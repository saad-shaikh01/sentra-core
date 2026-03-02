/**
 * EngagementsController — PM-BE-007
 *
 * Routes (controller prefix 'engagements', global prefix 'api/pm'):
 *   POST   /api/pm/engagements           — create engagement
 *   GET    /api/pm/engagements           — list engagements (paginated)
 *   GET    /api/pm/engagements/:id       — engagement detail
 *   PATCH  /api/pm/engagements/:id       — update engagement
 *   POST   /api/pm/engagements/:id/archive — archive / close engagement
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { EngagementsService } from './engagements.service';
import { CreateEngagementDto } from './dto/create-engagement.dto';
import { UpdateEngagementDto } from './dto/update-engagement.dto';
import { QueryEngagementsDto } from './dto/query-engagements.dto';

@UseGuards(OrgContextGuard)
@Controller('engagements')
export class EngagementsController {
  constructor(private readonly engagementsService: EngagementsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateEngagementDto,
  ) {
    const engagement = await this.engagementsService.create(
      ctx.organizationId,
      ctx.userId,
      dto,
    );
    return wrapSingle(engagement);
  }

  @Get()
  async list(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: QueryEngagementsDto,
  ) {
    return this.engagementsService.list(ctx.organizationId, query);
  }

  @Get(':id')
  async findOne(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const engagement = await this.engagementsService.findOne(ctx.organizationId, id);
    return wrapSingle(engagement);
  }

  @Patch(':id')
  async update(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateEngagementDto,
  ) {
    const updated = await this.engagementsService.update(ctx.organizationId, id, dto);
    return wrapSingle(updated);
  }

  /** Closes / archives the engagement (sets status → CANCELLED). */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const archived = await this.engagementsService.archive(ctx.organizationId, id);
    return wrapSingle(archived);
  }
}
