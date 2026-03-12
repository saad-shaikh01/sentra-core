import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';
import {
  CommGSuiteConnection,
  CommGSuiteConnectionDocument,
} from '../../schemas/comm-gsuite-connection.schema';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { CommCacheService } from '../../common/cache/comm-cache.service';

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface GSuiteDirectoryUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  isAdmin: boolean;
  isSuspended: boolean;
  orgUnitPath: string;
  lastLoginTime?: string;
  creationTime?: string;
}

@Injectable()
export class GSuiteService {
  private readonly logger = new Logger(GSuiteService.name);

  constructor(
    @InjectModel(CommGSuiteConnection.name)
    private readonly connectionModel: Model<CommGSuiteConnectionDocument>,
    private readonly encryption: TokenEncryptionService,
    private readonly cache: CommCacheService,
    private readonly config: ConfigService,
  ) {}

  private createOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get<string>('GMAIL_CLIENT_ID'),
      this.config.get<string>('GMAIL_CLIENT_SECRET'),
      this.config.get<string>('GSUITE_REDIRECT_URI'),
    );
  }

  /**
   * Generate OAuth URL with Google Workspace Admin + Directory API scopes.
   * Admin must have Google Workspace super admin or user management privileges.
   */
  async initiateOAuth(organizationId: string, userId: string): Promise<string> {
    const oauth2Client = this.createOAuth2Client();
    const nonce = crypto.randomBytes(16).toString('hex');

    await this.cache.set(
      `gsuite:oauth:nonce:${nonce}`,
      JSON.stringify({ organizationId, userId }),
      NONCE_TTL_MS,
    );

    const state = Buffer.from(
      JSON.stringify({ organizationId, userId, nonce }),
    ).toString('base64url');

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/admin.directory.user.readonly',
        'https://www.googleapis.com/auth/admin.directory.domain.readonly',
        'email',
        'profile',
      ],
      state,
    });
  }

  /**
   * Handle OAuth callback — exchange code for tokens and persist connection.
   */
  async handleCallback(
    code: string,
    stateB64: string,
  ): Promise<CommGSuiteConnectionDocument> {
    let statePayload: { organizationId: string; userId: string; nonce: string };
    try {
      statePayload = JSON.parse(
        Buffer.from(stateB64, 'base64url').toString('utf8'),
      ) as { organizationId: string; userId: string; nonce: string };
    } catch {
      throw new BadRequestException('Invalid OAuth state parameter');
    }

    const { organizationId, userId, nonce } = statePayload;
    if (!nonce) throw new BadRequestException('OAuth state expired or invalid');

    const nonceCacheKey = `gsuite:oauth:nonce:${nonce}`;
    const cached = await this.cache.get<string>(nonceCacheKey);
    if (!cached) throw new BadRequestException('OAuth state expired or invalid');

    await this.cache.del(nonceCacheKey);

    const cached_payload = JSON.parse(cached) as { organizationId: string; userId: string };
    if (
      cached_payload.organizationId !== organizationId ||
      cached_payload.userId !== userId
    ) {
      throw new BadRequestException('OAuth state tampered');
    }

    const oauth2Client = this.createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new BadRequestException('Missing tokens from Google OAuth response — ensure G Suite admin account was used');
    }

    // Get admin email + domain
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const adminEmail = userInfo.data.email!;
    const domain = adminEmail.split('@')[1];

    const encryptedAccessToken = this.encryption.encrypt(tokens.access_token, organizationId);
    const encryptedRefreshToken = this.encryption.encrypt(tokens.refresh_token, organizationId);
    const tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;

    const connection = await this.connectionModel.findOneAndUpdate(
      { organizationId },
      {
        organizationId,
        connectedByUserId: userId,
        adminEmail,
        domain,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        isActive: true,
      },
      { upsert: true, new: true },
    );

    this.logger.log(`G Suite connected for org ${organizationId} — domain: ${domain}`);
    return connection;
  }

  /**
   * Get connection status for the org.
   */
  async getConnection(
    organizationId: string,
  ): Promise<{ connected: boolean; adminEmail?: string; domain?: string; connectedAt?: Date }> {
    const conn = await this.connectionModel.findOne({ organizationId, isActive: true });
    if (!conn) return { connected: false };
    return {
      connected: true,
      adminEmail: conn.adminEmail,
      domain: conn.domain,
      connectedAt: (conn as any).createdAt,
    };
  }

  /**
   * List all users in the connected G Suite domain via Google Directory API.
   */
  async listUsers(
    organizationId: string,
    pageToken?: string,
    maxResults = 100,
  ): Promise<{ users: GSuiteDirectoryUser[]; nextPageToken?: string }> {
    const conn = await this.getActiveConnection(organizationId);
    const auth = await this.buildAuthClient(conn);

    const admin = google.admin({ version: 'directory_v1', auth });

    const resp = await admin.users.list({
      domain: conn.domain,
      maxResults,
      orderBy: 'email',
      projection: 'full',
      ...(pageToken ? { pageToken } : {}),
    });

    const users: GSuiteDirectoryUser[] = (resp.data.users ?? []).map((u) => ({
      id: u.id ?? '',
      email: (u.primaryEmail ?? '') as string,
      name: u.name?.fullName ?? '',
      firstName: u.name?.givenName ?? '',
      lastName: u.name?.familyName ?? '',
      photoUrl: u.thumbnailPhotoUrl ?? undefined,
      isAdmin: u.isAdmin ?? false,
      isSuspended: u.suspended ?? false,
      orgUnitPath: u.orgUnitPath ?? '/',
      lastLoginTime: u.lastLoginTime ?? undefined,
      creationTime: u.creationTime ?? undefined,
    }));

    return {
      users,
      nextPageToken: resp.data.nextPageToken ?? undefined,
    };
  }

  /**
   * Disconnect the G Suite integration for the org.
   */
  async disconnect(organizationId: string): Promise<void> {
    await this.connectionModel.deleteOne({ organizationId });
    this.logger.log(`G Suite disconnected for org ${organizationId}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async getActiveConnection(organizationId: string): Promise<CommGSuiteConnectionDocument> {
    const conn = await this.connectionModel.findOne({ organizationId, isActive: true });
    if (!conn) {
      throw new NotFoundException('G Suite is not connected for this organization');
    }
    return conn;
  }

  private async buildAuthClient(conn: CommGSuiteConnectionDocument): Promise<OAuth2Client> {
    const oauth2Client = this.createOAuth2Client();

    const accessToken = this.encryption.decrypt(conn.encryptedAccessToken, conn.organizationId);
    const refreshToken = this.encryption.decrypt(conn.encryptedRefreshToken, conn.organizationId);

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: conn.tokenExpiresAt?.getTime(),
    });

    // Auto-refresh if expired (google-auth-library handles this)
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        const newEncrypted = this.encryption.encrypt(tokens.access_token, conn.organizationId);
        await this.connectionModel.updateOne(
          { _id: conn._id },
          {
            encryptedAccessToken: newEncrypted,
            tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : conn.tokenExpiresAt,
          },
        );
      }
    });

    return oauth2Client;
  }
}
