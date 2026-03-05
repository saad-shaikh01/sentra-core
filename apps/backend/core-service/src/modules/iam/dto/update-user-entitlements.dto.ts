import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { AppCode } from '@sentra-core/types';
import { InviteAppBundleDto } from './invite-bundle.dto';

export class UpdateUserEntitlementsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteAppBundleDto)
  appBundles: InviteAppBundleDto[];

  @IsOptional()
  @IsEnum(AppCode)
  defaultAppCode?: AppCode;
}
