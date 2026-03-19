'use client';

import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  CheckCircle,
  CreditCard,
  FileText,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Zap,
} from 'lucide-react';
import type { GlobalNotification, GlobalNotificationType } from '../types';
import { useNotificationContext } from '../context/notification-context';

// -------------------------------------------------------
// timeAgo helper
// -------------------------------------------------------
export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 4) return `${diffWk}w ago`;
  const diffMon = Math.floor(diffDay / 30);
  if (diffMon < 12) return `${diffMon}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

// -------------------------------------------------------
// TYPE_ICONS — Record ensures all 12 types are covered
// -------------------------------------------------------
type IconComponent = React.ComponentType<{ className?: string }>;

const TYPE_ICONS: Record<GlobalNotificationType, IconComponent> = {
  PAYMENT_FAILED: AlertCircle,
  INVOICE_OVERDUE: FileText,
  SALE_STATUS_CHANGED: ArrowRightLeft,
  CHARGEBACK_FILED: AlertTriangle,
  PAYMENT_RECEIVED: CheckCircle,
  LEAD_ASSIGNED: UserCheck,
  LEAD_STATUS_CHANGED: TrendingUp,
  TASK_ASSIGNED: Zap,
  TASK_DUE_SOON: RefreshCw,
  MENTION: MessageSquare,
  PROJECT_UPDATE: CreditCard,
  SYSTEM: Bell,
};

const TYPE_COLORS: Record<GlobalNotificationType, string> = {
  PAYMENT_FAILED: 'text-red-400',
  INVOICE_OVERDUE: 'text-orange-400',
  SALE_STATUS_CHANGED: 'text-blue-400',
  CHARGEBACK_FILED: 'text-red-500',
  PAYMENT_RECEIVED: 'text-green-400',
  LEAD_ASSIGNED: 'text-violet-400',
  LEAD_STATUS_CHANGED: 'text-indigo-400',
  TASK_ASSIGNED: 'text-yellow-400',
  TASK_DUE_SOON: 'text-amber-400',
  MENTION: 'text-cyan-400',
  PROJECT_UPDATE: 'text-teal-400',
  SYSTEM: 'text-white/50',
};

// -------------------------------------------------------
// NotificationItem
// -------------------------------------------------------
interface NotificationItemProps {
  notification: GlobalNotification;
  onNavigate?: (url: string) => void;
}

export function NotificationItem({ notification, onNavigate }: NotificationItemProps) {
  const { markRead } = useNotificationContext();

  const IconComp = TYPE_ICONS[notification.type] ?? Bell;
  const colorClass = TYPE_COLORS[notification.type] ?? 'text-white/50';

  function handleClick() {
    if (!notification.isRead) {
      markRead(notification.id);
    }
    if (notification.url) {
      onNavigate?.(notification.url);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        'hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
        notification.isRead ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Icon */}
      <span
        className={[
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          'bg-white/[0.06]',
          colorClass,
        ].join(' ')}
      >
        <IconComp className="h-4 w-4" />
      </span>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/90 leading-snug line-clamp-2">{notification.message}</p>
        <p className="mt-1 text-[11px] text-white/40">{timeAgo(notification.createdAt)}</p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-400" aria-label="Unread" />
      )}
    </button>
  );
}
