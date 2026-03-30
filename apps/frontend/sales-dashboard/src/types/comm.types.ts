export interface EmailAddress {
  name?: string;
  email: string;
}

export interface CommAttachment {
  filename: string;
  mimeType: string;
  size: number;
  gmailAttachmentId?: string;
  cdnUrl?: string;
  s3Key?: string;
}

export interface EntityLink {
  entityType: 'lead' | 'client' | 'project';
  entityId: string;
}

export interface SendAsAlias {
  email: string;
  name?: string;
  isDefault: boolean;
}

export interface CommIdentity {
  id: string;
  userId?: string;
  brandId?: string;
  email: string;
  displayName: string;
  isDefault: boolean;
  sendAsAliases: SendAsAlias[];
  syncState: {
    status: 'active' | 'error' | 'paused';
    lastSyncAt: string | null;
    lastError: string | null;
    initialSyncDone?: boolean;
  };
}

export interface RingCentralPhoneNumber {
  id?: string;
  phoneNumber: string;
  usageType?: string;
  type?: string;
  features: string[];
}

export interface RingCentralConnection {
  id: string;
  userId?: string;
  brandId?: string;
  accountId: string;
  extensionId: string;
  extensionNumber?: string;
  displayName?: string;
  email?: string;
  serverUrl?: string;
  phoneNumbers: RingCentralPhoneNumber[];
  mainPhoneNumber?: string;
  directPhoneNumbers: string[];
  smsSenderPhoneNumbers: string[];
  defaultOutboundPhoneNumber?: string;
  isDefault: boolean;
  connectionState?: {
    status: 'active' | 'error' | 'reauthorization_required';
    lastError?: string | null;
    lastSeenAt?: string | null;
  };
  webhookState?: {
    status: 'inactive' | 'pending' | 'active' | 'expiring' | 'expired' | 'error';
    subscriptionId?: string;
    deliveryAddress?: string;
    eventFilters?: string[];
    expiresAt?: string | null;
    lastEventAt?: string | null;
    lastError?: string | null;
    lastSyncedAt?: string | null;
  };
  tokenExpiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CommReplyState = 'none' | 'fresh' | 'waiting' | 'ghosted' | 'replied';
export type CommResponseTimeSignalQuality = 'insufficient' | 'weak' | 'usable';
export type CommResponseTimeScope = 'none' | 'recipient_email' | 'entity' | 'organization';
export type CommSilenceState = 'none' | 'watch' | 'overdue' | 'at_risk' | 'ghosted';
export type CommEngagementBand = 'low' | 'medium' | 'high';
export type CommEngagementConfidence = 'low' | 'medium' | 'high';
export type CommSensitivity = 'low' | 'medium' | 'high';
export type CommOpenTrackingState =
  | 'disabled'
  | 'enabled'
  | 'open_signal_detected'
  | 'suspicious_signal_detected'
  | 'unknown'
  | 'detected'
  | 'estimated'
  | 'suspicious';

export interface CommTrackingSummary {
  replyState?: CommReplyState;
  deliveryState?: string;
  bounceState?: string;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  repliedAt?: string;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  openCount?: number;
  trackedOpenCount?: number;
  estimatedHumanOpenCount?: number;
  suspiciousOpenCount?: number;
  hasOpenSignal?: boolean;
  openTrackingState?: CommOpenTrackingState | string;
  lastOpenSource?: string;
  trackingEnabled?: boolean;
  primaryRecipientEmail?: string;
  recentEstimatedHumanOpenCount?: number;
  recentSuspiciousOpenCount?: number;
  responseTimeComparableCount?: number;
  responseTimeMedianMs?: number;
  responseTimeP75Ms?: number;
  responseTimeAverageMs?: number;
  responseTimeSignalQuality?: CommResponseTimeSignalQuality | string;
  responseTimeScope?: CommResponseTimeScope | string;
  expectedReplyWindowMs?: number;
  silenceState?: CommSilenceState | string;
  silenceOverdueFactor?: number;
  engagementScore?: number;
  engagementBand?: CommEngagementBand | string;
  engagementScoreConfidence?: CommEngagementConfidence | string;
  scoreReasons?: string[];
  needsFollowUpNow?: boolean;
  hotLead?: boolean;
  openedButNotReplied?: boolean;
  suspiciousTrackingOnly?: boolean;
}

export interface CommThread {
  id: string;
  subject?: string;
  snippet?: string;
  participants: EmailAddress[];
  latestMessageAt?: string;
  lastMessageAt?: string;
  messageCount: number;
  hasAttachments?: boolean;
  hasUnread?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
  labelIds?: string[];
  entityLinks: EntityLink[];
  identityId?: string;
  gmailThreadId?: string;
  replyState?: CommReplyState;
  deliveryState?: string;
  bounceState?: string;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  repliedAt?: string;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  openCount?: number;
  trackedOpenCount?: number;
  estimatedHumanOpenCount?: number;
  suspiciousOpenCount?: number;
  hasOpenSignal?: boolean;
  openTrackingState?: CommOpenTrackingState | string;
  lastOpenSource?: string;
  trackingEnabled?: boolean;
  primaryRecipientEmail?: string;
  recentEstimatedHumanOpenCount?: number;
  recentSuspiciousOpenCount?: number;
  responseTimeComparableCount?: number;
  responseTimeMedianMs?: number;
  responseTimeP75Ms?: number;
  responseTimeAverageMs?: number;
  responseTimeSignalQuality?: CommResponseTimeSignalQuality | string;
  responseTimeScope?: CommResponseTimeScope | string;
  expectedReplyWindowMs?: number;
  silenceState?: CommSilenceState | string;
  silenceOverdueFactor?: number;
  engagementScore?: number;
  engagementBand?: CommEngagementBand | string;
  engagementScoreConfidence?: CommEngagementConfidence | string;
  scoreReasons?: string[];
  needsFollowUpNow?: boolean;
  hotLead?: boolean;
  openedButNotReplied?: boolean;
  suspiciousTrackingOnly?: boolean;
  tracking?: CommTrackingSummary;
}

export interface CommMessage {
  id: string;
  threadId?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  direction?: 'inbound' | 'outbound';
  isSentByIdentity?: boolean;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  attachments: CommAttachment[];
  sentAt?: string;
  labelIds?: string[];
  identityId?: string;
  sentByUserId?: string;
  replyState?: CommReplyState;
  deliveryState?: string;
  bounceState?: string;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  repliedAt?: string;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  openCount?: number;
  trackedOpenCount?: number;
  estimatedHumanOpenCount?: number;
  suspiciousOpenCount?: number;
  hasOpenSignal?: boolean;
  openTrackingState?: CommOpenTrackingState | string;
  lastOpenSource?: string;
  trackingEnabled?: boolean;
  primaryRecipientEmail?: string;
  recentEstimatedHumanOpenCount?: number;
  recentSuspiciousOpenCount?: number;
  responseTimeComparableCount?: number;
  responseTimeMedianMs?: number;
  responseTimeP75Ms?: number;
  responseTimeAverageMs?: number;
  responseTimeSignalQuality?: CommResponseTimeSignalQuality | string;
  responseTimeScope?: CommResponseTimeScope | string;
  expectedReplyWindowMs?: number;
  silenceState?: CommSilenceState | string;
  silenceOverdueFactor?: number;
  engagementScore?: number;
  engagementBand?: CommEngagementBand | string;
  engagementScoreConfidence?: CommEngagementConfidence | string;
  scoreReasons?: string[];
  needsFollowUpNow?: boolean;
  hotLead?: boolean;
  openedButNotReplied?: boolean;
  suspiciousTrackingOnly?: boolean;
  tracking?: CommTrackingSummary;
}

export interface CommMessageSummary {
  id: string;
  threadId?: string;
  gmailThreadId?: string;
  direction?: 'inbound' | 'outbound';
  isSentByIdentity?: boolean;
  from: EmailAddress;
  subject?: string;
  snippet?: string;
  sentAt?: string;
  hasAttachments?: boolean;
  replyState?: CommReplyState;
  deliveryState?: string;
  bounceState?: string;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  repliedAt?: string;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  openCount?: number;
  trackedOpenCount?: number;
  estimatedHumanOpenCount?: number;
  suspiciousOpenCount?: number;
  hasOpenSignal?: boolean;
  openTrackingState?: CommOpenTrackingState | string;
  lastOpenSource?: string;
  trackingEnabled?: boolean;
  primaryRecipientEmail?: string;
  recentEstimatedHumanOpenCount?: number;
  recentSuspiciousOpenCount?: number;
  responseTimeComparableCount?: number;
  responseTimeMedianMs?: number;
  responseTimeP75Ms?: number;
  responseTimeAverageMs?: number;
  responseTimeSignalQuality?: CommResponseTimeSignalQuality | string;
  responseTimeScope?: CommResponseTimeScope | string;
  expectedReplyWindowMs?: number;
  silenceState?: CommSilenceState | string;
  silenceOverdueFactor?: number;
  engagementScore?: number;
  engagementBand?: CommEngagementBand | string;
  engagementScoreConfidence?: CommEngagementConfidence | string;
  scoreReasons?: string[];
  needsFollowUpNow?: boolean;
  hotLead?: boolean;
  openedButNotReplied?: boolean;
  suspiciousTrackingOnly?: boolean;
  tracking?: CommTrackingSummary;
}

export interface CommIntelligenceSummary {
  dateRange: {
    dateFrom: string;
    dateTo: string;
  };
  totals: {
    trackedSends: number;
    replies: number;
    estimatedOpens: number;
    suspiciousOpens: number;
    bounces: number;
    sendFailures: number;
  };
  responseTimes: {
    sampleSize: number;
    medianMs?: number;
    averageMs?: number;
    p75Ms?: number;
    signalQuality: CommResponseTimeSignalQuality | string;
    humanWindow?: string;
  };
  queues: {
    needsFollowUp: number;
    hotLeads: number;
    overdue: number;
    openedNoReply: number;
    suspiciousOnly: number;
  };
}

export interface CommSettings {
  organizationId: string;
  trackingEnabled: boolean;
  openTrackingEnabled: boolean;
  allowPerMessageTrackingToggle: boolean;
  ghostedAfterDays: number;
  silenceSensitivity: CommSensitivity;
  engagementSensitivity: CommSensitivity;
  inAppAlertsEnabled: boolean;
  emailAlertsEnabled: boolean;
  multipleOpenAlertsEnabled: boolean;
  multipleOpenThreshold: number;
  hotLeadAlertsEnabled: boolean;
  overdueAlertsEnabled: boolean;
  updatedByUserId?: string;
}

export interface UpdateCommSettingsDto {
  trackingEnabled?: boolean;
  openTrackingEnabled?: boolean;
  allowPerMessageTrackingToggle?: boolean;
  ghostedAfterDays?: number;
  silenceSensitivity?: CommSensitivity;
  engagementSensitivity?: CommSensitivity;
  inAppAlertsEnabled?: boolean;
  emailAlertsEnabled?: boolean;
  multipleOpenAlertsEnabled?: boolean;
  multipleOpenThreshold?: number;
  hotLeadAlertsEnabled?: boolean;
  overdueAlertsEnabled?: boolean;
}

export type CommAlertType = 'multi_open' | 'hot_lead' | 'overdue_follow_up';
export type CommAlertSeverity = 'info' | 'warning' | 'success';

export interface CommAlert {
  id: string;
  alertType: CommAlertType;
  severity: CommAlertSeverity;
  title: string;
  body: string;
  isRead: boolean;
  isActive: boolean;
  threadId?: string;
  gmailThreadId?: string;
  identityId?: string;
  entityType?: string;
  entityId?: string;
  firstTriggeredAt?: string;
  lastTriggeredAt?: string;
  reasonKeys?: string[];
  metadata?: Record<string, unknown>;
}

export interface CommAlertListResponse extends PaginatedResponse<CommAlert> {
  unreadCount: number;
}

export interface CommAlertQuery {
  status?: 'all' | 'active' | 'unread';
  page?: number;
  limit?: number;
}

export interface CommMaintenanceJob {
  id: string;
  name: string;
  batchSize?: number;
  state: string;
  progress?: Record<string, unknown>;
  finishedOn?: string;
  failedReason?: string;
  returnvalue?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CommIdentityListResponse {
  data: CommIdentity[];
}

export interface RingCentralConnectionListResponse {
  data: RingCentralConnection[];
}

export type RingCentralTrackedCallStatus =
  | 'queued'
  | 'dialing'
  | 'connected'
  | 'finished'
  | 'cancelled'
  | 'failed';

export interface RingCentralTrackedCall {
  id: string;
  connectionId: string;
  connectionLabel?: string;
  brandId?: string;
  entityType?: string;
  entityId?: string;
  contactName?: string;
  matchedPhoneNumber?: string;
  toPhoneNumber: string;
  fromPhoneNumber?: string;
  fromName?: string;
  toName?: string;
  ringOutId?: string;
  ringOutUri?: string;
  sessionId?: string;
  telephonySessionId?: string;
  partyId?: string;
  direction?: string;
  missedCall?: boolean;
  eventTime?: string;
  disposition?: string;
  notes?: string;
  notesUpdatedAt?: string;
  notesUpdatedByUserId?: string;
  source?: 'ringout' | 'webhook';
  callStatus: RingCentralTrackedCallStatus;
  providerCallStatus?: string;
  providerCallerStatus?: string;
  providerCalleeStatus?: string;
  failureReason?: string;
  lastPolledAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RingCentralActiveCall {
  id: string;
  connectionId: string;
  connectionLabel?: string;
  brandId?: string;
  sessionId?: string;
  telephonySessionId?: string;
  partyId?: string;
  direction?: string;
  result?: string;
  startTime?: string;
  duration?: number;
  fromName?: string;
  fromPhoneNumber?: string;
  toName?: string;
  toPhoneNumber?: string;
}

export interface StartRingCentralCallDto {
  toPhoneNumber: string;
  fromPhoneNumber?: string;
  connectionId?: string;
  brandId?: string;
  contactName?: string;
  entityType?: 'lead' | 'client' | 'sale' | 'project';
  entityId?: string;
  playPrompt?: boolean;
}

export interface ListRingCentralCallsParams {
  status?: 'all' | 'open';
  limit?: number;
  entityType?: 'lead' | 'client' | 'sale' | 'project';
  entityId?: string;
}

export interface UpdateRingCentralCallAnnotationDto {
  disposition?: string;
  notes?: string;
}

export interface RingCentralSmsThread {
  id: string;
  connectionId: string;
  connectionLabel?: string;
  brandId?: string;
  entityType?: string;
  entityId?: string;
  contactName?: string;
  participantPhoneNumber: string;
  participantName?: string;
  providerConversationId?: string;
  fromPhoneNumber?: string;
  messageCount: number;
  unreadCount: number;
  lastMessageAt?: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  snippet?: string;
  lastMessageDirection?: 'Inbound' | 'Outbound';
  lastMessageStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RingCentralSmsMessage {
  id: string;
  threadId: string;
  connectionId: string;
  connectionLabel?: string;
  brandId?: string;
  entityType?: string;
  entityId?: string;
  providerMessageId: string;
  providerConversationId?: string;
  direction: 'Inbound' | 'Outbound';
  fromPhoneNumber?: string;
  fromName?: string;
  toPhoneNumbers: string[];
  toNames: string[];
  participantPhoneNumber?: string;
  contactName?: string;
  subject?: string;
  messageStatus?: string;
  readStatus?: string;
  isRead: boolean;
  sentAt?: string;
  lastModifiedTime?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListRingCentralSmsThreadsParams {
  limit?: number;
  entityType?: 'lead' | 'client' | 'sale' | 'project';
  entityId?: string;
}

export interface ListRingCentralSmsMessagesParams {
  threadId?: string;
  limit?: number;
  entityType?: 'lead' | 'client' | 'sale' | 'project';
  entityId?: string;
}

export interface SendRingCentralSmsDto {
  toPhoneNumber: string;
  text: string;
  fromPhoneNumber?: string;
  connectionId?: string;
  brandId?: string;
  contactName?: string;
  entityType?: 'lead' | 'client' | 'sale' | 'project';
  entityId?: string;
}

export interface ListThreadsParams {
  page?: number;
  limit?: number;
  search?: string;
  filter?:
    | 'all'
    | 'unread'
    | 'sent'
    | 'archived'
    | 'fresh'
    | 'waiting'
    | 'ghosted'
    | 'replied'
    | 'bounced'
    | 'failed'
    | 'opened'
    | 'unopened'
    | 'suspicious'
    | 'needs_follow_up'
    | 'hot_lead'
    | 'overdue'
    | 'opened_no_reply'
    | 'suspicious_only';
  identityId?: string;
  scope?: 'all';
}

export interface ListMessagesParams {
  threadId?: string;
  page?: number;
  limit?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface CommIntelligenceSummaryParams {
  dateFrom?: string;
  dateTo?: string;
}

export interface SendMessageDto {
  identityId: string;
  fromAlias?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachmentS3Keys?: string[];
  entityType?: string;
  entityId?: string;
  trackingEnabled?: boolean;
}

export interface ReplyDto {
  identityId: string;
  fromAlias?: string;
  bodyText?: string;
  bodyHtml?: string;
  cc?: string[];
  attachmentS3Keys?: string[];
  replyAll?: boolean;
  trackingEnabled?: boolean;
}

export interface ForwardDto {
  identityId: string;
  to: string[];
  bodyText?: string;
  bodyHtml?: string;
  attachmentS3Keys?: string[];
  trackingEnabled?: boolean;
}
