import {
  CommThreadDeliveryState,
  CommThreadEngagementBand,
  CommThreadEngagementConfidence,
  CommThreadReplyState,
  CommThreadResponseTimeScope,
  CommThreadResponseTimeSignalQuality,
  CommThreadSilenceState,
} from '../../schemas/comm-thread.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FALLBACK_EXPECTED_REPLY_WINDOW_MS = 2 * DAY_MS;

export type ResponseTimeStats = {
  comparableCount: number;
  medianMs?: number;
  p75Ms?: number;
  averageMs?: number;
  signalQuality: CommThreadResponseTimeSignalQuality;
};

export type ThreadIntelligenceInput = {
  replyState: CommThreadReplyState;
  deliveryState: CommThreadDeliveryState;
  lastOutboundAt?: Date;
  repliedAt?: Date;
  expectedReplyWindowMs?: number;
  silenceOverdueFactor?: number;
  silenceState: CommThreadSilenceState;
  responseTimeSignalQuality: CommThreadResponseTimeSignalQuality;
  recentEstimatedHumanOpenCount: number;
  recentSuspiciousOpenCount: number;
  estimatedHumanOpenCount: number;
  suspiciousOpenCount: number;
  hasOpenSignal: boolean;
  now: Date;
  engagementScoreMultiplier?: number;
  hotLeadThreshold?: number;
};

export type ThreadIntelligenceScore = {
  engagementScore: number;
  engagementBand: CommThreadEngagementBand;
  engagementScoreConfidence: CommThreadEngagementConfidence;
  scoreReasons: string[];
  needsFollowUpNow: boolean;
  hotLead: boolean;
  openedButNotReplied: boolean;
  suspiciousTrackingOnly: boolean;
};

export function summarizeResponseTimes(values: number[]): ResponseTimeStats {
  if (values.length === 0) {
    return {
      comparableCount: 0,
      signalQuality: 'insufficient',
    };
  }

  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return {
      comparableCount: 0,
      signalQuality: 'insufficient',
    };
  }

  const comparableCount = sorted.length;
  return {
    comparableCount,
    medianMs: percentile(sorted, 0.5),
    p75Ms: percentile(sorted, 0.75),
    averageMs: Math.round(sorted.reduce((total, value) => total + value, 0) / comparableCount),
    signalQuality:
      comparableCount >= 5
        ? 'usable'
        : comparableCount >= 2
          ? 'weak'
          : 'insufficient',
  };
}

export function selectResponseTimeScope(
  candidateStats: Array<{
    scope: CommThreadResponseTimeScope;
    stats: ResponseTimeStats;
  }>,
): { scope: CommThreadResponseTimeScope; stats: ResponseTimeStats } {
  const usableCandidate = candidateStats.find((candidate) => candidate.stats.comparableCount >= 3);
  if (usableCandidate) {
    return usableCandidate;
  }

  const weakCandidate = candidateStats.find((candidate) => candidate.stats.comparableCount > 0);
  if (weakCandidate) {
    return weakCandidate;
  }

  return {
    scope: 'none',
    stats: {
      comparableCount: 0,
      signalQuality: 'insufficient',
    },
  };
}

export function resolveExpectedReplyWindowMs(
  stats: Pick<ResponseTimeStats, 'comparableCount' | 'medianMs' | 'p75Ms'>,
): number {
  if (stats.comparableCount >= 3 && stats.p75Ms) {
    return clamp(stats.p75Ms, 2 * HOUR_MS, 14 * DAY_MS);
  }

  if (stats.comparableCount >= 1 && stats.medianMs) {
    return clamp(Math.round(stats.medianMs * 1.5), 2 * HOUR_MS, 14 * DAY_MS);
  }

  return FALLBACK_EXPECTED_REPLY_WINDOW_MS;
}

export function deriveSilenceState(input: {
  replyState: CommThreadReplyState;
  lastOutboundAt?: Date;
  repliedAt?: Date;
  expectedReplyWindowMs: number;
  now?: Date;
  thresholds?: {
    overdue: number;
    atRisk: number;
    ghosted: number;
  };
}): { silenceState: CommThreadSilenceState; silenceOverdueFactor?: number } {
  if (!input.lastOutboundAt || input.repliedAt || input.replyState === 'replied') {
    return { silenceState: 'none' };
  }

  const now = input.now ?? new Date();
  const elapsedMs = now.getTime() - input.lastOutboundAt.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return { silenceState: 'none' };
  }

  const expectedReplyWindowMs = Math.max(input.expectedReplyWindowMs, HOUR_MS);
  const silenceOverdueFactor = Number((elapsedMs / expectedReplyWindowMs).toFixed(1));
  const thresholds = input.thresholds ?? {
    overdue: 1,
    atRisk: 1.75,
    ghosted: 3,
  };

  if (input.replyState === 'ghosted' || silenceOverdueFactor >= thresholds.ghosted) {
    return { silenceState: 'ghosted', silenceOverdueFactor };
  }

  if (silenceOverdueFactor >= thresholds.atRisk) {
    return { silenceState: 'at_risk', silenceOverdueFactor };
  }

  if (silenceOverdueFactor >= thresholds.overdue) {
    return { silenceState: 'overdue', silenceOverdueFactor };
  }

  return { silenceState: 'watch', silenceOverdueFactor };
}

export function calculateThreadIntelligenceScore(
  input: ThreadIntelligenceInput,
): ThreadIntelligenceScore {
  let engagementScore = 40;
  const scoreReasons: string[] = [];
  const hasReply = Boolean(input.repliedAt) || input.replyState === 'replied';
  const hasDeliveryFailure =
    input.deliveryState === 'bounce_detected' || input.deliveryState === 'send_failed';
  const openedButNotReplied =
    !hasReply &&
    input.estimatedHumanOpenCount > 0 &&
    input.hasOpenSignal;
  const suspiciousTrackingOnly =
    !hasReply &&
    input.estimatedHumanOpenCount === 0 &&
    input.suspiciousOpenCount > 0;

  if (input.deliveryState === 'bounce_detected') {
    engagementScore -= 40;
    scoreReasons.push('Bounce detected');
  } else if (input.deliveryState === 'send_failed') {
    engagementScore -= 30;
    scoreReasons.push('Send failed before delivery');
  }

  if (hasReply && input.repliedAt) {
    const replyAgeMs = Math.max(0, input.now.getTime() - input.repliedAt.getTime());
    engagementScore += replyAgeMs <= 7 * DAY_MS ? 28 : 18;
    scoreReasons.push(`Recent reply received ${formatAgo(replyAgeMs)} ago`);
  }

  if (input.recentEstimatedHumanOpenCount >= 3) {
    engagementScore += 18;
    scoreReasons.push(`Opened ${input.recentEstimatedHumanOpenCount} times in the last 24h`);
  } else if (input.recentEstimatedHumanOpenCount >= 1) {
    engagementScore += 10;
    scoreReasons.push('Open signal detected in the last 24h');
  } else if (input.estimatedHumanOpenCount >= 1) {
    engagementScore += 5;
    scoreReasons.push('Estimated open signal detected');
  }

  if (openedButNotReplied) {
    engagementScore += 4;
    scoreReasons.push('Opened but not replied');
  }

  if (suspiciousTrackingOnly) {
    engagementScore -= 8;
    scoreReasons.push('Only suspicious open signals');
  }

  if (!hasReply) {
    if (input.replyState === 'fresh') {
      engagementScore += 6;
      scoreReasons.push('Fresh outreach window');
    } else if (input.replyState === 'waiting') {
      engagementScore += 2;
      scoreReasons.push('Waiting for reply');
    } else if (input.replyState === 'ghosted') {
      engagementScore -= 12;
      scoreReasons.push('Thread is already ghosted');
    }
  }

  if (!hasReply && input.silenceState === 'overdue') {
    engagementScore -= 10;
    scoreReasons.push(buildSilenceReason(input.silenceOverdueFactor));
  } else if (!hasReply && input.silenceState === 'at_risk') {
    engagementScore -= 16;
    scoreReasons.push(buildSilenceReason(input.silenceOverdueFactor));
  } else if (!hasReply && input.silenceState === 'ghosted') {
    engagementScore -= 22;
    scoreReasons.push(buildSilenceReason(input.silenceOverdueFactor));
  }

  if (
    input.responseTimeSignalQuality === 'usable' &&
    input.expectedReplyWindowMs &&
    input.expectedReplyWindowMs <= DAY_MS
  ) {
    engagementScore += 5;
    scoreReasons.push('Historically quick responder');
  }

  engagementScore = clamp(
    engagementScore * (input.engagementScoreMultiplier ?? 1),
    0,
    100,
  );

  const engagementBand: CommThreadEngagementBand =
    engagementScore >= 70 ? 'high' : engagementScore >= 40 ? 'medium' : 'low';
  const engagementScoreConfidence: CommThreadEngagementConfidence =
    hasReply ||
    (input.responseTimeSignalQuality === 'usable' &&
      (input.recentEstimatedHumanOpenCount > 0 || input.estimatedHumanOpenCount > 0))
      ? 'high'
      : input.responseTimeSignalQuality !== 'insufficient' ||
          input.hasOpenSignal ||
          input.suspiciousOpenCount > 0 ||
          hasDeliveryFailure
        ? 'medium'
        : 'low';

  const needsFollowUpNow =
    !hasReply &&
    !hasDeliveryFailure &&
    (input.silenceState === 'overdue' ||
      input.silenceState === 'at_risk' ||
      input.silenceState === 'ghosted' ||
      openedButNotReplied);

  const hotLeadThreshold = input.hotLeadThreshold ?? 70;
  const hotLead =
    !hasDeliveryFailure &&
    !suspiciousTrackingOnly &&
    (hasReply || engagementScore >= hotLeadThreshold || input.recentEstimatedHumanOpenCount >= 3);

  return {
    engagementScore,
    engagementBand,
    engagementScoreConfidence,
    scoreReasons: scoreReasons.slice(0, 6),
    needsFollowUpNow,
    hotLead,
    openedButNotReplied,
    suspiciousTrackingOnly,
  };
}

export function formatDuration(ms?: number): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) {
    return 'n/a';
  }

  if (ms < HOUR_MS) {
    return `${Math.max(1, Math.round(ms / (60 * 1000)))}m`;
  }

  if (ms < DAY_MS) {
    return `${Math.max(1, Math.round(ms / HOUR_MS))}h`;
  }

  const days = ms / DAY_MS;
  return days >= 10 ? `${Math.round(days)}d` : `${days.toFixed(1)}d`;
}

function buildSilenceReason(silenceOverdueFactor?: number): string {
  if (silenceOverdueFactor && Number.isFinite(silenceOverdueFactor) && silenceOverdueFactor >= 1) {
    return `No reply ${silenceOverdueFactor.toFixed(1)}x longer than typical`;
  }

  return 'No reply beyond the expected window';
}

function formatAgo(ms: number): string {
  if (ms < HOUR_MS) {
    return `${Math.max(1, Math.round(ms / (60 * 1000)))}m`;
  }

  if (ms < DAY_MS) {
    return `${Math.max(1, Math.round(ms / HOUR_MS))}h`;
  }

  return `${(ms / DAY_MS).toFixed(ms >= 10 * DAY_MS ? 0 : 1)}d`;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 1) {
    return values[0];
  }

  const index = (values.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return values[lower];
  }

  const weight = index - lower;
  return Math.round(values[lower] * (1 - weight) + values[upper] * weight);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
