import sanitizeHtml from 'sanitize-html';
import { gmail_v1 } from 'googleapis';
import {
  CommMessage,
  CommMessageDeliveryState,
} from '../../schemas/comm-message.schema';
import {
  CommThreadBounceState,
  CommThreadDeliveryState,
  CommThreadReplyState,
} from '../../schemas/comm-thread.schema';

type EmailAddress = { email: string; name?: string };

type ThreadStateInput = Pick<
  CommMessage,
  | 'from'
  | 'to'
  | 'cc'
  | 'sentAt'
  | 'isRead'
  | 'isSentByIdentity'
  | 'subject'
  | 'bodyText'
  | 'bodyHtml'
  | 'deliveryState'
  | 'isBounceDetected'
  | 'bounceDetectedAt'
  | 'bounceReason'
>;

export type ParsedGmailMessage = Omit<
  Partial<CommMessage>,
  'deliveryState' | 'isBounceDetected' | 'bounceDetectedAt' | 'bounceReason'
> & {
  deliveryState: CommMessageDeliveryState;
  isBounceDetected: boolean;
  bounceDetectedAt?: Date;
  bounceReason?: string;
};

type ExistingThreadState = {
  lastSendFailureAt?: Date;
  lastSendFailureReason?: string;
};

const FRESH_REPLY_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const GHOSTED_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const BOUNCE_SUBJECT_PATTERNS = [
  'delivery status notification',
  'delivery failure',
  'delivery has failed',
  'delivery incomplete',
  'mail delivery failed',
  'mail delivery subsystem',
  'returned mail',
  'undeliverable',
  'failure notice',
];

const BOUNCE_SENDER_PATTERNS = ['mailer-daemon', 'postmaster', 'mail delivery subsystem'];

export function stripInjectedTrackingPixels(bodyHtml?: string): string | undefined {
  if (!bodyHtml) {
    return bodyHtml;
  }

  const stripped = bodyHtml
    .replace(/<img\b[^>]*src=["'][^"']*\/track\/o\/[^"']+["'][^>]*>/gi, '')
    .trim();

  return stripped || undefined;
}

function normalizeEmail(email?: string): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized || undefined;
}

function buildHeaderMap(
  headers: gmail_v1.Schema$MessagePartHeader[] = [],
): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, header) => {
    const name = header.name?.trim().toLowerCase();
    const value = header.value?.trim();
    if (!name || !value) {
      return acc;
    }

    acc[name] = acc[name] ? `${acc[name]}, ${value}` : value;
    return acc;
  }, {});
}

function parseEmailList(header: string): EmailAddress[] {
  return header
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const match = value.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
      if (match) {
        return {
          name: match[1].trim() || undefined,
          email: match[2].trim() || value,
        };
      }

      return { email: value };
    });
}

export function extractRfcMessageIds(value?: string): string[] {
  if (!value) {
    return [];
  }

  const bracketMatches = Array.from(value.matchAll(/<([^>]+)>/g))
    .map((match) => match[1]?.trim())
    .filter((candidate): candidate is string => Boolean(candidate));

  if (bracketMatches.length > 0) {
    return Array.from(new Set(bracketMatches));
  }

  return Array.from(
    new Set(
      value
        .split(/\s+/)
        .map((candidate) => candidate.trim())
        .filter(Boolean),
    ),
  );
}

function extractBodyAndAttachments(raw: gmail_v1.Schema$Message): {
  bodyText?: string;
  bodyHtml?: string;
  attachments: CommMessage['attachments'];
} {
  let bodyText: string | undefined;
  let rawBodyHtml: string | undefined;
  const attachments: CommMessage['attachments'] = [];

  const extractParts = (parts: gmail_v1.Schema$MessagePart[] = []) => {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText = Buffer.from(part.body.data, 'base64url').toString('utf8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        rawBodyHtml = Buffer.from(part.body.data, 'base64url').toString('utf8');
      } else if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType ?? 'application/octet-stream',
          size: part.body.size ?? 0,
          gmailAttachmentId: part.body.attachmentId,
        });
      }

      if (part.parts) {
        extractParts(part.parts);
      }
    }
  };

  if (raw.payload?.parts) {
    extractParts(raw.payload.parts);
  } else if (raw.payload?.body?.data) {
    const mime = raw.payload.mimeType ?? 'text/plain';
    const text = Buffer.from(raw.payload.body.data, 'base64url').toString('utf8');
    if (mime === 'text/html') {
      rawBodyHtml = text;
    } else {
      bodyText = text;
    }
  }

  const bodyHtml = rawBodyHtml
    ? sanitizeHtml(rawBodyHtml, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ['src', 'alt', 'width', 'height'],
          a: ['href', 'target', 'rel'],
        },
        allowedSchemes: ['https', 'data'],
        allowedSchemesByTag: { img: ['https', 'data'] },
      }) || undefined
    : undefined;

  return { bodyText, bodyHtml: stripInjectedTrackingPixels(bodyHtml), attachments };
}

function isBounceMessage(args: {
  fromEmail?: string;
  subject?: string;
  bodyText?: string;
  snippet?: string;
}): boolean {
  const haystack = [
    args.fromEmail?.toLowerCase() ?? '',
    args.subject?.toLowerCase() ?? '',
    args.bodyText?.toLowerCase() ?? '',
    args.snippet?.toLowerCase() ?? '',
  ];

  return (
    BOUNCE_SENDER_PATTERNS.some((pattern) => haystack[0].includes(pattern)) ||
    BOUNCE_SUBJECT_PATTERNS.some((pattern) => haystack[1].includes(pattern)) ||
    BOUNCE_SUBJECT_PATTERNS.some((pattern) => haystack[2].includes(pattern) || haystack[3].includes(pattern))
  );
}

export function parseGmailMessage(
  raw: gmail_v1.Schema$Message,
  identity: { organizationId: string; _id: string | { toString(): string } },
): ParsedGmailMessage {
  const headers = buildHeaderMap(raw.payload?.headers ?? []);
  const from = parseEmailList(headers.from ?? '')[0] ?? { email: '' };
  const to = parseEmailList(headers.to ?? '');
  const cc = parseEmailList(headers.cc ?? '');
  const bcc = parseEmailList(headers.bcc ?? '');
  const subject = headers.subject || undefined;
  const internalDate = raw.internalDate ? new Date(Number(raw.internalDate)) : undefined;
  const sentAt = internalDate ?? (headers.date ? new Date(headers.date) : undefined);
  const { bodyText, bodyHtml, attachments } = extractBodyAndAttachments(raw);
  const labels = raw.labelIds ?? [];
  const isRead = !labels.includes('UNREAD');
  const isSentByIdentity = labels.includes('SENT');
  const rfcMessageId = extractRfcMessageIds(headers['message-id'])[0];
  const inReplyToRfcMessageId = extractRfcMessageIds(headers['in-reply-to'])[0];
  const referenceIds = extractRfcMessageIds(headers.references);
  const fromEmail = normalizeEmail(from.email);
  const bounceCandidate = isBounceMessage({
    fromEmail,
    subject,
    bodyText,
    snippet: raw.snippet ?? bodyText,
  });

  return {
    organizationId: identity.organizationId,
    gmailThreadId: raw.threadId!,
    gmailMessageId: raw.id!,
    identityId: String(identity._id),
    from,
    to,
    cc,
    bcc,
    subject,
    bodyText,
    bodyHtml,
    attachments,
    sentAt,
    gmailInternalDate: internalDate,
    headers,
    rfcMessageId,
    inReplyToRfcMessageId,
    referenceIds,
    isRead,
    isSentByIdentity,
    isBounceDetected: bounceCandidate,
    bounceDetectedAt: bounceCandidate ? sentAt ?? new Date() : undefined,
    bounceReason: bounceCandidate ? subject ?? 'Bounce or delivery failure detected' : undefined,
    deliveryState: isSentByIdentity ? 'sent' : 'none',
    gmailLabels: labels,
  };
}

export function mergeAttachments(
  existing: CommMessage['attachments'] = [],
  parsed: CommMessage['attachments'] = [],
): CommMessage['attachments'] {
  const remaining = [...existing];
  const merged = parsed.map((attachment) => {
    const index = remaining.findIndex(
      (candidate) =>
        candidate.gmailAttachmentId === attachment.gmailAttachmentId ||
        (candidate.filename === attachment.filename && candidate.size === attachment.size),
    );

    if (index === -1) {
      return attachment;
    }

    const [match] = remaining.splice(index, 1);
    return {
      ...attachment,
      s3Key: match.s3Key,
      archivedAt: match.archivedAt,
    };
  });

  return [...merged, ...remaining];
}

function getSnippet(message?: ThreadStateInput): string | undefined {
  if (!message) {
    return undefined;
  }

  return (
    message.bodyText?.slice(0, 200) ??
    message.bodyHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) ??
    message.subject
  );
}

export function deriveThreadState(
  messages: ThreadStateInput[],
  existingThread?: ExistingThreadState,
  now = new Date(),
  options?: {
    freshReplyWindowMs?: number;
    ghostedReplyWindowMs?: number;
  },
): {
  participants: EmailAddress[];
  messageCount: number;
  lastMessageAt?: Date;
  hasUnread: boolean;
  hasSent: boolean;
  subject?: string;
  snippet?: string;
  lastOutboundAt?: Date;
  lastInboundAt?: Date;
  repliedAt?: Date;
  replyState: CommThreadReplyState;
  deliveryState: CommThreadDeliveryState;
  bounceState: CommThreadBounceState;
  bounceDetectedAt?: Date;
  bounceReason?: string;
} {
  const sortedMessages = [...messages].sort((left, right) => {
    const leftTime = left.sentAt?.getTime() ?? 0;
    const rightTime = right.sentAt?.getTime() ?? 0;
    return leftTime - rightTime;
  });

  const participantsMap = new Map<string, EmailAddress>();
  for (const message of sortedMessages) {
    const addresses = [message.from, ...(message.to ?? []), ...(message.cc ?? [])];
    for (const address of addresses) {
      const normalized = normalizeEmail(address?.email);
      if (!normalized) {
        continue;
      }

      if (!participantsMap.has(normalized)) {
        participantsMap.set(normalized, {
          email: normalized,
          name: address?.name,
        });
      }
    }
  }

  const lastMessage = sortedMessages.at(-1);
  const outboundMessages = sortedMessages.filter((message) => message.isSentByIdentity);
  const inboundMessages = sortedMessages.filter(
    (message) => !message.isSentByIdentity && !message.isBounceDetected,
  );
  const lastOutboundAt = outboundMessages.at(-1)?.sentAt;
  const lastInboundAt = inboundMessages.at(-1)?.sentAt;
  const repliedAt = lastOutboundAt
    ? inboundMessages.find((message) => (message.sentAt?.getTime() ?? 0) > lastOutboundAt.getTime())?.sentAt
    : undefined;
  const freshReplyWindowMs = Math.max(
    options?.freshReplyWindowMs ?? FRESH_REPLY_WINDOW_MS,
    60 * 60 * 1000,
  );
  const ghostedReplyWindowMs = Math.max(
    options?.ghostedReplyWindowMs ?? GHOSTED_REPLY_WINDOW_MS,
    freshReplyWindowMs,
  );

  let replyState: CommThreadReplyState = 'none';
  if (lastOutboundAt) {
    if (repliedAt) {
      replyState = 'replied';
    } else {
      const ageMs = now.getTime() - lastOutboundAt.getTime();
      replyState = ageMs <= freshReplyWindowMs
        ? 'fresh'
        : ageMs <= ghostedReplyWindowMs
          ? 'waiting'
          : 'ghosted';
    }
  }

  const bouncedOutbound = [...outboundMessages]
    .reverse()
    .find((message) => message.deliveryState === 'bounce_detected');
  const bounceDetectedAt = bouncedOutbound?.bounceDetectedAt;
  const bounceReason = bouncedOutbound?.bounceReason;
  const bounceState: CommThreadBounceState = bouncedOutbound ? 'detected' : 'none';

  let deliveryState: CommThreadDeliveryState = 'none';
  if (bounceState === 'detected') {
    deliveryState = 'bounce_detected';
  } else if (
    existingThread?.lastSendFailureAt &&
    (!lastOutboundAt || existingThread.lastSendFailureAt.getTime() > lastOutboundAt.getTime())
  ) {
    deliveryState = 'send_failed';
  } else if (lastOutboundAt) {
    deliveryState = 'sent';
  }

  return {
    participants: Array.from(participantsMap.values()),
    messageCount: sortedMessages.length,
    lastMessageAt: lastMessage?.sentAt,
    hasUnread: sortedMessages.some((message) => !message.isRead),
    hasSent: outboundMessages.length > 0,
    subject: sortedMessages.find((message) => message.subject)?.subject,
    snippet: getSnippet(lastMessage),
    lastOutboundAt,
    lastInboundAt,
    repliedAt,
    replyState,
    deliveryState,
    bounceState,
    bounceDetectedAt,
    bounceReason,
  };
}
