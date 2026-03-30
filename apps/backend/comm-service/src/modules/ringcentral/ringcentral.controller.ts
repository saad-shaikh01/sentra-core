import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { UserRole } from '@sentra-core/types';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { COMM_MUTATION_OK, wrapSingle } from '../../common/response/comm-api-response';
import { CreateRingCentralCallDto } from './dto/create-ringcentral-call.dto';
import { SendRingCentralSmsDto } from './dto/send-ringcentral-sms.dto';
import { UpdateRingCentralCallAnnotationDto } from './dto/update-ringcentral-call-annotation.dto';
import { RingCentralService } from './ringcentral.service';

@Controller('ringcentral')
export class RingCentralController {
  constructor(
    private readonly service: RingCentralService,
    private readonly config: ConfigService,
  ) {}

  @UseGuards(OrgContextGuard)
  @Get('oauth/initiate')
  async initiateOAuth(
    @GetOrgContext() ctx: OrgContext,
    @Query('brandId') brandId?: string,
  ) {
    const url = await this.service.initiateOAuth(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      brandId,
    );
    return wrapSingle({ redirectUrl: url });
  }

  @Get('oauth/callback')
  async oauthCallback(
    @Query() query: Record<string, string | undefined>,
    @Req() _req: Request,
    @Res() res: Response,
  ) {
    const error = typeof query.error === 'string' ? query.error : undefined;
    const code = typeof query.code === 'string' ? query.code : undefined;
    const state = typeof query.state === 'string' ? query.state : undefined;

    if (error) {
      return res.redirect(this.buildSettingsRedirect({ error }));
    }

    if (!code || !state) {
      return res.redirect(this.buildSettingsRedirect({ error: 'missing_oauth_parameters' }));
    }

    try {
      const connection = await this.service.handleOAuthCallback(code, state);
      return res.redirect(
        this.buildSettingsRedirect({
          success: true,
          connectionId: String(connection._id),
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'oauth_callback_failed';
      return res.redirect(this.buildSettingsRedirect({ error: message }));
    }
  }

  @UseGuards(OrgContextGuard)
  @Get('oauth/brands')
  async getOAuthBrands(@Headers('authorization') authorization?: string) {
    const brands = await this.service.getOAuthBrands(authorization);
    return wrapSingle(brands);
  }

  @UseGuards(OrgContextGuard)
  @Get('connections')
  async listConnections(@GetOrgContext() ctx: OrgContext) {
    const connections = await this.service.listConnections(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return {
      data: connections.map((connection) => this.service.serializeConnection(connection)),
    };
  }

  @UseGuards(OrgContextGuard)
  @Get('connections/:id')
  async getConnection(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const connection = await this.service.getConnection(
      ctx.organizationId,
      id,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return wrapSingle(this.service.serializeConnection(connection));
  }

  @UseGuards(OrgContextGuard)
  @Post('connections/:id/subscriptions/sync')
  @HttpCode(HttpStatus.OK)
  async syncWebhookSubscription(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.service.syncWebhookSubscription(
      ctx.organizationId,
      id,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return COMM_MUTATION_OK;
  }

  @UseGuards(OrgContextGuard)
  @Patch('connections/:id/default')
  @HttpCode(HttpStatus.OK)
  async setDefault(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.service.setDefault(
      ctx.organizationId,
      id,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return COMM_MUTATION_OK;
  }

  @UseGuards(OrgContextGuard)
  @Delete('connections/:id')
  @HttpCode(HttpStatus.OK)
  async deleteConnection(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.service.deleteConnection(
      ctx.organizationId,
      id,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return COMM_MUTATION_OK;
  }

  @UseGuards(OrgContextGuard)
  @Post('calls')
  async startCall(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateRingCentralCallDto,
  ) {
    const call = await this.service.startCall(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      dto,
    );
    return wrapSingle(call);
  }

  @UseGuards(OrgContextGuard)
  @Get('calls')
  async listCalls(
    @GetOrgContext() ctx: OrgContext,
    @Query('status') status?: 'all' | 'open',
    @Query('limit') limit?: string,
    @Query('entityType') entityType?: 'lead' | 'client' | 'sale' | 'project',
    @Query('entityId') entityId?: string,
  ) {
    const calls = await this.service.listCalls(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      {
        status,
        limit: limit ? Number.parseInt(limit, 10) : undefined,
        entityType,
        entityId,
      },
    );
    return { data: calls };
  }

  @UseGuards(OrgContextGuard)
  @Patch('calls/:id/annotation')
  async updateCallAnnotation(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateRingCentralCallAnnotationDto,
  ) {
    const call = await this.service.updateCallAnnotation(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      id,
      dto,
    );
    return wrapSingle(call);
  }

  @UseGuards(OrgContextGuard)
  @Get('calls/active')
  async listActiveCalls(
    @GetOrgContext() ctx: OrgContext,
    @Query('connectionId') connectionId?: string,
    @Query('brandId') brandId?: string,
  ) {
    const calls = await this.service.listActiveCalls(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      { connectionId, brandId },
    );
    return { data: calls };
  }

  @UseGuards(OrgContextGuard)
  @Delete('calls/:id')
  @HttpCode(HttpStatus.OK)
  async cancelCall(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.service.cancelCall(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      id,
    );
    return COMM_MUTATION_OK;
  }

  @UseGuards(OrgContextGuard)
  @Get('sms/threads')
  async listSmsThreads(
    @GetOrgContext() ctx: OrgContext,
    @Query('limit') limit?: string,
    @Query('entityType') entityType?: 'lead' | 'client' | 'sale' | 'project',
    @Query('entityId') entityId?: string,
  ) {
    const threads = await this.service.listSmsThreads(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      {
        limit: limit ? Number.parseInt(limit, 10) : undefined,
        entityType,
        entityId,
      },
    );
    return { data: threads };
  }

  @UseGuards(OrgContextGuard)
  @Get('sms/messages')
  async listSmsMessages(
    @GetOrgContext() ctx: OrgContext,
    @Query('threadId') threadId?: string,
    @Query('limit') limit?: string,
    @Query('entityType') entityType?: 'lead' | 'client' | 'sale' | 'project',
    @Query('entityId') entityId?: string,
  ) {
    const messages = await this.service.listSmsMessages(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      {
        threadId,
        limit: limit ? Number.parseInt(limit, 10) : undefined,
        entityType,
        entityId,
      },
    );
    return { data: messages };
  }

  @UseGuards(OrgContextGuard)
  @Post('sms/messages')
  async sendSms(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: SendRingCentralSmsDto,
  ) {
    const message = await this.service.sendSms(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      dto,
    );
    return wrapSingle(message);
  }

  @UseGuards(OrgContextGuard)
  @Patch('sms/threads/:id/read')
  @HttpCode(HttpStatus.OK)
  async markSmsThreadRead(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.service.markSmsThreadRead(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      id,
    );
    return COMM_MUTATION_OK;
  }

  @Post('webhooks')
  async receiveWebhook(
    @Headers('validation-token') validationToken: string | undefined,
    @Body() payload: Record<string, unknown> | undefined,
    @Res() res: Response,
  ) {
    const acknowledgement = await this.service.acceptWebhookNotification(
      payload,
      validationToken,
    );

    if (acknowledgement.validationToken) {
      res.setHeader('Validation-Token', acknowledgement.validationToken);
    }

    return res.status(HttpStatus.OK).json({ success: true });
  }

  private buildSettingsRedirect(params: {
    success?: boolean;
    connectionId?: string;
    error?: string;
  }): string {
    const frontendBase =
      this.config.get<string>('SALES_DASHBOARD_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:4200';

    const url = new URL('/dashboard/settings/ringcentral', frontendBase);
    if (params.success) {
      url.searchParams.set('success', '1');
    }
    if (params.connectionId) {
      url.searchParams.set('connectionId', params.connectionId);
    }
    if (params.error) {
      url.searchParams.set('error', params.error);
    }
    return url.toString();
  }
}
