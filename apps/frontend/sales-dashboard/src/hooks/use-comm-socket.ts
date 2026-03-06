'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { commKeys } from './use-comm';
import { useUIStore } from '@/stores/ui-store';
import { COMM_ENABLED } from '@/lib/feature-flags';

const COMM_WS_URL = process.env.NEXT_PUBLIC_COMM_WS_URL || 'http://localhost:3002';

/**
 * App-level hook that connects to the /comm Socket.io namespace.
 * Mount once in the dashboard layout via CommEventsWatcher.
 * Writes connection status, sync progress, and identity errors to Zustand.
 * Invalidates TanStack Query caches on relevant events.
 * No-ops when NEXT_PUBLIC_COMM_ENABLED=false.
 */
export function useCommSocket() {
  const queryClient = useQueryClient();

  const resolveThreadId = (data: any): string | undefined =>
    data?.threadId ?? data?.message?.threadId ?? data?.message?.gmailThreadId;

  const resolveIdentityError = (data: any): string =>
    data?.error ?? data?.errorMessage ?? 'Mail sync error';

  useEffect(() => {
    if (!COMM_ENABLED) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

    const socket = io(COMM_WS_URL + '/comm', {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      transports: ['websocket'],
    });

    useUIStore.getState().setCommConnectionStatus('connecting');

    socket.on('connect', () => {
      const prevStatus = useUIStore.getState().commConnectionStatus;
      useUIStore.getState().setCommConnectionStatus('connected');
      // On reconnect (not initial connect), refresh all comm data
      if (prevStatus !== 'connecting') {
        queryClient.invalidateQueries({ queryKey: commKeys.all });
      }
    });

    socket.on('disconnect', () => {
      useUIStore.getState().setCommConnectionStatus('disconnected');
    });

    socket.on('connect_error', () => {
      useUIStore.getState().setCommConnectionStatus('error');
    });

    socket.on('message:new', (data: any) => {
      const threadId = resolveThreadId(data);
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: commKeys.thread(threadId) });
        queryClient.invalidateQueries({ queryKey: commKeys.messages({ threadId }) });
      }
      useUIStore.getState().incrementCommUnread();
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
      const synced = data?.synced ?? data?.processed ?? 0;
      const total = data?.total ?? 0;
      useUIStore.getState().setCommSyncProgress(data.identityId, synced, total);
      if (total > 0 && synced >= total) {
        useUIStore.getState().clearCommSyncProgress(data.identityId);
        queryClient.invalidateQueries({ queryKey: commKeys.identities() });
        queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      }
    });

    socket.on('identity:error', (data: any) => {
      useUIStore.getState().setCommIdentityError(data.identityId, resolveIdentityError(data));
      queryClient.invalidateQueries({ queryKey: commKeys.identities() });
    });

    socket.on('link:created', () => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
    });

    socket.on('link:removed', () => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
    });

    return () => {
      socket.disconnect();
      useUIStore.getState().setCommConnectionStatus('disconnected');
    };
  // eslint-disable-next-line
  }, []);
}
