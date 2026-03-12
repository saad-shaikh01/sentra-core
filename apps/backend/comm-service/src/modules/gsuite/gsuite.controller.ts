import {
  Controller,
  Get,
  Delete,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { GSuiteService } from './gsuite.service';

@Controller('gsuite')
export class GSuiteController {
  constructor(
    private readonly service: GSuiteService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Initiate G Suite OAuth flow (admin must be Google Workspace admin).
   * Returns the Google authorization URL.
   */
  @UseGuards(OrgContextGuard)
  @Get('oauth/initiate')
  async initiateOAuth(@GetOrgContext() ctx: OrgContext) {
    const url = await this.service.initiateOAuth(ctx.organizationId, ctx.userId);
    return wrapSingle({ redirectUrl: url });
  }

  /**
   * OAuth callback — state param carries orgId + userId.
   * Redirects to frontend G Suite settings page after storing connection.
   */
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
      await this.service.handleCallback(code, state);
      return res.redirect(this.buildSettingsRedirect({ success: true }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'gsuite_callback_failed';
      return res.redirect(this.buildSettingsRedirect({ error: message }));
    }
  }

  /**
   * Get current G Suite connection status for the org.
   */
  @UseGuards(OrgContextGuard)
  @Get('connection')
  async getConnection(@GetOrgContext() ctx: OrgContext) {
    const status = await this.service.getConnection(ctx.organizationId);
    return wrapSingle(status);
  }

  /**
   * List all users in the connected G Suite domain.
   * Returns paginated list of directory users.
   */
  @UseGuards(OrgContextGuard)
  @Get('users')
  async listUsers(
    @GetOrgContext() ctx: OrgContext,
    @Query('pageToken') pageToken?: string,
    @Query('maxResults') maxResultsStr?: string,
  ) {
    const maxResults = maxResultsStr ? parseInt(maxResultsStr, 10) : 100;
    const result = await this.service.listUsers(ctx.organizationId, pageToken, maxResults);
    return result; // { users: [], nextPageToken?: string }
  }

  /**
   * Disconnect the G Suite integration for the org.
   */
  @UseGuards(OrgContextGuard)
  @Delete('connection')
  @HttpCode(HttpStatus.OK)
  async disconnect(@GetOrgContext() ctx: OrgContext) {
    await this.service.disconnect(ctx.organizationId);
    return COMM_MUTATION_OK;
  }

  private buildSettingsRedirect(params: { success?: boolean; error?: string }): string {
    const frontendBase =
      this.config.get<string>('SALES_DASHBOARD_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:4200';

    const url = new URL('/dashboard/settings/gsuite', frontendBase);
    if (params.success) url.searchParams.set('success', '1');
    if (params.error) url.searchParams.set('error', params.error);
    return url.toString();
  }
}
