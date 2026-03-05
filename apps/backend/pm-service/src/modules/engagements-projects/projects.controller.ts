/**
 * ProjectsController — PM-BE-008 / PM-BE-009
 *
 * Routes (controller prefix 'projects', global prefix 'api/pm'):
 *   POST   /api/pm/projects        — create project (triggers template generation if templateId provided)
 *   GET    /api/pm/projects        — list projects (paginated)
 *   GET    /api/pm/projects/:id    — project detail with stages
 *   GET    /api/pm/projects/:id/board — kanban payload for project workspace
 *   GET    /api/pm/projects/:id/activity — project audit/activity feed
 *   PATCH  /api/pm/projects/:id    — update project metadata
 *   POST   /api/pm/projects/:id/archive — archive project
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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';

@UseGuards(OrgContextGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateProjectDto,
  ) {
    const project = await this.projectsService.create(
      ctx.organizationId,
      ctx.userId,
      dto,
    );
    return wrapSingle(project);
  }

  @Get()
  async list(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: QueryProjectsDto,
  ) {
    return this.projectsService.list(ctx.organizationId, query);
  }

  @Get(':id')
  async findOne(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const project = await this.projectsService.findOne(ctx.organizationId, id);
    return wrapSingle(project);
  }

  @Get(':id/board')
  async board(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const board = await this.projectsService.board(ctx.organizationId, id);
    return wrapSingle(board);
  }

  @Get(':id/activity')
  async activity(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.activity(
      ctx.organizationId,
      id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Patch(':id')
  async update(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    const updated = await this.projectsService.update(
      ctx.organizationId,
      id,
      ctx.userId,
      dto,
    );
    return wrapSingle(updated);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const archived = await this.projectsService.archive(
      ctx.organizationId,
      id,
      ctx.userId,
    );
    return wrapSingle(archived);
  }
}
