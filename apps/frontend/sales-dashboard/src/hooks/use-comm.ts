'use client';

import {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
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

export const commKeys = {
  all: ['comm'] as const,
  identities: () => [...commKeys.all, 'identities'] as const,
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
      return (res?.data ?? res ?? []) as CommIdentity[];
    },
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
  return useMutation({
    mutationFn: (threadId: string) => api.markCommThreadRead(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
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
    mutationFn: (brandId: string) => api.initiateOAuth(brandId),
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
