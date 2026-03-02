/**
 * TasksController — PM-BE-011 / PM-BE-012
 *
 * Routes (global prefix /api/pm):
 *   POST   /api/pm/stages/:stageId/tasks             — create task
 *   GET    /api/pm/stages/:stageId/tasks             — list tasks for stage
 *   GET    /api/pm/projects/:projectId/tasks         — list tasks for project
 *   GET    /api/pm/tasks/:id                         — task detail
 *   PATCH  /api/pm/tasks/:id                         — update task
 *   POST   /api/pm/tasks/:id/assign                  — assign task (MANUAL)
 *   POST   /api/pm/tasks/:id/claim                   — claim task (self)
 *   POST   /api/pm/tasks/:id/block                   — block task
 *   POST   /api/pm/tasks/:id/unblock                 — unblock task
 *   POST   /api/pm/tasks/:id/worklogs                — create worklog
 *   GET    /api/pm/tasks/:id/worklogs                — list worklogs
 *   GET    /api/pm/my-tasks                          — assignee-centric task list
 */

import {
  Controller,
  Get,
  Post,
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
import { TasksService } from './tasks.service';
import { WorklogsService } from './worklogs.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { BlockTaskDto } from './dto/block-task.dto';
import { CreateWorklogDto } from './dto/create-worklog.dto';
import { QueryMyTasksDto } from './dto/query-my-tasks.dto';

@UseGuards(OrgContextGuard)
@Controller()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly worklogsService: WorklogsService,
  ) {}

  // ── create task inside stage ──────────────────────────────────────────────

  @Post('stages/:stageId/tasks')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
    @Query('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    const task = await this.tasksService.create(
      ctx.organizationId,
      ctx.userId,
      projectId,
      stageId,
      dto,
    );
    return wrapSingle(task);
  }

  // ── list tasks by stage ───────────────────────────────────────────────────

  @Get('stages/:stageId/tasks')
  async listByStage(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
    @Query() query: QueryTasksDto,
  ) {
    return this.tasksService.listByStage(ctx.organizationId, stageId, query);
  }

  // ── list tasks by project ─────────────────────────────────────────────────

  @Get('projects/:projectId/tasks')
  async listByProject(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Query() query: QueryTasksDto,
  ) {
    return this.tasksService.listByProject(ctx.organizationId, projectId, query);
  }

  // ── my tasks (assignee-centric) ───────────────────────────────────────────

  @Get('my-tasks')
  async myTasks(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: QueryMyTasksDto,
  ) {
    return this.worklogsService.myTasks(ctx.organizationId, ctx.userId, query);
  }

  // ── task detail ───────────────────────────────────────────────────────────

  @Get('tasks/:id')
  async findOne(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const task = await this.tasksService.findOne(ctx.organizationId, id);
    return wrapSingle(task);
  }

  // ── update task ───────────────────────────────────────────────────────────

  @Patch('tasks/:id')
  async update(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const task = await this.tasksService.update(ctx.organizationId, id, ctx.userId, dto);
    return wrapSingle(task);
  }

  // ── assign ────────────────────────────────────────────────────────────────

  @Post('tasks/:id/assign')
  @HttpCode(HttpStatus.OK)
  async assign(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
  ) {
    const task = await this.tasksService.assign(ctx.organizationId, id, ctx.userId, dto);
    return wrapSingle(task);
  }

  // ── claim ─────────────────────────────────────────────────────────────────

  @Post('tasks/:id/claim')
  @HttpCode(HttpStatus.OK)
  async claim(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const task = await this.tasksService.claim(ctx.organizationId, id, ctx.userId);
    return wrapSingle(task);
  }

  // ── block / unblock ───────────────────────────────────────────────────────

  @Post('tasks/:id/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: BlockTaskDto,
  ) {
    const task = await this.tasksService.block(ctx.organizationId, id, ctx.userId, dto);
    return wrapSingle(task);
  }

  @Post('tasks/:id/unblock')
  @HttpCode(HttpStatus.OK)
  async unblock(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const task = await this.tasksService.unblock(ctx.organizationId, id, ctx.userId);
    return wrapSingle(task);
  }

  // ── worklogs ──────────────────────────────────────────────────────────────

  @Post('tasks/:id/worklogs')
  @HttpCode(HttpStatus.CREATED)
  async createWorklog(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: CreateWorklogDto,
  ) {
    const log = await this.worklogsService.createWorklog(
      ctx.organizationId,
      id,
      ctx.userId,
      dto,
    );
    return wrapSingle(log);
  }

  @Get('tasks/:id/worklogs')
  async listWorklogs(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.worklogsService.listWorklogs(
      ctx.organizationId,
      id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }
}
