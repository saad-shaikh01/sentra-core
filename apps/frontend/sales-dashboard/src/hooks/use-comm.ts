'use client';

import {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { useUIStore } from '@/stores/ui-store';
import { COMM_ENABLED } from '@/lib/feature-flags';
import type {
  CommAlertListResponse,
  CommAlertQuery,
  CommIdentity,
  CommIntelligenceSummary,
  CommIntelligenceSummaryParams,
  CommMaintenanceJob,
  CommThread,
  CommMessage,
  CommMessageSummary,
  CommSettings,
  PaginatedResponse,
  ListThreadsParams,
  ListMessagesParams,
  PaginationParams,
  SendMessageDto,
  ReplyDto,
  ForwardDto,
  UpdateCommSettingsDto,
} from '@/types/comm.types';

const COMM_UNREAD_STORAGE_KEY = 'comm:unread';
const COMM_UNREAD_STALE_TIME_MS = 5 * 60 * 1000;

type CommUnreadCountResponse = {
  total: number;
  byIdentity: Record<string, number>;
};

function readStoredUnreadCount(): { count: number; timestamp: number } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(COMM_UNREAD_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<{ count: number; timestamp: number }>;
    if (typeof parsed.count !== 'number' || typeof parsed.timestamp !== 'number') {
      return null;
    }

    return {
      count: Math.max(0, parsed.count),
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

export const commKeys = {
  all: ['comm'] as const,
  identities: () => [...commKeys.all, 'identities'] as const,
  unreadCount: () => [...commKeys.all, 'unread-count'] as const,
  threads: (params?: ListThreadsParams) => [...commKeys.all, 'threads', params] as const,
  thread: (id: string) => [...commKeys.all, 'threads', id] as const,
  messages: (params?: ListMessagesParams) => [...commKeys.all, 'messages', params] as const,
  intelligenceSummary: (params?: CommIntelligenceSummaryParams) =>
    [...commKeys.all, 'intelligence-summary', params] as const,
  settings: () => [...commKeys.all, 'settings'] as const,
  alerts: (params?: CommAlertQuery) => [...commKeys.all, 'alerts', params] as const,
  maintenanceJob: (jobId?: string) => [...commKeys.all, 'maintenance-job', jobId] as const,
  timeline: (entityType: string, entityId: string, params?: PaginationParams) =>
    [...commKeys.all, 'timeline', entityType, entityId, params] as const,
  emailTemplates: () => [...commKeys.all, 'email-templates'] as const,
};

export function useIdentities() {
  return useQuery({
    queryKey: commKeys.identities(),
    queryFn: async () => {
      const res = await api.listIdentities();
      const raw: CommIdentity[] = (res?.data ?? res ?? []) as CommIdentity[];
      // Normalize: backend may return _id instead of id (Mongoose lean / serialization)
      return raw.map((identity) => ({
        ...identity,
        id: (identity.id ?? (identity as unknown as { _id: string })._id ?? '') as string,
      }));
    },
  });
}

export function useUnreadCount() {
  const setCommUnread = useUIStore((state) => state.setCommUnread);
  const storedUnread = readStoredUnreadCount();

  // Only treat localStorage as initialData if it's very recent (under 30s).
  // Older entries may have been inflated by org-wide socket events for other
  // users' identities and should not be shown on page load.
  const isStoredFresh = storedUnread
    ? Date.now() - storedUnread.timestamp < 30_000
    : false;

  return useQuery({
    queryKey: commKeys.unreadCount(),
    queryFn: async () => {
      const response = await api.fetch<CommUnreadCountResponse>('/threads/unread-count', {
        service: 'comm',
      });
      setCommUnread(response.total);
      return response;
    },
    initialData: isStoredFresh
      ? { total: storedUnread!.count, byIdentity: {} }
      : undefined,
    initialDataUpdatedAt: isStoredFresh ? storedUnread!.timestamp : undefined,
    staleTime: 60 * 1000,
    refetchOnMount: true,
    enabled: COMM_ENABLED,
  });
}

export function useThreads(params?: ListThreadsParams, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: commKeys.threads(params),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.listCommThreads({ ...params, page: pageParam, limit: 20 });
      return (res as PaginatedResponse<CommThread>);
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    enabled: options?.enabled !== false,
  });
}

export function useThread(id: string) {
  return useQuery({
    queryKey: commKeys.thread(id),
    queryFn: async () => {
      const res = await api.getCommThread(id);
      return (res?.data ?? res) as CommThread;
    },
    enabled: !!id,
    staleTime: 3 * 60 * 1000,
  });
}

export function useMessages(params?: ListMessagesParams) {
  return useQuery({
    queryKey: commKeys.messages(params),
    queryFn: async () => {
      const res = await api.listCommMessages(params as Record<string, unknown>);
      return (res as PaginatedResponse<CommMessage>);
    },
    enabled: !!params?.threadId,
    staleTime: 3 * 60 * 1000,
  });
}

export function useEntityTimeline(entityType: string, entityId: string, params?: PaginationParams) {
  return useQuery({
    queryKey: commKeys.timeline(entityType, entityId, params),
    queryFn: async () => {
      const res = await api.getEntityTimeline(entityType, entityId, params as Record<string, unknown>);
      const items = res?.data ?? [];
      return items.map((message: CommMessage) => ({
        id: message.id,
        threadId: message.threadId,
        gmailThreadId: message.gmailThreadId,
        direction: message.isSentByIdentity ? 'outbound' : 'inbound',
        isSentByIdentity: message.isSentByIdentity,
        from: message.from,
        subject: message.subject,
        snippet: message.bodyText?.slice(0, 160) ?? message.subject,
        sentAt: message.sentAt,
        hasAttachments: (message.attachments?.length ?? 0) > 0,
        replyState: message.replyState ?? message.tracking?.replyState,
        deliveryState: message.deliveryState ?? message.tracking?.deliveryState,
        bounceState: message.bounceState ?? message.tracking?.bounceState,
        lastOutboundAt: message.lastOutboundAt ?? message.tracking?.lastOutboundAt,
        lastInboundAt: message.lastInboundAt ?? message.tracking?.lastInboundAt,
        repliedAt: message.repliedAt ?? message.tracking?.repliedAt,
        firstOpenedAt: message.firstOpenedAt ?? message.tracking?.firstOpenedAt,
        lastOpenedAt: message.lastOpenedAt ?? message.tracking?.lastOpenedAt,
        openCount: message.openCount ?? message.tracking?.openCount,
        estimatedHumanOpenCount: message.estimatedHumanOpenCount ?? message.tracking?.estimatedHumanOpenCount,
        suspiciousOpenCount: message.suspiciousOpenCount ?? message.tracking?.suspiciousOpenCount,
        hasOpenSignal: message.hasOpenSignal ?? message.tracking?.hasOpenSignal,
        openTrackingState: message.openTrackingState ?? message.tracking?.openTrackingState,
        lastOpenSource: message.lastOpenSource ?? message.tracking?.lastOpenSource,
        trackingEnabled: message.trackingEnabled ?? message.tracking?.trackingEnabled,
        primaryRecipientEmail: message.primaryRecipientEmail ?? message.tracking?.primaryRecipientEmail,
        recentEstimatedHumanOpenCount:
          message.recentEstimatedHumanOpenCount ?? message.tracking?.recentEstimatedHumanOpenCount,
        recentSuspiciousOpenCount:
          message.recentSuspiciousOpenCount ?? message.tracking?.recentSuspiciousOpenCount,
        responseTimeComparableCount:
          message.responseTimeComparableCount ?? message.tracking?.responseTimeComparableCount,
        responseTimeMedianMs: message.responseTimeMedianMs ?? message.tracking?.responseTimeMedianMs,
        responseTimeP75Ms: message.responseTimeP75Ms ?? message.tracking?.responseTimeP75Ms,
        responseTimeAverageMs:
          message.responseTimeAverageMs ?? message.tracking?.responseTimeAverageMs,
        responseTimeSignalQuality:
          message.responseTimeSignalQuality ?? message.tracking?.responseTimeSignalQuality,
        responseTimeScope: message.responseTimeScope ?? message.tracking?.responseTimeScope,
        expectedReplyWindowMs:
          message.expectedReplyWindowMs ?? message.tracking?.expectedReplyWindowMs,
        silenceState: message.silenceState ?? message.tracking?.silenceState,
        silenceOverdueFactor: message.silenceOverdueFactor ?? message.tracking?.silenceOverdueFactor,
        engagementScore: message.engagementScore ?? message.tracking?.engagementScore,
        engagementBand: message.engagementBand ?? message.tracking?.engagementBand,
        engagementScoreConfidence:
          message.engagementScoreConfidence ?? message.tracking?.engagementScoreConfidence,
        scoreReasons: message.scoreReasons ?? message.tracking?.scoreReasons,
        needsFollowUpNow: message.needsFollowUpNow ?? message.tracking?.needsFollowUpNow,
        hotLead: message.hotLead ?? message.tracking?.hotLead,
        openedButNotReplied:
          message.openedButNotReplied ?? message.tracking?.openedButNotReplied,
        suspiciousTrackingOnly:
          message.suspiciousTrackingOnly ?? message.tracking?.suspiciousTrackingOnly,
        tracking: message.tracking,
      })) as CommMessageSummary[];
    },
    enabled: !!entityType && !!entityId,
  });
}

export function useCommIntelligenceSummary(params?: CommIntelligenceSummaryParams) {
  return useQuery({
    queryKey: commKeys.intelligenceSummary(params),
    queryFn: async () => {
      const res = await api.getCommIntelligenceSummary(params as Record<string, unknown>);
      return (res?.data ?? res) as CommIntelligenceSummary;
    },
    staleTime: 60 * 1000,
    enabled: COMM_ENABLED,
  });
}

export function useCommSettings() {
  return useQuery({
    queryKey: commKeys.settings(),
    queryFn: async () => {
      const res = await api.getCommSettings();
      return (res?.data ?? res) as CommSettings;
    },
    staleTime: 60 * 1000,
    enabled: COMM_ENABLED,
  });
}

export function useUpdateCommSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateCommSettingsDto) => {
      const res = await api.updateCommSettings(dto as Record<string, unknown>);
      return (res?.data ?? res) as CommSettings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(commKeys.settings(), settings);
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      queryClient.invalidateQueries({ queryKey: commKeys.intelligenceSummary() });
      toast.success('Email intelligence settings updated');
    },
    onError: (e: Error) => toast.error('Failed to update email intelligence settings', e.message),
  });
}

export function useCommAlerts(params?: CommAlertQuery) {
  return useQuery({
    queryKey: commKeys.alerts(params),
    queryFn: async () => {
      const res = await api.listCommAlerts(params as Record<string, unknown>) as CommAlertListResponse;
      return {
        ...res,
        data: (res.data ?? []).map((alert) => ({
          ...alert,
          id: (alert.id ?? (alert as unknown as { _id?: string })._id ?? '') as string,
        })),
      } as CommAlertListResponse;
    },
    staleTime: 30 * 1000,
    enabled: COMM_ENABLED,
  });
}

export function useMarkCommAlertRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => api.markCommAlertRead(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.alerts() });
    },
    onError: (e: Error) => toast.error('Failed to mark alert as read', e.message),
  });
}

export function useMarkAllCommAlertsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => api.markAllCommAlertsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.alerts() });
    },
    onError: (e: Error) => toast.error('Failed to mark alerts as read', e.message),
  });
}

export function useRunCommIntelligenceBackfill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto?: { batchSize?: number }) => {
      const res = await api.runCommIntelligenceBackfill(dto as Record<string, unknown> | undefined);
      return (res?.data ?? res) as CommMaintenanceJob;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.settings() });
      toast.success('Repair job queued');
    },
    onError: (e: Error) => toast.error('Failed to queue repair job', e.message),
  });
}

export function useCommMaintenanceJob(jobId?: string, enabled = true) {
  return useQuery({
    queryKey: commKeys.maintenanceJob(jobId),
    queryFn: async () => {
      const res = await api.getCommMaintenanceJob(jobId!);
      return (res?.data ?? res) as CommMaintenanceJob;
    },
    enabled: Boolean(jobId) && enabled,
    refetchInterval: (query) => {
      const state = (query.state.data as CommMaintenanceJob | undefined)?.state;
      return state === 'completed' || state === 'failed' ? false : 4000;
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: SendMessageDto) => {
      const idempotencyKey = crypto.randomUUID();
      return api.sendCommMessage(dto as unknown as Record<string, unknown>, idempotencyKey);
    },
    onSuccess: (_data, dto) => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      if (dto.entityType && dto.entityId) {
        queryClient.invalidateQueries({ queryKey: commKeys.timeline(dto.entityType, dto.entityId) });
      }
      toast.success('Email sent');
    },
    onError: (e: Error) => toast.error('Failed to send email', e.message),
  });
}

export function useReplyToMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, dto }: { messageId: string; dto: ReplyDto }) => {
      const idempotencyKey = crypto.randomUUID();
      return api.replyToCommMessage(messageId, dto as unknown as Record<string, unknown>, idempotencyKey);
    },
    onSuccess: (_data, { dto }) => {
      const threadId = (dto as any).threadId as string | undefined;
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: commKeys.thread(threadId) });
        queryClient.invalidateQueries({ queryKey: commKeys.messages({ threadId }) });
      }
      toast.success('Reply sent');
    },
    onError: (e: Error) => toast.error('Failed to send reply', e.message),
  });
}

export function useForwardMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, dto }: { messageId: string; dto: ForwardDto }) => {
      const idempotencyKey = crypto.randomUUID();
      return api.forwardCommMessage(messageId, dto as unknown as Record<string, unknown>, idempotencyKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.all });
      toast.success('Email forwarded');
    },
    onError: (e: Error) => toast.error('Failed to forward email', e.message),
  });
}

export function useArchiveThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.archiveCommThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
    },
    onError: (e: Error) => toast.error('Failed to archive thread', e.message),
  });
}

export function useMarkThreadRead() {
  const queryClient = useQueryClient();
  const decrementCommUnread = useUIStore((state) => state.decrementCommUnread);
  return useMutation({
    mutationFn: (threadId: string) => api.markCommThreadRead(threadId),
    onMutate: (threadId) => {
      // Optimistically mark thread as read in every cached threads list
      queryClient.setQueriesData(
        { queryKey: commKeys.threads() },
        (old: any) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((t: any) =>
              String(t._id ?? t.id) === threadId ? { ...t, hasUnread: false } : t,
            ),
          };
        },
      );
      // Also update single thread cache
      queryClient.setQueryData(commKeys.thread(threadId), (old: any) =>
        old ? { ...old, hasUnread: false } : old,
      );
    },
    onSuccess: (_data, threadId) => {
      decrementCommUnread(1);
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      queryClient.invalidateQueries({ queryKey: commKeys.thread(threadId) });
      queryClient.invalidateQueries({ queryKey: commKeys.unreadCount() });
    },
  });
}

export function useMarkThreadUnread() {
  const queryClient = useQueryClient();
  const incrementCommUnread = useUIStore((state) => state.incrementCommUnread);
  return useMutation({
    mutationFn: (threadId: string) =>
      api.fetch<void>(`/threads/${threadId}/unread`, { method: 'PATCH', service: 'comm' }),
    onMutate: (threadId) => {
      // Optimistically mark thread as unread in every cached threads list
      queryClient.setQueriesData(
        { queryKey: commKeys.threads() },
        (old: any) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((t: any) =>
              String(t._id ?? t.id) === threadId ? { ...t, hasUnread: true } : t,
            ),
          };
        },
      );
      queryClient.setQueryData(commKeys.thread(threadId), (old: any) =>
        old ? { ...old, hasUnread: true } : old,
      );
    },
    onSuccess: (_data, threadId) => {
      incrementCommUnread(1);
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      queryClient.invalidateQueries({ queryKey: commKeys.thread(threadId) });
      queryClient.invalidateQueries({ queryKey: commKeys.unreadCount() });
    },
  });
}

export function useBatchThreadAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadIds, action }: { threadIds: string[]; action: 'archive' | 'mark_read' | 'mark_unread' }) =>
      api.batchThreadAction(threadIds, action),
    onSuccess: (_data, { action }) => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      queryClient.invalidateQueries({ queryKey: commKeys.unreadCount() });
      const label = action === 'archive' ? 'Archived' : action === 'mark_read' ? 'Marked as read' : 'Marked as unread';
      toast.success(`${label} successfully`);
    },
    onError: (e: Error) => toast.error('Batch action failed', e.message),
  });
}

export function useLinkThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, entityType, entityId }: { threadId: string; entityType: string; entityId: string }) =>
      api.linkCommThread(threadId, entityType, entityId),
    onSuccess: (_data, { entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      queryClient.invalidateQueries({ queryKey: commKeys.timeline(entityType, entityId) });
      toast.success('Thread linked');
    },
    onError: (e: Error) => toast.error('Failed to link thread', e.message),
  });
}

export function useUnlinkThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, entityType, entityId }: { threadId: string; entityType: string; entityId: string }) =>
      api.unlinkCommThread(threadId, entityType, entityId),
    onSuccess: (_data, { entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      queryClient.invalidateQueries({ queryKey: commKeys.timeline(entityType, entityId) });
      toast.success('Thread unlinked');
    },
    onError: (e: Error) => toast.error('Failed to unlink thread', e.message),
  });
}

export function useInitiateOAuth() {
  return useMutation({
    mutationFn: (brandId?: string) => api.initiateOAuth(brandId),
    onError: (e: Error) => toast.error('Failed to initiate OAuth', e.message),
  });
}

export function useDisconnectIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.disconnectIdentity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.identities() });
      toast.success('Gmail account disconnected');
    },
    onError: (e: Error) => toast.error('Failed to disconnect account', e.message),
  });
}

// ─── G Suite Hooks ──────────────────────────────────────────────────────────

export const gsuiteKeys = {
  connection: () => ['gsuite', 'connection'] as const,
  users: (pageToken?: string) => ['gsuite', 'users', pageToken] as const,
};

export function useGSuiteConnection() {
  return useQuery({
    queryKey: gsuiteKeys.connection(),
    queryFn: async () => {
      const res = await api.getGSuiteConnection();
      return res?.data ?? res;
    },
  });
}

export function useGSuiteUsers(pageToken?: string) {
  return useQuery({
    queryKey: gsuiteKeys.users(pageToken),
    queryFn: () => api.listGSuiteUsers(pageToken),
    enabled: false, // only load when connection is confirmed
  });
}

export function useInitiateGSuiteOAuth() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.initiateGSuiteOAuth();
      const url = res?.data?.redirectUrl ?? (res as any)?.redirectUrl;
      if (url) window.location.href = url;
    },
    onError: (e: Error) => toast.error('Failed to initiate G Suite OAuth', e.message),
  });
}

export function useDisconnectGSuite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.disconnectGSuite(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gsuiteKeys.connection() });
      queryClient.invalidateQueries({ queryKey: gsuiteKeys.users() });
      toast.success('G Suite disconnected');
    },
    onError: (e: Error) => toast.error('Failed to disconnect G Suite', e.message),
  });
}

export function useInviteUser() {
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      api.inviteUser(email, role),
    onError: (e: Error) => toast.error('Failed to send invitation', e.message),
  });
}

export interface CommSignature {
  _id: string;
  name: string;
  bodyHtml: string;
  identityId?: string;
  isDefault: boolean;
}

export function useSignatures() {
  return useQuery({
    queryKey: [...commKeys.all, 'signatures'] as const,
    queryFn: async () => {
      const res = await api.listSignatures();
      return (res as any)?.data as CommSignature[];
    },
  });
}

export function useDefaultSignature(identityId?: string) {
  return useQuery({
    queryKey: [...commKeys.all, 'signatures', 'default', identityId] as const,
    queryFn: async () => {
      const res = await api.getDefaultSignature(identityId);
      return (res as any)?.data as CommSignature | null;
    },
    enabled: true,
  });
}

export function useCreateSignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name: string; bodyHtml: string; identityId?: string; isDefault?: boolean }) =>
      api.createSignature(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...commKeys.all, 'signatures'] });
      toast.success('Signature saved');
    },
    onError: (e: Error) => toast.error('Failed to save signature', e.message),
  });
}

export function useUpdateSignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { name?: string; bodyHtml?: string; isDefault?: boolean } }) =>
      api.updateSignature(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...commKeys.all, 'signatures'] });
      toast.success('Signature updated');
    },
    onError: (e: Error) => toast.error('Failed to update signature', e.message),
  });
}

export function useDeleteSignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSignature(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...commKeys.all, 'signatures'] });
      toast.success('Signature deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete signature', e.message),
  });
}

export interface CommEmailTemplate {
  _id: string;
  name: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: commKeys.emailTemplates(),
    queryFn: async () => {
      const res = await api.listEmailTemplates();
      return (res as any)?.data as CommEmailTemplate[];
    },
  });
}

export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name: string; subject?: string; bodyHtml?: string; bodyText?: string }) =>
      api.createEmailTemplate(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.emailTemplates() });
      toast.success('Template saved');
    },
    onError: (e: Error) => toast.error('Failed to save template', e.message),
  });
}

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { name?: string; subject?: string; bodyHtml?: string; bodyText?: string } }) =>
      api.updateEmailTemplate(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.emailTemplates() });
      toast.success('Template updated');
    },
    onError: (e: Error) => toast.error('Failed to update template', e.message),
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEmailTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.emailTemplates() });
      toast.success('Template deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete template', e.message),
  });
}

