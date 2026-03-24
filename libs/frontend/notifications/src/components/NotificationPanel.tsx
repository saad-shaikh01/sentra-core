'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useNotificationContext } from '../context/notification-context';
import { NotificationItem } from './NotificationItem';

interface NotificationPanelProps {
  onNavigate?: (url: string) => void;
  onClose?: () => void;
}

export function NotificationPanel({ onNavigate, onClose }: NotificationPanelProps) {
  const { notifications, isLoading, isError, markAllRead, isMarkingAll, unreadCount } =
    useNotificationContext();

  function handleNavigate(url: string) {
    onNavigate?.(url);
    onClose?.();
  }

  return (
    <div className="flex flex-col w-80 max-h-[480px] bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <h2 className="text-sm font-semibold text-white">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] text-blue-300">
              {unreadCount}
            </span>
          )}
        </h2>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead()}
            disabled={isMarkingAll}
            className="text-[11px] text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
          >
            {isMarkingAll ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 text-white/30 animate-spin" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="py-10 px-4 text-center text-sm text-white/40">
            Failed to load notifications.
          </div>
        )}

        {!isLoading && !isError && notifications.length === 0 && (
          <div className="py-10 px-4 text-center text-sm text-white/40">
            You're all caught up!
          </div>
        )}

        {!isLoading && !isError && notifications.map((notif) => (
          <NotificationItem
            key={notif.id}
            notification={notif}
            onNavigate={handleNavigate}
          />
        ))}
      </div>
    </div>
  );
}
