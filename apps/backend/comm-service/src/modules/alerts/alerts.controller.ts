import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { AlertsService } from './alerts.service';

@UseGuards(OrgContextGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  async listAlerts(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: QueryAlertsDto,
  ) {
    return this.alertsService.listAlerts(ctx.organizationId, ctx.userId, query);
  }

  @Patch(':id/read')
  async markRead(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    await this.alertsService.markRead(ctx.organizationId, ctx.userId, id);
    return COMM_MUTATION_OK;
  }

  @Patch('read-all')
  async markAllRead(@GetOrgContext() ctx: OrgContext) {
    await this.alertsService.markAllRead(ctx.organizationId, ctx.userId);
    return COMM_MUTATION_OK;
  }
}
