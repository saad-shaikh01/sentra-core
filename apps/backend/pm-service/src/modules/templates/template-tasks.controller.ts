/**
 * TemplateTasksController — PM-BE-006
 *
 * Routes (controller prefix 'templates/tasks'):
 *   PATCH  /api/pm/templates/tasks/:taskId  — update task
 *   DELETE /api/pm/templates/tasks/:taskId  — delete task
 *   POST   /api/pm/templates/tasks/:taskId/checklists — create checklist for task
 */

import {
  Controller,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { TemplateTasksService } from './template-tasks.service';
import { TemplateChecklistsService } from './template-checklists.service';
import { UpdateTemplateTaskDto } from './dto/update-task.dto';
import { CreateChecklistItemDto } from './dto/create-checklist.dto';

@UseGuards(OrgContextGuard)
@Controller('templates/tasks')
export class TemplateTasksController {
  constructor(
    private readonly tasksService: TemplateTasksService,
    private readonly checklistsService: TemplateChecklistsService,
  ) {}

  @Patch(':taskId')
  async updateTask(
    @GetOrgContext() ctx: OrgContext,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTemplateTaskDto,
  ) {
    const task = await this.tasksService.updateTask(ctx.organizationId, taskId, dto);
    return wrapSingle(task);
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(
    @GetOrgContext() ctx: OrgContext,
    @Param('taskId') taskId: string,
  ) {
    await this.tasksService.deleteTask(ctx.organizationId, taskId);
  }

  /**
   * POST /api/pm/templates/tasks/:taskId/checklists
   * Convenience shortcut — taskId is injected into the DTO internally.
   */
  @Post(':taskId/checklists')
  @HttpCode(HttpStatus.CREATED)
  async createChecklist(
    @GetOrgContext() ctx: OrgContext,
    @Param('taskId') taskId: string,
    @Body() dto: CreateChecklistItemDto,
  ) {
    // Force-bind the taskId from the route param
    dto.templateTaskId = taskId;
    dto.templateStageId = undefined;

    const item = await this.checklistsService.create(ctx.organizationId, dto);
    return wrapSingle(item);
  }
}
