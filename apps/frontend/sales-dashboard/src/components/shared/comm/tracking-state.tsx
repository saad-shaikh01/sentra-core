'use client';

import { BadgeCheck, AlertTriangle, Clock3, MailOpen, TriangleAlert, CircleDot } from 'lucide-react';
import { timeAgo } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type {
  CommEngagementBand,
  CommReplyState,
  CommTrackingSummary,
} from '@/types/comm.types';

export interface CommTrackingLike {
  replyState?: CommReplyState;
  deliveryState?: string;
  bounceState?: string;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  repliedAt?: string;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  openCount?: number;
  trackedOpenCount?: number;
  estimatedHumanOpenCount?: number;
  suspiciousOpenCount?: number;
  hasOpenSignal?: boolean;
  openTrackingState?: string;
  lastOpenSource?: string;
  trackingEnabled?: boolean;
  primaryRecipientEmail?: string;
  recentEstimatedHumanOpenCount?: number;
  recentSuspiciousOpenCount?: number;
  responseTimeComparableCount?: number;
  responseTimeMedianMs?: number;
  responseTimeP75Ms?: number;
  responseTimeAverageMs?: number;
  responseTimeSignalQuality?: string;
  responseTimeScope?: string;
  expectedReplyWindowMs?: number;
  silenceState?: string;
  silenceOverdueFactor?: number;
  engagementScore?: number;
  engagementBand?: string;
  engagementScoreConfidence?: string;
  scoreReasons?: string[];
  needsFollowUpNow?: boolean;
  hotLead?: boolean;
  openedButNotReplied?: boolean;
  suspiciousTrackingOnly?: boolean;
  tracking?: CommTrackingSummary;
}

export interface CommTrackingBadgesProps {
  source?: CommTrackingLike | null;
  className?: string;
  compact?: boolean;
  showTiming?: boolean;
}

export interface CommIntelligenceBadgesProps {
  source?: CommTrackingLike | null;
  className?: string;
  compact?: boolean;
  showReasons?: boolean;
  showMetrics?: boolean;
}

function resolveTrackingSnapshot(source?: CommTrackingLike | null): CommTrackingSummary {
  if (!source) {
    return {};
  }

  const tracking = source.tracking ?? {};
  return {
    replyState: source.replyState ?? tracking.replyState,
    deliveryState: source.deliveryState ?? tracking.deliveryState,
    bounceState: source.bounceState ?? tracking.bounceState,
    lastOutboundAt: source.lastOutboundAt ?? tracking.lastOutboundAt,
    lastInboundAt: source.lastInboundAt ?? tracking.lastInboundAt,
    repliedAt: source.repliedAt ?? tracking.repliedAt,
    firstOpenedAt: source.firstOpenedAt ?? tracking.firstOpenedAt,
    lastOpenedAt: source.lastOpenedAt ?? tracking.lastOpenedAt,
    openCount: source.openCount ?? source.trackedOpenCount ?? tracking.openCount ?? tracking.trackedOpenCount,
    estimatedHumanOpenCount: source.estimatedHumanOpenCount ?? tracking.estimatedHumanOpenCount,
    suspiciousOpenCount: source.suspiciousOpenCount ?? tracking.suspiciousOpenCount,
    hasOpenSignal: source.hasOpenSignal ?? tracking.hasOpenSignal,
    openTrackingState: source.openTrackingState ?? tracking.openTrackingState,
    lastOpenSource: source.lastOpenSource ?? tracking.lastOpenSource,
    trackingEnabled: source.trackingEnabled ?? tracking.trackingEnabled,
    primaryRecipientEmail: source.primaryRecipientEmail ?? tracking.primaryRecipientEmail,
    recentEstimatedHumanOpenCount:
      source.recentEstimatedHumanOpenCount ?? tracking.recentEstimatedHumanOpenCount,
    recentSuspiciousOpenCount:
      source.recentSuspiciousOpenCount ?? tracking.recentSuspiciousOpenCount,
    responseTimeComparableCount:
      source.responseTimeComparableCount ?? tracking.responseTimeComparableCount,
    responseTimeMedianMs: source.responseTimeMedianMs ?? tracking.responseTimeMedianMs,
    responseTimeP75Ms: source.responseTimeP75Ms ?? tracking.responseTimeP75Ms,
    responseTimeAverageMs: source.responseTimeAverageMs ?? tracking.responseTimeAverageMs,
    responseTimeSignalQuality:
      source.responseTimeSignalQuality ?? tracking.responseTimeSignalQuality,
    responseTimeScope: source.responseTimeScope ?? tracking.responseTimeScope,
    expectedReplyWindowMs: source.expectedReplyWindowMs ?? tracking.expectedReplyWindowMs,
    silenceState: source.silenceState ?? tracking.silenceState,
    silenceOverdueFactor: source.silenceOverdueFactor ?? tracking.silenceOverdueFactor,
    engagementScore: source.engagementScore ?? tracking.engagementScore,
    engagementBand: source.engagementBand ?? tracking.engagementBand,
    engagementScoreConfidence:
      source.engagementScoreConfidence ?? tracking.engagementScoreConfidence,
    scoreReasons: source.scoreReasons ?? tracking.scoreReasons,
    needsFollowUpNow: source.needsFollowUpNow ?? tracking.needsFollowUpNow,
    hotLead: source.hotLead ?? tracking.hotLead,
    openedButNotReplied: source.openedButNotReplied ?? tracking.openedButNotReplied,
    suspiciousTrackingOnly:
      source.suspiciousTrackingOnly ?? tracking.suspiciousTrackingOnly,
  };
}

export function deriveReplyState(source?: CommTrackingLike | null): CommReplyState | undefined {
  const snapshot = resolveTrackingSnapshot(source);
  if (snapshot.replyState && snapshot.replyState !== 'none') {
    return snapshot.replyState;
  }

  if (snapshot.repliedAt) {
    return 'replied';
  }

  if (!snapshot.lastOutboundAt) {
    return undefined;
  }

  if (snapshot.lastInboundAt) {
    const outboundAt = new Date(snapshot.lastOutboundAt).getTime();
    const inboundAt = new Date(snapshot.lastInboundAt).getTime();
    if (Number.isFinite(outboundAt) && Number.isFinite(inboundAt) && inboundAt >= outboundAt) {
      return 'replied';
    }
  }

  const elapsedMs = Date.now() - new Date(snapshot.lastOutboundAt).getTime();
  if (!Number.isFinite(elapsedMs)) {
    return 'waiting';
  }

  if (elapsedMs <= 2 * 24 * 60 * 60 * 1000) {
    return 'fresh';
  }

  return elapsedMs > 7 * 24 * 60 * 60 * 1000 ? 'ghosted' : 'waiting';
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function TrackingBadge({
  icon: Icon,
  label,
  className,
}: {
  icon: typeof BadgeCheck;
  label: string;
  className: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function formatDurationShort(ms?: number): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) {
    return 'n/a';
  }

  const minutes = ms / (60 * 1000);
  if (minutes < 60) {
    return `${Math.max(1, Math.round(minutes))}m`;
  }

  const hours = ms / (60 * 60 * 1000);
  if (hours < 24) {
    return `${Math.max(1, Math.round(hours))}h`;
  }

  const days = ms / (24 * 60 * 60 * 1000);
  return days >= 10 ? `${Math.round(days)}d` : `${days.toFixed(1)}d`;
}

function engagementClassName(band?: CommEngagementBand | string): string {
  if (band === 'high') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  }

  if (band === 'medium') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
  }

  return 'border-white/10 bg-white/5 text-muted-foreground';
}

export function CommTrackingBadges({ source, className, compact = false, showTiming = true }: CommTrackingBadgesProps) {
  const snapshot = resolveTrackingSnapshot(source);
  const replyState = deriveReplyState(source);
  const badges = [];
  const openTrackingState = snapshot.openTrackingState?.trim().toLowerCase();

  if (replyState) {
    const styles: Record<Exclude<CommReplyState, 'none'>, { className: string; icon: typeof MailOpen }> = {
      fresh: { className: 'border-sky-500/20 bg-sky-500/10 text-sky-300', icon: CircleDot },
      waiting: { className: 'border-amber-500/20 bg-amber-500/10 text-amber-300', icon: Clock3 },
      ghosted: { className: 'border-rose-500/20 bg-rose-500/10 text-rose-300', icon: AlertTriangle },
      replied: { className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300', icon: BadgeCheck },
    };

    const config = styles[replyState];
    badges.push(
      <TrackingBadge
        key="reply"
        icon={config.icon}
        label={titleCase(replyState)}
        className={config.className}
      />,
    );
  }

  if (snapshot.deliveryState && snapshot.deliveryState !== 'none') {
    const state = snapshot.deliveryState.trim();
    badges.push(
      <TrackingBadge
        key="delivery"
        icon={BadgeCheck}
        label={`Delivery ${titleCase(state)}`}
        className="border-white/10 bg-white/5 text-muted-foreground"
      />,
    );
  }

  if (snapshot.bounceState && snapshot.bounceState !== 'none') {
    const state = snapshot.bounceState.trim();
    badges.push(
      <TrackingBadge
        key="bounce"
        icon={TriangleAlert}
        label={`Bounce ${titleCase(state)}`}
        className="border-red-500/20 bg-red-500/10 text-red-300"
      />,
    );
  }

  const estimatedHumanOpenCount = snapshot.estimatedHumanOpenCount ?? 0;
  const totalOpenCount = snapshot.openCount ?? 0;
  const suspiciousOpenCount = snapshot.suspiciousOpenCount ?? 0;
  const hasOpenSignal =
    Boolean(snapshot.hasOpenSignal) ||
    Boolean(snapshot.firstOpenedAt) ||
    Boolean(snapshot.lastOpenedAt) ||
    totalOpenCount > 0 ||
    estimatedHumanOpenCount > 0 ||
    openTrackingState === 'open_signal_detected' ||
    openTrackingState === 'detected' ||
    openTrackingState === 'estimated' ||
    openTrackingState === 'suspicious_signal_detected' ||
    openTrackingState === 'suspicious';

  if (suspiciousOpenCount > 0 || openTrackingState === 'suspicious_signal_detected' || openTrackingState === 'suspicious') {
    badges.push(
      <TrackingBadge
        key="suspicious-opens"
        icon={TriangleAlert}
        label={`Suspicious activity${suspiciousOpenCount > 1 ? ` (${suspiciousOpenCount})` : ''}`}
        className="border-rose-500/20 bg-rose-500/10 text-rose-300"
      />,
    );
  }

  if (hasOpenSignal) {
    const strongestOpenCount = Math.max(totalOpenCount, estimatedHumanOpenCount);
    const openLabel =
      strongestOpenCount > 1
        ? 'Opened multiple times'
        : strongestOpenCount === 1
          ? 'Opened'
          : 'Open signal detected';

    badges.push(
      <TrackingBadge
        key="open-signal"
        icon={MailOpen}
        label={openLabel}
        className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
      />,
    );
  }

  if (snapshot.trackingEnabled && hasOpenSignal) {
    badges.push(
      <TrackingBadge
        key="tracking-estimated"
        icon={Clock3}
        label="Tracking estimated"
        className="border-amber-500/20 bg-amber-500/10 text-amber-300"
      />,
    );
  }

  if (badges.length === 0 && !showTiming) {
    return null;
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {badges.length > 0 && (
        <div className={cn('flex flex-wrap gap-1.5', compact ? 'gap-1' : 'gap-1.5')}>
          {badges}
        </div>
      )}
      {showTiming && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
          {snapshot.lastOutboundAt && <span>Last outbound {timeAgo(snapshot.lastOutboundAt)}</span>}
          {snapshot.lastInboundAt && <span>Last inbound {timeAgo(snapshot.lastInboundAt)}</span>}
          {snapshot.repliedAt && <span>Replied {timeAgo(snapshot.repliedAt)}</span>}
          {snapshot.firstOpenedAt && <span>First opened {timeAgo(snapshot.firstOpenedAt)}</span>}
          {snapshot.lastOpenedAt && <span>Last opened {timeAgo(snapshot.lastOpenedAt)}</span>}
          {snapshot.lastOpenSource && <span>Open source {snapshot.lastOpenSource}</span>}
        </div>
      )}
    </div>
  );
}

export function CommIntelligenceBadges({
  source,
  className,
  compact = false,
  showReasons = true,
  showMetrics = true,
}: CommIntelligenceBadgesProps) {
  const snapshot = resolveTrackingSnapshot(source);
  const badges = [];

  if (typeof snapshot.engagementScore === 'number') {
    badges.push(
      <TrackingBadge
        key="engagement-score"
        icon={CircleDot}
        label={`Score ${Math.round(snapshot.engagementScore)}`}
        className={engagementClassName(snapshot.engagementBand)}
      />,
    );
  }

  if (snapshot.hotLead) {
    badges.push(
      <TrackingBadge
        key="hot-lead"
        icon={BadgeCheck}
        label="Hot lead"
        className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      />,
    );
  }

  if (snapshot.needsFollowUpNow) {
    badges.push(
      <TrackingBadge
        key="needs-follow-up"
        icon={Clock3}
        label="Needs follow-up"
        className="border-amber-500/20 bg-amber-500/10 text-amber-300"
      />,
    );
  }

  if (snapshot.openedButNotReplied) {
    badges.push(
      <TrackingBadge
        key="opened-no-reply"
        icon={MailOpen}
        label="Opened, no reply"
        className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
      />,
    );
  }

  if (snapshot.suspiciousTrackingOnly) {
    badges.push(
      <TrackingBadge
        key="suspicious-only"
        icon={TriangleAlert}
        label="Suspicious only"
        className="border-rose-500/20 bg-rose-500/10 text-rose-300"
      />,
    );
  }

  if (snapshot.silenceState && snapshot.silenceState !== 'none' && snapshot.silenceState !== 'watch') {
    badges.push(
      <TrackingBadge
        key="silence"
        icon={AlertTriangle}
        label={titleCase(snapshot.silenceState)}
        className="border-rose-500/20 bg-rose-500/10 text-rose-300"
      />,
    );
  }

  const reasonList = (snapshot.scoreReasons ?? []).filter(Boolean).slice(0, compact ? 2 : 4);

  if (badges.length === 0 && !showReasons && !showMetrics) {
    return null;
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {badges.length > 0 && (
        <div className={cn('flex flex-wrap gap-1.5', compact ? 'gap-1' : 'gap-1.5')}>
          {badges}
        </div>
      )}
      {showMetrics && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
          {snapshot.responseTimeMedianMs && (
            <span>
              Typical reply {formatDurationShort(snapshot.responseTimeMedianMs)}
              {typeof snapshot.responseTimeComparableCount === 'number'
                ? ` · n=${snapshot.responseTimeComparableCount}`
                : ''}
            </span>
          )}
          {snapshot.expectedReplyWindowMs && <span>Expected window {formatDurationShort(snapshot.expectedReplyWindowMs)}</span>}
          {snapshot.silenceOverdueFactor && snapshot.silenceOverdueFactor >= 1 && (
            <span>{snapshot.silenceOverdueFactor.toFixed(1)}x past expected window</span>
          )}
          {snapshot.engagementScoreConfidence && (
            <span>Signal {titleCase(snapshot.engagementScoreConfidence)}</span>
          )}
        </div>
      )}
      {showReasons && reasonList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reasonList.map((reason) => (
            <span
              key={reason}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export { resolveTrackingSnapshot };
