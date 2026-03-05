import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/comm-api-response';
import { AttachmentsService } from './attachments.service';

@UseGuards(OrgContextGuard)
@Controller('messages')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get(':messageId/attachments/:index')
  async getAttachmentUrl(
    @GetOrgContext() ctx: OrgContext,
    @Param('messageId') messageId: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    const result = await this.service.getAttachmentUrl(ctx.organizationId, messageId, index);
    return wrapSingle(result);
  }
}

@UseGuards(OrgContextGuard)
@Controller('attachments')
export class AttachmentUploadController {
  constructor(private readonly service: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @GetOrgContext() ctx: OrgContext,
    @UploadedFile() file: any,
  ) {
    const result = await this.service.uploadAttachment(ctx.organizationId, file);
    return wrapSingle(result);
  }
}
