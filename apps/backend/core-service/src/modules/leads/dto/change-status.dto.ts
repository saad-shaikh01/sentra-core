import { IsEnum, IsDateString, ValidateIf } from 'class-validator';
import { LeadStatus } from '@sentra-core/types';

export class ChangeStatusDto {
  @IsEnum(LeadStatus)
  status: LeadStatus;

  /** Required when status is FOLLOW_UP; ignored otherwise. */
  @ValidateIf((o: ChangeStatusDto) => o.status === LeadStatus.FOLLOW_UP)
  @IsDateString()
  followUpDate?: string;
}
