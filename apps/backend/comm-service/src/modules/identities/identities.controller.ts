import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { IdentitiesService } from './identities.service';
import { OAuthCallbackQueryDto } from './dto/identities.dto';

@Controller('identities')
export class IdentitiesController {
  constructor(private readonly service: IdentitiesService) {}

  /**
   * Initiate Gmail OAuth flow.
   * Returns the Google authorization URL.
   */
  @UseGuards(OrgContextGuard)
  @Get('oauth/initiate')
  initiateOAuth(@GetOrgContext() ctx: OrgContext) {
    const url = this.service.initiateOAuth(ctx.organizationId, ctx.userId);
    return wrapSingle({ authUrl: url });
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
      return res.redirect(`/?oauth_error=${query.error}`);
    }

    await this.service.handleOAuthCallback(query.code, query.state);
    return res.redirect(`/?oauth_success=true`);
  }

  @UseGuards(OrgContextGuard)
  @Get()
  async listIdentities(@GetOrgContext() ctx: OrgContext) {
    const identities = await this.service.listIdentities(ctx.organizationId);
    return { data: identities };
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
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteIdentity(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.service.deleteIdentity(ctx.organizationId, id);
    return COMM_MUTATION_OK;
  }
}
