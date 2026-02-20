import { IsString, MinLength } from 'class-validator';

export class UpdateCredentialsDto {
  @IsString()
  @MinLength(6)
  password: string;
}
