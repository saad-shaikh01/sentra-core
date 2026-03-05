import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AppCode, DataScopeType } from '@sentra-core/types';

export class InviteScopeGrantDto {
  @IsString()
  resourceKey: string;

  @IsEnum(DataScopeType)
  scopeType: DataScopeType;

  @IsOptional()
  @IsObject()
  scopeValues?: Record<string, unknown>;
}

export class InviteAppBundleDto {
  @IsEnum(AppCode)
  appCode: AppCode;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteScopeGrantDto)
  scopeGrants?: InviteScopeGrantDto[];
}
