import { IsString, IsArray, IsEmail, IsOptional, IsNotEmpty, ArrayNotEmpty, ValidateIf, IsBoolean, IsDateString } from 'class-validator';

export class SendMessageDto {
  @IsString()
  identityId: string;

  @IsOptional()
  @IsEmail()
  fromAlias?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  to: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsString()
  @IsNotEmpty()
  subject: string;

  @ValidateIf((dto: SendMessageDto) => !dto.bodyText)
  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentS3Keys?: string[];

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsBoolean()
  trackingEnabled?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class ReplyDto {
  @IsString()
  identityId: string;

  @IsOptional()
  @IsEmail()
  fromAlias?: string;

  @ValidateIf((dto: ReplyDto) => !dto.bodyText)
  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentS3Keys?: string[];

  @IsOptional()
  @IsBoolean()
  replyAll?: boolean;

  @IsOptional()
  @IsBoolean()
  trackingEnabled?: boolean;
}

export class ForwardDto {
  @IsString()
  identityId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  to: string[];

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentS3Keys?: string[];

  @IsOptional()
  @IsBoolean()
  trackingEnabled?: boolean;
}
