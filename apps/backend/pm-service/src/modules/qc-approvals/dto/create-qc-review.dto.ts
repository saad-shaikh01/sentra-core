import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PmReviewDecision } from '../../../common/enums/pm.enums';

export class CreateQcReviewDto {
  @IsEnum(PmReviewDecision)
  decision!: PmReviewDecision;

  @IsOptional()
  @IsString()
  feedback?: string;
}
