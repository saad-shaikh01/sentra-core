'use client';

import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { useNotificationContext } from '../context/notification-context';
import { NotificationPanel } from './NotificationPanel';

interface NotificationBellProps {
  /** Called when the user clicks a notification with a url */
  onNavigate?: (url: string) => void;
  className?: string;
}

export function NotificationBell({ onNavigate, className = '' }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useNotificationContext();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          className={[
            'relative inline-flex items-center justify-center rounded-xl',
            'h-9 w-9 transition-colors',
            'bg-white/[0.03] border border-white/10',
            'hover:bg-white/[0.07] hover:border-white/20',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Bell className="h-4 w-4 text-white/70" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className={[
                'absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center',
                'rounded-full bg-blue-500 px-1',
                'text-[10px] font-bold text-white leading-none',
              ].join(' ')}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <NotificationPanel
            onNavigate={onNavigate}
            onClose={() => setOpen(false)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
