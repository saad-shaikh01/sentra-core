import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { SignaturesService } from './signatures.service';
import { CreateSignatureDto, UpdateSignatureDto } from './dto/signature.dto';

@UseGuards(OrgContextGuard)
@Controller('signatures')
export class SignaturesController {
  constructor(private readonly service: SignaturesService) {}

  @Get()
  async list(@GetOrgContext() ctx: OrgContext) {
    const data = await this.service.list(ctx.organizationId);
    return { data };
  }

  @Get('default')
  async getDefault(
    @GetOrgContext() ctx: OrgContext,
    @Query('identityId') identityId?: string,
  ) {
    const data = await this.service.getDefaultForIdentity(ctx.organizationId, identityId);
    return { data };
  }

  @Post()
  async create(@GetOrgContext() ctx: OrgContext, @Body() dto: CreateSignatureDto) {
    const data = await this.service.create(ctx.organizationId, ctx.userId, dto);
    return { data };
  }

  @Patch(':id')
  async update(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateSignatureDto,
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
