import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { ClientStatus } from '@sentra-core/types';
import { PaginationQueryDto } from '../../../common';

export class QueryClientsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  upsellAgentId?: string;

  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
