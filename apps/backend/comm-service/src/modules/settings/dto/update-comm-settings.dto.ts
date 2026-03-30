import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

const SENSITIVITY_VALUES = ['low', 'medium', 'high'] as const;

export class UpdateCommSettingsDto {
  @IsOptional()
  @IsBoolean()
  trackingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  openTrackingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPerMessageTrackingToggle?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(30)
  ghostedAfterDays?: number;

  @IsOptional()
  @IsIn(SENSITIVITY_VALUES)
  silenceSensitivity?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsIn(SENSITIVITY_VALUES)
  engagementSensitivity?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsBoolean()
  inAppAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  multipleOpenAlertsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  multipleOpenThreshold?: number;

  @IsOptional()
  @IsBoolean()
  hotLeadAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  overdueAlertsEnabled?: boolean;
}
