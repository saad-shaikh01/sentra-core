/**
 * StagesController — PM-BE-010
 *
 * Routes (global prefix /api/pm):
 *   GET    /api/pm/projects/:projectId/stages       — list project stages
 *   GET    /api/pm/stages/:id                       — stage detail
 *   PATCH  /api/pm/stages/:id                       — update stage metadata
 *   PATCH  /api/pm/stages/:id/lead                  — transfer lead ownership
 *   POST   /api/pm/stages/:id/activate              — activate stage (dep check)
 *   POST   /api/pm/stages/:id/complete              — mark stage completed
 *   POST   /api/pm/stages/:id/block                 — block stage
 *   POST   /api/pm/stages/:id/unblock               — unblock stage
 *   POST   /api/pm/stages/:id/skip                  — skip optional stage
 */

import {
  Controller,
  Get,
  Patch,
  Post,
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
import { StagesService } from './stages.service';
import { UpdateStageDto } from './dto/update-stage.dto';
import { StageLeadDto } from './dto/stage-lead.dto';
import { BlockStageDto } from './dto/block-stage.dto';

@UseGuards(OrgContextGuard)
@Controller()
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  // ── project stage list ────────────────────────────────────────────────────

  @Get('projects/:projectId/stages')
  async list(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stagesService.list(
      ctx.organizationId,
      projectId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get('stages')
  async listAll(
    @GetOrgContext() ctx: OrgContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stagesService.listAll(
      ctx.organizationId,
      ctx.userId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  // ── stage detail ──────────────────────────────────────────────────────────

  @Get('stages/:id')
  async findOne(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const stage = await this.stagesService.findOne(ctx.organizationId, id);
    return wrapSingle(stage);
  }

  // ── update metadata ───────────────────────────────────────────────────────

  @Patch('stages/:id')
  async update(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateStageDto,
  ) {
    const stage = await this.stagesService.update(ctx.organizationId, id, dto);
    return wrapSingle(stage);
  }

  // ── transfer lead ─────────────────────────────────────────────────────────

  @Patch('stages/:id/lead')
  async updateLead(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: StageLeadDto,
  ) {
    const stage = await this.stagesService.updateLead(ctx.organizationId, id, dto);
    return wrapSingle(stage);
  }

  // ── lifecycle mutations ───────────────────────────────────────────────────

  @Post('stages/:id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const stage = await this.stagesService.activate(ctx.organizationId, id);
    return wrapSingle(stage);
  }

  @Post('stages/:id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const stage = await this.stagesService.complete(ctx.organizationId, id);
    return wrapSingle(stage);
  }

  @Post('stages/:id/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: BlockStageDto,
  ) {
    const stage = await this.stagesService.block(ctx.organizationId, id, dto);
    return wrapSingle(stage);
  }

  @Post('stages/:id/unblock')
  @HttpCode(HttpStatus.OK)
  async unblock(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const stage = await this.stagesService.unblock(ctx.organizationId, id);
    return wrapSingle(stage);
  }

  @Post('stages/:id/skip')
  @HttpCode(HttpStatus.OK)
  async skip(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const stage = await this.stagesService.skip(ctx.organizationId, id);
    return wrapSingle(stage);
  }
}
