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
// TYPE_ICONS — Record ensures all notification types are covered
// -------------------------------------------------------
type IconComponent = React.ComponentType<{ className?: string }>;

const TYPE_ICONS: Record<GlobalNotificationType, IconComponent> = {
  SALE_CREATED: CreditCard,
  PAYMENT_FAILED: AlertCircle,
  INVOICE_OVERDUE: FileText,
  SALE_STATUS_CHANGED: ArrowRightLeft,
  CHARGEBACK_FILED: AlertTriangle,
  LEAD_CREATED: FileText,
  LEAD_ASSIGNED: UserCheck,
  LEAD_CONTRIBUTOR_ADDED: UserCheck,
  CLIENT_ASSIGNED: UserCheck,
  CLIENT_PM_ASSIGNED: UserCheck,
  PAYMENT_RECEIVED: CheckCircle,
  TASK_ASSIGNED: Zap,
  TASK_DUE_SOON: RefreshCw,
  MENTION: MessageSquare,
  PROJECT_STATUS_CHANGED: TrendingUp,
  SYSTEM_ALERT: Bell,
  COMMENT_ADDED: MessageSquare,
  APPROVAL_REQUESTED: CheckCircle,
};

const TYPE_COLORS: Record<GlobalNotificationType, string> = {
  SALE_CREATED: 'text-emerald-400',
  PAYMENT_FAILED: 'text-red-400',
  INVOICE_OVERDUE: 'text-orange-400',
  SALE_STATUS_CHANGED: 'text-blue-400',
  CHARGEBACK_FILED: 'text-red-500',
  LEAD_CREATED: 'text-sky-400',
  LEAD_ASSIGNED: 'text-cyan-400',
  LEAD_CONTRIBUTOR_ADDED: 'text-cyan-300',
  CLIENT_ASSIGNED: 'text-emerald-300',
  CLIENT_PM_ASSIGNED: 'text-teal-300',
  PAYMENT_RECEIVED: 'text-green-400',
  TASK_ASSIGNED: 'text-yellow-400',
  TASK_DUE_SOON: 'text-amber-400',
  MENTION: 'text-cyan-400',
  PROJECT_STATUS_CHANGED: 'text-indigo-400',
  SYSTEM_ALERT: 'text-white/50',
  COMMENT_ADDED: 'text-blue-300',
  APPROVAL_REQUESTED: 'text-green-500',
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
        <p className="text-sm text-white/90 leading-snug line-clamp-2">
          {notification.title ? `${notification.title}: ` : ''}
          {notification.body}
        </p>
        <p className="mt-1 text-[11px] text-white/40">{timeAgo(notification.createdAt)}</p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-400" aria-label="Unread" />
      )}
    </button>
  );
}
