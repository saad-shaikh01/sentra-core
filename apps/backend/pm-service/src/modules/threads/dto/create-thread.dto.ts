import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { PmThreadScopeType, PmThreadVisibility } from '../../../common/enums/pm.enums';

export class CreateThreadDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsEnum(PmThreadScopeType)
  scopeType!: PmThreadScopeType;

  @IsString()
  @IsNotEmpty()
  scopeId!: string;

  @IsOptional()
  @IsEnum(PmThreadVisibility)
  visibility?: PmThreadVisibility = PmThreadVisibility.INTERNAL;
}
