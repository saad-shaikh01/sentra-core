import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { wrapSingle } from '../../common/response/comm-api-response';
import { IntelligenceSummaryQueryDto } from './dto/intelligence-summary.dto';
import { IntelligenceService } from './intelligence.service';

@UseGuards(OrgContextGuard)
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Get('summary')
  async getSummary(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: IntelligenceSummaryQueryDto,
  ) {
    const summary = await this.intelligenceService.getSummary(ctx.organizationId, query);
    return wrapSingle(summary);
  }
}
