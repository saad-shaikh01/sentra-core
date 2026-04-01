import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto } from './dto/email-template.dto';

@UseGuards(OrgContextGuard)
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get()
  async list(@GetOrgContext() ctx: OrgContext) {
    const data = await this.service.list(ctx.organizationId);
    return { data };
  }

  @Post()
  async create(@GetOrgContext() ctx: OrgContext, @Body() dto: CreateEmailTemplateDto) {
    const data = await this.service.create(ctx.organizationId, ctx.userId, dto);
    return { data };
  }

  @Patch(':id')
  async update(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    const data = await this.service.update(ctx.organizationId, id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@GetOrgContext() ctx: OrgContext, @Param('id') id: string) {
    await this.service.delete(ctx.organizationId, id);
    return COMM_MUTATION_OK;
  }
}
