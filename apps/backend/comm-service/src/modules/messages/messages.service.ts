/**
 * MessagesService
 *
 * Handles Send / Reply / Forward using Gmail API.
 * Builds RFC 2822 MIME via nodemailer MailComposer.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const MailComposerCtor: any = (() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const m = require('nodemailer/lib/mail-composer');
  // Support both CommonJS (module.exports = Class) and ESM-interop (.default) shapes
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return m?.default ?? m;
})();
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CommEntityLink, CommEntityLinkDocument } from '../../schemas/comm-entity-link.schema';
import { IdentitiesService } from '../identities/identities.service';
import { GmailApiService } from '../sync/gmail-api.service';
import { SyncService } from '../sync/sync.service';
import { AuditService } from '../audit/audit.service';
import { SendMessageDto, ReplyDto, ForwardDto } from './dto/send-message.dto';
import { CommGateway } from '../gateway/comm.gateway';
import { MetricsService } from '../../common/metrics/metrics.service';
import { buildCommPaginationResponse, toMongoosePagination } from '../../common/helpers/pagination.helper';
import { ListMessagesQueryDto } from './dto/list-messages.dto';
import { AttachmentsService } from '../attachments/attachments.service';
import { EntityLinksService } from '../entity-links/entity-links.service';
import { CommSettingsService } from '../settings/comm-settings.service';
import { PreparedOpenTracking, TrackingService } from '../tracking/tracking.service';
import { COMM_SCHEDULED_SEND_QUEUE } from '../sync/sync.constants';
import { ScheduledSendJobData } from './scheduled-send.processor';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    @InjectModel(CommThread.name)
    private readonly threadModel: Model<CommThreadDocument>,
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    @InjectModel(CommEntityLink.name)
    private readonly entityLinkModel: Model<CommEntityLinkDocument>,
    private readonly identitiesService: IdentitiesService,
    private readonly gmailApi: GmailApiService,
    private readonly syncService: SyncService,
    private readonly trackingService: TrackingService,
    private readonly settingsService: CommSettingsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly audit: AuditService,
    @InjectQueue(COMM_SCHEDULED_SEND_QUEUE)
    private readonly scheduledSendQueue: Queue<ScheduledSendJobData>,
    @Optional() private readonly gateway?: CommGateway,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() private readonly entityLinksService?: EntityLinksService,
  ) {}

  async listMessages(
    organizationId: string,
    userId: string,
    role: UserRole,
    query: ListMessagesQueryDto,
  ) {
    const { page = 1, limit = 20, threadId, entityType, entityId } = query;
    const filter: Record<string, unknown> = { organizationId };
    let sort: { sentAt: 1 | -1 } = { sentAt: -1 };
    const userIdentityIds = this.identitiesService.isPrivileged(role)
      ? []
      : await this.identitiesService.resolveUserIdentityIds(organizationId, userId);

    if (threadId) {
      const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);
      if (!thread) {
        throw new NotFoundException(`Thread ${threadId} not found`);
      }
      this.assertMessageAccess(thread.identityId, userIdentityIds, role, `Thread ${threadId} not found`);
      filter.gmailThreadId = thread.gmailThreadId;
      sort = { sentAt: 1 };
    }

    if (entityType && entityId) {
      // No identity filter for entity-linked queries: the entity link is the
      // access control. Any org member (e.g. Agent B after reassignment) can
      // see all emails linked to the entity they have access to.
      const linkedThreads = await this.threadModel
        .find({
          organizationId,
          'entityLinks.entityType': entityType,
          'entityLinks.entityId': entityId,
        })
        .select('gmailThreadId')
        .lean()
        .exec();

      const gmailThreadIds = linkedThreads.map((thread) => thread.gmailThreadId);
      if (gmailThreadIds.length === 0) {
        return buildCommPaginationResponse([], 0, page, limit);
      }

      if (typeof filter.gmailThreadId === 'string') {
        if (!gmailThreadIds.includes(filter.gmailThreadId)) {
          return buildCommPaginationResponse([], 0, page, limit);
        }
      } else {
        filter.gmailThreadId = { $in: gmailThreadIds };
      }
    }

    const { skip } = toMongoosePagination(page, limit);
    const [data, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.messageModel.countDocuments(filter),
    ]);

    const enrichedData = await this.attachThreadTrackingState(organizationId, data);

    return buildCommPaginationResponse(enrichedData, total, page, limit);
  }

  async getMessage(
    organizationId: string,
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<CommMessageDocument> {
    const message = await this.findMessageByIdOrGmailId(organizationId, id);
    if (!message) {
      throw new NotFoundException(`Message ${id} not found`);
    }

    if (!this.identitiesService.isPrivileged(role)) {
      const userIdentityIds = await this.identitiesService.resolveUserIdentityIds(organizationId, userId);
      this.assertMessageAccess(message.identityId, userIdentityIds, role, `Message ${id} not found`);
    }
    return message;
  }

  async sendMessage(
    organizationId: string,
    userId: string,
    dto: SendMessageDto,
  ): Promise<CommMessageDocument | { scheduled: true; jobId: string }> {
    // If scheduledAt is set, queue a delayed job
    if (dto.scheduledAt) {
      const sendAt = new Date(dto.scheduledAt);
      const delayMs = Math.max(0, sendAt.getTime() - Date.now());
      const job = await this.scheduledSendQueue.add(
        'scheduled-send',
        { organizationId, userId, dto },
        { delay: delayMs, removeOnComplete: true, removeOnFail: 1000 },
      );
      this.logger.log(`Scheduled send job ${job.id} for org ${organizationId} in ${delayMs}ms`);
      return { scheduled: true, jobId: String(job.id) };
    }

    const identity = await this.getIdentityForSend(organizationId, dto.identityId);
    const fromAddress = this.resolveFromAlias(identity, dto.fromAlias);
    const body = this.resolveMessageBody(dto.bodyHtml, dto.bodyText);
    const subject = dto.subject?.trim();
    const attachments = await this.attachmentsService.fetchAttachmentBuffers(dto.attachmentS3Keys ?? []);

    if (!subject) {
      throw new UnprocessableEntityException('Subject is required');
    }

    const { htmlForSend, preparedTracking } = await this.prepareTrackedHtml({
      organizationId,
      identityId: String(identity._id),
      bodyHtml: body.bodyHtml,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      entityType: dto.entityType,
      entityId: dto.entityId,
      trackingEnabledOverride: dto.trackingEnabled,
    });

    const rawMime = await this.buildMime({
      from: fromAddress,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject,
      html: htmlForSend,
      text: body.bodyText,
      attachments,
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    let sendResp: { id: string; threadId: string };
    try {
      sendResp = await this.gmailSend(gmail, { raw: rawMime }, `identity ${identity._id}`, 'send');
    } catch (error) {
      await this.trackingService.abandonPreparedOpenTracking(preparedTracking?.tokenId);
      await this.recordSendFailureEvent({
        organizationId,
        identityId: String(identity._id),
        entityType: dto.entityType,
        entityId: dto.entityId,
        recipients: { to: dto.to, cc: dto.cc, bcc: dto.bcc },
        operation: 'send',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const gmailMessageId = sendResp.id!;
    const gmailThreadId = sendResp.threadId!;
    const { message, thread } = await this.canonicalizeSentMessage({
      organizationId,
      identity,
      gmailMessageId,
      gmailThreadId,
      userId,
      subject,
      bodyHtml: body.bodyHtml,
      bodyText: body.bodyText,
      fromAddress,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      attachments,
    });
    await this.finalizeSentTracking({
      message,
      thread,
      preparedTracking,
      entityType: dto.entityType,
      entityId: dto.entityId,
    });

    if (dto.entityType && dto.entityId) {
      await this.linkThreadToEntity(organizationId, userId, gmailThreadId, dto.entityType, dto.entityId);
    }

    // Auto-link by recipient email — matches thread participants against leads/clients
    if (gmailThreadId) {
      void this.entityLinksService
        ?.autoLinkThreads(organizationId, [gmailThreadId])
        .catch((err: unknown) => {
          this.logger.error(`Auto-link failed for thread ${gmailThreadId}: ${String(err)}`);
        });
    }

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'MESSAGE_SENT',
      entityType: 'message',
      entityId: gmailMessageId,
      metadata: { to: dto.to, subject },
    });

    this.metrics?.incrementMessagesSent(dto.identityId);
    this.gateway?.emitToOrg(organizationId, 'message:sent', {
      threadId: String(thread._id),
      gmailThreadId,
      direction: 'outbound',
      message: {
        id: String(message._id),
        gmailMessageId,
        gmailThreadId,
        from: message.from,
        to: message.to.map((entry) => entry.email),
        subject: message.subject,
        identityId: dto.identityId,
      },
    });

    return message;
  }

  async replyToMessage(
    organizationId: string,
    userId: string,
    messageId: string,
    dto: ReplyDto,
  ): Promise<CommMessageDocument> {
    const original = await this.findMessageByIdOrGmailId(organizationId, messageId);

    if (!original) throw new NotFoundException(`Message ${messageId} not found`);

    const identity = await this.getIdentityForSend(organizationId, dto.identityId);
    const fromAddress = this.resolveFromAlias(identity, dto.fromAlias);
    const body = this.resolveMessageBody(dto.bodyHtml, dto.bodyText);
    const attachments = await this.attachmentsService.fetchAttachmentBuffers(dto.attachmentS3Keys ?? []);
    const recipients = this.resolveReplyRecipients(original, fromAddress, dto.replyAll);
    const mergedCc = this.mergeRecipients(recipients.cc, dto.cc);
    const { htmlForSend, preparedTracking } = await this.prepareTrackedHtml({
      organizationId,
      identityId: String(identity._id),
      bodyHtml: body.bodyHtml,
      to: recipients.to,
      cc: mergedCc,
      bcc: [],
      trackingEnabledOverride: dto.trackingEnabled,
    });

    const rawMime = await this.buildMime({
      from: fromAddress,
      to: recipients.to,
      cc: mergedCc,
      subject: `Re: ${original.subject ?? ''}`,
      html: htmlForSend,
      text: body.bodyText,
      inReplyTo: original.rfcMessageId ?? original.gmailMessageId,
      references: this.buildReferenceIds(original),
      threadId: original.gmailThreadId,
      attachments,
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    let replyResp: { id: string; threadId: string };
    try {
      replyResp = await this.gmailSend(
        gmail,
        { raw: rawMime, threadId: original.gmailThreadId },
        `identity ${identity._id}`,
        'reply',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.trackingService.abandonPreparedOpenTracking(preparedTracking?.tokenId);
      await this.syncService.recordThreadSendFailure(organizationId, original.gmailThreadId, message);
      await this.recordSendFailureEvent({
        organizationId,
        identityId: String(identity._id),
        gmailThreadId: original.gmailThreadId,
        recipients: { to: recipients.to, cc: mergedCc, bcc: [] },
        operation: 'reply',
        reason: message,
      });
      throw error;
    }

    const gmailMessageId = replyResp.id!;
    const { message, thread } = await this.canonicalizeSentMessage({
      organizationId,
      identity,
      gmailMessageId,
      gmailThreadId: original.gmailThreadId,
      userId,
      subject: `Re: ${original.subject ?? ''}`,
      bodyHtml: body.bodyHtml,
      bodyText: body.bodyText,
      fromAddress,
      to: recipients.to,
      cc: mergedCc,
      bcc: [],
      attachments,
    });
    await this.finalizeSentTracking({
      message,
      thread,
      preparedTracking,
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'MESSAGE_REPLIED',
      entityType: 'message',
      entityId: gmailMessageId,
      metadata: { originalMessageId: messageId },
    });

    // Auto-link by recipient email
    if (original.gmailThreadId) {
      void this.entityLinksService?.autoLinkThreads(organizationId, [original.gmailThreadId]);
    }

    this.gateway?.emitToOrg(organizationId, 'message:sent', {
      threadId: await this.getThreadIdForGmailThread(organizationId, original.gmailThreadId),
      gmailThreadId: original.gmailThreadId,
      direction: 'outbound',
      message: {
        id: String(message._id),
        gmailMessageId,
        gmailThreadId: original.gmailThreadId,
        from: message.from,
        subject: message.subject,
        identityId: dto.identityId,
      },
    });

    return message;
  }

  async forwardMessage(
    organizationId: string,
    userId: string,
    messageId: string,
    dto: ForwardDto,
  ): Promise<CommMessageDocument> {
    const original = await this.findMessageByIdOrGmailId(organizationId, messageId);

    if (!original) throw new NotFoundException(`Message ${messageId} not found`);

    const identity = await this.getIdentityForSend(organizationId, dto.identityId);
    const fromAddress = this.resolveFromAlias(identity, undefined);
    const attachments = await this.attachmentsService.fetchAttachmentBuffers(dto.attachmentS3Keys ?? []);
    const introHtml = dto.bodyHtml
      ? dto.bodyHtml
      : dto.bodyText
        ? this.renderPlainTextAsHtml(dto.bodyText)
        : '';

    const quotedBody = `
      <div>${introHtml}</div>
      <br/>
      <div style="border-left: 2px solid #ccc; padding-left: 8px; color: #666;">
        <p><strong>From:</strong> ${original.from.email}</p>
        <p><strong>Subject:</strong> ${original.subject ?? ''}</p>
        <div>${original.bodyHtml ?? original.bodyText ?? ''}</div>
      </div>
    `;
    const { htmlForSend, preparedTracking } = await this.prepareTrackedHtml({
      organizationId,
      identityId: String(identity._id),
      bodyHtml: quotedBody,
      to: dto.to,
      cc: [],
      bcc: [],
      trackingEnabledOverride: dto.trackingEnabled,
    });

    const rawMime = await this.buildMime({
      from: fromAddress,
      to: dto.to,
      subject: `Fwd: ${original.subject ?? ''}`,
      html: htmlForSend,
      text: dto.bodyText,
      attachments,
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    let fwdResp: { id: string; threadId: string };
    try {
      fwdResp = await this.gmailSend(
        gmail,
        { raw: rawMime },
        `identity ${identity._id}`,
        'forward',
      );
    } catch (error) {
      await this.trackingService.abandonPreparedOpenTracking(preparedTracking?.tokenId);
      await this.recordSendFailureEvent({
        organizationId,
        identityId: String(identity._id),
        recipients: { to: dto.to, cc: [], bcc: [] },
        operation: 'forward',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const gmailMessageId = fwdResp.id!;
    const gmailThreadId = fwdResp.threadId!;
    const { message, thread } = await this.canonicalizeSentMessage({
      organizationId,
      identity,
      gmailMessageId,
      gmailThreadId,
      userId,
      subject: `Fwd: ${original.subject ?? ''}`,
      bodyHtml: quotedBody,
      bodyText: dto.bodyText,
      fromAddress,
      to: dto.to,
      cc: [],
      bcc: [],
      attachments,
    });
    await this.finalizeSentTracking({
      message,
      thread,
      preparedTracking,
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'MESSAGE_FORWARDED',
      entityType: 'message',
      entityId: gmailMessageId,
      metadata: { originalMessageId: messageId, to: dto.to },
    });

    // Auto-link by recipient email
    if (gmailThreadId) {
      void this.entityLinksService?.autoLinkThreads(organizationId, [gmailThreadId]);
    }

    this.gateway?.emitToOrg(organizationId, 'message:sent', {
      threadId: String(thread._id),
      gmailThreadId,
      direction: 'outbound',
      message: {
        id: String(message._id),
        gmailMessageId,
        gmailThreadId,
        from: message.from,
        to: message.to.map((entry) => entry.email),
        subject: message.subject,
        identityId: dto.identityId,
      },
    });

    return message;
  }

  private async gmailSend(
    gmail: Awaited<ReturnType<typeof this.gmailApi.getGmailClient>>,
    requestBody: { raw: string; threadId?: string },
    context: string,
    operation: string,
  ): Promise<{ id: string; threadId: string }> {
    try {
      const resp = await gmail.users.messages.send({ userId: 'me', requestBody });
      return { id: resp.data.id!, threadId: resp.data.threadId! };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gmail ${operation} failed for ${context}: ${msg}`);
      throw new ServiceUnavailableException(`Gmail ${operation} failed: ${msg}`);
    }
  }

  private async getIdentityForSend(
    organizationId: string,
    identityId: string,
  ): Promise<CommIdentityDocument> {
    const identity = await this.identityModel
      .findOne({ _id: identityId, organizationId, isActive: true })
      .exec();

    if (!identity) {
      throw new NotFoundException(`Identity ${identityId} not found or inactive`);
    }
    return identity;
  }

  private resolveFromAlias(identity: CommIdentityDocument, aliasEmail?: string): string {
    if (aliasEmail) {
      const alias = identity.sendAsAliases.find((a) => a.email === aliasEmail);
      if (!alias) {
        throw new UnprocessableEntityException(
          `Alias ${aliasEmail} not found in identity send-as list`,
        );
      }
      return aliasEmail;
    }

    const defaultAlias = identity.sendAsAliases.find((a) => a.isDefault);
    return defaultAlias?.email ?? identity.email;
  }

  private resolveMessageBody(bodyHtml?: string, bodyText?: string): {
    bodyHtml?: string;
    bodyText?: string;
  } {
    const normalizedHtml = bodyHtml?.trim();
    const normalizedText = bodyText?.trim();

    if (!normalizedHtml && !normalizedText) {
      throw new UnprocessableEntityException('Message body is required');
    }

    return {
      bodyHtml: normalizedHtml ?? (normalizedText ? this.renderPlainTextAsHtml(normalizedText) : undefined),
      bodyText: normalizedText ?? (normalizedHtml ? this.stripHtml(normalizedHtml) : undefined),
    };
  }

  private resolveReplyRecipients(
    original: CommMessageDocument,
    fromAddress: string,
    replyAll?: boolean,
  ): { to: string[]; cc: string[] } {
    if (!replyAll) {
      const fallback = original.isSentByIdentity
        ? original.to[0]?.email ?? original.from.email
        : original.from.email;
      return { to: [fallback], cc: [] };
    }

    const excluded = new Set([fromAddress.toLowerCase()]);
    const toCandidates = original.isSentByIdentity
      ? original.to.map((entry) => entry.email)
      : [original.from.email, ...original.to.map((entry) => entry.email)];

    return {
      to: this.filterUniqueEmails(toCandidates, excluded),
      cc: this.filterUniqueEmails(original.cc.map((entry) => entry.email), excluded),
    };
  }

  private mergeRecipients(base: string[], extra?: string[]): string[] {
    return this.filterUniqueEmails([...base, ...(extra ?? [])]);
  }

  private filterUniqueEmails(emails: Array<string | undefined>, excluded = new Set<string>()): string[] {
    const seen = new Set<string>();
    const results: string[] = [];

    for (const email of emails) {
      const normalized = email?.trim().toLowerCase();
      if (!normalized || excluded.has(normalized) || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      results.push(email!.trim());
    }

    return results;
  }

  private async buildMime(opts: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    html?: string;
    text?: string;
    inReplyTo?: string;
    references?: string[];
    threadId?: string;
    attachments?: Array<{ buffer: Buffer; filename: string; mimeType: string }>;
  }): Promise<string> {
    const mailOptions: Record<string, unknown> = {
      from: opts.from,
      to: opts.to.join(', '),
      subject: opts.subject,
    };

    if (opts.cc?.length) mailOptions.cc = opts.cc.join(', ');
    if (opts.bcc?.length) mailOptions.bcc = opts.bcc.join(', ');
    if (opts.html) mailOptions.html = opts.html;
    if (opts.text) mailOptions.text = opts.text;
    if (opts.attachments?.length) {
      mailOptions.attachments = opts.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.buffer,
        contentType: attachment.mimeType,
      }));
    }

    const headers: Record<string, string> = {};
    if (opts.inReplyTo) headers['In-Reply-To'] = `<${opts.inReplyTo}>`;
    if (opts.references?.length) {
      headers['References'] = opts.references.map((reference) => `<${reference}>`).join(' ');
    }
    if (Object.keys(headers).length) mailOptions.headers = headers;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const composer = new MailComposerCtor(mailOptions);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const compiled = composer.compile();

    return new Promise<string>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      compiled.build((err: Error | null, message: Buffer) => {
        if (err) {
          this.logger.error(`MailComposer build failed: ${err.message}`);
          return reject(new ServiceUnavailableException(`MIME build error: ${err.message}`));
        }
        resolve(message.toString('base64url'));
      });
    });
  }

  private async upsertThread(
    organizationId: string,
    identity: CommIdentityDocument,
    gmailThreadId: string,
    subject: string | undefined,
    message: CommMessageDocument,
  ): Promise<CommThreadDocument> {
    return (await this.threadModel.findOneAndUpdate(
      { organizationId, gmailThreadId },
      {
        $setOnInsert: {
          organizationId,
          identityId: String(identity._id),
          gmailThreadId,
          subject,
          entityLinks: [],
        },
        $inc: { messageCount: 1 },
        $max: { lastMessageAt: message.sentAt ?? new Date() },
        $set: {
          snippet: subject,
          ...(message.isSentByIdentity ? { hasSent: true } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec())!;
  }

  private buildReferenceIds(original: CommMessageDocument): string[] | undefined {
    const referenceIds = Array.from(
      new Set(
        [...(original.referenceIds ?? []), original.rfcMessageId]
          .filter((candidate): candidate is string => Boolean(candidate)),
      ),
    );
    return referenceIds.length > 0 ? referenceIds : undefined;
  }

  private async canonicalizeSentMessage(args: {
    organizationId: string;
    identity: CommIdentityDocument;
    gmailMessageId: string;
    gmailThreadId: string;
    userId: string;
    fromAddress: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    bodyHtml?: string;
    bodyText?: string;
    attachments: Array<{ buffer: Buffer; filename: string; mimeType: string; size: number; s3Key?: string }>;
  }): Promise<{ message: CommMessageDocument; thread: CommThreadDocument }> {
    try {
      const { message, thread } = await this.syncService.syncGmailMessage(
        args.identity,
        args.gmailMessageId,
        { emitInboundEvent: false, sentByUserId: args.userId },
      );
      return { message, thread };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Canonical Gmail fetch failed after send for message ${args.gmailMessageId}: ${message}`,
      );

      const fallbackMessage = (await this.messageModel.findOneAndUpdate(
        { organizationId: args.organizationId, gmailMessageId: args.gmailMessageId },
        {
          $set: {
            organizationId: args.organizationId,
            gmailThreadId: args.gmailThreadId,
            gmailMessageId: args.gmailMessageId,
            identityId: String(args.identity._id),
            from: { email: args.fromAddress },
            to: args.to.map((email) => ({ email })),
            cc: (args.cc ?? []).map((email) => ({ email })),
            bcc: (args.bcc ?? []).map((email) => ({ email })),
            subject: args.subject,
            bodyHtml: args.bodyHtml,
            bodyText: args.bodyText,
            attachments: args.attachments.map((attachment) => ({
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              size: attachment.size,
              s3Key: attachment.s3Key,
            })),
            sentAt: new Date(),
            gmailInternalDate: new Date(),
            isRead: true,
            isSentByIdentity: true,
            sentByUserId: args.userId,
            gmailLabels: ['SENT'],
            deliveryState: 'sent',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ))!;
      const thread = await this.syncService.refreshThreadState(
        args.organizationId,
        args.gmailThreadId,
        String(args.identity._id),
      );

      void this.syncService
        .processMessage(args.identity, args.gmailMessageId)
        .catch((processError) =>
          this.logger.warn(
            `Deferred sent-message enrichment failed for ${args.gmailMessageId}: ${
              processError instanceof Error ? processError.message : String(processError)
            }`,
          ),
        );

      return { message: fallbackMessage, thread };
    }
  }

  private async prepareTrackedHtml(args: {
    organizationId: string;
    identityId: string;
    bodyHtml?: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    entityType?: string;
    entityId?: string;
    trackingEnabledOverride?: boolean;
  }): Promise<{ htmlForSend?: string; preparedTracking?: PreparedOpenTracking | null }> {
    if (!args.bodyHtml) {
      return { htmlForSend: args.bodyHtml, preparedTracking: null };
    }

    const settings = await this.settingsService.getResolvedSettings(args.organizationId);
    const trackingEnabled =
      settings.trackingEnabled &&
      settings.openTrackingEnabled &&
      args.trackingEnabledOverride !== false;

    if (!trackingEnabled) {
      return { htmlForSend: args.bodyHtml, preparedTracking: null };
    }

    const preparedTracking = await this.trackingService.prepareOpenTracking({
      organizationId: args.organizationId,
      identityId: args.identityId,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      entityType: args.entityType,
      entityId: args.entityId,
    });

    if (!preparedTracking) {
      return { htmlForSend: args.bodyHtml, preparedTracking };
    }

    return {
      htmlForSend: this.trackingService.injectOpenTrackingPixel(args.bodyHtml, preparedTracking.pixelUrl),
      preparedTracking,
    };
  }

  private async finalizeSentTracking(args: {
    message: CommMessageDocument;
    thread: CommThreadDocument;
    preparedTracking?: PreparedOpenTracking | null;
    entityType?: string;
    entityId?: string;
  }): Promise<void> {
    try {
      if (args.preparedTracking?.tokenId) {
        await this.trackingService.activateOpenTracking({
          message: args.message,
          thread: args.thread,
          tokenId: args.preparedTracking.tokenId,
          eventContext: {
            entityType: args.entityType,
            entityId: args.entityId,
            recipientEmail: args.preparedTracking.recipientEmail,
          },
        });
        return;
      }

      await this.trackingService.recordSentEvent({
        message: args.message,
        thread: args.thread,
        entityType: args.entityType,
        entityId: args.entityId,
      });
    } catch (error) {
      this.logger.warn(
        `Message tracking finalization failed for ${args.message.gmailMessageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      try {
        await this.trackingService.recordSentEvent({
          message: args.message,
          thread: args.thread,
          entityType: args.entityType,
          entityId: args.entityId,
        });
      } catch (fallbackError) {
        this.logger.warn(
          `Sent event fallback failed for ${args.message.gmailMessageId}: ${
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          }`,
        );
      }
    }
  }

  private async recordSendFailureEvent(args: {
    organizationId: string;
    identityId: string;
    gmailThreadId?: string;
    entityType?: string;
    entityId?: string;
    recipients: { to: string[]; cc?: string[]; bcc?: string[] };
    operation: 'send' | 'reply' | 'forward';
    reason: string;
  }): Promise<void> {
    try {
      await this.trackingService.recordSendFailedEvent({
        organizationId: args.organizationId,
        identityId: args.identityId,
        gmailThreadId: args.gmailThreadId,
        entityType: args.entityType,
        entityId: args.entityId,
        recipientEmail: this.resolveSingleTrackedRecipient(
          args.recipients.to,
          args.recipients.cc,
          args.recipients.bcc,
        ),
        metadata: {
          operation: args.operation,
          reason: args.reason,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record send failure tracking event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolveSingleTrackedRecipient(
    to: string[],
    cc?: string[],
    bcc?: string[],
  ): string | undefined {
    const recipients = Array.from(
      new Set(
        [...to, ...(cc ?? []), ...(bcc ?? [])]
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    return recipients.length === 1 ? recipients[0] : undefined;
  }

  private async attachThreadTrackingState(
    organizationId: string,
    messages: CommMessageDocument[],
  ): Promise<Array<Record<string, unknown>>> {
    if (messages.length === 0) {
      return [];
    }

    const gmailThreadIds = Array.from(
      new Set(
        messages
          .map((message) => message.gmailThreadId)
          .filter((gmailThreadId): gmailThreadId is string => Boolean(gmailThreadId)),
      ),
    );

    if (gmailThreadIds.length === 0) {
      return messages.map((message) =>
        typeof message.toObject === 'function'
          ? (message.toObject() as unknown as Record<string, unknown>)
          : (message as unknown as Record<string, unknown>),
      );
    }

    const threads = await this.threadModel
      .find({
        organizationId,
        gmailThreadId: { $in: gmailThreadIds },
      })
      .select(
        [
          'gmailThreadId',
          'replyState',
          'deliveryState',
          'bounceState',
          'lastOutboundAt',
          'lastInboundAt',
          'repliedAt',
          'firstOpenedAt',
          'lastOpenedAt',
          'trackedOpenCount',
          'estimatedHumanOpenCount',
          'suspiciousOpenCount',
          'hasOpenSignal',
          'trackingEnabled',
          'lastOpenSource',
          'primaryRecipientEmail',
          'recentEstimatedHumanOpenCount',
          'recentSuspiciousOpenCount',
          'responseTimeComparableCount',
          'responseTimeMedianMs',
          'responseTimeP75Ms',
          'responseTimeAverageMs',
          'responseTimeSignalQuality',
          'responseTimeScope',
          'expectedReplyWindowMs',
          'silenceState',
          'silenceOverdueFactor',
          'engagementScore',
          'engagementBand',
          'engagementScoreConfidence',
          'scoreReasons',
          'needsFollowUpNow',
          'hotLead',
          'openedButNotReplied',
          'suspiciousTrackingOnly',
        ].join(' '),
      )
      .lean()
      .exec();

    const threadByGmailThreadId = new Map(
      threads.map((thread) => [thread.gmailThreadId as string, thread]),
    );

    return messages.map((message) => {
      const serialized =
        typeof message.toObject === 'function'
          ? (message.toObject() as unknown as Record<string, unknown>)
          : (message as unknown as Record<string, unknown>);
      const thread = threadByGmailThreadId.get(message.gmailThreadId);

      if (!thread) {
        return serialized;
      }

      return {
        ...serialized,
        replyState: serialized.replyState ?? thread.replyState,
        deliveryState: serialized.deliveryState ?? thread.deliveryState,
        bounceState: serialized.bounceState ?? thread.bounceState,
        lastOutboundAt: serialized.lastOutboundAt ?? thread.lastOutboundAt,
        lastInboundAt: serialized.lastInboundAt ?? thread.lastInboundAt,
        repliedAt: serialized.repliedAt ?? thread.repliedAt,
        tracking:
          serialized.tracking ??
          {
            replyState: thread.replyState,
            deliveryState: thread.deliveryState,
            bounceState: thread.bounceState,
            lastOutboundAt: thread.lastOutboundAt,
            lastInboundAt: thread.lastInboundAt,
            repliedAt: thread.repliedAt,
            firstOpenedAt: thread.firstOpenedAt,
            lastOpenedAt: thread.lastOpenedAt,
            trackedOpenCount: thread.trackedOpenCount,
            estimatedHumanOpenCount: thread.estimatedHumanOpenCount,
            suspiciousOpenCount: thread.suspiciousOpenCount,
            hasOpenSignal: thread.hasOpenSignal,
            trackingEnabled: thread.trackingEnabled,
            lastOpenSource: thread.lastOpenSource,
            primaryRecipientEmail: thread.primaryRecipientEmail,
            recentEstimatedHumanOpenCount: thread.recentEstimatedHumanOpenCount,
            recentSuspiciousOpenCount: thread.recentSuspiciousOpenCount,
            responseTimeComparableCount: thread.responseTimeComparableCount,
            responseTimeMedianMs: thread.responseTimeMedianMs,
            responseTimeP75Ms: thread.responseTimeP75Ms,
            responseTimeAverageMs: thread.responseTimeAverageMs,
            responseTimeSignalQuality: thread.responseTimeSignalQuality,
            responseTimeScope: thread.responseTimeScope,
            expectedReplyWindowMs: thread.expectedReplyWindowMs,
            silenceState: thread.silenceState,
            silenceOverdueFactor: thread.silenceOverdueFactor,
            engagementScore: thread.engagementScore,
            engagementBand: thread.engagementBand,
            engagementScoreConfidence: thread.engagementScoreConfidence,
            scoreReasons: thread.scoreReasons,
            needsFollowUpNow: thread.needsFollowUpNow,
            hotLead: thread.hotLead,
            openedButNotReplied: thread.openedButNotReplied,
            suspiciousTrackingOnly: thread.suspiciousTrackingOnly,
          },
      };
    });
  }

  private async findMessageByIdOrGmailId(
    organizationId: string,
    messageId: string,
  ): Promise<CommMessageDocument | null> {
    const query = Types.ObjectId.isValid(messageId)
      ? {
          organizationId,
          $or: [{ _id: new Types.ObjectId(messageId) }, { gmailMessageId: messageId }],
        }
      : { organizationId, gmailMessageId: messageId };

    return this.messageModel.findOne(query).exec();
  }

  private async findThreadByIdOrGmailThreadId(
    organizationId: string,
    threadId: string,
  ): Promise<CommThreadDocument | null> {
    const query = Types.ObjectId.isValid(threadId)
      ? {
          organizationId,
          $or: [{ _id: new Types.ObjectId(threadId) }, { gmailThreadId: threadId }],
        }
      : { organizationId, gmailThreadId: threadId };

    return this.threadModel.findOne(query).exec();
  }

  private async getThreadIdForGmailThread(
    organizationId: string,
    gmailThreadId: string,
  ): Promise<string | undefined> {
    const thread = await this.threadModel
      .findOne({ organizationId, gmailThreadId })
      .select('_id')
      .exec();
    return thread ? String(thread._id) : undefined;
  }

  private async linkThreadToEntity(
    organizationId: string,
    userId: string,
    gmailThreadId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await this.threadModel.updateOne(
      { organizationId, gmailThreadId },
      {
        $addToSet: {
          entityLinks: {
            entityType,
            entityId,
            linkedBy: 'MANUAL',
            linkedAt: new Date(),
          },
        },
      },
    );

    await this.entityLinkModel.findOneAndUpdate(
      { organizationId, gmailThreadId, entityType, entityId },
      {
        $setOnInsert: {
          organizationId,
          gmailThreadId,
          entityType,
          entityId,
          linkedBy: 'MANUAL',
          linkedByUserId: userId,
        } satisfies Partial<CommEntityLink>,
      },
      { upsert: true },
    );
  }

  private renderPlainTextAsHtml(text: string): string {
    return this.escapeHtml(text).replace(/\n/g, '<br/>');
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private assertMessageAccess(
    identityId: string,
    userIdentityIds: string[],
    role: UserRole,
    notFoundMessage: string,
  ): void {
    if (this.identitiesService.isPrivileged(role)) {
      return;
    }

    if (!userIdentityIds.includes(identityId)) {
      throw new NotFoundException(notFoundMessage);
    }
  }
}
