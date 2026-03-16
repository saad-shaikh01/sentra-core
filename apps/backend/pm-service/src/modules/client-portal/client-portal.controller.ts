import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { ClientPortalService } from './client-portal.service';
import { CreatePortalAccessDto } from './dto/create-portal-access.dto';

@Controller('client-portal')
export class ClientPortalController {
  constructor(private readonly service: ClientPortalService) {}

  // Protected: PM creates token
  @UseGuards(OrgContextGuard)
  @Post('access')
  @HttpCode(HttpStatus.CREATED)
  async createAccess(@GetOrgContext() ctx: OrgContext, @Body() dto: CreatePortalAccessDto) {
    return wrapSingle(await this.service.createAccess(ctx.organizationId, ctx.userId, dto));
  }

  // Public routes (token in URL)
  @Get('projects/:token')
  async getProject(@Param('token') token: string) {
    return wrapSingle(await this.service.getProject(token));
  }

  @Get('projects/:token/deliverables')
  async getDeliverables(@Param('token') token: string) {
    const data = await this.service.getDeliverables(token);
    return { data };
  }

  @Post('approvals/:approvalId/respond')
  @HttpCode(HttpStatus.OK)
  async respondToApproval(
    @Param('approvalId') approvalId: string,
    @Body() body: { token: string; decision: 'APPROVED' | 'REJECTED'; notes?: string },
  ) {
    return wrapSingle(await this.service.respondToApproval(body.token, approvalId, body));
  }

  @Get('threads/:token')
  async getThreads(@Param('token') token: string) {
    const data = await this.service.getThreads(token);
    return { data };
  }

  @Post('threads/:token/messages')
  @HttpCode(HttpStatus.CREATED)
  async postMessage(
    @Param('token') token: string,
    @Body() body: { threadId: string; message: string },
  ) {
    return wrapSingle(await this.service.postMessage(token, body.threadId, body.message));
  }

  @UseGuards(OrgContextGuard)
  @Delete('access/:id')
  @HttpCode(HttpStatus.OK)
  async revokeAccess(@GetOrgContext() ctx: OrgContext, @Param('id') id: string) {
    return wrapSingle(await this.service.revokeAccess(ctx.organizationId, id));
  }
}
