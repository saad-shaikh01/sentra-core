'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BadgeCheck, AlertTriangle, Clock3, MailOpen, TriangleAlert, CircleDot, ChevronUp, ChevronDown } from 'lucide-react';
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

  if (replyState && replyState !== 'none') {
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

  if (snapshot.trackingEnabled && !hasOpenSignal) {
    badges.push(
      <TrackingBadge
        key="tracking-on"
        icon={MailOpen}
        label="Tracking on"
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

export interface CommIntelligencePanelProps {
  source?: CommTrackingLike | null;
  className?: string;
  actions?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
}

export function CommIntelligencePanel({
  source,
  className,
  actions,
  title,
  subtitle,
}: CommIntelligencePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const snapshot = resolveTrackingSnapshot(source);
  const replyState = deriveReplyState(source);
  const openTrackingState = snapshot.openTrackingState?.trim().toLowerCase();

  // 1. Collect Primary Statuses (Actionable/High-level)
  const primaryBadges = [];
  if (replyState && replyState !== 'none') {
    const styles: Record<Exclude<CommReplyState, 'none'>, { className: string; icon: typeof MailOpen }> = {
      fresh: { className: 'border-sky-500/20 bg-sky-500/10 text-sky-300', icon: CircleDot },
      waiting: { className: 'border-amber-500/20 bg-amber-500/10 text-amber-300', icon: Clock3 },
      ghosted: { className: 'border-rose-500/20 bg-rose-500/10 text-rose-300', icon: AlertTriangle },
      replied: { className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300', icon: BadgeCheck },
    };
    const config = styles[replyState];
    primaryBadges.push(
      <TrackingBadge key="reply" icon={config.icon} label={titleCase(replyState)} className={config.className} />
    );
  }
  if (snapshot.hotLead) {
    primaryBadges.push(
      <TrackingBadge key="hot-lead" icon={BadgeCheck} label="Hot lead" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 shadow-[0_0_12px_-4px_rgba(99,102,241,0.4)]" />
    );
  }
  if (snapshot.needsFollowUpNow) {
    primaryBadges.push(
      <TrackingBadge key="needs-follow-up" icon={Clock3} label="Needs follow-up" className="border-amber-500/30 bg-amber-500/10 text-amber-300" />
    );
  }

  // 2. Collect Secondary Signals (Engagement/Delivery)
  const secondaryBadges = [];
  if (snapshot.deliveryState && snapshot.deliveryState !== 'none') {
    secondaryBadges.push(
      <div key="delivery" className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
        <BadgeCheck className="h-3 w-3" />
        <span>Delivery {titleCase(snapshot.deliveryState)}</span>
      </div>
    );
  }

  const estimatedHumanOpenCount = snapshot.estimatedHumanOpenCount ?? 0;
  const totalOpenCount = snapshot.openCount ?? 0;
  const suspiciousOpenCount = snapshot.suspiciousOpenCount ?? 0;
  const hasOpenSignal = Boolean(snapshot.hasOpenSignal) || Boolean(snapshot.firstOpenedAt) || Boolean(snapshot.lastOpenedAt) || totalOpenCount > 0 || estimatedHumanOpenCount > 0;

  if (hasOpenSignal) {
    const strongestOpenCount = Math.max(totalOpenCount, estimatedHumanOpenCount);
    const openLabel = strongestOpenCount > 1 ? `Opened ${strongestOpenCount}x` : 'Opened';
    secondaryBadges.push(
      <div key="open-signal" className="flex items-center gap-1.5 text-[11px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
        <MailOpen className="h-3 w-3" />
        <span>{openLabel}</span>
      </div>
    );
  }

  if (suspiciousOpenCount > 0 || openTrackingState === 'suspicious') {
    secondaryBadges.push(
      <div key="suspicious" className="flex items-center gap-1.5 text-[11px] text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
        <TriangleAlert className="h-3 w-3" />
        <span>Suspicious activity</span>
      </div>
    );
  }

  // 3. Metrics
  const metrics = [];
  if (typeof snapshot.engagementScore === 'number') {
    metrics.push({
      label: 'Engagement',
      value: `${Math.round(snapshot.engagementScore)}%`,
      sub: snapshot.engagementBand ? titleCase(snapshot.engagementBand) : null,
      color: snapshot.engagementBand === 'high' ? 'text-emerald-400' : snapshot.engagementBand === 'medium' ? 'text-amber-400' : 'text-muted-foreground'
    });
  }
  if (snapshot.responseTimeMedianMs) {
    metrics.push({
      label: 'Typical Reply',
      value: formatDurationShort(snapshot.responseTimeMedianMs),
      sub: snapshot.responseTimeComparableCount ? `n=${snapshot.responseTimeComparableCount}` : null,
      color: 'text-foreground'
    });
  }
  if (snapshot.expectedReplyWindowMs) {
    metrics.push({
      label: 'Expected Window',
      value: formatDurationShort(snapshot.expectedReplyWindowMs),
      sub: snapshot.silenceOverdueFactor && snapshot.silenceOverdueFactor >= 1 ? `${snapshot.silenceOverdueFactor.toFixed(1)}x past` : 'On track',
      color: snapshot.silenceOverdueFactor && snapshot.silenceOverdueFactor >= 1 ? 'text-rose-400' : 'text-muted-foreground'
    });
  }

  const hasDetails = secondaryBadges.length > 0 || (snapshot.scoreReasons && snapshot.scoreReasons.length > 0) || metrics.length > 0;

  return (
    <div className={cn('flex flex-col p-4 sm:p-6 bg-gradient-to-b from-white/[0.03] to-transparent rounded-2xl border border-white/10 shadow-xl mb-6', className)}>
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              {title && <div className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">{title}</div>}
              {subtitle && <div className="text-sm text-muted-foreground font-medium">{subtitle}</div>}
            </div>
            {hasDetails && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all shrink-0"
                title={isExpanded ? 'Collapse insights' : 'Expand insights'}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
          
          {primaryBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2.5">
              {primaryBadges}
            </div>
          )}
        </div>
        
        {actions && (
          <div className="flex items-center gap-1 self-end sm:self-start bg-white/5 p-1 rounded-xl border border-white/5 shadow-inner">
            {actions}
          </div>
        )}
      </div>

      {/* Content Grid (Collapsible) */}
      <AnimatePresence>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-6 mt-6 border-t border-white/5">
              {/* Secondary Signals Row */}
              <div className="lg:col-span-7 space-y-4">
                {secondaryBadges.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 px-1">Engagement Signals</p>
                    <div className="flex flex-wrap gap-2">
                      {secondaryBadges}
                    </div>
                  </div>
                )}
                
                {snapshot.scoreReasons && snapshot.scoreReasons.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 px-1">Insights</p>
                    <div className="flex flex-wrap gap-1.5">
                      {snapshot.scoreReasons.map((reason) => (
                        <span key={reason} className="text-[10px] bg-white/[0.03] text-muted-foreground/80 border border-white/5 px-2 py-0.5 rounded-full">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Metrics Section */}
              {metrics.length > 0 && (
                <div className="lg:col-span-5 grid grid-cols-3 gap-3 bg-black/20 p-3 rounded-2xl border border-white/5">
                  {metrics.map((m) => (
                    <div key={m.label} className="flex flex-col items-center text-center px-1">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">{m.label}</p>
                      <p className={cn('text-sm sm:text-base font-bold tracking-tight', m.color)}>{m.value}</p>
                      {m.sub && <p className="text-[9px] text-muted-foreground/40 mt-0.5 font-medium truncate w-full">{m.sub}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Timing Info (Bottom Bar) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 mt-4 border-t border-white/5 text-[10px] text-muted-foreground/50 font-medium">
              {snapshot.lastOutboundAt && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-sky-500/50" />
                  <span>Outbound {timeAgo(snapshot.lastOutboundAt)}</span>
                </div>
              )}
              {snapshot.lastInboundAt && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-emerald-500/50" />
                  <span>Inbound {timeAgo(snapshot.lastInboundAt)}</span>
                </div>
              )}
              {snapshot.repliedAt && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-primary/50" />
                  <span>Replied {timeAgo(snapshot.repliedAt)}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { resolveTrackingSnapshot };
