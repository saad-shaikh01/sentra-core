import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { PipelineService, SaleClosedWonDto } from './pipeline.service';

@Controller('pipeline')
export class PipelineController {
  private readonly serviceKey: string;

  constructor(
    private readonly service: PipelineService,
    private readonly config: ConfigService,
  ) {
    this.serviceKey = config.get<string>('INTERNAL_SERVICE_KEY', 'internal-service-key');
  }

  @Post('sale-closed-won')
  async handleSaleClosedWon(
    @Headers('x-service-key') serviceKey: string,
    @Body() dto: SaleClosedWonDto,
  ) {
    if (serviceKey !== this.serviceKey) {
      throw new ForbiddenException('Invalid service key');
    }
    return this.service.handleSaleClosedWon(dto);
  }

  @UseGuards(OrgContextGuard)
  @Get('pending-sales')
  async getPendingSales(@GetOrgContext() ctx: OrgContext) {
    return this.service.getPendingSales(ctx.organizationId);
  }
}
