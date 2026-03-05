import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { AuditService, AuditQueryDto } from './audit.service';
import { IsOptional, IsString } from 'class-validator';
import { CommPaginationQueryDto } from '../../common/dto/pagination-query.dto';

class AuditQueryParamsDto extends CommPaginationQueryDto implements AuditQueryDto {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() actorUserId?: string;
  @IsOptional() @IsString() action?: any;
}

@UseGuards(OrgContextGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  async queryLogs(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: AuditQueryParamsDto,
  ) {
    return this.service.queryLogs(ctx.organizationId, query);
  }
}
