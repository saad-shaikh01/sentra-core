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
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { SalesService } from './sales.service';
import { Roles, CurrentUser, AppAccess } from '../auth/decorators';
import {
  CreateSaleDto,
  UpdateSaleDto,
  QuerySalesDto,
  ChargeSaleDto,
  CreateSubscriptionDto,
  AddNoteDto,
  CreateRefundDto,
  CreateChargebackDto,
} from './dto';
import { UserRole, AppCode, JwtPayload, ISale, ISaleCreateResponse, IPaginatedResponse } from '@sentra-core/types';
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
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.FRONTSELL_AGENT,
    UserRole.UPSELL_AGENT,
  )
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: JwtPayload): Promise<ISaleCreateResponse> {
    if (user.role === UserRole.PROJECT_MANAGER) {
      throw new ForbiddenException('Project managers do not have permission to create sales');
    }

    return this.salesService.create(user.orgId, user.sub, user.role, dto);
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
  getSummary(
    @Query('brandId') brandId: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @CurrentUser('orgId') orgId: string,
  ) {
    return this.salesService.getSummary(orgId, { brandId, dateFrom, dateTo });
  }

  @Get()
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.PROJECT_MANAGER,
    UserRole.FRONTSELL_AGENT,
    UserRole.UPSELL_AGENT,
  )
  findAll(@Query() query: QuerySalesDto, @CurrentUser() user: JwtPayload): Promise<IPaginatedResponse<ISale>> {
    return this.salesService.findAll(user.orgId, query, user.sub, user.role);
  }

  @Get(':id')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.PROJECT_MANAGER,
    UserRole.FRONTSELL_AGENT,
    UserRole.UPSELL_AGENT,
  )
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.salesService.findOne(id, orgId);
  }

  @Patch(':id')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.FRONTSELL_AGENT,
    UserRole.UPSELL_AGENT,
  )
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto, @CurrentUser() user: JwtPayload): Promise<ISale> {
    if (user.role === UserRole.PROJECT_MANAGER) {
      throw new ForbiddenException('Project managers do not have permission to update sales');
    }

    return this.salesService.update(id, user.orgId, user.sub, user.role, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    return this.salesService.remove(id, user.orgId, user.sub);
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
  charge(@Param('id') id: string, @Body() dto: ChargeSaleDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.charge(id, user.orgId, user.sub, dto);
  }

  @Post(':id/subscribe')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  subscribe(@Param('id') id: string, @Body() dto: CreateSubscriptionDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.subscribe(id, user.orgId, user.sub, dto);
  }

  @Post(':id/note')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.FRONTSELL_AGENT,
    UserRole.UPSELL_AGENT,
    UserRole.PROJECT_MANAGER,
  )
  addNote(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: boolean }> {
    return this.salesService.addNote(id, user.orgId, user.sub, dto.note);
  }

  @Post(':id/refund')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  refund(@Param('id') id: string, @Body() dto: CreateRefundDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.refund(id, user.orgId, user.sub, dto);
  }

  @Post(':id/chargeback')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  recordChargeback(@Param('id') id: string, @Body() dto: CreateChargebackDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.recordChargeback(id, user.orgId, user.sub, dto);
  }

  @Post(':id/cancel-subscription')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  cancelSubscription(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.salesService.cancelSubscription(id, orgId);
  }
}
