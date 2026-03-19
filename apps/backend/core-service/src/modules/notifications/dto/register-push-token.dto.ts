import { IsString, IsEnum, IsOptional } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsEnum(['WEB', 'ANDROID', 'IOS'])
  platform: 'WEB' | 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  userAgent?: string;
}
