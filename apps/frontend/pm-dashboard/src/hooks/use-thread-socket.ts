'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL =
  (process.env.NEXT_PUBLIC_PM_WS_URL || 'http://localhost:3003') + '/ws/threads';
const PM_WS_PATH = process.env.NEXT_PUBLIC_PM_WS_PATH || '/socket.io-pm/';

export interface ThreadMessage {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  messageType: string;
  createdAt: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseThreadSocketOptions {
  threadId: string | undefined;
  enabled?: boolean;
  onMessage: (msg: ThreadMessage) => void;
}

/**
 * Manages a Socket.io connection to the PM threads WebSocket namespace.
 * Handles auth via localStorage accessToken, join/leave room, and reconnect backoff.
 */
export function useThreadSocket({ threadId, enabled = true, onMessage }: UseThreadSocketOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const socketRef = useRef<Socket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const sendMessage = useCallback(
    (body: string) => {
      if (!socketRef.current?.connected || !threadId) return false;
      socketRef.current.emit('message:send', { threadId, body });
      return true;
    },
    [threadId],
  );

  useEffect(() => {
    if (!enabled || !threadId) return;

    const token =
      typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

    const socket = io(WS_URL, {
      auth: { token },
      path: PM_WS_PATH,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      transports: ['websocket'],
    });

    socketRef.current = socket;
    setStatus('connecting');

    socket.on('connect', () => {
      setStatus('connected');
      socket.emit('join', { threadId });
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socket.on('connect_error', () => {
      setStatus('error');
    });

    socket.on('thread:message', (msg: ThreadMessage) => {
      onMessageRef.current(msg);
    });

    socket.on('thread:error', (err: { message: string }) => {
      console.error('[ThreadSocket] server error:', err.message);
    });

    return () => {
      socket.emit('leave', { threadId });
      socket.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
    };
  }, [threadId, enabled]);

  return { status, sendMessage };
}
