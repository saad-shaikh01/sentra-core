import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SalesService } from './sales.service';
import { Roles, CurrentUser } from '../auth/decorators';
import { CreateSaleDto, UpdateSaleDto, QuerySalesDto, ChargeSaleDto, CreateSubscriptionDto } from './dto';
import { UserRole, JwtPayload, ISale, IPaginatedResponse } from '@sentra-core/types';

@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
  create(@Body() dto: CreateSaleDto, @CurrentUser('orgId') orgId: string): Promise<ISale> {
    return this.salesService.create(orgId, dto);
  }

  @Get()
  findAll(@Query() query: QuerySalesDto, @CurrentUser('orgId') orgId: string): Promise<IPaginatedResponse<ISale>> {
    return this.salesService.findAll(orgId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.salesService.findOne(id, orgId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto, @CurrentUser('orgId') orgId: string): Promise<ISale> {
    return this.salesService.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('orgId') orgId: string): Promise<{ message: string }> {
    return this.salesService.remove(id, orgId);
  }

  @Post(':id/charge')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  charge(@Param('id') id: string, @Body() dto: ChargeSaleDto, @CurrentUser('orgId') orgId: string) {
    return this.salesService.charge(id, orgId, dto);
  }

  @Post(':id/subscribe')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  subscribe(@Param('id') id: string, @Body() dto: CreateSubscriptionDto, @CurrentUser('orgId') orgId: string) {
    return this.salesService.subscribe(id, orgId, dto);
  }

  @Post(':id/cancel-subscription')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  cancelSubscription(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.salesService.cancelSubscription(id, orgId);
  }
}
