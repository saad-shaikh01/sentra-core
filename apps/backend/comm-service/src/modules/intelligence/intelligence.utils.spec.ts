import {
  calculateThreadIntelligenceScore,
  deriveSilenceState,
  resolveExpectedReplyWindowMs,
  summarizeResponseTimes,
} from './intelligence.utils';

describe('intelligence.utils', () => {
  it('summarizes response times with robust percentile stats', () => {
    const stats = summarizeResponseTimes([
      2 * 60 * 60 * 1000,
      4 * 60 * 60 * 1000,
      6 * 60 * 60 * 1000,
      8 * 60 * 60 * 1000,
      10 * 60 * 60 * 1000,
    ]);

    expect(stats).toMatchObject({
      comparableCount: 5,
      medianMs: 6 * 60 * 60 * 1000,
      p75Ms: 8 * 60 * 60 * 1000,
      averageMs: 6 * 60 * 60 * 1000,
      signalQuality: 'usable',
    });
  });

  it('derives overdue silence factors from the expected response window', () => {
    const now = new Date('2026-03-30T12:00:00.000Z');
    const silence = deriveSilenceState({
      replyState: 'waiting',
      lastOutboundAt: new Date('2026-03-29T12:00:00.000Z'),
      expectedReplyWindowMs: 12 * 60 * 60 * 1000,
      now,
    });

    expect(silence).toEqual({
      silenceState: 'at_risk',
      silenceOverdueFactor: 2,
    });
  });

  it('uses p75 when enough response history exists and falls back safely otherwise', () => {
    expect(
      resolveExpectedReplyWindowMs({
        comparableCount: 4,
        medianMs: 4 * 60 * 60 * 1000,
        p75Ms: 10 * 60 * 60 * 1000,
      }),
    ).toBe(10 * 60 * 60 * 1000);

    expect(
      resolveExpectedReplyWindowMs({
        comparableCount: 1,
        medianMs: 2 * 60 * 60 * 1000,
      }),
    ).toBe(3 * 60 * 60 * 1000);
  });

  it('produces explainable hot-lead scoring without overclaiming suspicious opens', () => {
    const result = calculateThreadIntelligenceScore({
      replyState: 'waiting',
      deliveryState: 'sent',
      lastOutboundAt: new Date('2026-03-29T08:00:00.000Z'),
      expectedReplyWindowMs: 8 * 60 * 60 * 1000,
      silenceOverdueFactor: 1.2,
      silenceState: 'overdue',
      responseTimeSignalQuality: 'usable',
      recentEstimatedHumanOpenCount: 3,
      recentSuspiciousOpenCount: 0,
      estimatedHumanOpenCount: 3,
      suspiciousOpenCount: 0,
      hasOpenSignal: true,
      now: new Date('2026-03-30T10:00:00.000Z'),
    });

    expect(result.engagementBand).toBe('medium');
    expect(result.hotLead).toBe(true);
    expect(result.openedButNotReplied).toBe(true);
    expect(result.scoreReasons).toEqual(
      expect.arrayContaining([
        'Opened 3 times in the last 24h',
        'Opened but not replied',
        'No reply 1.2x longer than typical',
      ]),
    );
  });
});
