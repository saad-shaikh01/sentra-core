import { IsString, IsArray, IsEmail, IsOptional, ArrayNotEmpty } from 'class-validator';

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
  subject: string;

  @IsString()
  bodyHtml: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentS3Keys?: string[];
}

export class ReplyDto {
  @IsString()
  identityId: string;

  @IsString()
  bodyHtml: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];
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
}
