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
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import MailComposer from 'nodemailer/lib/mail-composer';
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { IdentitiesService } from '../identities/identities.service';
import { GmailApiService } from '../sync/gmail-api.service';
import { AuditService } from '../audit/audit.service';
import { SendMessageDto, ReplyDto, ForwardDto } from './dto/send-message.dto';

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
    private readonly identitiesService: IdentitiesService,
    private readonly gmailApi: GmailApiService,
    private readonly audit: AuditService,
  ) {}

  async sendMessage(
    organizationId: string,
    userId: string,
    dto: SendMessageDto,
  ): Promise<CommMessageDocument> {
    const identity = await this.getIdentityForSend(organizationId, dto.identityId);
    const fromAddress = this.resolveFromAlias(identity, dto.fromAlias);

    const rawMime = await this.buildMime({
      from: fromAddress,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject,
      html: dto.bodyHtml,
      text: dto.bodyText,
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    const resp = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMime },
    });

    const gmailMessageId = resp.data.id!;
    const gmailThreadId = resp.data.threadId!;

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
          subject: dto.subject,
          bodyHtml: dto.bodyHtml,
          bodyText: dto.bodyText,
          attachments: [],
          isRead: true,
          isSentByIdentity: true,
          gmailLabels: ['SENT'],
        },
      },
      { upsert: true, new: true },
    );

    await this.upsertThread(organizationId, identity, gmailThreadId, dto.subject, message!);

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'MESSAGE_SENT',
      entityType: 'message',
      entityId: gmailMessageId,
      metadata: { to: dto.to, subject: dto.subject },
    });

    return message!;
  }

  async replyToMessage(
    organizationId: string,
    userId: string,
    messageId: string,
    dto: ReplyDto,
  ): Promise<CommMessageDocument> {
    const original = await this.messageModel
      .findOne({ _id: messageId, organizationId })
      .exec();

    if (!original) throw new NotFoundException(`Message ${messageId} not found`);

    const identity = await this.getIdentityForSend(organizationId, dto.identityId);
    const fromAddress = this.resolveFromAlias(identity, undefined);

    const replyToEmail = original.isSentByIdentity
      ? original.to[0]?.email ?? original.from.email
      : original.from.email;

    const rawMime = await this.buildMime({
      from: fromAddress,
      to: [replyToEmail],
      cc: dto.cc,
      subject: `Re: ${original.subject ?? ''}`,
      html: dto.bodyHtml,
      text: dto.bodyText,
      inReplyTo: original.gmailMessageId,
      references: original.gmailMessageId,
      threadId: original.gmailThreadId,
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    const resp = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMime, threadId: original.gmailThreadId },
    });

    const gmailMessageId = resp.data.id!;

    const message = await this.messageModel.findOneAndUpdate(
      { organizationId, gmailMessageId },
      {
        $setOnInsert: {
          organizationId,
          gmailThreadId: original.gmailThreadId,
          gmailMessageId,
          identityId: String(identity._id),
          from: { email: fromAddress },
          to: [{ email: replyToEmail }],
          cc: (dto.cc ?? []).map((e) => ({ email: e })),
          bcc: [],
          subject: `Re: ${original.subject ?? ''}`,
          bodyHtml: dto.bodyHtml,
          bodyText: dto.bodyText,
          attachments: [],
          isRead: true,
          isSentByIdentity: true,
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

    return message!;
  }

  async forwardMessage(
    organizationId: string,
    userId: string,
    messageId: string,
    dto: ForwardDto,
  ): Promise<CommMessageDocument> {
    const original = await this.messageModel
      .findOne({ _id: messageId, organizationId })
      .exec();

    if (!original) throw new NotFoundException(`Message ${messageId} not found`);

    const identity = await this.getIdentityForSend(organizationId, dto.identityId);
    const fromAddress = this.resolveFromAlias(identity, undefined);

    const quotedBody = `
      <div>${dto.bodyHtml ?? ''}</div>
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
    });

    const gmail = await this.gmailApi.getGmailClient(identity);
    const resp = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMime },
    });

    const gmailMessageId = resp.data.id!;
    const gmailThreadId = resp.data.threadId!;

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
          attachments: [],
          isRead: true,
          isSentByIdentity: true,
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

    return message!;
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

  private async buildMime(opts: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    html: string;
    text?: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
  }): Promise<string> {
    const mailOptions: any = {
      from: opts.from,
      to: opts.to.join(', '),
      subject: opts.subject,
      html: opts.html,
    };

    if (opts.cc?.length) mailOptions.cc = opts.cc.join(', ');
    if (opts.bcc?.length) mailOptions.bcc = opts.bcc.join(', ');
    if (opts.text) mailOptions.text = opts.text;

    const headers: Record<string, string> = {};
    if (opts.inReplyTo) headers['In-Reply-To'] = `<${opts.inReplyTo}>`;
    if (opts.references) headers['References'] = `<${opts.references}>`;
    if (Object.keys(headers).length) mailOptions.headers = headers;

    const composer = new MailComposer(mailOptions);
    const compiled = composer.compile();

    return new Promise<string>((resolve, reject) => {
      compiled.build((err, message) => {
        if (err) return reject(err);
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
  ): Promise<void> {
    await this.threadModel.findOneAndUpdate(
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
        $set: { snippet: subject },
      },
      { upsert: true },
    );
  }
}
