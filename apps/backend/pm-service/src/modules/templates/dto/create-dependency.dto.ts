import { IsUUID, IsEnum, IsOptional } from 'class-validator';
import { PmDependencyType } from '../../../common/enums/pm.enums';

export class CreateStageDependencyDto {
  /** The stage that must complete (or start) before the parent stage. */
  @IsUUID('4')
  dependsOnTemplateStageId: string;

  @IsOptional()
  @IsEnum(PmDependencyType)
  dependencyType?: PmDependencyType;
}
