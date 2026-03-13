import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { SalesService } from './sales.service';
import { Roles, CurrentUser, AppAccess } from '../auth/decorators';
import { CreateSaleDto, UpdateSaleDto, QuerySalesDto, ChargeSaleDto, CreateSubscriptionDto } from './dto';
import { UserRole, AppCode, JwtPayload, ISale, IPaginatedResponse } from '@sentra-core/types';
import { StorageService } from '../../common';

const ALLOWED_CONTRACT_TYPES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_CONTRACT_SIZE = 20 * 1024 * 1024; // 20 MB

@Controller('sales')
@AppAccess(AppCode.SALES_DASHBOARD)
export class SalesController {
  constructor(
    private salesService: SalesService,
    private storage: StorageService,
  ) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: JwtPayload): Promise<ISale> {
    return this.salesService.create(user.orgId, user.sub, dto);
  }

  @Get()
  findAll(@Query() query: QuerySalesDto, @CurrentUser() user: JwtPayload): Promise<IPaginatedResponse<ISale>> {
    return this.salesService.findAll(user.orgId, query, user.sub, user.role);
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

  @Post('upload/contract')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadContract(
    @UploadedFile() file: any,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('File is required');
    if (!ALLOWED_CONTRACT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF and Word documents are allowed');
    }
    if (file.size > MAX_CONTRACT_SIZE) {
      throw new BadRequestException('File too large. Maximum 20 MB');
    }
    const url = await this.storage.upload(file.buffer, file.originalname, file.mimetype, `contracts/${orgId}`);
    return { url };
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
