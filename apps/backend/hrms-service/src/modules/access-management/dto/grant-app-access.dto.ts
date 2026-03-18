import { IsString, MinLength } from 'class-validator';

export class GrantAppAccessDto {
  @IsString()
  @MinLength(1)
  appCode!: string;
}
