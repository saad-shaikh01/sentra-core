import { IsEnum } from 'class-validator';
import { LeadStatus } from '@sentra-core/types';

export class ChangeStatusDto {
  @IsEnum(LeadStatus)
  status: LeadStatus;
}
