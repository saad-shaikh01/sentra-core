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

    socket.on('message:new', (data: { threadId?: string; direction?: string }) => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      if (data.threadId) {
        queryClient.invalidateQueries({ queryKey: commKeys.thread(data.threadId) });
        queryClient.invalidateQueries({ queryKey: commKeys.messages({ threadId: data.threadId }) });
      }
      if (data.direction === 'inbound') {
        useUIStore.getState().incrementCommUnread();
      }
    });

    socket.on('message:sent', (data: { threadId?: string }) => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      if (data.threadId) {
        queryClient.invalidateQueries({ queryKey: commKeys.thread(data.threadId) });
        queryClient.invalidateQueries({ queryKey: commKeys.messages({ threadId: data.threadId }) });
      }
    });

    socket.on('thread:updated', (data: { threadId?: string }) => {
      queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      if (data.threadId) {
        queryClient.invalidateQueries({ queryKey: commKeys.thread(data.threadId) });
      }
    });

    socket.on('sync:progress', (data: { identityId: string; synced: number; total: number }) => {
      useUIStore.getState().setCommSyncProgress(data.identityId, data.synced, data.total);
      if (data.synced >= data.total) {
        useUIStore.getState().clearCommSyncProgress(data.identityId);
        queryClient.invalidateQueries({ queryKey: commKeys.identities() });
        queryClient.invalidateQueries({ queryKey: commKeys.threads() });
      }
    });

    socket.on('identity:error', (data: { identityId: string; error: string }) => {
      useUIStore.getState().setCommIdentityError(data.identityId, data.error);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
