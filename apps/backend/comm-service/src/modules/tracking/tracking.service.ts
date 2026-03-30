import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, createHmac, randomBytes } from 'crypto';
import {
  CommMessage,
  CommMessageDocument,
  CommMessageOpenSource,
} from '../../schemas/comm-message.schema';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import {
  CommMessageEvent,
  CommMessageEventDocument,
  CommMessageEventType,
} from '../../schemas/comm-message-event.schema';
import {
  CommMessageTrackingToken,
  CommMessageTrackingTokenDocument,
} from '../../schemas/comm-message-tracking-token.schema';
import { IntelligenceService } from '../intelligence/intelligence.service';

const OPEN_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);

const SECURITY_SCANNER_PATTERNS = [
  'barracuda',
  'curl',
  'google-safety',
  'headless',
  'mimecast',
  'outlook-ios',
  'proofpoint',
  'python-requests',
  'safelinks',
  'symantec',
  'trend micro',
  'urlscan',
  'wget',
];

const GOOGLE_PROXY_PATTERNS = ['googleimageproxy', 'googleusercontent'];
const DUPLICATE_OPEN_WINDOW_MS = 60 * 1000;
const IMMEDIATE_OPEN_WINDOW_MS = 2 * 1000;

type MessageEventContext = {
  organizationId: string;
  messageId?: string;
  threadId?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  identityId?: string;
  entityType?: string;
  entityId?: string;
  recipientEmail?: string;
};

export type PreparedOpenTracking = {
  tokenId: string;
  rawToken: string;
  pixelUrl: string;
  trackingMode: 'per_message';
  recipientEmail?: string;
};

type PrepareOpenTrackingInput = {
  organizationId: string;
  identityId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  entityType?: string;
  entityId?: string;
};

type ActivateOpenTrackingInput = {
  message: CommMessageDocument;
  thread?: CommThreadDocument | null;
  tokenId: string;
  eventContext?: Pick<MessageEventContext, 'entityType' | 'entityId' | 'recipientEmail'>;
};

type OpenPixelRequestContext = {
  ip?: string;
  userAgent?: string;
  referer?: string;
};

type OpenHeuristics = {
  ipHash?: string;
  userAgent?: string;
  userAgentHash?: string;
  referer?: string;
  source: CommMessageOpenSource;
  suspicionReasons: string[];
  isSuspicious: boolean;
  isHumanEstimated: boolean;
};

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    @InjectModel(CommThread.name)
    private readonly threadModel: Model<CommThreadDocument>,
    @InjectModel(CommMessageEvent.name)
    private readonly eventModel: Model<CommMessageEventDocument>,
    @InjectModel(CommMessageTrackingToken.name)
    private readonly tokenModel: Model<CommMessageTrackingTokenDocument>,
    private readonly config: ConfigService,
    private readonly intelligenceService: IntelligenceService,
  ) {}

  getTrackingPixel(): Buffer {
    return OPEN_PIXEL_GIF;
  }

  async prepareOpenTracking(input: PrepareOpenTrackingInput): Promise<PreparedOpenTracking | null> {
    const trackingBaseUrl = this.resolveTrackingBaseUrl();
    if (!trackingBaseUrl) {
      return null;
    }

    // Gmail sends a single MIME body to all recipients in this flow, so tracking is per-message.
    const recipientEmails = Array.from(
      new Set(
        [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])]
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const rawToken = randomBytes(24).toString('base64url');
    const token = await this.tokenModel.create({
      organizationId: input.organizationId,
      identityId: input.identityId,
      entityType: input.entityType,
      entityId: input.entityId,
      recipientEmail: recipientEmails.length === 1 ? recipientEmails[0] : undefined,
      recipientCount: recipientEmails.length,
      tokenHash: this.hashToken(rawToken),
      tokenType: 'open',
      trackingMode: 'per_message',
      status: 'reserved',
    });

    return {
      tokenId: String(token._id),
      rawToken,
      pixelUrl: `${trackingBaseUrl}/track/o/${encodeURIComponent(rawToken)}.gif`,
      trackingMode: 'per_message',
      recipientEmail: token.recipientEmail,
    };
  }

  injectOpenTrackingPixel(bodyHtml: string, pixelUrl: string): string {
    const pixelTag = `<img src="${this.escapeHtmlAttribute(pixelUrl)}" alt="" width="1" height="1" style="display:block!important;width:1px!important;height:1px!important;border:0!important;margin:0!important;padding:0!important;" />`;
    if (bodyHtml.includes(pixelTag) || bodyHtml.includes(pixelUrl)) {
      return bodyHtml;
    }

    if (/<\/body>/i.test(bodyHtml)) {
      return bodyHtml.replace(/<\/body>/i, `${pixelTag}</body>`);
    }

    return `${bodyHtml}${pixelTag}`;
  }

  stripInjectedTrackingPixels(bodyHtml?: string): string | undefined {
    if (!bodyHtml) {
      return bodyHtml;
    }

    const stripped = bodyHtml
      .replace(/<img\b[^>]*src=["'][^"']*\/track\/o\/[^"']+["'][^>]*>/gi, '')
      .trim();

    return stripped || undefined;
  }

  async activateOpenTracking(input: ActivateOpenTrackingInput): Promise<void> {
    const threadEntity = input.thread ? this.resolveThreadEntity(input.thread) : undefined;
    const token = await this.tokenModel.findByIdAndUpdate(
      input.tokenId,
      {
        $set: {
          messageId: String(input.message._id),
          threadId: input.thread ? String(input.thread._id) : undefined,
          gmailMessageId: input.message.gmailMessageId,
          gmailThreadId: input.message.gmailThreadId,
          identityId: input.message.identityId,
          entityType: input.eventContext?.entityType ?? threadEntity?.entityType,
          entityId: input.eventContext?.entityId ?? threadEntity?.entityId,
          status: 'active',
        },
      },
      { new: true },
    ).exec();

    await this.messageModel.findByIdAndUpdate(input.message._id, {
      $set: {
        trackingEnabled: true,
        trackingMode: 'per_message',
        trackingTokenId: input.tokenId,
        trackedRecipientEmail:
          token?.recipientEmail ?? input.eventContext?.recipientEmail ?? input.message.trackedRecipientEmail,
        openTrackingState: 'enabled',
      },
    }).exec();

    if (input.thread?._id) {
      await this.threadModel.findByIdAndUpdate(input.thread._id, {
        $set: {
          trackingEnabled: true,
        },
      }).exec();
    }

    await this.recordEvent(
      {
        organizationId: input.message.organizationId,
        messageId: String(input.message._id),
        threadId: input.thread ? String(input.thread._id) : undefined,
        gmailMessageId: input.message.gmailMessageId,
        gmailThreadId: input.message.gmailThreadId,
        identityId: input.message.identityId,
        entityType: input.eventContext?.entityType ?? threadEntity?.entityType,
        entityId: input.eventContext?.entityId ?? threadEntity?.entityId,
        recipientEmail:
          token?.recipientEmail ??
          input.eventContext?.recipientEmail ??
          input.message.trackedRecipientEmail,
      },
      'sent',
      {
        tokenId: input.tokenId,
        metadata: {
          trackingEnabled: true,
          trackingMode: 'per_message',
          openTrackingEstimated: true,
        },
        occurredAt: input.message.sentAt ?? new Date(),
      },
    );
  }

  async recordSentEvent(input: {
    message: CommMessageDocument;
    thread?: CommThreadDocument | null;
    entityType?: string;
    entityId?: string;
  }): Promise<void> {
    const threadEntity = input.thread ? this.resolveThreadEntity(input.thread) : undefined;
    await this.recordEvent(
      {
        organizationId: input.message.organizationId,
        messageId: String(input.message._id),
        threadId: input.thread ? String(input.thread._id) : undefined,
        gmailMessageId: input.message.gmailMessageId,
        gmailThreadId: input.message.gmailThreadId,
        identityId: input.message.identityId,
        entityType: input.entityType ?? threadEntity?.entityType,
        entityId: input.entityId ?? threadEntity?.entityId,
        recipientEmail: input.message.trackedRecipientEmail ?? input.message.to[0]?.email,
      },
      'sent',
      {
        occurredAt: input.message.sentAt ?? new Date(),
        metadata: {
          trackingEnabled: input.message.trackingEnabled,
          trackingMode: input.message.trackingMode,
          openTrackingEstimated: true,
        },
      },
    );
  }

  async abandonPreparedOpenTracking(tokenId?: string): Promise<void> {
    if (!tokenId) {
      return;
    }

    await this.tokenModel.findByIdAndUpdate(tokenId, {
      $set: { status: 'abandoned' },
    }).exec();
  }

  async recordReplyDetected(message: CommMessageDocument, thread: CommThreadDocument): Promise<void> {
    const eventEntity = this.resolveThreadEntity(thread);
    await this.recordEvent(
      {
        organizationId: message.organizationId,
        messageId: String(message._id),
        threadId: String(thread._id),
        gmailMessageId: message.gmailMessageId,
        gmailThreadId: message.gmailThreadId,
        identityId: message.identityId,
        entityType: eventEntity?.entityType,
        entityId: eventEntity?.entityId,
        recipientEmail: message.from?.email?.trim().toLowerCase(),
      },
      'reply_detected',
      {
        occurredAt: message.sentAt ?? new Date(),
      },
    );
  }

  async recordBounceDetected(
    outboundMessage: CommMessageDocument,
    thread: CommThreadDocument | null,
    bounceMessage: CommMessageDocument,
  ): Promise<void> {
    const eventEntity = thread ? this.resolveThreadEntity(thread) : undefined;
    await this.recordEvent(
      {
        organizationId: outboundMessage.organizationId,
        messageId: String(outboundMessage._id),
        threadId: thread ? String(thread._id) : undefined,
        gmailMessageId: outboundMessage.gmailMessageId,
        gmailThreadId: outboundMessage.gmailThreadId,
        identityId: outboundMessage.identityId,
        entityType: eventEntity?.entityType,
        entityId: eventEntity?.entityId,
        recipientEmail: outboundMessage.trackedRecipientEmail ?? outboundMessage.to[0]?.email,
      },
      'bounce_detected',
      {
        occurredAt:
          bounceMessage.bounceDetectedAt ??
          bounceMessage.sentAt ??
          outboundMessage.bounceDetectedAt ??
          new Date(),
        metadata: {
          reason: outboundMessage.bounceReason ?? bounceMessage.bounceReason,
          sourceMessageId: String(bounceMessage._id),
        },
      },
    );
  }

  async recordSendFailedEvent(input: {
    organizationId: string;
    identityId?: string;
    thread?: CommThreadDocument | null;
    gmailThreadId?: string;
    entityType?: string;
    entityId?: string;
    recipientEmail?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const eventEntity = input.thread ? this.resolveThreadEntity(input.thread) : undefined;
    await this.recordEvent(
      {
        organizationId: input.organizationId,
        threadId: input.thread ? String(input.thread._id) : undefined,
        gmailThreadId: input.gmailThreadId ?? input.thread?.gmailThreadId,
        identityId: input.identityId ?? input.thread?.identityId,
        entityType: input.entityType ?? eventEntity?.entityType,
        entityId: input.entityId ?? eventEntity?.entityId,
        recipientEmail: input.recipientEmail,
      },
      'send_failed',
      {
        metadata: input.metadata,
      },
    );
  }

  async captureOpenPixel(rawToken: string, requestContext: OpenPixelRequestContext): Promise<void> {
    const token = await this.tokenModel.findOne({
      tokenHash: this.hashToken(rawToken),
      tokenType: 'open',
      status: 'active',
    }).exec();

    if (!token) {
      return;
    }

    const message =
      (token.messageId
        ? await this.messageModel.findById(token.messageId).exec()
        : token.gmailMessageId
          ? await this.messageModel.findOne({
              organizationId: token.organizationId,
              gmailMessageId: token.gmailMessageId,
            }).exec()
          : null) ?? null;

    if (!message) {
      return;
    }

    const thread =
      (token.threadId
        ? await this.threadModel.findById(token.threadId).exec()
        : token.gmailThreadId
          ? await this.threadModel.findOne({
              organizationId: token.organizationId,
              gmailThreadId: token.gmailThreadId,
            }).exec()
          : null) ?? null;

    const occurredAt = new Date();
    const heuristics = await this.buildOpenHeuristics(token, message, requestContext, occurredAt);
    const eventEntity = thread ? this.resolveThreadEntity(thread) : undefined;

    await this.recordEvent(
      {
        organizationId: token.organizationId,
        messageId: String(message._id),
        threadId: thread ? String(thread._id) : token.threadId,
        gmailMessageId: message.gmailMessageId,
        gmailThreadId: message.gmailThreadId,
        identityId: message.identityId,
        entityType: eventEntity?.entityType ?? token.entityType,
        entityId: eventEntity?.entityId ?? token.entityId,
        recipientEmail: token.recipientEmail ?? message.trackedRecipientEmail,
      },
      'open_pixel',
      {
        tokenId: String(token._id),
        occurredAt,
        requestMeta: {
          ipHash: heuristics.ipHash,
          userAgent: heuristics.userAgent,
          userAgentHash: heuristics.userAgentHash,
          referer: heuristics.referer,
          source: heuristics.source,
          suspicionReasons: heuristics.suspicionReasons,
          isSuspicious: heuristics.isSuspicious,
          isHumanEstimated: heuristics.isHumanEstimated,
        },
      },
    );

    const existingHumanSignals = message.estimatedHumanOpenCount ?? 0;
    const openTrackingState = heuristics.isHumanEstimated
      ? 'open_signal_detected'
      : existingHumanSignals > 0
        ? 'open_signal_detected'
        : 'suspicious_signal_detected';

    await this.messageModel.findByIdAndUpdate(message._id, {
      $set: {
        trackingEnabled: true,
        trackingMode: 'per_message',
        trackingTokenId: String(token._id),
        trackedRecipientEmail: token.recipientEmail ?? message.trackedRecipientEmail,
        lastOpenedAt: occurredAt,
        lastOpenSource: heuristics.source,
        openTrackingState,
      },
      $inc: {
        openCount: 1,
        estimatedHumanOpenCount: heuristics.isHumanEstimated ? 1 : 0,
        suspiciousOpenCount: heuristics.isSuspicious ? 1 : 0,
      },
      $min: {
        firstOpenedAt: occurredAt,
      },
    }).exec();

    await this.threadModel.findOneAndUpdate(
      { organizationId: token.organizationId, gmailThreadId: message.gmailThreadId },
      {
        $set: {
          trackingEnabled: true,
          hasOpenSignal: true,
          lastOpenedAt: occurredAt,
          lastOpenSource: heuristics.source,
        },
        $inc: {
          trackedOpenCount: 1,
          estimatedHumanOpenCount: heuristics.isHumanEstimated ? 1 : 0,
          suspiciousOpenCount: heuristics.isSuspicious ? 1 : 0,
        },
        $min: {
          firstOpenedAt: occurredAt,
        },
      },
    ).exec();

    void this.intelligenceService
      .refreshThreadIntelligence(token.organizationId, message.gmailThreadId)
      .catch((error) =>
        this.logger.warn(
          `Failed to refresh intelligence after open capture for ${message.gmailThreadId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
  }

  private async recordEvent(
    context: MessageEventContext,
    eventType: CommMessageEventType,
    options: {
      tokenId?: string;
      occurredAt?: Date;
      requestMeta?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    await this.eventModel.create({
      ...context,
      eventType,
      occurredAt: options.occurredAt ?? new Date(),
      tokenId: options.tokenId,
      requestMeta: options.requestMeta,
      metadata: options.metadata,
    });
  }

  private async buildOpenHeuristics(
    token: CommMessageTrackingTokenDocument,
    message: CommMessageDocument,
    requestContext: OpenPixelRequestContext,
    occurredAt: Date,
  ): Promise<OpenHeuristics> {
    const ip = requestContext.ip?.split(',')[0]?.trim();
    const userAgent = requestContext.userAgent?.trim();
    const referer = requestContext.referer?.trim();
    const normalizedUserAgent = userAgent?.toLowerCase() ?? '';
    const normalizedReferer = referer?.toLowerCase() ?? '';
    const ipHash = ip ? this.hashMetadata(ip) : undefined;
    const userAgentHash = userAgent ? this.hashMetadata(userAgent) : undefined;
    const source = this.resolveOpenSource(normalizedUserAgent, normalizedReferer);
    const suspicionReasons: string[] = [];

    if (source === 'security_scanner') {
      suspicionReasons.push('known_scanner_user_agent');
    }

    if (
      message.sentAt &&
      occurredAt.getTime() - new Date(message.sentAt).getTime() >= 0 &&
      occurredAt.getTime() - new Date(message.sentAt).getTime() <= IMMEDIATE_OPEN_WINDOW_MS
    ) {
      suspicionReasons.push('opened_immediately_after_send');
    }

    const latestOpenEvent = await this.eventModel
      .findOne({
        organizationId: token.organizationId,
        tokenId: String(token._id),
        eventType: 'open_pixel',
      })
      .sort({ occurredAt: -1 })
      .lean()
      .exec();

    if (
      latestOpenEvent &&
      latestOpenEvent.requestMeta &&
      typeof latestOpenEvent.requestMeta === 'object'
    ) {
      const lastOccurredAt = new Date(latestOpenEvent.occurredAt).getTime();
      const lastIpHash = (latestOpenEvent.requestMeta as Record<string, unknown>).ipHash;
      const lastUserAgentHash = (latestOpenEvent.requestMeta as Record<string, unknown>).userAgentHash;
      if (
        occurredAt.getTime() - lastOccurredAt <= DUPLICATE_OPEN_WINDOW_MS &&
        lastIpHash &&
        lastIpHash === ipHash &&
        lastUserAgentHash &&
        lastUserAgentHash === userAgentHash
      ) {
        suspicionReasons.push('repeated_open_same_fingerprint');
      }
    }

    const isSuspicious = suspicionReasons.length > 0;

    return {
      ipHash,
      userAgent,
      userAgentHash,
      referer,
      source,
      suspicionReasons,
      isSuspicious,
      isHumanEstimated: !isSuspicious && source !== 'security_scanner',
    };
  }

  private resolveOpenSource(
    normalizedUserAgent: string,
    normalizedReferer: string,
  ): CommMessageOpenSource {
    if (
      GOOGLE_PROXY_PATTERNS.some((pattern) => normalizedUserAgent.includes(pattern)) ||
      GOOGLE_PROXY_PATTERNS.some((pattern) => normalizedReferer.includes(pattern))
    ) {
      return 'google_image_proxy';
    }

    if (SECURITY_SCANNER_PATTERNS.some((pattern) => normalizedUserAgent.includes(pattern))) {
      return 'security_scanner';
    }

    if (normalizedUserAgent) {
      return 'direct';
    }

    return 'unknown';
  }

  private resolveTrackingBaseUrl(): string | null {
    const explicit = this.config.get<string>('COMM_TRACKING_BASE_URL')?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, '');
    }

    const redirectUri = this.config.get<string>('GMAIL_REDIRECT_URI')?.trim();
    if (redirectUri) {
      try {
        const parsed = new URL(redirectUri);
        const identitiesIndex = parsed.pathname.indexOf('/identities/');
        if (identitiesIndex >= 0) {
          parsed.pathname = parsed.pathname.slice(0, identitiesIndex);
          parsed.search = '';
          parsed.hash = '';
          return parsed.toString().replace(/\/$/, '');
        }
      } catch (error) {
        this.logger.warn(
          `Failed to derive tracking base URL from GMAIL_REDIRECT_URI: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return 'http://localhost:3002/api/comm';
  }

  private resolveThreadEntity(thread: CommThreadDocument): { entityType?: string; entityId?: string } | undefined {
    const entityLink = thread.entityLinks?.[0];
    if (!entityLink) {
      return undefined;
    }

    return {
      entityType: entityLink.entityType,
      entityId: entityLink.entityId,
    };
  }

  private escapeHtmlAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private hashMetadata(value: string): string {
    const key =
      this.config.get<string>('COMM_ENCRYPTION_MASTER_KEY') ??
      this.config.get<string>('GMAIL_CLIENT_SECRET') ??
      'comm-tracking';
    return createHmac('sha256', key).update(value).digest('hex');
  }
}
