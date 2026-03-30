import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommSettings, CommSettingsDocument } from '../../schemas/comm-settings.schema';
import { UpdateCommSettingsDto } from './dto/update-comm-settings.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ResolvedCommSettings = {
  trackingEnabled: boolean;
  openTrackingEnabled: boolean;
  allowPerMessageTrackingToggle: boolean;
  ghostedAfterDays: number;
  silenceSensitivity: 'low' | 'medium' | 'high';
  engagementSensitivity: 'low' | 'medium' | 'high';
  inAppAlertsEnabled: boolean;
  emailAlertsEnabled: boolean;
  multipleOpenAlertsEnabled: boolean;
  multipleOpenThreshold: number;
  hotLeadAlertsEnabled: boolean;
  overdueAlertsEnabled: boolean;
};

export type RuntimeCommSettings = {
  freshReplyWindowMs: number;
  ghostedReplyWindowMs: number;
  silenceThresholds: {
    overdue: number;
    atRisk: number;
    ghosted: number;
  };
  engagementScoreMultiplier: number;
  hotLeadThreshold: number;
};

export const DEFAULT_COMM_SETTINGS: ResolvedCommSettings = {
  trackingEnabled: true,
  openTrackingEnabled: true,
  allowPerMessageTrackingToggle: true,
  ghostedAfterDays: 7,
  silenceSensitivity: 'medium',
  engagementSensitivity: 'medium',
  inAppAlertsEnabled: true,
  emailAlertsEnabled: false,
  multipleOpenAlertsEnabled: true,
  multipleOpenThreshold: 3,
  hotLeadAlertsEnabled: true,
  overdueAlertsEnabled: true,
};

export function resolveCommSettings(
  settings?: Partial<ResolvedCommSettings> | null,
): ResolvedCommSettings {
  const source = settings ?? {};
  return {
    trackingEnabled: source.trackingEnabled ?? DEFAULT_COMM_SETTINGS.trackingEnabled,
    openTrackingEnabled: source.openTrackingEnabled ?? DEFAULT_COMM_SETTINGS.openTrackingEnabled,
    allowPerMessageTrackingToggle:
      source.allowPerMessageTrackingToggle ?? DEFAULT_COMM_SETTINGS.allowPerMessageTrackingToggle,
    ghostedAfterDays: source.ghostedAfterDays ?? DEFAULT_COMM_SETTINGS.ghostedAfterDays,
    silenceSensitivity: source.silenceSensitivity ?? DEFAULT_COMM_SETTINGS.silenceSensitivity,
    engagementSensitivity:
      source.engagementSensitivity ?? DEFAULT_COMM_SETTINGS.engagementSensitivity,
    inAppAlertsEnabled: source.inAppAlertsEnabled ?? DEFAULT_COMM_SETTINGS.inAppAlertsEnabled,
    emailAlertsEnabled: source.emailAlertsEnabled ?? DEFAULT_COMM_SETTINGS.emailAlertsEnabled,
    multipleOpenAlertsEnabled:
      source.multipleOpenAlertsEnabled ?? DEFAULT_COMM_SETTINGS.multipleOpenAlertsEnabled,
    multipleOpenThreshold:
      source.multipleOpenThreshold ?? DEFAULT_COMM_SETTINGS.multipleOpenThreshold,
    hotLeadAlertsEnabled: source.hotLeadAlertsEnabled ?? DEFAULT_COMM_SETTINGS.hotLeadAlertsEnabled,
    overdueAlertsEnabled: source.overdueAlertsEnabled ?? DEFAULT_COMM_SETTINGS.overdueAlertsEnabled,
  };
}

export function buildRuntimeCommSettings(
  settings: ResolvedCommSettings,
): RuntimeCommSettings {
  const ghostedAfterDays = Math.max(2, Math.min(30, Math.round(settings.ghostedAfterDays)));
  const freshWindowDays = Math.max(1, Math.min(3, Math.round(ghostedAfterDays / 3)));

  const silenceThresholds =
    settings.silenceSensitivity === 'high'
      ? { overdue: 0.85, atRisk: 1.4, ghosted: 2.4 }
      : settings.silenceSensitivity === 'low'
        ? { overdue: 1.25, atRisk: 2.1, ghosted: 3.4 }
        : { overdue: 1, atRisk: 1.75, ghosted: 3 };

  const engagementTuning =
    settings.engagementSensitivity === 'high'
      ? { engagementScoreMultiplier: 1.12, hotLeadThreshold: 64 }
      : settings.engagementSensitivity === 'low'
        ? { engagementScoreMultiplier: 0.9, hotLeadThreshold: 78 }
        : { engagementScoreMultiplier: 1, hotLeadThreshold: 70 };

  return {
    freshReplyWindowMs: freshWindowDays * DAY_MS,
    ghostedReplyWindowMs: ghostedAfterDays * DAY_MS,
    silenceThresholds,
    ...engagementTuning,
  };
}

@Injectable()
export class CommSettingsService {
  constructor(
    @InjectModel(CommSettings.name)
    private readonly settingsModel: Model<CommSettingsDocument>,
  ) {}

  async getSettingsDocument(organizationId: string): Promise<CommSettingsDocument | null> {
    return this.settingsModel.findOne({ organizationId }).exec();
  }

  async getSettings(organizationId: string): Promise<ResolvedCommSettings & { organizationId: string }> {
    const doc = await this.getSettingsDocument(organizationId);
    return {
      organizationId,
      ...resolveCommSettings(doc?.toObject() as Partial<ResolvedCommSettings> | undefined),
    };
  }

  async getResolvedSettings(organizationId: string): Promise<ResolvedCommSettings> {
    const doc = await this.getSettingsDocument(organizationId);
    return resolveCommSettings(doc?.toObject() as Partial<ResolvedCommSettings> | undefined);
  }

  async updateSettings(
    organizationId: string,
    userId: string,
    role: UserRole,
    dto: UpdateCommSettingsDto,
  ): Promise<ResolvedCommSettings & { organizationId: string; updatedByUserId?: string }> {
    this.assertPrivileged(role);

    const updated = await this.settingsModel
      .findOneAndUpdate(
        { organizationId },
        {
          $set: {
            ...Object.fromEntries(
              Object.entries(dto).filter(([, value]) => value !== undefined),
            ),
            updatedByUserId: userId,
          },
          $setOnInsert: {
            organizationId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    const resolved = resolveCommSettings(updated?.toObject() as Partial<ResolvedCommSettings>);
    return {
      organizationId,
      ...resolved,
      updatedByUserId: updated?.updatedByUserId,
    };
  }

  getRuntimeSettings(settings: ResolvedCommSettings): RuntimeCommSettings {
    return buildRuntimeCommSettings(settings);
  }

  private assertPrivileged(role: UserRole): void {
    if (role !== UserRole.OWNER && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only owners and admins can update email intelligence settings');
    }
  }
}
