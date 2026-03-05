import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { InviteAppBundleDto } from './invite-bundle.dto';

export class CreateIamInvitationDto {
  @IsEmail()
  email: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteAppBundleDto)
  appBundles: InviteAppBundleDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
