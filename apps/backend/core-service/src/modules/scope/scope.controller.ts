import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ScopeService } from './scope.service';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';

@Controller('internal/scope')
export class ScopeController {
  constructor(private readonly scopeService: ScopeService) {}

  @Post('invalidate/user')
  @UseGuards(InternalServiceGuard)
  async invalidateUser(@Body() body: { userId: string; orgId: string }) {
    await this.scopeService.invalidateUser(body.userId, body.orgId);
    return { ok: true };
  }

  @Post('invalidate/team')
  @UseGuards(InternalServiceGuard)
  async invalidateTeam(@Body() body: { teamId: string; orgId: string }) {
    await this.scopeService.invalidateTeam(body.teamId, body.orgId);
    return { ok: true };
  }
}
