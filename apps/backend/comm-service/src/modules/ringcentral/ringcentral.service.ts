import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { UserRole } from '@sentra-core/types';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { CommCacheService } from '../../common/cache/comm-cache.service';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import {
  ContactLookupResult as InternalContactLookupResult,
  InternalContactsClient,
} from '../../common/http/internal-contacts.client';
import { CommGateway } from '../gateway/comm.gateway';
import {
  RingCentralCallSession,
  RingCentralCallSessionDocument,
  RingCentralCallStatus,
} from '../../schemas/ringcentral-call-session.schema';
import {
  RingCentralConnection,
  RingCentralConnectionDocument,
  RingCentralPhoneNumber,
} from '../../schemas/ringcentral-connection.schema';
import {
  RingCentralWebhookEvent,
  RingCentralWebhookEventDocument,
} from '../../schemas/ringcentral-webhook-event.schema';
import { CreateRingCentralCallDto } from './dto/create-ringcentral-call.dto';
import { SendRingCentralSmsDto } from './dto/send-ringcentral-sms.dto';
import { UpdateRingCentralCallAnnotationDto } from './dto/update-ringcentral-call-annotation.dto';
import {
  RingCentralSmsMessage,
  RingCentralSmsMessageDocument,
} from '../../schemas/ringcentral-sms-message.schema';
import {
  RingCentralSmsDirection,
  RingCentralSmsThread,
  RingCentralSmsThreadDocument,
} from '../../schemas/ringcentral-sms-thread.schema';
import {
  DEFAULT_RINGCENTRAL_WEBHOOK_EVENT_FILTERS,
  RINGCENTRAL_EVENTS_QUEUE,
  RINGCENTRAL_SMS_EVENT_FILTER,
  RINGCENTRAL_SUBSCRIPTIONS_QUEUE,
  RINGCENTRAL_SUBSCRIPTION_RENEWAL_FILTER,
  RINGCENTRAL_TELEPHONY_EVENT_FILTER,
} from './ringcentral.constants';

type OAuthStatePayload = {
  organizationId: string;
  userId: string;
  role: UserRole;
  brandId?: string;
  nonce?: string;
};

type RingCentralTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type RingCentralAccountResponse = {
  id?: string;
  mainNumber?: string;
};

type RingCentralExtensionResponse = {
  id?: string;
  extensionNumber?: string;
  name?: string;
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
};

type RingCentralPhoneNumbersResponse = {
  records?: Array<{
    id?: string | number;
    phoneNumber?: string;
    usageType?: string;
    type?: string;
    features?: string[];
  }>;
};

type RingOutStatusResponse = {
  id?: string | number;
  uri?: string;
  status?: {
    callStatus?: string;
    callerStatus?: string;
    calleeStatus?: string;
  };
};

type RingCentralActiveCallsResponse = {
  records?: Array<{
    id?: string | number;
    sessionId?: string | number;
    telephonySessionId?: string | number;
    partyId?: string | number;
    direction?: string;
    result?: string;
    startTime?: string;
    duration?: number;
    from?: {
      phoneNumber?: string;
      name?: string;
      extensionId?: string | number;
    };
    to?: {
      phoneNumber?: string;
      name?: string;
      extensionId?: string | number;
    };
  }>;
};

type RingCentralSubscriptionResponse = {
  id?: string | number;
  expiresIn?: number;
  expirationTime?: string;
  eventFilters?: string[];
  deliveryMode?: {
    transportType?: string;
    address?: string;
  };
};

type RingCentralWebhookNotification = {
  uuid?: string;
  event?: string;
  timestamp?: string;
  subscriptionId?: string;
  ownerId?: string | number;
  body?: {
    sequence?: number;
    sessionId?: string | number;
    telephonySessionId?: string | number;
    eventTime?: string;
    accountId?: string | number;
    parties?: Array<{
      accountId?: string | number;
      extensionId?: string | number;
      id?: string | number;
      direction?: string;
      from?: {
        phoneNumber?: string;
        name?: string;
        extensionId?: string | number;
      };
      to?: {
        phoneNumber?: string;
        name?: string;
        extensionId?: string | number;
      };
      status?: {
        code?: string;
        reason?: string;
        rcc?: boolean;
      };
      missedCall?: boolean;
    }>;
    id?: string | number;
    conversationId?: string | number;
    direction?: string;
    from?: {
      phoneNumber?: string;
      name?: string;
      extensionId?: string | number;
    };
    to?: Array<{
      phoneNumber?: string;
      name?: string;
      extensionId?: string | number;
    }>;
    subject?: string;
    type?: string;
    readStatus?: string;
    messageStatus?: string;
    creationTime?: string;
    lastModifiedTime?: string;
    availability?: string;
  };
};

type RingCentralWebhookAcknowledgement = {
  validationToken?: string;
};

type RingCentralTelephonySummary = {
  id: string;
  connectionId: string;
  connectionLabel: string;
  brandId?: string;
  sessionId?: string;
  telephonySessionId?: string;
  partyId?: string;
  direction?: string;
  callStatus: RingCentralCallStatus;
  statusCode?: string;
  statusReason?: string;
  eventTime?: string;
  fromName?: string;
  fromPhoneNumber?: string;
  toName?: string;
  toPhoneNumber?: string;
  missedCall: boolean;
  isRinging: boolean;
  isTerminal: boolean;
};

type RingCentralCallListOptions = {
  status?: 'all' | 'open';
  limit?: number;
  entityType?: 'lead' | 'client' | 'sale' | 'project';
  entityId?: string;
};

type RingCentralSmsListOptions = {
  threadId?: string;
  limit?: number;
  entityType?: 'lead' | 'client' | 'sale' | 'project';
  entityId?: string;
};

type RingCentralSmsMessageInfo = {
  id?: string | number;
  uri?: string;
  conversationId?: string | number;
  direction?: string;
  from?: {
    phoneNumber?: string;
    name?: string;
    extensionId?: string | number;
  };
  to?: Array<{
    phoneNumber?: string;
    name?: string;
    extensionId?: string | number;
  }>;
  subject?: string;
  creationTime?: string;
  lastModifiedTime?: string;
  readStatus?: string;
  messageStatus?: string;
  availability?: string;
};

type RingCentralConnectionAccessToken = {
  connection: RingCentralConnectionDocument;
  accessToken: string;
};

const OAUTH_NONCE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_CALL_LIST_LIMIT = 10;
const DEFAULT_SMS_LIST_LIMIT = 25;
const WEBHOOK_SUBSCRIPTION_EXPIRING_WINDOW_MS = 15 * 60 * 1000;
const WEBHOOK_SUBSCRIPTION_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60 - 1;
const OPEN_CALL_STATUSES: RingCentralCallStatus[] = ['queued', 'dialing', 'connected'];
const TERMINAL_CALL_STATUSES: RingCentralCallStatus[] = ['finished', 'cancelled', 'failed'];
const DEFAULT_RINGCENTRAL_SCOPES = [
  'ReadAccounts',
  'ReadCallLog',
  'ReadCallRecording',
  'ReadMessages',
  'SMS',
  'RingOut',
  'CallControl',
  'WebhookSubscriptions',
] as const;

@Injectable()
export class RingCentralService {
  private readonly logger = new Logger(RingCentralService.name);
  private readonly tokenRefreshes = new Map<string, Promise<RingCentralConnectionDocument>>();

  constructor(
    @InjectModel(RingCentralConnection.name)
    private readonly connectionModel: Model<RingCentralConnectionDocument>,
    @InjectModel(RingCentralCallSession.name)
    private readonly callSessionModel: Model<RingCentralCallSessionDocument>,
    @InjectModel(RingCentralSmsThread.name)
    private readonly smsThreadModel: Model<RingCentralSmsThreadDocument>,
    @InjectModel(RingCentralSmsMessage.name)
    private readonly smsMessageModel: Model<RingCentralSmsMessageDocument>,
    @InjectModel(RingCentralWebhookEvent.name)
    private readonly webhookEventModel: Model<RingCentralWebhookEventDocument>,
    @InjectQueue(RINGCENTRAL_EVENTS_QUEUE)
    private readonly ringCentralEventsQueue: Queue,
    @InjectQueue(RINGCENTRAL_SUBSCRIPTIONS_QUEUE)
    private readonly ringCentralSubscriptionsQueue: Queue,
    private readonly cache: CommCacheService,
    private readonly encryption: TokenEncryptionService,
    private readonly config: ConfigService,
    private readonly contactsClient: InternalContactsClient,
    @Optional() private readonly gateway?: CommGateway,
  ) {}

  async initiateOAuth(
    organizationId: string,
    userId: string,
    role: UserRole,
    brandId?: string,
  ): Promise<string> {
    const serverUrl = this.getServerUrl();
    const clientId = this.getRequiredConfig('RINGCENTRAL_CLIENT_ID');
    const redirectUri = this.getRequiredConfig('RINGCENTRAL_REDIRECT_URI');
    const nonce = crypto.randomBytes(16).toString('hex');

    await this.cache.set(
      `ringcentral:oauth:nonce:${nonce}`,
      JSON.stringify({ organizationId, userId }),
      OAUTH_NONCE_TTL_MS,
    );

    const statePayload: OAuthStatePayload = {
      organizationId,
      userId,
      role,
      nonce,
      ...(brandId ? { brandId } : {}),
    };

    const url = new URL('/restapi/oauth/authorize', serverUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', Buffer.from(JSON.stringify(statePayload)).toString('base64url'));
    url.searchParams.set('scope', this.getScopes().join(' '));
    return url.toString();
  }

  async handleOAuthCallback(code: string, stateB64: string): Promise<RingCentralConnectionDocument> {
    const statePayload = this.parseState(stateB64);
    const { organizationId, userId, role, brandId, nonce } = statePayload;

    if (!nonce) {
      throw new BadRequestException('OAuth state expired or invalid');
    }

    const nonceCacheKey = `ringcentral:oauth:nonce:${nonce}`;
    const cachedState = await this.cache.get<string>(nonceCacheKey);
    if (!cachedState) {
      throw new BadRequestException('OAuth state expired or invalid');
    }

    await this.cache.del(nonceCacheKey);

    let cachedPayload: Pick<OAuthStatePayload, 'organizationId' | 'userId'>;
    try {
      cachedPayload = JSON.parse(cachedState) as Pick<OAuthStatePayload, 'organizationId' | 'userId'>;
    } catch {
      throw new BadRequestException('OAuth state expired or invalid');
    }

    if (
      cachedPayload.organizationId !== organizationId ||
      cachedPayload.userId !== userId
    ) {
      throw new BadRequestException('OAuth state tampered');
    }

    const tokens = await this.exchangeAuthorizationCode(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new BadRequestException('Missing tokens from RingCentral OAuth response');
    }

    const [account, extension, phoneNumbers] = await Promise.all([
      this.apiGet<RingCentralAccountResponse>('/restapi/v1.0/account/~', tokens.access_token),
      this.apiGet<RingCentralExtensionResponse>(
        '/restapi/v1.0/account/~/extension/~/',
        tokens.access_token,
      ),
      this.apiGet<RingCentralPhoneNumbersResponse>(
        '/restapi/v1.0/account/~/extension/~/phone-number',
        tokens.access_token,
      ),
    ]);

    const accountId = account.id ? String(account.id) : undefined;
    const extensionId = extension.id ? String(extension.id) : undefined;
    if (!accountId || !extensionId) {
      throw new BadRequestException('RingCentral account metadata was incomplete');
    }

    const normalizedPhoneNumbers = this.normalizePhoneNumbers(phoneNumbers.records ?? []);
    const directPhoneNumbers = normalizedPhoneNumbers.map((record) => record.phoneNumber);
    const smsSenderPhoneNumbers = normalizedPhoneNumbers
      .filter((record) => record.features.includes('SmsSender'))
      .map((record) => record.phoneNumber);

    const existing = await this.connectionModel.findOne({
      organizationId,
      accountId,
      extensionId,
    });

    if (
      existing &&
      existing.userId !== userId &&
      role !== UserRole.OWNER &&
      role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('You do not own this RingCentral extension');
    }

    const existingCount = await this.connectionModel.countDocuments({
      organizationId,
      isActive: true,
    });
    const shouldBeDefault = existingCount === 0 || Boolean(existing?.isDefault);
    const tokenExpiresAt =
      typeof tokens.expires_in === 'number'
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined;
    const encryptedAccessToken = this.encryption.encrypt(tokens.access_token, organizationId);
    const encryptedRefreshToken = this.encryption.encrypt(tokens.refresh_token, organizationId);
    const displayName =
      extension.name ||
      [extension.contact?.firstName, extension.contact?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      undefined;
    const email = extension.contact?.email;
    const mainPhoneNumber = account.mainNumber ?? directPhoneNumbers[0];
    const defaultOutboundPhoneNumber =
      smsSenderPhoneNumbers[0] ?? directPhoneNumbers[0] ?? mainPhoneNumber;

    const connection = await this.connectionModel.findOneAndUpdate(
      { organizationId, accountId, extensionId },
      {
        $set: {
          organizationId,
          accountId,
          extensionId,
          brandId,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          scopes: this.parseScopes(tokens.scope),
          displayName,
          email,
          serverUrl: this.getServerUrl(),
          extensionNumber: extension.extensionNumber,
          phoneNumbers: normalizedPhoneNumbers,
          mainPhoneNumber,
          directPhoneNumbers,
          smsSenderPhoneNumbers,
          defaultOutboundPhoneNumber,
          isActive: true,
          ...(shouldBeDefault ? { isDefault: true } : {}),
          connectionState: {
            status: 'active',
            lastError: undefined,
            lastSeenAt: new Date(),
          },
        },
        $setOnInsert: {
          userId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    this.logger.log(
      `RingCentral connection stored for extension ${extensionId} (org: ${organizationId})`,
    );
    void this.enqueueWebhookSubscriptionSync(String(connection._id));
    return connection;
  }

  async getOAuthBrands(authorization?: string): Promise<Array<{ id: string; name: string }>> {
    const coreServiceUrl = this.config.get<string>('CORE_SERVICE_URL');
    if (!coreServiceUrl) {
      throw new InternalServerErrorException('CORE_SERVICE_URL is not configured');
    }

    const response = await fetch(`${coreServiceUrl}/api/brands?limit=100`, {
      headers: authorization ? { Authorization: authorization } : {},
    });

    if (!response.ok) {
      throw new InternalServerErrorException('Failed to load brands');
    }

    const payload = (await response.json()) as {
      data?: Array<{ id: string; name: string }>;
    };

    return (payload.data ?? []).map((brand) => ({
      id: brand.id,
      name: brand.name,
    }));
  }

  isPrivileged(role: UserRole): boolean {
    return role === UserRole.OWNER || role === UserRole.ADMIN;
  }

  async listConnections(
    organizationId: string,
    userId: string,
    role: UserRole,
  ): Promise<RingCentralConnectionDocument[]> {
    const filter = this.isPrivileged(role)
      ? { organizationId, isActive: true }
      : { organizationId, userId, isActive: true };

    return this.connectionModel
      .find(filter)
      .select('-encryptedAccessToken -encryptedRefreshToken')
      .sort({ isDefault: -1, createdAt: -1 })
      .exec();
  }

  async getConnection(
    organizationId: string,
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<RingCentralConnectionDocument> {
    const connection = await this.connectionModel
      .findOne({
        _id: id,
        organizationId,
        isActive: true,
        ...(this.isPrivileged(role) ? {} : { userId }),
      })
      .select('-encryptedAccessToken -encryptedRefreshToken')
      .exec();

    if (!connection) {
      throw new NotFoundException(`RingCentral connection ${id} not found`);
    }
    return connection;
  }

  async setDefault(
    organizationId: string,
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    const connection = await this.connectionModel.findOne({ _id: id, organizationId, isActive: true });
    if (!connection) {
      throw new NotFoundException(`RingCentral connection ${id} not found`);
    }
    if (!this.isPrivileged(role) && connection.userId !== userId) {
      throw new ForbiddenException('You can only set your own RingCentral connection as default');
    }

    await this.connectionModel.updateMany(
      { organizationId, isActive: true },
      { $set: { isDefault: false } },
    );
    await this.connectionModel.findByIdAndUpdate(id, { $set: { isDefault: true } }).exec();
  }

  async deleteConnection(
    organizationId: string,
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    const connection = await this.connectionModel.findOne({ _id: id, organizationId });
    if (!connection) {
      throw new NotFoundException(`RingCentral connection ${id} not found`);
    }
    if (!this.isPrivileged(role) && connection.userId !== userId) {
      throw new ForbiddenException('You can only disconnect your own RingCentral connection');
    }

    const wasDefault = connection.isDefault;
    if (connection.webhookState?.subscriptionId) {
      try {
        await this.apiRequest<void>(
          connection,
          'DELETE',
          `/restapi/v1.0/subscription/${connection.webhookState.subscriptionId}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to delete RingCentral webhook subscription ${connection.webhookState.subscriptionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.connectionModel.findByIdAndUpdate(id, {
      $set: {
        isActive: false,
        isDefault: false,
        webhookState: {
          status: 'inactive',
          subscriptionId: undefined,
          validationTokenHash: undefined,
          deliveryAddress: undefined,
          eventFilters: [],
          expiresAt: undefined,
          lastEventAt: undefined,
          lastError: undefined,
          lastSyncedAt: new Date(),
        },
      },
    });

    if (wasDefault) {
      const replacement = await this.connectionModel
        .findOne({ organizationId, isActive: true, _id: { $ne: id } })
        .sort({ createdAt: 1 })
        .exec();
      if (replacement) {
        await this.connectionModel.findByIdAndUpdate(replacement._id, {
          $set: { isDefault: true },
        });
      }
    }
  }

  serializeConnection(connection: RingCentralConnectionDocument) {
    const value = connection.toObject({ virtuals: true }) as Record<string, unknown> & {
      webhookState?: Record<string, unknown>;
    };

    const webhookState = value.webhookState
      ? {
          ...value.webhookState,
          ...(value.webhookState['expiresAt'] instanceof Date
            ? { expiresAt: (value.webhookState['expiresAt'] as Date).toISOString() }
            : {}),
          ...(value.webhookState['lastEventAt'] instanceof Date
            ? { lastEventAt: (value.webhookState['lastEventAt'] as Date).toISOString() }
            : {}),
          ...(value.webhookState['lastSyncedAt'] instanceof Date
            ? { lastSyncedAt: (value.webhookState['lastSyncedAt'] as Date).toISOString() }
            : {}),
        }
      : undefined;

    if (webhookState && 'validationTokenHash' in webhookState) {
      delete webhookState['validationTokenHash'];
    }

    return {
      ...value,
      id: String(connection._id),
      webhookState,
    };
  }

  async syncWebhookSubscription(
    organizationId: string,
    connectionId: string,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    await this.resolveConnectionById(organizationId, userId, role, connectionId);
    await this.enqueueWebhookSubscriptionSync(connectionId);
  }

  async acceptWebhookNotification(
    payload: Record<string, unknown> | undefined,
    validationToken?: string,
  ): Promise<RingCentralWebhookAcknowledgement> {
    const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
    const notification = normalizedPayload as RingCentralWebhookNotification;

    if (validationToken && !notification.subscriptionId && !notification.uuid) {
      return { validationToken };
    }

    const providerEventId = this.normalizeString(notification.uuid);
    if (providerEventId) {
      const existing = await this.webhookEventModel.findOne({ providerEventId }).lean().exec();
      if (existing) {
        return {};
      }
    }

    const providerSubscriptionId = this.normalizeString(notification.subscriptionId);
    const connection = providerSubscriptionId
      ? await this.connectionModel
          .findOne({
            isActive: true,
            'webhookState.subscriptionId': providerSubscriptionId,
          })
          .exec()
      : null;

    const event = await this.webhookEventModel.create({
      organizationId: connection?.organizationId,
      userId: connection?.userId,
      connectionId: connection ? String(connection._id) : undefined,
      providerSubscriptionId,
      providerEventId,
      ownerId: notification.ownerId ? String(notification.ownerId) : undefined,
      eventType: this.normalizeString(notification.event),
      validationTokenHeader: validationToken,
      telephonySessionId: notification.body?.telephonySessionId
        ? String(notification.body.telephonySessionId)
        : undefined,
      sessionId: notification.body?.sessionId ? String(notification.body.sessionId) : undefined,
      partyId: notification.body?.parties?.[0]?.id
        ? String(notification.body.parties[0].id)
        : undefined,
      sequence: notification.body?.sequence,
      payload: normalizedPayload,
      processingStatus: 'pending',
      receivedAt: new Date(),
    });

    await this.ringCentralEventsQueue.add(
      'process-webhook-event',
      { webhookEventId: String(event._id) },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        jobId: providerEventId
          ? `ringcentral:webhook:${providerEventId}`
          : `ringcentral:webhook:${String(event._id)}`,
      },
    );

    return {};
  }

  async processSubscriptionSyncJob(connectionId: string): Promise<void> {
    const connection = await this.connectionModel.findOne({
      _id: connectionId,
      isActive: true,
    });

    if (!connection) {
      return;
    }

    await this.syncWebhookSubscriptionForConnection(connection);
  }

  async processWebhookEventJob(webhookEventId: string): Promise<void> {
    const event = await this.webhookEventModel.findById(webhookEventId).exec();
    if (!event || event.processingStatus !== 'pending') {
      return;
    }

    const connection = event.connectionId
      ? await this.connectionModel.findById(event.connectionId).exec()
      : null;
    const notification = event.payload as RingCentralWebhookNotification;

    if (!connection) {
      await this.webhookEventModel.findByIdAndUpdate(event._id, {
        $set: {
          processingStatus: 'ignored',
          processedAt: new Date(),
          errorMessage: 'RingCentral connection not found for webhook event',
        },
      });
      return;
    }

    const expectedValidationHash = connection.webhookState?.validationTokenHash;
    if (
      expectedValidationHash &&
      event.validationTokenHeader &&
      this.hashWebhookValidationToken(event.validationTokenHeader) !== expectedValidationHash
    ) {
      await this.connectionModel.findByIdAndUpdate(connection._id, {
        $set: {
          'webhookState.status': 'error',
          'webhookState.lastError': 'Incoming webhook validation token mismatch',
          'webhookState.lastSyncedAt': new Date(),
        },
      });
      await this.webhookEventModel.findByIdAndUpdate(event._id, {
        $set: {
          processingStatus: 'failed',
          processedAt: new Date(),
          errorMessage: 'validation_token_mismatch',
        },
      });
      return;
    }

    if (this.isSubscriptionRenewalWebhookEvent(notification.event)) {
      await this.connectionModel.findByIdAndUpdate(connection._id, {
        $set: {
          'webhookState.status': 'expiring',
          'webhookState.lastEventAt': new Date(),
          'webhookState.lastError': undefined,
        },
      });
      await this.enqueueWebhookSubscriptionSync(String(connection._id));
      await this.webhookEventModel.findByIdAndUpdate(event._id, {
        $set: {
          processingStatus: 'processed',
          processedAt: new Date(),
          processingSummary: { action: 'renewal_enqueued' },
        },
      });
      return;
    }

    if (this.isTelephonyWebhookEvent(notification.event)) {
      const summary = this.serializeTelephonyWebhook(connection, notification);
      const trackedCall = summary
        ? await this.upsertCallSessionFromWebhook(connection, summary)
        : null;

      await this.connectionModel.findByIdAndUpdate(connection._id, {
        $set: {
          'webhookState.status': 'active',
          'webhookState.lastEventAt': new Date(),
          'webhookState.lastError': undefined,
        },
      });

      if (summary) {
        const eventPayload = trackedCall ?? summary;
        this.gateway?.emitToUser(connection.userId, 'call:updated', eventPayload);

        if (summary.direction === 'Inbound' && summary.isRinging) {
          this.gateway?.emitToUser(connection.userId, 'call:incoming', eventPayload);
        }

        if (summary.isTerminal) {
          this.gateway?.emitToUser(connection.userId, 'call:ended', eventPayload);
        }
      }

      await this.webhookEventModel.findByIdAndUpdate(event._id, {
        $set: {
          processingStatus: 'processed',
          processedAt: new Date(),
          processingSummary:
            trackedCall ??
            summary ??
            { ignored: true },
        },
      });
      return;
    }

    if (this.isSmsWebhookEvent(notification.event)) {
      const message = await this.upsertSmsMessageFromWebhook(connection, notification);

      await this.connectionModel.findByIdAndUpdate(connection._id, {
        $set: {
          'webhookState.status': 'active',
          'webhookState.lastEventAt': new Date(),
          'webhookState.lastError': undefined,
        },
      });

      if (message) {
        this.gateway?.emitToUser(connection.userId, 'sms:new', message);
      }

      await this.webhookEventModel.findByIdAndUpdate(event._id, {
        $set: {
          processingStatus: 'processed',
          processedAt: new Date(),
          processingSummary: message ?? { ignored: true },
        },
      });
      return;
    }

    await this.webhookEventModel.findByIdAndUpdate(event._id, {
      $set: {
        processingStatus: 'ignored',
        processedAt: new Date(),
        processingSummary: { reason: 'unsupported_event_type' },
      },
    });
  }

  async startCall(
    organizationId: string,
    userId: string,
    role: UserRole,
    dto: CreateRingCentralCallDto,
  ) {
    const toPhoneNumber = this.normalizeString(dto.toPhoneNumber);
    if (!toPhoneNumber) {
      throw new BadRequestException('toPhoneNumber is required');
    }

    const connection = await this.resolveConnectionForCall(
      organizationId,
      userId,
      role,
      dto.connectionId,
      dto.brandId,
    );

    const body: Record<string, unknown> = {
      to: { phoneNumber: toPhoneNumber },
      playPrompt: dto.playPrompt ?? false,
    };

    const fromPhoneNumber = this.normalizeString(dto.fromPhoneNumber);
    if (fromPhoneNumber) {
      body['from'] = { phoneNumber: fromPhoneNumber };
    }

    const response = await this.apiRequest<RingOutStatusResponse>(
      connection,
      'POST',
      '/restapi/v1.0/account/~/extension/~/ring-out',
      body,
    );

    const normalizedStatus = this.mapRingOutStatus(response.status);
    const session = await this.callSessionModel.create({
      organizationId,
      userId,
      connectionId: String(connection._id),
      brandId: dto.brandId ?? connection.brandId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      contactName: this.normalizeString(dto.contactName),
      matchedPhoneNumber: toPhoneNumber,
      toPhoneNumber,
      fromPhoneNumber:
        fromPhoneNumber ??
        connection.defaultOutboundPhoneNumber ??
        connection.mainPhoneNumber,
      direction: 'Outbound',
      source: 'ringout',
      ringOutId: response.id ? String(response.id) : undefined,
      ringOutUri: response.uri,
      callStatus: normalizedStatus,
      providerCallStatus: response.status?.callStatus,
      providerCallerStatus: response.status?.callerStatus,
      providerCalleeStatus: response.status?.calleeStatus,
      failureReason:
        normalizedStatus === 'failed'
          ? response.status?.callStatus ?? response.status?.calleeStatus
          : undefined,
      lastPolledAt: new Date(),
      lastProviderPayload: response as unknown as Record<string, unknown>,
    });

    return this.serializeCallSession(session, connection);
  }

  async listCalls(
    organizationId: string,
    userId: string,
    role: UserRole,
    options: RingCentralCallListOptions = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_CALL_LIST_LIMIT, 1), 25);
    const filter =
      options.entityType && options.entityId
        ? { organizationId }
        : this.isPrivileged(role)
          ? { organizationId }
          : { organizationId, userId };

    const callStatusFilter =
      options.status === 'open'
        ? { callStatus: { $in: OPEN_CALL_STATUSES } }
        : {};
    const entityFilter =
      options.entityType && options.entityId
        ? { entityType: options.entityType, entityId: options.entityId }
        : {};

    const sessions = await this.callSessionModel
      .find({ ...filter, ...callStatusFilter, ...entityFilter })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    const connectionsById = await this.loadConnectionsById(
      organizationId,
      sessions.map((session) => session.connectionId),
    );

    await Promise.all(
      sessions
        .filter((session) => this.shouldSyncCall(session))
        .map(async (session) => {
          const connection = connectionsById.get(session.connectionId);
          if (!connection) {
            return;
          }
          try {
            await this.syncTrackedCall(session, connection);
          } catch (error) {
            this.logger.warn(
              `Failed to sync RingCentral call ${session._id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }),
    );

    const refreshedSessions = await this.callSessionModel
      .find({ _id: { $in: sessions.map((session) => session._id) } })
      .sort({ createdAt: -1 })
      .exec();

    return refreshedSessions.map((session) =>
      this.serializeCallSession(session, connectionsById.get(session.connectionId)),
    );
  }

  async updateCallAnnotation(
    organizationId: string,
    userId: string,
    role: UserRole,
    callId: string,
    dto: UpdateRingCentralCallAnnotationDto,
  ) {
    const session = await this.getAccessibleCallSession(
      organizationId,
      userId,
      role,
      callId,
    );
    const disposition = this.normalizeString(dto.disposition);
    const notes = this.normalizeString(dto.notes);

    if (!disposition && !notes && dto.disposition == null && dto.notes == null) {
      throw new BadRequestException('At least one call annotation field is required');
    }

    const updatedSession = await this.callSessionModel
      .findByIdAndUpdate(
        session._id,
        {
          $set: {
            disposition,
            notes,
            notesUpdatedAt: new Date(),
            notesUpdatedByUserId: userId,
          },
        },
        { new: true },
      )
      .exec();

    const connection = await this.connectionModel.findById(session.connectionId).exec();
    return this.serializeCallSession(updatedSession ?? session, connection ?? undefined);
  }

  async listActiveCalls(
    organizationId: string,
    userId: string,
    role: UserRole,
    opts?: { connectionId?: string; brandId?: string },
  ) {
    const connections = await this.resolveAccessibleConnections(
      organizationId,
      userId,
      role,
      opts,
    );

    const perConnectionResults = await Promise.all(
      connections.map(async (connection) => {
        try {
          const response = await this.apiRequest<RingCentralActiveCallsResponse>(
            connection,
            'GET',
            '/restapi/v1.0/account/~/extension/~/active-calls',
          );
          return (response.records ?? []).map((record) =>
            this.serializeActiveCall(connection, record),
          );
        } catch (error) {
          this.logger.warn(
            `Failed to read active calls for RingCentral connection ${connection._id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return [];
        }
      }),
    );

    return perConnectionResults
      .flat()
      .sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
        return bTime - aTime;
      });
  }

  async cancelCall(
    organizationId: string,
    userId: string,
    role: UserRole,
    callId: string,
  ): Promise<void> {
    const session = await this.getAccessibleCallSession(
      organizationId,
      userId,
      role,
      callId,
    );
    if (!session.ringOutId) {
      throw new BadRequestException('This call cannot be canceled');
    }
    if (TERMINAL_CALL_STATUSES.includes(session.callStatus)) {
      return;
    }

    const connection = await this.resolveConnectionById(
      organizationId,
      userId,
      role,
      session.connectionId,
    );

    await this.apiRequest<void>(
      connection,
      'DELETE',
      `/restapi/v1.0/account/~/extension/~/ring-out/${session.ringOutId}`,
    );

    await this.callSessionModel.findByIdAndUpdate(session._id, {
      $set: {
        callStatus: 'cancelled',
        providerCallerStatus: 'Rejected',
        providerCalleeStatus: 'Rejected',
        failureReason: 'Canceled by CRM user',
        lastPolledAt: new Date(),
      },
    });
  }

  async listSmsThreads(
    organizationId: string,
    userId: string,
    role: UserRole,
    options: Omit<RingCentralSmsListOptions, 'threadId'> = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_SMS_LIST_LIMIT, 1), 100);
    const filter =
      options.entityType && options.entityId
        ? { organizationId }
        : this.isPrivileged(role)
          ? { organizationId }
          : { organizationId, userId };
    const entityFilter =
      options.entityType && options.entityId
        ? { entityType: options.entityType, entityId: options.entityId }
        : {};

    const threads = await this.smsThreadModel
      .find({ ...filter, ...entityFilter })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(limit)
      .exec();

    const connectionsById = await this.loadConnectionsById(
      organizationId,
      threads.map((thread) => thread.connectionId),
    );

    return threads.map((thread) =>
      this.serializeSmsThread(thread, connectionsById.get(thread.connectionId)),
    );
  }

  async listSmsMessages(
    organizationId: string,
    userId: string,
    role: UserRole,
    options: RingCentralSmsListOptions = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_SMS_LIST_LIMIT, 1), 100);
    const filter =
      options.entityType && options.entityId
        ? { organizationId }
        : this.isPrivileged(role)
          ? { organizationId }
          : { organizationId, userId };
    const threadFilter =
      options.threadId
        ? { threadId: options.threadId }
        : {};
    const entityFilter =
      options.entityType && options.entityId
        ? { entityType: options.entityType, entityId: options.entityId }
        : {};

    const messages = await this.smsMessageModel
      .find({ ...filter, ...threadFilter, ...entityFilter })
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(limit)
      .exec();

    const [connectionsById, threads] = await Promise.all([
      this.loadConnectionsById(
        organizationId,
        messages.map((message) => message.connectionId),
      ),
      this.smsThreadModel
        .find({ _id: { $in: Array.from(new Set(messages.map((message) => message.threadId))) } })
        .exec(),
    ]);
    const threadsById = new Map(threads.map((thread) => [String(thread._id), thread]));

    return [...messages]
      .sort((a, b) => {
        const aTime = (a.sentAt ?? a.createdAt)?.getTime() ?? 0;
        const bTime = (b.sentAt ?? b.createdAt)?.getTime() ?? 0;
        return aTime - bTime;
      })
      .map((message) =>
        this.serializeSmsMessage(
          message,
          connectionsById.get(message.connectionId),
          threadsById.get(message.threadId),
        ),
      );
  }

  async sendSms(
    organizationId: string,
    userId: string,
    role: UserRole,
    dto: SendRingCentralSmsDto,
  ) {
    const toPhoneNumber = this.normalizeString(dto.toPhoneNumber);
    const text = this.normalizeString(dto.text);

    if (!toPhoneNumber) {
      throw new BadRequestException('toPhoneNumber is required');
    }
    if (!text) {
      throw new BadRequestException('text is required');
    }

    const connection = await this.resolveConnectionForCall(
      organizationId,
      userId,
      role,
      dto.connectionId,
      dto.brandId,
    );
    const fromPhoneNumber = this.resolveSmsSenderPhoneNumber(connection, dto.fromPhoneNumber);

    const response = await this.apiRequest<RingCentralSmsMessageInfo>(
      connection,
      'POST',
      '/restapi/v1.0/account/~/extension/~/sms',
      {
        from: { phoneNumber: fromPhoneNumber },
        to: [{ phoneNumber: toPhoneNumber }],
        text,
      },
    );

    const providerMessage = response.id
      ? await this.fetchSmsMessageInfo(connection, String(response.id))
      : {
          ...response,
          from: { phoneNumber: fromPhoneNumber },
          to: [{ phoneNumber: toPhoneNumber, name: dto.contactName }],
          subject: text,
          direction: 'Outbound',
          creationTime: new Date().toISOString(),
          messageStatus: response.messageStatus ?? 'Queued',
          readStatus: 'Read',
        };

    const message = await this.upsertSmsMessageFromProvider(connection, providerMessage, {
      entityType: dto.entityType,
      entityId: dto.entityId,
      contactName: this.normalizeString(dto.contactName),
    });

    if (!message) {
      throw new InternalServerErrorException('Failed to persist RingCentral SMS message');
    }

    this.gateway?.emitToUser(connection.userId, 'sms:new', message);

    return message;
  }

  async markSmsThreadRead(
    organizationId: string,
    userId: string,
    role: UserRole,
    threadId: string,
  ): Promise<void> {
    const thread = await this.getAccessibleSmsThread(
      organizationId,
      userId,
      role,
      threadId,
    );

    await Promise.all([
      this.smsMessageModel.updateMany(
        {
          organizationId,
          threadId: String(thread._id),
          direction: 'Inbound',
          isRead: false,
        },
        {
          $set: {
            isRead: true,
            readStatus: 'Read',
            lastModifiedTime: new Date(),
          },
        },
      ),
      this.smsThreadModel.findByIdAndUpdate(thread._id, {
        $set: {
          unreadCount: 0,
        },
      }),
    ]);
  }

  async getDecryptedCredentials(connection: RingCentralConnectionDocument): Promise<{
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt?: Date;
  }> {
    return {
      accessToken: this.encryption.decrypt(
        connection.encryptedAccessToken,
        connection.organizationId,
      ),
      refreshToken: this.encryption.decrypt(
        connection.encryptedRefreshToken,
        connection.organizationId,
      ),
      tokenExpiresAt: connection.tokenExpiresAt,
    };
  }

  private parseState(stateB64: string): OAuthStatePayload {
    try {
      return JSON.parse(
        Buffer.from(stateB64, 'base64url').toString('utf8'),
      ) as OAuthStatePayload;
    } catch {
      throw new BadRequestException('Invalid OAuth state parameter');
    }
  }

  private getServerUrl(): string {
    const serverUrl =
      this.config.get<string>('RINGCENTRAL_SERVER_URL') ??
      'https://platform.ringcentral.com';
    return serverUrl.replace(/\/+$/, '');
  }

  private getScopes(): string[] {
    const configured = this.config.get<string>('RINGCENTRAL_SCOPES')?.trim();
    if (!configured) {
      return [...DEFAULT_RINGCENTRAL_SCOPES];
    }
    return configured
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  private parseScopes(scopeString?: string): string[] {
    if (!scopeString) {
      return this.getScopes();
    }
    return scopeString
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured`);
    }
    return value;
  }

  private async exchangeAuthorizationCode(code: string): Promise<RingCentralTokenResponse> {
    return this.performTokenGrant(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.getRequiredConfig('RINGCENTRAL_REDIRECT_URI'),
      }),
    );
  }

  private async performTokenGrant(body: URLSearchParams): Promise<RingCentralTokenResponse> {
    const tokenUrl = new URL('/restapi/oauth/token', this.getServerUrl());
    const clientId = this.getRequiredConfig('RINGCENTRAL_CLIENT_ID');
    const clientSecret = this.getRequiredConfig('RINGCENTRAL_CLIENT_SECRET');

    const response = await fetch(tokenUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body,
    });

    if (!response.ok) {
      const message = await this.readErrorMessage(response, 'ringcentral_token_exchange_failed');
      throw new BadRequestException(message);
    }

    return (await response.json()) as RingCentralTokenResponse;
  }

  private async apiGet<T>(path: string, accessToken: string): Promise<T> {
    const url = new URL(path, this.getServerUrl());
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const message = await this.readErrorMessage(response, 'ringcentral_api_call_failed');
      throw new BadRequestException(message);
    }

    return (await response.json()) as T;
  }

  private async apiRequest<T>(
    connection: RingCentralConnectionDocument,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
    allowUnauthorizedRetry = true,
  ): Promise<T> {
    const attemptRequest = async (accessToken: string) => {
      const url = new URL(path, this.getServerUrl());
      return fetch(url.toString(), {
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            }
          : {
              Authorization: `Bearer ${accessToken}`,
            },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    };

    let authorized = await this.getAuthorizedAccessToken(connection);
    let response = await attemptRequest(authorized.accessToken);

    if (response.status === 401 && allowUnauthorizedRetry) {
      authorized = await this.getAuthorizedAccessToken(authorized.connection, true);
      response = await attemptRequest(authorized.accessToken);
    }

    if (!response.ok) {
      const message = await this.readErrorMessage(response, 'ringcentral_api_call_failed');
      if (response.status === 401 || response.status === 403) {
        await this.markConnectionReauthorizationRequired(authorized.connection, message);
      }
      throw new BadRequestException(message);
    }

    await this.connectionModel.findByIdAndUpdate(authorized.connection._id, {
      $set: {
        connectionState: {
          status: 'active',
          lastError: undefined,
          lastSeenAt: new Date(),
        },
      },
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private async getAuthorizedAccessToken(
    connection: RingCentralConnectionDocument,
    forceRefresh = false,
  ): Promise<RingCentralConnectionAccessToken> {
    const credentials = await this.getDecryptedCredentials(connection);
    const tokenExpiresAt = credentials.tokenExpiresAt?.getTime();
    const needsRefresh =
      forceRefresh ||
      !tokenExpiresAt ||
      tokenExpiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_WINDOW_MS;

    if (!needsRefresh) {
      return {
        connection,
        accessToken: credentials.accessToken,
      };
    }

    return this.refreshAccessToken(connection);
  }

  private async refreshAccessToken(
    connection: RingCentralConnectionDocument,
  ): Promise<RingCentralConnectionAccessToken> {
    const cacheKey = String(connection._id);
    const existingRefresh = this.tokenRefreshes.get(cacheKey);
    if (existingRefresh) {
      const updatedConnection = await existingRefresh;
      const credentials = await this.getDecryptedCredentials(updatedConnection);
      return {
        connection: updatedConnection,
        accessToken: credentials.accessToken,
      };
    }

    const refreshPromise = (async () => {
      const credentials = await this.getDecryptedCredentials(connection);
      if (!credentials.refreshToken) {
        throw new BadRequestException('RingCentral refresh token is missing');
      }

      const tokens = await this.performTokenGrant(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: credentials.refreshToken,
        }),
      );

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new BadRequestException('RingCentral refresh token exchange failed');
      }

      const updatedConnection = await this.connectionModel
        .findByIdAndUpdate(
          connection._id,
          {
            $set: {
              encryptedAccessToken: this.encryption.encrypt(
                tokens.access_token,
                connection.organizationId,
              ),
              encryptedRefreshToken: this.encryption.encrypt(
                tokens.refresh_token,
                connection.organizationId,
              ),
              tokenExpiresAt:
                typeof tokens.expires_in === 'number'
                  ? new Date(Date.now() + tokens.expires_in * 1000)
                  : undefined,
              scopes: this.parseScopes(tokens.scope),
              connectionState: {
                status: 'active',
                lastError: undefined,
                lastSeenAt: new Date(),
              },
            },
          },
          { new: true },
        )
        .exec();

      if (!updatedConnection) {
        throw new NotFoundException('RingCentral connection disappeared during token refresh');
      }

      return updatedConnection;
    })()
      .catch(async (error) => {
        await this.markConnectionReauthorizationRequired(
          connection,
          error instanceof Error ? error.message : 'RingCentral token refresh failed',
        );
        throw error;
      })
      .finally(() => {
        this.tokenRefreshes.delete(cacheKey);
      });

    this.tokenRefreshes.set(cacheKey, refreshPromise);
    const updatedConnection = await refreshPromise;
    const updatedCredentials = await this.getDecryptedCredentials(updatedConnection);
    return {
      connection: updatedConnection,
      accessToken: updatedCredentials.accessToken,
    };
  }

  private async markConnectionReauthorizationRequired(
    connection: RingCentralConnectionDocument,
    message: string,
  ): Promise<void> {
    await this.connectionModel.findByIdAndUpdate(connection._id, {
      $set: {
        connectionState: {
          status: 'reauthorization_required',
          lastError: message,
          lastSeenAt: new Date(),
        },
      },
    });
  }

  private async resolveAccessibleConnections(
    organizationId: string,
    userId: string,
    role: UserRole,
    filters?: { connectionId?: string; brandId?: string },
  ): Promise<RingCentralConnectionDocument[]> {
    if (filters?.connectionId) {
      const connection = await this.resolveConnectionById(
        organizationId,
        userId,
        role,
        filters.connectionId,
      );
      return connection ? [connection] : [];
    }

    const query = this.isPrivileged(role)
      ? { organizationId, isActive: true }
      : { organizationId, isActive: true, userId };

    return this.connectionModel
      .find(filters?.brandId ? { ...query, brandId: filters.brandId } : query)
      .sort({ isDefault: -1, createdAt: 1 })
      .exec();
  }

  private async resolveConnectionById(
    organizationId: string,
    userId: string,
    role: UserRole,
    connectionId: string,
  ): Promise<RingCentralConnectionDocument> {
    const connection = await this.connectionModel.findOne({
      _id: connectionId,
      organizationId,
      isActive: true,
      ...(this.isPrivileged(role) ? {} : { userId }),
    });

    if (!connection) {
      throw new NotFoundException(`RingCentral connection ${connectionId} not found`);
    }

    return connection;
  }

  private async resolveConnectionForCall(
    organizationId: string,
    userId: string,
    role: UserRole,
    connectionId?: string,
    brandId?: string,
  ): Promise<RingCentralConnectionDocument> {
    if (connectionId) {
      return this.resolveConnectionById(organizationId, userId, role, connectionId);
    }

    const connections = await this.resolveAccessibleConnections(
      organizationId,
      userId,
      role,
    );

    if (connections.length === 0) {
      throw new NotFoundException('No active RingCentral connections found');
    }

    if (brandId) {
      const brandDefault = connections.find(
        (candidate) => candidate.brandId === brandId && candidate.isDefault,
      );
      if (brandDefault) {
        return brandDefault;
      }

      const brandSpecific = connections.find((candidate) => candidate.brandId === brandId);
      if (brandSpecific) {
        return brandSpecific;
      }
    }

    return connections.find((candidate) => candidate.isDefault) ?? connections[0];
  }

  private async getAccessibleCallSession(
    organizationId: string,
    userId: string,
    role: UserRole,
    callId: string,
  ): Promise<RingCentralCallSessionDocument> {
    const session = await this.callSessionModel.findOne({
      _id: callId,
      organizationId,
      ...(this.isPrivileged(role) ? {} : { userId }),
    });

    if (!session) {
      throw new NotFoundException(`RingCentral call ${callId} not found`);
    }
    return session;
  }

  private async getAccessibleSmsThread(
    organizationId: string,
    userId: string,
    role: UserRole,
    threadId: string,
  ): Promise<RingCentralSmsThreadDocument> {
    const thread = await this.smsThreadModel.findOne({
      _id: threadId,
      organizationId,
      ...(this.isPrivileged(role) ? {} : { userId }),
    });

    if (!thread) {
      throw new NotFoundException(`RingCentral SMS thread ${threadId} not found`);
    }

    return thread;
  }

  private shouldSyncCall(session: RingCentralCallSessionDocument): boolean {
    if (!session.ringOutId || !OPEN_CALL_STATUSES.includes(session.callStatus)) {
      return false;
    }

    const lastPolledAt = session.lastPolledAt?.getTime() ?? 0;
    return Date.now() - lastPolledAt >= 2_000;
  }

  private async syncTrackedCall(
    session: RingCentralCallSessionDocument,
    connection: RingCentralConnectionDocument,
  ): Promise<RingCentralCallSessionDocument> {
    if (!session.ringOutId) {
      return session;
    }

    const response = await this.apiRequest<RingOutStatusResponse>(
      connection,
      'GET',
      `/restapi/v1.0/account/~/extension/~/ring-out/${session.ringOutId}`,
    );

    const callStatus = this.mapRingOutStatus(response.status, session.callStatus);
    const updatedSession = await this.callSessionModel
      .findByIdAndUpdate(
        session._id,
        {
          $set: {
            callStatus,
            providerCallStatus: response.status?.callStatus,
            providerCallerStatus: response.status?.callerStatus,
            providerCalleeStatus: response.status?.calleeStatus,
            failureReason:
              callStatus === 'failed'
                ? response.status?.callStatus ?? response.status?.calleeStatus
                : undefined,
            lastPolledAt: new Date(),
            lastProviderPayload: response as unknown as Record<string, unknown>,
          },
        },
        { new: true },
      )
      .exec();

    return updatedSession ?? session;
  }

  private async loadConnectionsById(
    organizationId: string,
    connectionIds: string[],
  ): Promise<Map<string, RingCentralConnectionDocument>> {
    if (connectionIds.length === 0) {
      return new Map();
    }

    const connections = await this.connectionModel
      .find({
        organizationId,
        _id: { $in: Array.from(new Set(connectionIds)) },
      })
      .exec();

    return new Map(connections.map((connection) => [String(connection._id), connection]));
  }

  private async enqueueWebhookSubscriptionSync(connectionId: string): Promise<void> {
    await this.connectionModel.findByIdAndUpdate(connectionId, {
      $set: {
        'webhookState.status': 'pending',
        'webhookState.lastError': undefined,
        'webhookState.lastSyncedAt': new Date(),
      },
    });

    await this.ringCentralSubscriptionsQueue.add(
      'sync-webhook-subscription',
      { connectionId },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  private async syncWebhookSubscriptionForConnection(
    connection: RingCentralConnectionDocument,
  ): Promise<void> {
    if (!this.shouldRefreshWebhookSubscription(connection)) {
      return;
    }

    const validationToken = crypto.randomBytes(24).toString('hex');
    const deliveryAddress = this.resolveWebhookAddress();
    const requestBody = {
      eventFilters: [...DEFAULT_RINGCENTRAL_WEBHOOK_EVENT_FILTERS],
      deliveryMode: {
        transportType: 'WebHook',
        address: deliveryAddress,
        verificationType: 'Validation-Token',
        validationToken,
      },
      expiresIn: WEBHOOK_SUBSCRIPTION_EXPIRES_IN_SECONDS,
    } satisfies Record<string, unknown>;

    await this.connectionModel.findByIdAndUpdate(connection._id, {
      $set: {
        'webhookState.status': 'pending',
        'webhookState.lastError': undefined,
        'webhookState.lastSyncedAt': new Date(),
      },
    });

    try {
      const response = connection.webhookState?.subscriptionId
        ? await this.apiRequest<RingCentralSubscriptionResponse>(
            connection,
            'PUT',
            `/restapi/v1.0/subscription/${connection.webhookState.subscriptionId}`,
            requestBody,
          )
        : await this.apiRequest<RingCentralSubscriptionResponse>(
            connection,
            'POST',
            '/restapi/v1.0/subscription',
            requestBody,
          );

      const expiresAt = this.resolveSubscriptionExpiry(response);
      await this.connectionModel.findByIdAndUpdate(connection._id, {
        $set: {
          'webhookState.status': 'active',
          'webhookState.subscriptionId': response.id ? String(response.id) : undefined,
          'webhookState.validationTokenHash': this.hashWebhookValidationToken(validationToken),
          'webhookState.deliveryAddress':
            response.deliveryMode?.address ?? deliveryAddress,
          'webhookState.eventFilters':
            response.eventFilters?.length
              ? response.eventFilters
              : [...DEFAULT_RINGCENTRAL_WEBHOOK_EVENT_FILTERS],
          'webhookState.expiresAt': expiresAt,
          'webhookState.lastError': undefined,
          'webhookState.lastSyncedAt': new Date(),
        },
      });
    } catch (error) {
      await this.connectionModel.findByIdAndUpdate(connection._id, {
        $set: {
          'webhookState.status': 'error',
          'webhookState.lastError':
            error instanceof Error ? error.message : 'RingCentral webhook sync failed',
          'webhookState.lastSyncedAt': new Date(),
        },
      });
      throw error;
    }
  }

  private shouldRefreshWebhookSubscription(
    connection: RingCentralConnectionDocument,
  ): boolean {
    const status = connection.webhookState?.status;
    const subscriptionId = connection.webhookState?.subscriptionId;
    const expiresAt = connection.webhookState?.expiresAt;

    if (!subscriptionId || !expiresAt) {
      return true;
    }

    if (status === 'error' || status === 'expired' || status === 'inactive' || status === 'expiring') {
      return true;
    }

    return expiresAt.getTime() - Date.now() <= WEBHOOK_SUBSCRIPTION_EXPIRING_WINDOW_MS;
  }

  private resolveSubscriptionExpiry(response: RingCentralSubscriptionResponse): Date {
    if (response.expirationTime) {
      return new Date(response.expirationTime);
    }

    const expiresIn = typeof response.expiresIn === 'number'
      ? response.expiresIn
      : WEBHOOK_SUBSCRIPTION_EXPIRES_IN_SECONDS;
    return new Date(Date.now() + expiresIn * 1000);
  }

  private resolveWebhookAddress(): string {
    const explicit =
      this.config.get<string>('RINGCENTRAL_WEBHOOK_URL') ??
      this.config.get<string>('COMM_SERVICE_PUBLIC_URL') ??
      this.config.get<string>('COMM_SERVICE_URL');

    if (!explicit) {
      return 'http://localhost:3002/api/comm/ringcentral/webhooks';
    }

    const base = explicit.replace(/\/+$/, '');
    if (base.endsWith('/api/comm/ringcentral/webhooks')) {
      return base;
    }
    if (base.endsWith('/api/comm')) {
      return `${base}/ringcentral/webhooks`;
    }
    return `${base}/api/comm/ringcentral/webhooks`;
  }

  private hashWebhookValidationToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private isSubscriptionRenewalWebhookEvent(event?: string): boolean {
    const normalized = event?.toLowerCase() ?? '';
    return normalized.includes(
      RINGCENTRAL_SUBSCRIPTION_RENEWAL_FILTER.split('~')[0].toLowerCase(),
    );
  }

  private isTelephonyWebhookEvent(event?: string): boolean {
    const normalized = event?.toLowerCase() ?? '';
    return normalized.includes(
      `/${RINGCENTRAL_TELEPHONY_EVENT_FILTER.split('/extension/~/')[1]?.toLowerCase() ?? 'telephony/sessions'}`,
    );
  }

  private isSmsWebhookEvent(event?: string): boolean {
    const normalized = event?.toLowerCase() ?? '';
    const eventPath =
      RINGCENTRAL_SMS_EVENT_FILTER.split('/extension/~/')[1]
        ?.split('?')[0]
        ?.toLowerCase() ?? 'message-store/instant';
    return (
      normalized.includes(`/${eventPath}`) &&
      normalized.includes('type=sms')
    );
  }

  private serializeTelephonyWebhook(
    connection: RingCentralConnectionDocument,
    notification: RingCentralWebhookNotification,
  ): RingCentralTelephonySummary | null {
    const party = this.resolveTelephonyParty(connection, notification);
    if (!party) {
      return null;
    }

    const callStatus = this.mapTelephonyStatus(
      party.status?.code,
      Boolean(party.missedCall),
    );
    const statusCode = this.normalizeString(party.status?.code);
    const isTerminal = TERMINAL_CALL_STATUSES.includes(callStatus);

    return {
      id: `${String(connection._id)}:${String(
        notification.body?.telephonySessionId ?? notification.body?.sessionId ?? party.id ?? crypto.randomUUID(),
      )}`,
      connectionId: String(connection._id),
      connectionLabel:
        connection.displayName || connection.email || connection.extensionNumber || connection.id,
      brandId: connection.brandId,
      sessionId: notification.body?.sessionId
        ? String(notification.body.sessionId)
        : undefined,
      telephonySessionId: notification.body?.telephonySessionId
        ? String(notification.body.telephonySessionId)
        : undefined,
      partyId: party.id ? String(party.id) : undefined,
      direction: party.direction,
      callStatus,
      statusCode,
      statusReason: this.normalizeString(party.status?.reason),
      eventTime: notification.body?.eventTime ?? notification.timestamp,
      fromName: party.from?.name,
      fromPhoneNumber: party.from?.phoneNumber,
      toName: party.to?.name,
      toPhoneNumber: party.to?.phoneNumber,
      missedCall: Boolean(party.missedCall),
      isRinging:
        party.direction === 'Inbound' &&
        (callStatus === 'queued' || callStatus === 'dialing'),
      isTerminal,
    };
  }

  private async upsertCallSessionFromWebhook(
    connection: RingCentralConnectionDocument,
    summary: RingCentralTelephonySummary,
  ) {
    const existingSession = await this.findCallSessionForTelephonyEvent(connection, summary);
    const matchedPhoneNumber = this.resolveExternalPhoneNumber(summary);
    const contactMatch = matchedPhoneNumber
      ? await this.lookupPhoneLinkedEntity(connection.organizationId, matchedPhoneNumber)
      : undefined;

    const session =
      existingSession ??
      (await this.callSessionModel.create({
        organizationId: connection.organizationId,
        userId: connection.userId,
        connectionId: String(connection._id),
        brandId: connection.brandId,
        callStatus: summary.callStatus,
        toPhoneNumber: summary.toPhoneNumber ?? 'Unknown',
        fromPhoneNumber: summary.fromPhoneNumber,
        source: 'webhook',
      }));

    const updatedSession = await this.callSessionModel
      .findByIdAndUpdate(
        session._id,
        {
          $set: {
            organizationId: connection.organizationId,
            userId: connection.userId,
            connectionId: String(connection._id),
            brandId: session.brandId ?? connection.brandId,
            entityType: session.entityType ?? contactMatch?.entityType,
            entityId: session.entityId ?? contactMatch?.id,
            contactName:
              session.contactName ??
              contactMatch?.name ??
              summary.toName ??
              summary.fromName,
            matchedPhoneNumber: matchedPhoneNumber ?? session.matchedPhoneNumber,
            toPhoneNumber: summary.toPhoneNumber ?? session.toPhoneNumber,
            fromPhoneNumber: summary.fromPhoneNumber ?? session.fromPhoneNumber,
            fromName: summary.fromName ?? session.fromName,
            toName: summary.toName ?? session.toName,
            sessionId: summary.sessionId ?? session.sessionId,
            telephonySessionId:
              summary.telephonySessionId ?? session.telephonySessionId,
            partyId: summary.partyId ?? session.partyId,
            direction: summary.direction ?? session.direction,
            missedCall: summary.missedCall,
            eventTime: summary.eventTime ? new Date(summary.eventTime) : session.eventTime,
            source: 'webhook',
            callStatus: summary.callStatus,
            providerCallStatus: summary.statusCode ?? session.providerCallStatus,
            failureReason:
              summary.callStatus === 'failed'
                ? summary.statusReason ?? session.failureReason
                : undefined,
            lastProviderPayload: {
              ...(session.lastProviderPayload ?? {}),
              telephonyEvent: summary,
            },
          },
        },
        { new: true },
      )
      .exec();

    return this.serializeCallSession(updatedSession ?? session, connection);
  }

  private async findCallSessionForTelephonyEvent(
    connection: RingCentralConnectionDocument,
    summary: RingCentralTelephonySummary,
  ): Promise<RingCentralCallSessionDocument | null> {
    const directMatch =
      (summary.telephonySessionId &&
        (await this.callSessionModel
          .findOne({
            organizationId: connection.organizationId,
            connectionId: String(connection._id),
            telephonySessionId: summary.telephonySessionId,
            ...(summary.partyId ? { partyId: summary.partyId } : {}),
          })
          .exec())) ||
      (summary.sessionId &&
        (await this.callSessionModel
          .findOne({
            organizationId: connection.organizationId,
            connectionId: String(connection._id),
            sessionId: summary.sessionId,
            ...(summary.partyId ? { partyId: summary.partyId } : {}),
          })
          .exec()));

    if (directMatch) {
      return directMatch;
    }

    const normalizedFrom = this.normalizePhoneDigits(summary.fromPhoneNumber);
    const normalizedTo = this.normalizePhoneDigits(summary.toPhoneNumber);
    if (!normalizedFrom && !normalizedTo) {
      return null;
    }

    const recentSessions = await this.callSessionModel
      .find({
        organizationId: connection.organizationId,
        connectionId: String(connection._id),
        createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();

    return (
      recentSessions.find((session) => {
        const candidateFrom = this.normalizePhoneDigits(session.fromPhoneNumber);
        const candidateTo = this.normalizePhoneDigits(session.toPhoneNumber);
        return (
          (!normalizedFrom || !candidateFrom || normalizedFrom === candidateFrom) &&
          (!normalizedTo || !candidateTo || normalizedTo === candidateTo)
        );
      }) ?? null
    );
  }

  private async lookupPhoneLinkedEntity(
    organizationId: string,
    phoneNumber: string,
  ): Promise<InternalContactLookupResult | undefined> {
    const matches = await this.contactsClient.lookupByPhones(organizationId, [phoneNumber]);
    return matches.sort((a, b) => this.contactLookupPriority(a) - this.contactLookupPriority(b))[0];
  }

  private contactLookupPriority(contact: InternalContactLookupResult): number {
    return contact.entityType === 'client' ? 0 : 1;
  }

  private resolveExternalPhoneNumber(summary: RingCentralTelephonySummary): string | undefined {
    return summary.direction === 'Inbound'
      ? summary.fromPhoneNumber
      : summary.toPhoneNumber;
  }

  private async upsertSmsMessageFromWebhook(
    connection: RingCentralConnectionDocument,
    notification: RingCentralWebhookNotification,
  ) {
    const body = notification.body;
    if (!body) {
      return null;
    }

    const providerMessageId = body.id ? String(body.id) : undefined;
    const providerMessage = providerMessageId
      ? await this.fetchSmsMessageInfo(connection, providerMessageId).catch(() => ({
          id: providerMessageId,
          conversationId: body.conversationId,
          direction: body.direction,
          from: body.from,
          to: body.to,
          subject: body.subject,
          creationTime: body.creationTime,
          lastModifiedTime: body.lastModifiedTime,
          readStatus: body.readStatus,
          messageStatus: body.messageStatus,
          availability: body.availability,
        }))
      : {
          conversationId: body.conversationId,
          direction: body.direction,
          from: body.from,
          to: body.to,
          subject: body.subject,
          creationTime: body.creationTime,
          lastModifiedTime: body.lastModifiedTime,
          readStatus: body.readStatus,
          messageStatus: body.messageStatus,
          availability: body.availability,
        };

    return this.upsertSmsMessageFromProvider(connection, providerMessage);
  }

  private async fetchSmsMessageInfo(
    connection: RingCentralConnectionDocument,
    messageId: string,
  ): Promise<RingCentralSmsMessageInfo> {
    return this.apiRequest<RingCentralSmsMessageInfo>(
      connection,
      'GET',
      `/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
    );
  }

  private async upsertSmsMessageFromProvider(
    connection: RingCentralConnectionDocument,
    info: RingCentralSmsMessageInfo,
    context?: {
      entityType?: string;
      entityId?: string;
      contactName?: string;
    },
  ) {
    const direction = this.normalizeSmsDirection(info.direction, info.from?.extensionId, connection);
    const participantPhoneNumber = this.resolveSmsCounterpartyPhoneNumber(connection, info, direction);
    const providerMessageId = this.normalizeString(info.id ? String(info.id) : undefined);

    if (!direction || !participantPhoneNumber || !providerMessageId) {
      return null;
    }

    const contactMatch = await this.lookupPhoneLinkedEntity(
      connection.organizationId,
      participantPhoneNumber,
    ).catch(() => undefined);

    const thread = await this.upsertSmsThread(connection, {
      participantPhoneNumber,
      participantName:
        direction === 'Inbound'
          ? this.normalizeString(info.from?.name)
          : this.normalizeString(info.to?.[0]?.name),
      providerConversationId: this.normalizeString(
        info.conversationId ? String(info.conversationId) : undefined,
      ),
      fromPhoneNumber:
        direction === 'Outbound'
          ? this.normalizeString(info.from?.phoneNumber)
          : this.normalizeString(
              info.to?.find((entry) => this.connectionOwnsPhoneNumber(connection, entry.phoneNumber))
                ?.phoneNumber,
            ) ?? connection.defaultOutboundPhoneNumber,
      entityType: context?.entityType ?? contactMatch?.entityType,
      entityId: context?.entityId ?? contactMatch?.id,
      contactName:
        context?.contactName ??
        contactMatch?.name ??
        this.normalizeString(info.from?.name) ??
        this.normalizeString(info.to?.[0]?.name),
    });

    const sentAt = this.parseOptionalDate(info.creationTime) ?? new Date();
    const lastModifiedTime = this.parseOptionalDate(info.lastModifiedTime);
    const message = await this.smsMessageModel
      .findOneAndUpdate(
        {
          organizationId: connection.organizationId,
          providerMessageId,
        },
        {
          $setOnInsert: {
            organizationId: connection.organizationId,
            userId: connection.userId,
            connectionId: String(connection._id),
            threadId: String(thread._id),
          },
          $set: {
            brandId: thread.brandId ?? connection.brandId,
            entityType: thread.entityType,
            entityId: thread.entityId,
            providerConversationId: thread.providerConversationId,
            direction,
            fromPhoneNumber: this.normalizeString(info.from?.phoneNumber),
            fromName: this.normalizeString(info.from?.name),
            toPhoneNumbers: (info.to ?? [])
              .map((entry) => this.normalizeString(entry.phoneNumber))
              .filter((value): value is string => Boolean(value)),
            toNames: (info.to ?? [])
              .map((entry) => this.normalizeString(entry.name))
              .filter((value): value is string => Boolean(value)),
            subject: this.normalizeString(info.subject),
            messageStatus: this.normalizeString(info.messageStatus),
            readStatus: this.normalizeString(info.readStatus),
            sentAt,
            lastModifiedTime,
            isRead: this.isReadStatusRead(info.readStatus) || direction === 'Outbound',
            lastProviderPayload: info as unknown as Record<string, unknown>,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    if (!message) {
      return null;
    }

    const refreshedThread = await this.refreshSmsThreadState(thread);
    return this.serializeSmsMessage(message, connection, refreshedThread);
  }

  private async upsertSmsThread(
    connection: RingCentralConnectionDocument,
    input: {
      participantPhoneNumber: string;
      participantName?: string;
      providerConversationId?: string;
      fromPhoneNumber?: string;
      entityType?: string;
      entityId?: string;
      contactName?: string;
    },
  ): Promise<RingCentralSmsThreadDocument> {
    const existingByConversation =
      input.providerConversationId
        ? await this.smsThreadModel
            .findOne({
              organizationId: connection.organizationId,
              connectionId: String(connection._id),
              providerConversationId: input.providerConversationId,
            })
            .exec()
        : null;
    const existingThread =
      existingByConversation ??
      (await this.smsThreadModel
        .findOne({
          organizationId: connection.organizationId,
          connectionId: String(connection._id),
          participantPhoneNumber: input.participantPhoneNumber,
        })
        .exec());

    const thread = await this.smsThreadModel
      .findOneAndUpdate(
        existingThread
          ? { _id: existingThread._id }
          : {
              organizationId: connection.organizationId,
              connectionId: String(connection._id),
              participantPhoneNumber: input.participantPhoneNumber,
            },
        {
          $setOnInsert: {
            organizationId: connection.organizationId,
            userId: connection.userId,
            connectionId: String(connection._id),
            participantPhoneNumber: input.participantPhoneNumber,
          },
          $set: {
            brandId: connection.brandId,
            entityType: input.entityType ?? existingThread?.entityType,
            entityId: input.entityId ?? existingThread?.entityId,
            contactName: input.contactName ?? existingThread?.contactName,
            participantName: input.participantName ?? existingThread?.participantName,
            providerConversationId:
              input.providerConversationId ?? existingThread?.providerConversationId,
            fromPhoneNumber: input.fromPhoneNumber ?? existingThread?.fromPhoneNumber,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    return thread;
  }

  private async refreshSmsThreadState(
    thread: RingCentralSmsThreadDocument,
  ): Promise<RingCentralSmsThreadDocument> {
    const threadId = String(thread._id);
    const [messageCount, unreadCount, latestMessage, lastInbound, lastOutbound] = await Promise.all([
      this.smsMessageModel.countDocuments({
        organizationId: thread.organizationId,
        threadId,
      }),
      this.smsMessageModel.countDocuments({
        organizationId: thread.organizationId,
        threadId,
        direction: 'Inbound',
        isRead: false,
      }),
      this.smsMessageModel
        .findOne({ organizationId: thread.organizationId, threadId })
        .sort({ sentAt: -1, createdAt: -1 })
        .exec(),
      this.smsMessageModel
        .findOne({
          organizationId: thread.organizationId,
          threadId,
          direction: 'Inbound',
        })
        .sort({ sentAt: -1, createdAt: -1 })
        .exec(),
      this.smsMessageModel
        .findOne({
          organizationId: thread.organizationId,
          threadId,
          direction: 'Outbound',
        })
        .sort({ sentAt: -1, createdAt: -1 })
        .exec(),
    ]);

    const updatedThread = await this.smsThreadModel
      .findByIdAndUpdate(
        thread._id,
        {
          $set: {
            messageCount,
            unreadCount,
            lastMessageAt: latestMessage?.sentAt ?? latestMessage?.createdAt,
            lastInboundAt: lastInbound?.sentAt ?? lastInbound?.createdAt,
            lastOutboundAt: lastOutbound?.sentAt ?? lastOutbound?.createdAt,
            snippet: latestMessage?.subject,
            lastMessageDirection: latestMessage?.direction,
            lastMessageStatus: latestMessage?.messageStatus,
          },
        },
        { new: true },
      )
      .exec();

    return updatedThread ?? thread;
  }

  private resolveSmsCounterpartyPhoneNumber(
    connection: RingCentralConnectionDocument,
    info: RingCentralSmsMessageInfo,
    direction: RingCentralSmsDirection,
  ): string | undefined {
    if (direction === 'Inbound') {
      return this.normalizeString(info.from?.phoneNumber);
    }

    const toPhoneNumbers = (info.to ?? [])
      .map((entry) => this.normalizeString(entry.phoneNumber))
      .filter((value): value is string => Boolean(value));

    return (
      toPhoneNumbers.find((phoneNumber) => !this.connectionOwnsPhoneNumber(connection, phoneNumber)) ??
      toPhoneNumbers[0]
    );
  }

  private resolveSmsSenderPhoneNumber(
    connection: RingCentralConnectionDocument,
    requestedPhoneNumber?: string,
  ): string {
    const normalizedRequested = this.normalizeString(requestedPhoneNumber);
    if (normalizedRequested) {
      if (!this.connectionOwnsSmsPhoneNumber(connection, normalizedRequested)) {
        throw new BadRequestException('Requested SMS sender number is not enabled for this connection');
      }
      return normalizedRequested;
    }

    if (
      connection.defaultOutboundPhoneNumber &&
      this.connectionOwnsSmsPhoneNumber(connection, connection.defaultOutboundPhoneNumber)
    ) {
      return connection.defaultOutboundPhoneNumber;
    }

    const fallbackNumber = connection.smsSenderPhoneNumbers[0];
    if (!fallbackNumber) {
      throw new BadRequestException('No SMS-enabled sender numbers are configured for this RingCentral connection');
    }

    return fallbackNumber;
  }

  private connectionOwnsSmsPhoneNumber(
    connection: RingCentralConnectionDocument,
    phoneNumber?: string,
  ): boolean {
    const normalizedTarget = this.normalizePhoneDigits(phoneNumber);
    if (!normalizedTarget) {
      return false;
    }

    return connection.smsSenderPhoneNumbers.some(
      (candidate) => this.normalizePhoneDigits(candidate) === normalizedTarget,
    );
  }

  private connectionOwnsPhoneNumber(
    connection: RingCentralConnectionDocument,
    phoneNumber?: string,
  ): boolean {
    const normalizedTarget = this.normalizePhoneDigits(phoneNumber);
    if (!normalizedTarget) {
      return false;
    }

    const ownedPhoneNumbers = [
      connection.mainPhoneNumber,
      connection.defaultOutboundPhoneNumber,
      ...connection.directPhoneNumbers,
      ...connection.smsSenderPhoneNumbers,
      ...connection.phoneNumbers.map((entry) => entry.phoneNumber),
    ];

    return ownedPhoneNumbers.some(
      (candidate) => this.normalizePhoneDigits(candidate) === normalizedTarget,
    );
  }

  private normalizeSmsDirection(
    direction?: string,
    fromExtensionId?: string | number,
    connection?: RingCentralConnectionDocument,
  ): RingCentralSmsDirection | undefined {
    const normalized = direction?.trim().toLowerCase();
    if (normalized === 'inbound') {
      return 'Inbound';
    }
    if (normalized === 'outbound') {
      return 'Outbound';
    }

    if (connection && fromExtensionId && String(fromExtensionId) === connection.extensionId) {
      return 'Outbound';
    }

    return undefined;
  }

  private isReadStatusRead(readStatus?: string): boolean {
    return readStatus?.trim().toLowerCase() === 'read';
  }

  private parseOptionalDate(value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private resolveTelephonyParty(
    connection: RingCentralConnectionDocument,
    notification: RingCentralWebhookNotification,
  ) {
    const parties = notification.body?.parties ?? [];
    if (parties.length === 0) {
      return undefined;
    }

    return (
      parties.find((party) => {
        const candidateExtensionId = party.extensionId
          ? String(party.extensionId)
          : undefined;
        return candidateExtensionId === connection.extensionId;
      }) ?? parties[0]
    );
  }

  private mapTelephonyStatus(
    statusCode?: string,
    missedCall = false,
  ): RingCentralCallStatus {
    const normalized = statusCode?.trim().toLowerCase();

    if (!normalized) {
      return missedCall ? 'failed' : 'queued';
    }

    if (['setup', 'proceeding', 'parked', 'hold'].includes(normalized)) {
      return 'dialing';
    }

    if (['answered', 'connected'].includes(normalized)) {
      return 'connected';
    }

    if (['voicemail', 'busy', 'rejected', 'noanswer', 'disconnected'].includes(normalized)) {
      return missedCall || normalized !== 'disconnected' ? 'failed' : 'finished';
    }

    if (['gone'].includes(normalized)) {
      return missedCall ? 'failed' : 'finished';
    }

    return missedCall ? 'failed' : 'dialing';
  }

  private mapRingOutStatus(
    status?: RingOutStatusResponse['status'],
    currentStatus?: RingCentralCallStatus,
  ): RingCentralCallStatus {
    const callStatus = status?.callStatus;
    const callerStatus = status?.callerStatus;
    const calleeStatus = status?.calleeStatus;

    if (currentStatus === 'cancelled') {
      return 'cancelled';
    }

    if (callerStatus === 'Finished' || calleeStatus === 'Finished') {
      return 'finished';
    }

    if (
      callStatus === 'InProgress' ||
      callerStatus === 'InProgress' ||
      calleeStatus === 'InProgress'
    ) {
      return currentStatus === 'queued' ? 'queued' : 'dialing';
    }

    if (callStatus === 'Success') {
      return 'finished';
    }

    if (
      ['CannotReach', 'NoAnsweringMachine', 'NoSessionFound', 'Invalid'].includes(
        callStatus ?? '',
      ) ||
      ['Busy', 'NoAnswer', 'Rejected', 'GenericError', 'InternationalDisabled', 'Invalid'].includes(
        callerStatus ?? '',
      ) ||
      ['Busy', 'NoAnswer', 'Rejected', 'GenericError', 'InternationalDisabled', 'Invalid'].includes(
        calleeStatus ?? '',
      )
    ) {
      return 'failed';
    }

    return currentStatus ?? 'queued';
  }

  private serializeCallSession(
    session: RingCentralCallSessionDocument,
    connection?: RingCentralConnectionDocument,
  ) {
    return {
      id: String(session._id),
      connectionId: session.connectionId,
      connectionLabel:
        connection?.displayName ||
        connection?.email ||
        connection?.extensionNumber ||
        session.connectionId,
      brandId: session.brandId,
      entityType: session.entityType,
      entityId: session.entityId,
      contactName: session.contactName,
      matchedPhoneNumber: session.matchedPhoneNumber,
      toPhoneNumber: session.toPhoneNumber,
      fromPhoneNumber: session.fromPhoneNumber,
      fromName: session.fromName,
      toName: session.toName,
      ringOutId: session.ringOutId,
      ringOutUri: session.ringOutUri,
      sessionId: session.sessionId,
      telephonySessionId: session.telephonySessionId,
      partyId: session.partyId,
      direction: session.direction,
      missedCall: session.missedCall,
      eventTime: session.eventTime?.toISOString(),
      disposition: session.disposition,
      notes: session.notes,
      notesUpdatedAt: session.notesUpdatedAt?.toISOString(),
      notesUpdatedByUserId: session.notesUpdatedByUserId,
      source: session.source,
      callStatus: session.callStatus,
      providerCallStatus: session.providerCallStatus,
      providerCallerStatus: session.providerCallerStatus,
      providerCalleeStatus: session.providerCalleeStatus,
      failureReason: session.failureReason,
      lastPolledAt: session.lastPolledAt?.toISOString(),
      createdAt: session.createdAt?.toISOString(),
      updatedAt: session.updatedAt?.toISOString(),
    };
  }

  private serializeSmsThread(
    thread: RingCentralSmsThreadDocument,
    connection?: RingCentralConnectionDocument,
  ) {
    return {
      id: String(thread._id),
      connectionId: thread.connectionId,
      connectionLabel:
        connection?.displayName ||
        connection?.email ||
        connection?.extensionNumber ||
        thread.connectionId,
      brandId: thread.brandId,
      entityType: thread.entityType,
      entityId: thread.entityId,
      contactName: thread.contactName,
      participantPhoneNumber: thread.participantPhoneNumber,
      participantName: thread.participantName,
      providerConversationId: thread.providerConversationId,
      fromPhoneNumber: thread.fromPhoneNumber,
      messageCount: thread.messageCount,
      unreadCount: thread.unreadCount,
      lastMessageAt: thread.lastMessageAt?.toISOString(),
      lastInboundAt: thread.lastInboundAt?.toISOString(),
      lastOutboundAt: thread.lastOutboundAt?.toISOString(),
      snippet: thread.snippet,
      lastMessageDirection: thread.lastMessageDirection,
      lastMessageStatus: thread.lastMessageStatus,
      createdAt: thread.createdAt?.toISOString(),
      updatedAt: thread.updatedAt?.toISOString(),
    };
  }

  private serializeSmsMessage(
    message: RingCentralSmsMessageDocument,
    connection?: RingCentralConnectionDocument,
    thread?: RingCentralSmsThreadDocument,
  ) {
    return {
      id: String(message._id),
      threadId: message.threadId,
      connectionId: message.connectionId,
      connectionLabel:
        connection?.displayName ||
        connection?.email ||
        connection?.extensionNumber ||
        message.connectionId,
      brandId: message.brandId,
      entityType: message.entityType,
      entityId: message.entityId,
      providerMessageId: message.providerMessageId,
      providerConversationId: message.providerConversationId,
      direction: message.direction,
      fromPhoneNumber: message.fromPhoneNumber,
      fromName: message.fromName,
      toPhoneNumbers: message.toPhoneNumbers,
      toNames: message.toNames,
      participantPhoneNumber: thread?.participantPhoneNumber,
      contactName: thread?.contactName,
      subject: message.subject,
      messageStatus: message.messageStatus,
      readStatus: message.readStatus,
      isRead: message.isRead,
      sentAt: message.sentAt?.toISOString(),
      lastModifiedTime: message.lastModifiedTime?.toISOString(),
      createdAt: message.createdAt?.toISOString(),
      updatedAt: message.updatedAt?.toISOString(),
    };
  }

  private serializeActiveCall(
    connection: RingCentralConnectionDocument,
    record: NonNullable<RingCentralActiveCallsResponse['records']>[number],
  ) {
    return {
      id: `${String(connection._id)}:${String(
        record.id ?? record.sessionId ?? record.telephonySessionId ?? crypto.randomUUID(),
      )}`,
      connectionId: String(connection._id),
      connectionLabel:
        connection.displayName || connection.email || connection.extensionNumber || connection.id,
      brandId: connection.brandId,
      sessionId: record.sessionId ? String(record.sessionId) : undefined,
      telephonySessionId: record.telephonySessionId
        ? String(record.telephonySessionId)
        : undefined,
      partyId: record.partyId ? String(record.partyId) : undefined,
      direction: record.direction,
      result: record.result,
      startTime: record.startTime,
      duration: record.duration,
      fromName: record.from?.name,
      fromPhoneNumber: record.from?.phoneNumber,
      toName: record.to?.name,
      toPhoneNumber: record.to?.phoneNumber,
    };
  }

  private normalizePhoneNumbers(
    records: NonNullable<RingCentralPhoneNumbersResponse['records']>,
  ): RingCentralPhoneNumber[] {
    const seen = new Set<string>();
    const normalized: RingCentralPhoneNumber[] = [];

    for (const record of records) {
      const phoneNumber = record.phoneNumber?.trim();
      if (!phoneNumber || seen.has(phoneNumber)) {
        continue;
      }
      seen.add(phoneNumber);
      normalized.push({
        id: record.id ? String(record.id) : undefined,
        phoneNumber,
        usageType: record.usageType,
        type: record.type,
        features: Array.isArray(record.features) ? record.features : [],
      });
    }

    return normalized;
  }

  private normalizeString(value?: string | null): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private normalizePhoneDigits(value?: string | null): string | undefined {
    const digits = value?.replace(/\D/g, '');
    if (!digits) {
      return undefined;
    }

    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  private async readErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const payload = (await response.json()) as Record<string, unknown>;
      const message =
        typeof payload['message'] === 'string'
          ? payload['message']
          : typeof payload['error_description'] === 'string'
            ? payload['error_description']
            : typeof payload['description'] === 'string'
              ? payload['description']
              : undefined;
      return message ?? fallback;
    } catch {
      return fallback;
    }
  }
}
