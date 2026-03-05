import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class MoveTaskDto {
  @IsUUID('4')
  projectStageId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

