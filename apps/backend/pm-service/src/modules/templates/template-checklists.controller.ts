/**
 * TemplateChecklistsController — PM-BE-006
 *
 * Routes (controller prefix 'templates/checklists'):
 *   POST   /api/pm/templates/checklists             — create checklist item
 *   GET    /api/pm/templates/checklists              — list (requires ?templateStageId or ?templateTaskId)
 *   PATCH  /api/pm/templates/checklists/:checklistId — update
 *   DELETE /api/pm/templates/checklists/:checklistId — delete
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { TemplateChecklistsService } from './template-checklists.service';
import { CreateChecklistItemDto } from './dto/create-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist.dto';

class ChecklistQueryDto {
  @IsOptional()
  @IsUUID('4')
  templateStageId?: string;

  @IsOptional()
  @IsUUID('4')
  templateTaskId?: string;
}

@UseGuards(OrgContextGuard)
@Controller('templates/checklists')
export class TemplateChecklistsController {
  constructor(private readonly checklistsService: TemplateChecklistsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateChecklistItemDto,
  ) {
    const item = await this.checklistsService.create(ctx.organizationId, dto);
    return wrapSingle(item);
  }

  @Get()
  async list(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: ChecklistQueryDto,
  ) {
    const items = await this.checklistsService.list(ctx.organizationId, {
      templateStageId: query.templateStageId,
      templateTaskId: query.templateTaskId,
    });
    return wrapSingle(items);
  }

  @Patch(':checklistId')
  async update(
    @GetOrgContext() ctx: OrgContext,
    @Param('checklistId') checklistId: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    const updated = await this.checklistsService.update(
      ctx.organizationId,
      checklistId,
      dto,
    );
    return wrapSingle(updated);
  }

  @Delete(':checklistId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @GetOrgContext() ctx: OrgContext,
    @Param('checklistId') checklistId: string,
  ) {
    await this.checklistsService.delete(ctx.organizationId, checklistId);
  }
}
