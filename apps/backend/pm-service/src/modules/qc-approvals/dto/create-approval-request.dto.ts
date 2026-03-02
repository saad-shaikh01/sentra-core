import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmail,
  IsDateString,
} from 'class-validator';
import { PmApprovalTargetType } from '../../../common/enums/pm.enums';

export class CreateApprovalRequestDto {
  @IsString()
  @IsNotEmpty()
  deliverablePackageId!: string;

  @IsEnum(PmApprovalTargetType)
  approvalTargetType!: PmApprovalTargetType;

  @IsOptional()
  @IsString()
  approvalTargetUserId?: string;

  @IsOptional()
  @IsEmail()
  approvalTargetEmail?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
