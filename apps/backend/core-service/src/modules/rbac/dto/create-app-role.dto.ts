import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAppRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and underscores',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
