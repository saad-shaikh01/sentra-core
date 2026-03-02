import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SelfQcResponseItemDto {
  @IsOptional()
  @IsString()
  templateChecklistId?: string;

  @IsString()
  labelSnapshot!: string;

  @IsOptional()
  isChecked?: boolean = true;

  @IsOptional()
  @IsString()
  responseText?: string;
}

export class CreateSubmissionDto {
  @IsOptional()
  @IsString()
  notes?: string;

  /** Self-QC responses; required when task.requiresQc is true */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelfQcResponseItemDto)
  selfQcResponses?: SelfQcResponseItemDto[];
}
