import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { IdentitiesService } from './identities.service';
import { OAuthCallbackQueryDto } from './dto/identities.dto';
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
  initiateOAuth(
    @GetOrgContext() ctx: OrgContext,
    @Query('brandId') brandId?: string,
  ) {
    const url = this.service.initiateOAuth(ctx.organizationId, ctx.userId, brandId);
    return wrapSingle({ redirectUrl: url });
  }

  /**
   * OAuth callback — no OrgContextGuard because org context is in state param.
   * Redirects to frontend after storing identity.
   */
  @Get('oauth/callback')
  async oauthCallback(
    @Query() query: OAuthCallbackQueryDto,
    @Res() res: Response,
  ) {
    if (query.error) {
      return res.redirect(this.buildSettingsRedirect({ error: query.error }));
    }

    if (!query.code || !query.state) {
      return res.redirect(this.buildSettingsRedirect({ error: 'missing_oauth_parameters' }));
    }

    try {
      const identity = await this.service.handleOAuthCallback(query.code, query.state);
      await this.syncService.triggerInitialSync(String(identity._id));
      return res.redirect(this.buildSettingsRedirect({ success: true, identityId: String(identity._id) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'oauth_callback_failed';
      return res.redirect(this.buildSettingsRedirect({ error: message }));
    }
  }

  @UseGuards(OrgContextGuard)
  @Get()
  async listIdentities(@GetOrgContext() ctx: OrgContext) {
    const identities = await this.service.listIdentities(ctx.organizationId);
    return { data: identities };
  }

  // Must be declared before :id to avoid route conflict
  @UseGuards(OrgContextGuard)
  @Get(':id/labels')
  async getLabels(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const labels = await this.service.getLabels(ctx.organizationId, id);
    return { data: labels };
  }

  @UseGuards(OrgContextGuard)
  @Get(':id')
  async getIdentity(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const identity = await this.service.getIdentity(ctx.organizationId, id);
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
