import { IsString, IsNotEmpty } from 'class-validator';

export class BlockTaskDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
