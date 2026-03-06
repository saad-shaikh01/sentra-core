import { IsString, IsOptional } from 'class-validator';

export class InitiateOAuthDto {
  // orgId and userId come from OrgContext headers, not body
}

export class OAuthCallbackQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  error?: string;
}

export interface OAuthStatePayload {
  organizationId: string;
  userId: string;
  brandId?: string;
}
