'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationKeys } from './use-notifications';

const NOTIF_WS_URL =
  typeof process !== 'undefined'
    ? process.env['NEXT_PUBLIC_NOTIF_WS_URL'] || process.env['NEXT_PUBLIC_CORE_API_URL'] || 'http://localhost:3001'
    : 'http://localhost:3001';

const NOTIF_WS_PATH =
  typeof process !== 'undefined'
    ? process.env['NEXT_PUBLIC_NOTIF_WS_PATH'] || '/socket.io-notifications/'
    : '/socket.io-notifications/';

const AUTH_API_URL =
  typeof process !== 'undefined'
    ? process.env['NEXT_PUBLIC_CORE_API_URL'] || 'http://localhost:3001/api'
    : 'http://localhost:3001/api';

async function refreshSocketToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = window.localStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  try {
    const res = await window.fetch(`${AUTH_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${refreshToken}` },
    });
    if (!res.ok) return null;
    const payload = (await res.json().catch(() => null)) as {
      accessToken?: string;
      refreshToken?: string;
    } | null;
    if (!payload?.accessToken) return null;
    window.localStorage.setItem('accessToken', payload.accessToken);
    if (payload.refreshToken) window.localStorage.setItem('refreshToken', payload.refreshToken);
    return payload.accessToken;
  } catch {
    return null;
  }
}

function isAuthError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';
  const n = msg.toLowerCase();
  return n.includes('401') || n.includes('unauthorized') || n.includes('jwt');
}

/**
 * Connects to the /notifications Socket.io namespace.
 * Mount once in the dashboard layout.
 * Invalidates TanStack Query caches on notification:new events.
 *
 * @param enabled - Pass false to disable (e.g. feature flag off). Default true.
 */
export function useNotificationSocket(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Dynamically import socket.io-client to avoid SSR issues
    let isDisposed = false;
    let isRefreshing = false;
    let hasPermanentError = false;
    let currentSocket: {
      on: (event: string, handler: (...args: unknown[]) => void) => unknown;
      disconnect: () => void;
    } | null = null;

    const connect = async (token: string | null) => {
      const { io } = await import('socket.io-client');
      if (isDisposed) return;

      const socket = io(`${NOTIF_WS_URL}/notifications`, {
        auth: { token },
        path: NOTIF_WS_PATH,
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
        transports: ['websocket'],
      });

      currentSocket = socket;

      socket.on('connect', () => {
        queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      });

      socket.on('notification:new', () => {
        queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      });

      socket.on('notification:read', () => {
        queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      });

      socket.on('connect_error', async (error: unknown) => {
        if (!isAuthError(error)) return;
        if (isRefreshing || hasPermanentError) return;

        isRefreshing = true;
        const next = await refreshSocketToken();
        isRefreshing = false;

        if (isDisposed) return;

        if (!next) {
          hasPermanentError = true;
          socket.disconnect();
          return;
        }

        hasPermanentError = false;
        socket.disconnect();
        connect(next);
      });
    };

    const initialToken =
      typeof window !== 'undefined' ? window.localStorage.getItem('accessToken') : null;

    connect(initialToken);

    return () => {
      isDisposed = true;
      currentSocket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
