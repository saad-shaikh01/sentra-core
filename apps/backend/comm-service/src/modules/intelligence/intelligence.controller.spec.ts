import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';

describe('IntelligenceController', () => {
  it('wraps the intelligence summary in the standard single-resource response shape', async () => {
    const intelligenceService = {
      getSummary: jest.fn().mockResolvedValue({
        dateRange: {
          dateFrom: '2026-03-01T00:00:00.000Z',
          dateTo: '2026-03-30T23:59:59.000Z',
        },
        totals: {
          trackedSends: 4,
          replies: 2,
          estimatedOpens: 3,
          suspiciousOpens: 1,
          bounces: 0,
          sendFailures: 0,
        },
        responseTimes: {
          sampleSize: 2,
          signalQuality: 'weak',
        },
        queues: {
          needsFollowUp: 1,
          hotLeads: 1,
          overdue: 1,
          openedNoReply: 1,
          suspiciousOnly: 0,
        },
      }),
    };

    const controller = new IntelligenceController(
      intelligenceService as unknown as IntelligenceService,
    );

    await expect(
      controller.getSummary(
        {
          organizationId: 'org-1',
        } as never,
        {
          dateFrom: '2026-03-01T00:00:00.000Z',
          dateTo: '2026-03-30T23:59:59.000Z',
        },
      ),
    ).resolves.toEqual({
      data: expect.objectContaining({
        totals: expect.objectContaining({
          trackedSends: 4,
        }),
      }),
    });
  });
});
