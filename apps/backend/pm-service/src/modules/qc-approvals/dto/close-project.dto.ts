import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CloseProjectDto {
  @IsString()
  @IsNotEmpty()
  closureReason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
