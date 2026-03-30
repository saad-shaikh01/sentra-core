'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { commKeys, useUnreadCount } from './use-comm';
import { useUIStore } from '@/stores/ui-store';
import { toast } from '@/hooks/use-toast';
import { COMM_ENABLED } from '@/lib/feature-flags';

const COMM_WS_URL = process.env.NEXT_PUBLIC_COMM_WS_URL || 'http://localhost:3002';
const COMM_WS_PATH = process.env.NEXT_PUBLIC_COMM_WS_PATH || '/socket.io-comm/';
const AUTH_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function shouldRefreshSocketToken(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';

  const normalized = message.toLowerCase();
  return normalized.includes('401') || normalized.includes('unauthorized') || normalized.includes('jwt');
}

async function refreshSocketAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const refreshToken = window.localStorage.getItem('refreshToken');
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await window.fetch(`${AUTH_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as
      | { accessToken?: string; refreshToken?: string }
      | null;

    if (!payload?.accessToken) {
      return null;
    }

    window.localStorage.setItem('accessToken', payload.accessToken);
    if (payload.refreshToken) {
      window.localStorage.setItem('refreshToken', payload.refreshToken);
    }

    return payload.accessToken;
  } catch {
    return null;
  }
}

/**
 * App-level hook that connects to the /comm Socket.io namespace.
 * Mount once in the dashboard layout via CommEventsWatcher.
 * Writes connection status, sync progress, and identity errors to Zustand.
 * Invalidates TanStack Query caches on relevant events.
 * No-ops when NEXT_PUBLIC_COMM_ENABLED=false.
 */
export function useCommSocket() {
  const queryClient = useQueryClient();
  useUnreadCount();

  const resolveThreadId = (data: any): string | undefined =>
    data?.threadId ?? data?.message?.threadId ?? data?.message?.gmailThreadId;

  const resolveIdentityError = (data: any): string =>
    data?.error ?? data?.errorMessage ?? 'Mail sync error';

  useEffect(() => {
    if (!COMM_ENABLED) return;

    let currentSocket: { on: (event: string, handler: (...args: unknown[]) => void) => unknown; disconnect: () => void } | null = null;
    let isDisposed = false;
    let isRefreshingToken = false;
    let suppressDisconnectStatus = false;
    let hasPermanentAuthError = false;

    const connectSocket = (token: string | null) => {
      const socket = io(COMM_WS_URL + '/comm', {
        auth: { token },
        path: COMM_WS_PATH,
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
        transports: ['websocket'],
      });

      currentSocket = socket;
      useUIStore.getState().setCommConnectionStatus('connecting');

      socket.on('connect', () => {
        const prevStatus = useUIStore.getState().commConnectionStatus;
        useUIStore.getState().setCommConnectionStatus('connected');
        if (prevStatus !== 'connecting') {
          queryClient.invalidateQueries({ queryKey: commKeys.unreadCount() });
          queryClient.invalidateQueries({ queryKey: commKeys.threads() });
        }
      });

      socket.on('disconnect', () => {
        if (suppressDisconnectStatus) {
          suppressDisconnectStatus = false;
          return;
        }

        useUIStore.getState().setCommConnectionStatus(
          hasPermanentAuthError ? 'error' : 'disconnected',
        );
      });

      socket.on('connect_error', async (error: unknown) => {
        if (!shouldRefreshSocketToken(error)) {
          useUIStore.getState().setCommConnectionStatus('error');
          return;
        }

        if (isRefreshingToken || hasPermanentAuthError) {
          return;
        }

        isRefreshingToken = true;
        const nextAccessToken = await refreshSocketAccessToken();
        isRefreshingToken = false;

        if (isDisposed) {
          return;
        }

        if (!nextAccessToken) {
          hasPermanentAuthError = true;
          suppressDisconnectStatus = true;
          socket.disconnect();
          useUIStore.getState().setCommConnectionStatus('error');
          return;
        }

        hasPermanentAuthError = false;
        suppressDisconnectStatus = true;
        socket.disconnect();
        connectSocket(nextAccessToken);
      });

      socket.on('message:new', (data: any) => {
        const threadId = resolveThreadId(data);
        queryClient.invalidateQueries({ queryKey: commKeys.threads() });
        if (threadId) {
          queryClient.invalidateQueries({ queryKey: commKeys.thread(threadId) });
          queryClient.invalidateQueries({ queryKey: commKeys.messages({ threadId }) });
        }
        // Only increment unread count for messages from identities owned by the current user.
        // The broadcast is org-wide so Agent B would otherwise increment even with no Gmail.
        const cachedIdentities = queryClient.getQueryData<Array<{ id?: string; _id?: string }>>(commKeys.identities());
        const userIdentityIds = new Set(
          (cachedIdentities ?? []).map((i) => i.id ?? (i as any)._id ?? '').filter(Boolean),
        );
        const incomingIdentityId: string | undefined = data?.message?.identityId ?? data?.identityId;
        if (incomingIdentityId && userIdentityIds.has(incomingIdentityId)) {
          useUIStore.getState().incrementCommUnread(1);
        }
      });

      socket.on('message:sent', (data: any) => {
        const threadId = resolveThreadId(data);
        queryClient.invalidateQueries({ queryKey: commKeys.threads() });
        if (threadId) {
          queryClient.invalidateQueries({ queryKey: commKeys.thread(threadId) });
          queryClient.invalidateQueries({ queryKey: commKeys.messages({ threadId }) });
        }
      });

      socket.on('thread:updated', (data: any) => {
        const threadId = resolveThreadId(data);
        queryClient.invalidateQueries({ queryKey: commKeys.threads() });
        if (threadId) {
          queryClient.invalidateQueries({ queryKey: commKeys.thread(threadId) });
        }
      });

      socket.on('sync:progress', (data: any) => {
        // Progress UI is personal — skip entirely for other users' identity syncs.
        const cachedIdentities = queryClient.getQueryData<Array<{ id?: string; _id?: string }>>(commKeys.identities());
        const userIdentityIds = new Set(
          (cachedIdentities ?? []).map((i) => i.id ?? (i as any)._id ?? '').filter(Boolean),
        );
        if (!userIdentityIds.has(data?.identityId)) return;

        const synced = data?.synced ?? data?.processed ?? 0;
        const total = data?.total ?? 0;
        useUIStore.getState().setCommSyncProgress(data.identityId, synced, total);
        if (total > 0 && synced >= total) {
          useUIStore.getState().clearCommSyncProgress(data.identityId);
          queryClient.invalidateQueries({ queryKey: commKeys.identities() });
          queryClient.invalidateQueries({ queryKey: commKeys.threads() });
        }
      });

      socket.on('sync:complete', (data: any) => {
        // Always clear progress state (safe no-op if identity isn't in the user's list).
        useUIStore.getState().clearCommSyncProgress(data.identityId);

        // Only toast + invalidate for identities owned by the current user.
        // The sync:complete event is broadcast org-wide so all users receive it.
        const cachedIdentities = queryClient.getQueryData<Array<{ id?: string; _id?: string }>>(commKeys.identities());
        const userIdentityIds = new Set(
          (cachedIdentities ?? []).map((i) => i.id ?? (i as any)._id ?? '').filter(Boolean),
        );
        if (!userIdentityIds.has(data?.identityId)) return;

        queryClient.invalidateQueries({ queryKey: commKeys.identities() });
        queryClient.invalidateQueries({ queryKey: commKeys.threads() });
        toast.success(
          `Inbox sync complete for ${data?.email ?? 'mailbox'}`,
          `${data?.count ?? 0} messages synced`,
        );
      });

      socket.on('identity:error', (data: any) => {
        useUIStore.getState().setCommIdentityError(data.identityId, resolveIdentityError(data));
        queryClient.invalidateQueries({ queryKey: commKeys.identities() });
      });

      socket.on('link:created', (data: any) => {
        queryClient.invalidateQueries({ queryKey: commKeys.threads() });
        // When backfill completes after lead/client creation, the event carries
        // entityType + entityId so we can invalidate that entity's timeline precisely.
        if (data?.entityType && data?.entityId) {
          queryClient.invalidateQueries({
            queryKey: commKeys.timeline(data.entityType as string, data.entityId as string),
          });
        }
      });

      socket.on('link:removed', (data: any) => {
        queryClient.invalidateQueries({ queryKey: commKeys.threads() });
        if (data?.entityType && data?.entityId) {
          queryClient.invalidateQueries({
            queryKey: commKeys.timeline(data.entityType as string, data.entityId as string),
          });
        }
      });

      const invalidateRingCentral = () => {
        queryClient.invalidateQueries({ queryKey: commKeys.ringCentralCallsRoot() });
        queryClient.invalidateQueries({ queryKey: commKeys.ringCentralActiveCallsRoot() });
        queryClient.invalidateQueries({ queryKey: commKeys.ringCentralConnections() });
      };

      const invalidateRingCentralSms = () => {
        queryClient.invalidateQueries({ queryKey: commKeys.ringCentralSmsThreadsRoot() });
        queryClient.invalidateQueries({ queryKey: commKeys.ringCentralSmsMessagesRoot() });
      };

      socket.on('call:incoming', (data: any) => {
        invalidateRingCentral();
        const caller = data?.fromName ?? data?.fromPhoneNumber ?? 'Unknown caller';
        toast.success('Incoming RingCentral call', caller);
      });
      socket.on('call:updated', invalidateRingCentral);
      socket.on('call:ended', invalidateRingCentral);
      socket.on('sms:new', (data: any) => {
        invalidateRingCentralSms();
        if (String(data?.direction ?? '').toLowerCase() === 'inbound') {
          const sender =
            data?.contactName ??
            data?.fromName ??
            data?.participantPhoneNumber ??
            data?.fromPhoneNumber ??
            'Unknown sender';
          const preview = data?.subject ? String(data.subject).slice(0, 120) : undefined;
          toast.info(`New SMS from ${sender}`, preview);
        }
      });

      const invalidateAlerts = () => {
        queryClient.invalidateQueries({ queryKey: commKeys.alerts() });
      };

      socket.on('alert:new', invalidateAlerts);
      socket.on('alert:updated', invalidateAlerts);
      socket.on('alert:all-read', invalidateAlerts);
    };

    const initialToken = typeof window !== 'undefined' ? window.localStorage.getItem('accessToken') : null;
    connectSocket(initialToken);

    return () => {
      isDisposed = true;
      suppressDisconnectStatus = true;
      currentSocket?.disconnect();
      if (!hasPermanentAuthError) {
        useUIStore.getState().setCommConnectionStatus('disconnected');
      }
    };
   
  }, []);
}
