'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { pmKeys } from './use-pm-data';
import { useAuth } from './use-auth';

export function usePmSocket() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!user?.organizationId || typeof window === 'undefined') return;

    try {
      const PM_WS_URL = process.env.NEXT_PUBLIC_PM_WS_URL || 'http://localhost:3003';

      import('socket.io-client').then(({ io: socketIo }) => {
        const socket = socketIo(`${PM_WS_URL}/pm`, {
          query: { orgId: user.organizationId },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 3,
        });

        socketRef.current = socket;

        socket.on('pm:notification', () => {
          queryClient.invalidateQueries({ queryKey: ['pm', 'notifications'] });
        });

        socket.on('pm:task-assigned', () => {
          queryClient.invalidateQueries({ queryKey: pmKeys.myTasks });
        });

        socket.on('pm:qc-result', () => {
          queryClient.invalidateQueries({ queryKey: ['pm', 'qc-reviews'] });
        });
      }).catch(() => {
        // socket.io-client not available, skip
      });
    } catch {
      // socket connection failed, non-blocking
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?.organizationId, queryClient]);

  return socketRef;
}
