import { Model } from 'mongoose';
import { UserRole } from '@sentra-core/types';
import { ForbiddenException } from '@nestjs/common';
import { CommSettingsDocument } from '../../schemas/comm-settings.schema';
import { CommSettingsService, buildRuntimeCommSettings, DEFAULT_COMM_SETTINGS } from './comm-settings.service';

describe('CommSettingsService', () => {
  let service: CommSettingsService;
  let settingsModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  beforeEach(() => {
    settingsModel = {
      findOne: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(null),
      })),
      findOneAndUpdate: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          trackingEnabled: true,
          openTrackingEnabled: false,
          allowPerMessageTrackingToggle: false,
          ghostedAfterDays: 10,
          silenceSensitivity: 'high',
          engagementSensitivity: 'low',
          inAppAlertsEnabled: true,
          emailAlertsEnabled: false,
          multipleOpenAlertsEnabled: true,
          multipleOpenThreshold: 4,
          hotLeadAlertsEnabled: true,
          overdueAlertsEnabled: false,
          updatedByUserId: 'user-1',
          toObject() {
            return this;
          },
        }),
      })),
    };

    service = new CommSettingsService(
      settingsModel as unknown as Model<CommSettingsDocument>,
    );
  });

  it('returns safe defaults when no settings document exists', async () => {
    await expect(service.getResolvedSettings('org-1')).resolves.toEqual(DEFAULT_COMM_SETTINGS);
  });

  it('updates settings for privileged users and keeps runtime tuning explainable', async () => {
    const updated = await service.updateSettings(
      'org-1',
      'user-1',
      UserRole.ADMIN,
      {
        openTrackingEnabled: false,
        ghostedAfterDays: 10,
        silenceSensitivity: 'high',
        engagementSensitivity: 'low',
        multipleOpenThreshold: 4,
        overdueAlertsEnabled: false,
      },
    );

    expect(updated).toMatchObject({
      organizationId: 'org-1',
      openTrackingEnabled: false,
      ghostedAfterDays: 10,
      silenceSensitivity: 'high',
      engagementSensitivity: 'low',
      multipleOpenThreshold: 4,
      overdueAlertsEnabled: false,
    });

    expect(buildRuntimeCommSettings(updated)).toMatchObject({
      hotLeadThreshold: 78,
      silenceThresholds: {
        overdue: 0.85,
        atRisk: 1.4,
        ghosted: 2.4,
      },
    });
  });

  it('rejects non-admin updates', async () => {
    await expect(
      service.updateSettings('org-1', 'user-1', UserRole.FRONTSELL_AGENT, { trackingEnabled: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
