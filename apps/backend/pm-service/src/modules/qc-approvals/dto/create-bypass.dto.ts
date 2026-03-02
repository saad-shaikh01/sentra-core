import { IsString, IsNotEmpty } from 'class-validator';

export class CreateBypassDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
