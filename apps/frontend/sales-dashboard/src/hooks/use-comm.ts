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
  CommIdentity,
  CommThread,
  CommMessage,
  CommMessageSummary,
  PaginatedResponse,
  ListThreadsParams,
  ListMessagesParams,
  PaginationParams,
  SendMessageDto,
  ReplyDto,
  ForwardDto,
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
  timeline: (entityType: string, entityId: string, params?: PaginationParams) =>
    [...commKeys.all, 'timeline', entityType, entityId, params] as const,
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

  return useQuery({
    queryKey: commKeys.unreadCount(),
    queryFn: async () => {
      const response = await api.fetch<CommUnreadCountResponse>('/threads/unread-count', {
        service: 'comm',
      });
      setCommUnread(response.total);
      return response;
    },
    initialData: storedUnread
      ? {
          total: storedUnread.count,
          byIdentity: {},
        }
      : undefined,
    initialDataUpdatedAt: storedUnread?.timestamp ?? undefined,
    staleTime: COMM_UNREAD_STALE_TIME_MS,
    refetchOnMount: 'always',
    enabled: COMM_ENABLED,
  });
}

export function useThreads(params?: ListThreadsParams) {
  return useInfiniteQuery({
    queryKey: commKeys.threads(params),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.listCommThreads({ ...params, page: pageParam, limit: 20 });
      return (res as PaginatedResponse<CommThread>);
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
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
      })) as CommMessageSummary[];
    },
    enabled: !!entityType && !!entityId,
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
      queryClient.invalidateQueries({ queryKey: commKeys.all });
      if ((dto as any).threadId) {
        queryClient.invalidateQueries({ queryKey: commKeys.thread((dto as any).threadId) });
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
    onSuccess: () => {
      decrementCommUnread(1);
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
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
    onSuccess: () => {
      incrementCommUnread(1);
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      queryClient.invalidateQueries({ queryKey: commKeys.unreadCount() });
    },
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
