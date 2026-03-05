import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { OAuthStatePayload } from './dto/identities.dto';

@Injectable()
export class IdentitiesService {
  private readonly logger = new Logger(IdentitiesService.name);

  constructor(
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly encryption: TokenEncryptionService,
    private readonly config: ConfigService,
  ) {}

  private createOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get<string>('GMAIL_CLIENT_ID'),
      this.config.get<string>('GMAIL_CLIENT_SECRET'),
      this.config.get<string>('GMAIL_REDIRECT_URI'),
    );
  }

  /**
   * Generate OAuth2 authorization URL.
   * Encodes orgId + userId in state param to survive the OAuth redirect.
   */
  initiateOAuth(organizationId: string, userId: string): string {
    const oauth2Client = this.createOAuth2Client();
    const state = Buffer.from(JSON.stringify({ organizationId, userId } satisfies OAuthStatePayload)).toString('base64url');

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose',
      ],
      state,
    });
  }

  /**
   * Exchange authorization code for tokens and persist identity.
   */
  async handleOAuthCallback(code: string, stateB64: string): Promise<CommIdentityDocument> {
    let statePayload: OAuthStatePayload;
    try {
      statePayload = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8')) as OAuthStatePayload;
    } catch {
      throw new BadRequestException('Invalid OAuth state parameter');
    }

    const { organizationId, userId } = statePayload;
    const oauth2Client = this.createOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new BadRequestException('Missing tokens from Google OAuth response');
    }

    // Get user email from token info
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress!;

    // Fetch sendAs aliases
    const sendAsResp = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const sendAsAliases = (sendAsResp.data.sendAs ?? []).map((a) => ({
      email: a.sendAsEmail!,
      name: a.displayName ?? undefined,
      isDefault: a.isDefault ?? false,
    }));

    // Encrypt tokens
    const encryptedAccessToken = this.encryption.encrypt(tokens.access_token, organizationId);
    const encryptedRefreshToken = this.encryption.encrypt(tokens.refresh_token, organizationId);
    const tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;

    // Upsert identity
    const identity = await this.identityModel.findOneAndUpdate(
      { organizationId, email },
      {
        $set: {
          organizationId,
          userId,
          email,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          sendAsAliases,
          isActive: true,
        },
        $setOnInsert: {
          syncState: { initialSyncDone: false, fullBackfillDone: false },
        },
      },
      { upsert: true, new: true },
    );

    this.logger.log(`OAuth identity stored for ${email} (org: ${organizationId})`);
    return identity;
  }

  async listIdentities(organizationId: string): Promise<CommIdentityDocument[]> {
    return this.identityModel
      .find({ organizationId, isActive: true })
      .select('-encryptedAccessToken -encryptedRefreshToken')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getIdentity(organizationId: string, id: string): Promise<CommIdentityDocument> {
    const identity = await this.identityModel
      .findOne({ _id: id, organizationId, isActive: true })
      .select('-encryptedAccessToken -encryptedRefreshToken')
      .exec();

    if (!identity) {
      throw new NotFoundException(`Identity ${id} not found`);
    }
    return identity;
  }

  async deleteIdentity(organizationId: string, id: string): Promise<void> {
    const result = await this.identityModel.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { isActive: false } },
    );
    if (!result) {
      throw new NotFoundException(`Identity ${id} not found`);
    }
  }

  /**
   * Get decrypted credentials for internal use (sync module).
   * Never expose to controllers.
   */
  async getDecryptedCredentials(identity: CommIdentityDocument): Promise<{
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt?: Date;
  }> {
    const organizationId = identity.organizationId;
    return {
      accessToken: this.encryption.decrypt(identity.encryptedAccessToken, organizationId),
      refreshToken: this.encryption.decrypt(identity.encryptedRefreshToken, organizationId),
      tokenExpiresAt: identity.tokenExpiresAt,
    };
  }
}
