import { IsString } from 'class-validator';

export class GrantAppAccessDto {
  @IsString()
  appCode!: string;
}
