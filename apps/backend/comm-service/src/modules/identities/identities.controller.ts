import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Res,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  Req,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { UserRole } from '@sentra-core/types';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { IdentitiesService } from './identities.service';
import { SyncService } from '../sync/sync.service';

@Controller('identities')
export class IdentitiesController {
  constructor(
    private readonly service: IdentitiesService,
    @Inject(forwardRef(() => SyncService))
    private readonly syncService: SyncService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Initiate Gmail OAuth flow.
   * Returns the Google authorization URL.
   */
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

  /**
   * OAuth callback — no OrgContextGuard because org context is in state param.
   * Redirects to frontend after storing identity.
   */
  @Get('oauth/callback')
  async oauthCallback(
    @Query() query: Record<string, string | undefined>,
    @Req() req: Request,
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
      const identity = await this.service.handleOAuthCallback(code, state);
      await this.syncService.triggerInitialSync(String(identity._id), req.requestId);
      return res.redirect(this.buildSettingsRedirect({ success: true, identityId: String(identity._id) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'oauth_callback_failed';
      return res.redirect(this.buildSettingsRedirect({ error: message }));
    }
  }

  @UseGuards(OrgContextGuard)
  @Get('oauth/brands')
  async getOAuthBrands(@Headers('authorization') authorization?: string) {
    const brands = await this.service.getOAuthBrands(authorization);
    return { data: brands };
  }

  @UseGuards(OrgContextGuard)
  @Get()
  async listIdentities(@GetOrgContext() ctx: OrgContext) {
    const identities = await this.service.listIdentities(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return { data: identities };
  }

  // Must be declared before :id to avoid route conflict
  @UseGuards(OrgContextGuard)
  @Get(':id/labels')
  async getLabels(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const labels = await this.service.getLabels(
      ctx.organizationId,
      id,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return { data: labels };
  }

  @UseGuards(OrgContextGuard)
  @Get(':id')
  async getIdentity(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const identity = await this.service.getIdentity(
      ctx.organizationId,
      id,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return wrapSingle(identity);
  }

  @UseGuards(OrgContextGuard)
  @Patch(':id/default')
  @HttpCode(HttpStatus.OK)
  async setDefault(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.service.setDefault(ctx.organizationId, id);
    return COMM_MUTATION_OK;
  }

  @UseGuards(OrgContextGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteIdentity(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.service.deleteIdentity(ctx.organizationId, id);
    return COMM_MUTATION_OK;
  }

  private buildSettingsRedirect(params: {
    success?: boolean;
    identityId?: string;
    error?: string;
  }): string {
    const frontendBase =
      this.config.get<string>('SALES_DASHBOARD_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:4200';

    const url = new URL('/dashboard/settings/gmail', frontendBase);
    if (params.success) {
      url.searchParams.set('success', '1');
    }
    if (params.identityId) {
      url.searchParams.set('identityId', params.identityId);
    }
    if (params.error) {
      url.searchParams.set('error', params.error);
    }
    return url.toString();
  }
}
