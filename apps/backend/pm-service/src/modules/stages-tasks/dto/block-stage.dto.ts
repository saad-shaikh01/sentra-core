import { IsString, IsNotEmpty } from 'class-validator';

export class BlockStageDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
