import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AssignTaskDto {
  @IsString()
  @IsNotEmpty()
  assigneeId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
