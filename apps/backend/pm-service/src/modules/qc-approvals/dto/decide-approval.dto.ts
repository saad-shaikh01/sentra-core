import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PmApprovalDecision } from '../../../common/enums/pm.enums';

export class DecideApprovalDto {
  @IsEnum(PmApprovalDecision)
  decision!: PmApprovalDecision;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Optional — populated server-side from request.ip */
  actorIp?: string;
}
