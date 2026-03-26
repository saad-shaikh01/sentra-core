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
  Headers,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { EntityLinksService } from './entity-links.service';
import {
  BackfillByEmailDto,
  CreateEntityLinkDto,
  DeleteEntityLinkByEntityDto,
  ListEntityLinksQueryDto,
} from './dto/entity-links.dto';

@Controller('entity-links')
export class EntityLinksController {
  constructor(
    private readonly service: EntityLinksService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @UseGuards(OrgContextGuard)
  async createLink(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateEntityLinkDto,
  ) {
    const link = await this.service.createLink(ctx.organizationId, ctx.userId, dto);
    return wrapSingle(link);
  }

  // Must be declared before :linkId to avoid route conflict
  @Delete('by-entity')
  @UseGuards(OrgContextGuard)
  @HttpCode(HttpStatus.OK)
  async deleteLinkByEntity(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: DeleteEntityLinkByEntityDto,
  ) {
    await this.service.deleteLinkByEntity(ctx.organizationId, dto.threadId, dto.entityType, dto.entityId);
    return COMM_MUTATION_OK;
  }

  @Delete(':linkId')
  @UseGuards(OrgContextGuard)
  @HttpCode(HttpStatus.OK)
  async deleteLink(
    @GetOrgContext() ctx: OrgContext,
    @Param('linkId') linkId: string,
  ) {
    await this.service.deleteLink(ctx.organizationId, linkId);
    return COMM_MUTATION_OK;
  }

  @Get()
  @UseGuards(OrgContextGuard)
  async listLinks(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: ListEntityLinksQueryDto,
  ) {
    const links = await this.service.listLinks(ctx.organizationId, query.entityType, query.entityId);
    return { data: links };
  }

  /**
   * Internal service-to-service endpoint — secured by x-service-secret header.
   * NOT protected by OrgContextGuard.
   */
  @Post('backfill')
  @HttpCode(HttpStatus.OK)
  async backfillByEmail(
    @Headers('x-service-secret') serviceSecret: string,
    @Body() body: BackfillByEmailDto,
  ) {
    const expectedSecret = this.configService.get<string>('INTERNAL_SERVICE_KEY');
    if (!expectedSecret || serviceSecret !== expectedSecret) {
      throw new ForbiddenException('Invalid service secret');
    }

    await this.service.backfillByEmail(
      body.organizationId,
      body.entityType,
      body.entityId,
      body.emails,
    );
    return { ok: true };
  }
}
