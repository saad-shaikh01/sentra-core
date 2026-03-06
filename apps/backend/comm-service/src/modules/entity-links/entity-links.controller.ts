import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { EntityLinksService } from './entity-links.service';
import { CreateEntityLinkDto, DeleteEntityLinkByEntityDto, ListEntityLinksQueryDto } from './dto/entity-links.dto';

@UseGuards(OrgContextGuard)
@Controller('entity-links')
export class EntityLinksController {
  constructor(private readonly service: EntityLinksService) {}

  @Post()
  async createLink(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateEntityLinkDto,
  ) {
    const link = await this.service.createLink(ctx.organizationId, ctx.userId, dto);
    return wrapSingle(link);
  }

  // Must be declared before :linkId to avoid route conflict
  @Delete('by-entity')
  @HttpCode(HttpStatus.OK)
  async deleteLinkByEntity(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: DeleteEntityLinkByEntityDto,
  ) {
    await this.service.deleteLinkByEntity(ctx.organizationId, dto.threadId, dto.entityType, dto.entityId);
    return COMM_MUTATION_OK;
  }

  @Delete(':linkId')
  @HttpCode(HttpStatus.OK)
  async deleteLink(
    @GetOrgContext() ctx: OrgContext,
    @Param('linkId') linkId: string,
  ) {
    await this.service.deleteLink(ctx.organizationId, linkId);
    return COMM_MUTATION_OK;
  }

  @Get()
  async listLinks(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: ListEntityLinksQueryDto,
  ) {
    const links = await this.service.listLinks(ctx.organizationId, query.entityType, query.entityId);
    return { data: links };
  }
}
