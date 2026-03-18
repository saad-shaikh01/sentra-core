import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAppRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
