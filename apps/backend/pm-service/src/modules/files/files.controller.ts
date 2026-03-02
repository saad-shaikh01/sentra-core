/**
 * FilesController — PM-BE-017
 *
 * Routes (global prefix /api/pm):
 *   POST   /api/pm/files/upload-token    — request upload intent + storage key
 *   POST   /api/pm/files/complete-upload — confirm upload and create FileVersion
 *   GET    /api/pm/files/:id             — file asset detail (with versions)
 *   POST   /api/pm/files/:id/link        — link file to a scope
 *   GET    /api/pm/files/:id/signed-url  — get short-lived access URL
 *   GET    /api/pm/files/scope           — list files linked to a scope
 */

import {
  Controller,
  Get,
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
import { FilesService } from './files.service';
import { CreateFileAssetDto } from './dto/create-file-asset.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { LinkFileDto } from './dto/link-file.dto';

@UseGuards(OrgContextGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload-token')
  @HttpCode(HttpStatus.CREATED)
  async requestUploadToken(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateFileAssetDto,
  ) {
    const token = await this.filesService.requestUploadToken(
      ctx.organizationId,
      ctx.userId,
      dto,
    );
    return wrapSingle(token);
  }

  @Post('complete-upload')
  @HttpCode(HttpStatus.CREATED)
  async completeUpload(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CompleteUploadDto,
  ) {
    const version = await this.filesService.completeUpload(
      ctx.organizationId,
      ctx.userId,
      dto,
    );
    return wrapSingle(version);
  }

  @Get('scope')
  async listByScope(
    @GetOrgContext() ctx: OrgContext,
    @Query('scopeType') scopeType: string,
    @Query('scopeId') scopeId: string,
  ) {
    const links = await this.filesService.listLinksByScope(
      ctx.organizationId,
      scopeType,
      scopeId,
    );
    return wrapSingle(links);
  }

  @Get(':id')
  async findOne(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const asset = await this.filesService.findOne(ctx.organizationId, id);
    return wrapSingle(asset);
  }

  @Post(':id/link')
  @HttpCode(HttpStatus.CREATED)
  async linkFile(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: LinkFileDto,
  ) {
    const link = await this.filesService.linkFile(ctx.organizationId, id, ctx.userId, dto);
    return wrapSingle(link);
  }

  @Get(':id/signed-url')
  async getSignedUrl(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Query('versionId') versionId?: string,
  ) {
    const result = await this.filesService.getSignedUrl(
      ctx.organizationId,
      id,
      ctx.userId,
      versionId,
    );
    return wrapSingle(result);
  }
}
