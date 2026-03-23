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
import { CommEntityLink, CommEntityLinkDocument } from '../../schemas/comm-entity-link.schema';
import { IdentitiesService } from '../identities/identities.service';
import { GmailApiService } from '../sync/gmail-api.service';
import { AuditService } from '../audit/audit.service';
import { SendMessageDto, ReplyDto, ForwardDto } from './dto/send-message.dto';
import { CommGateway } from '../gateway/comm.gateway';
import { MetricsService } from '../../common/metrics/metrics.service';
import { buildCommPaginationResponse, toMongoosePagination } from '../../common/helpers/pagination.helper';
import { ListMessagesQueryDto } from './dto/list-messages.dto';
import { AttachmentsService } from '../attachments/attachments.service';

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
    private readonly attachmentsService: AttachmentsService,
    private readonly audit: AuditService,
    @Optional() private readonly gateway?: CommGateway,
    @Optional() private readonly metrics?: MetricsService,
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
      const linkedThreads = await this.threadModel
        .find({
          organizationId,
          'entityLinks.entityType': entityType,
          'entityLinks.entityId': entityId,
          ...(this.identitiesService.isPrivileged(role)
            ? {}
            : { identityId: { $in: userIdentityIds } }),
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

    return buildCommPaginationResponse(data, total, page, limit);
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
  ): Promise<CommMessageDocument> {
    const identity = await this.getIdentityForSend(organizationId, dto.identityId);
    const fromAddress = this.resolveFromAlias(identity, dto.fromAlias);
    const body = this.resolveMessageBody(dto.bodyHtml, dto.bodyText);
    const subject = dto.subject?.trim();
    const attachments = await this.attachmentsService.fetchAttachmentBuffers(dto.attachmentS3Keys ?? []);

    if (!subject) {
      throw new UnprocessableEntityException('Subject is required');
    }

    const rawMime = await this.buildMime({
      from: fromAddress,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject,
      html: body.bodyHtml,
      text: body.bodyText,
      attachments,
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    const sendResp = await this.gmailSend(gmail, { raw: rawMime }, `identity ${identity._id}`, 'send');

    const gmailMessageId = sendResp.id!;
    const gmailThreadId = sendResp.threadId!;

    const message = await this.messageModel.findOneAndUpdate(
      { organizationId, gmailMessageId },
      {
        $setOnInsert: {
          organizationId,
          gmailThreadId,
          gmailMessageId,
          identityId: String(identity._id),
          from: { email: fromAddress },
          to: dto.to.map((e) => ({ email: e })),
          cc: (dto.cc ?? []).map((e) => ({ email: e })),
          bcc: (dto.bcc ?? []).map((e) => ({ email: e })),
          subject,
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText,
          attachments: attachments.map((attachment) => ({
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            s3Key: attachment.s3Key,
          })),
          isRead: true,
          isSentByIdentity: true,
          sentByUserId: userId,
          gmailLabels: ['SENT'],
        },
      },
      { upsert: true, new: true },
    );

    const thread = await this.upsertThread(organizationId, identity, gmailThreadId, subject, message!);
    if (dto.entityType && dto.entityId) {
      await this.linkThreadToEntity(organizationId, userId, gmailThreadId, dto.entityType, dto.entityId);
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
        id: String(message!._id),
        gmailMessageId,
        gmailThreadId,
        from: { email: fromAddress },
        to: dto.to,
        subject,
        identityId: dto.identityId,
      },
    });

    return message!;
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

    const rawMime = await this.buildMime({
      from: fromAddress,
      to: recipients.to,
      cc: this.mergeRecipients(recipients.cc, dto.cc),
      subject: `Re: ${original.subject ?? ''}`,
      html: body.bodyHtml,
      text: body.bodyText,
      inReplyTo: original.gmailMessageId,
      references: original.gmailMessageId,
      threadId: original.gmailThreadId,
      attachments,
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    const replyResp = await this.gmailSend(
      gmail,
      { raw: rawMime, threadId: original.gmailThreadId },
      `identity ${identity._id}`,
      'reply',
    );

    const gmailMessageId = replyResp.id!;

    const message = await this.messageModel.findOneAndUpdate(
      { organizationId, gmailMessageId },
      {
        $setOnInsert: {
          organizationId,
          gmailThreadId: original.gmailThreadId,
          gmailMessageId,
          identityId: String(identity._id),
          from: { email: fromAddress },
          to: recipients.to.map((email) => ({ email })),
          cc: this.mergeRecipients(recipients.cc, dto.cc).map((email) => ({ email })),
          bcc: [],
          subject: `Re: ${original.subject ?? ''}`,
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText,
          attachments: attachments.map((attachment) => ({
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            s3Key: attachment.s3Key,
          })),
          isRead: true,
          isSentByIdentity: true,
          sentByUserId: userId,
          gmailLabels: ['SENT'],
        },
      },
      { upsert: true, new: true },
    );

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'MESSAGE_REPLIED',
      entityType: 'message',
      entityId: gmailMessageId,
      metadata: { originalMessageId: messageId },
    });

    this.gateway?.emitToOrg(organizationId, 'message:sent', {
      threadId: await this.getThreadIdForGmailThread(organizationId, original.gmailThreadId),
      gmailThreadId: original.gmailThreadId,
      direction: 'outbound',
      message: {
        id: String(message!._id),
        gmailMessageId,
        gmailThreadId: original.gmailThreadId,
        from: { email: fromAddress },
        subject: `Re: ${original.subject ?? ''}`,
        identityId: dto.identityId,
      },
    });

    return message!;
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

    const rawMime = await this.buildMime({
      from: fromAddress,
      to: dto.to,
      subject: `Fwd: ${original.subject ?? ''}`,
      html: quotedBody,
      text: dto.bodyText,
      attachments,
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    const fwdResp = await this.gmailSend(gmail, { raw: rawMime }, `identity ${identity._id}`, 'forward');

    const gmailMessageId = fwdResp.id!;
    const gmailThreadId = fwdResp.threadId!;

    const message = await this.messageModel.findOneAndUpdate(
      { organizationId, gmailMessageId },
      {
        $setOnInsert: {
          organizationId,
          gmailThreadId,
          gmailMessageId,
          identityId: String(identity._id),
          from: { email: fromAddress },
          to: dto.to.map((e) => ({ email: e })),
          cc: [],
          bcc: [],
          subject: `Fwd: ${original.subject ?? ''}`,
          bodyHtml: quotedBody,
          attachments: attachments.map((attachment) => ({
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            s3Key: attachment.s3Key,
          })),
          isRead: true,
          isSentByIdentity: true,
          sentByUserId: userId,
          gmailLabels: ['SENT'],
        },
      },
      { upsert: true, new: true },
    );

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'MESSAGE_FORWARDED',
      entityType: 'message',
      entityId: gmailMessageId,
      metadata: { originalMessageId: messageId, to: dto.to },
    });

    const thread = await this.threadModel.findOne({ organizationId, gmailThreadId }).exec();
    this.gateway?.emitToOrg(organizationId, 'message:sent', {
      threadId: thread ? String(thread._id) : undefined,
      gmailThreadId,
      direction: 'outbound',
      message: {
        id: String(message!._id),
        gmailMessageId,
        gmailThreadId,
        from: { email: fromAddress },
        to: dto.to,
        subject: `Fwd: ${original.subject ?? ''}`,
        identityId: dto.identityId,
      },
    });

    return message!;
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
    references?: string;
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
    if (opts.references) headers['References'] = `<${opts.references}>`;
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
