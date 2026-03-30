import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { wrapSingle } from '../../common/response/comm-api-response';
import { UpdateCommSettingsDto } from './dto/update-comm-settings.dto';
import { CommSettingsService } from './comm-settings.service';

@UseGuards(OrgContextGuard)
@Controller('settings')
export class CommSettingsController {
  constructor(private readonly settingsService: CommSettingsService) {}

  @Get()
  async getSettings(@GetOrgContext() ctx: OrgContext) {
    const settings = await this.settingsService.getSettings(ctx.organizationId);
    return wrapSingle(settings);
  }

  @Patch()
  async updateSettings(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: UpdateCommSettingsDto,
  ) {
    const settings = await this.settingsService.updateSettings(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      dto,
    );
    return wrapSingle(settings);
  }
}
