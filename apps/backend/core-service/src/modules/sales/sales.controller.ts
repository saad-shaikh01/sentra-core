import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { SalesService } from './sales.service';
import { CurrentUser, AppAccess } from '../auth/decorators';
import { Permissions } from '../../common';
import {
  CreateSaleDto,
  UpdateSaleDto,
  QuerySalesDto,
  ChargeSaleDto,
  CreateSubscriptionDto,
  AddNoteDto,
  CreateRefundDto,
  CreateChargebackDto,
  RecordManualPaymentDto,
} from './dto';
import { AppCode, JwtPayload, ISale, ISaleCreateResponse, IPaginatedResponse } from '@sentra-core/types';
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
  @Permissions('sales:sales:create')
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: JwtPayload): Promise<ISaleCreateResponse> {
    return this.salesService.create(user.orgId, user.sub, user.role, dto);
  }

  @Get('summary')
  @Permissions('sales:sales:view_own')
  getSummary(
    @Query('brandId') brandId: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.salesService.getSummary(user.orgId, user.sub, user.role, { brandId, dateFrom, dateTo });
  }

  @Get()
  @Permissions('sales:sales:view_own')
  findAll(@Query() query: QuerySalesDto, @CurrentUser() user: JwtPayload): Promise<IPaginatedResponse<ISale>> {
    return this.salesService.findAll(user.orgId, query, user.sub, user.role);
  }

  @Get(':id')
  @Permissions('sales:sales:view_own')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.salesService.findOne(id, orgId);
  }

  @Patch(':id')
  @Permissions('sales:sales:edit_own')
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto, @CurrentUser() user: JwtPayload): Promise<ISale> {
    return this.salesService.update(id, user.orgId, user.sub, user.role, dto);
  }

  @Delete(':id')
  @Permissions('sales:sales:delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    return this.salesService.remove(id, user.orgId, user.sub);
  }

  @Post('upload/contract')
  @Permissions('sales:sales:contract')
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
    const key = await this.storage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      `contracts/${orgId}`,
      orgId,
    );
    return { url: key };
  }

  @Get('cybersource/capture-context')
  @Permissions('sales:sales:charge')
  getCyberSourceCaptureContext(
    @Headers('origin') origin: string,
    @Headers('referer') referer: string,
  ) {
    const pageOrigin = origin || (referer ? new URL(referer).origin : 'http://localhost:3000');
    return this.salesService.getCyberSourceCaptureContext(pageOrigin);
  }

  @Post(':id/charge')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Permissions('sales:sales:charge')
  charge(@Param('id') id: string, @Body() dto: ChargeSaleDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.charge(id, user.orgId, user.sub, dto);
  }

  @Post(':id/record-payment')
  @Permissions('sales:sales:charge')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordManualPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.salesService.recordPayment(id, user.orgId, user.sub, dto);
  }

  @Post(':id/subscribe')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Permissions('sales:sales:charge')
  subscribe(@Param('id') id: string, @Body() dto: CreateSubscriptionDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.subscribe(id, user.orgId, user.sub, dto);
  }

  @Post(':id/note')
  @Permissions('sales:sales:note')
  addNote(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: boolean }> {
    return this.salesService.addNote(id, user.orgId, user.sub, dto.note);
  }

  @Post(':id/refund')
  @Permissions('sales:sales:charge')
  refund(@Param('id') id: string, @Body() dto: CreateRefundDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.refund(id, user.orgId, user.sub, dto);
  }

  @Post(':id/chargeback')
  @Permissions('sales:sales:charge')
  recordChargeback(@Param('id') id: string, @Body() dto: CreateChargebackDto, @CurrentUser() user: JwtPayload) {
    return this.salesService.recordChargeback(id, user.orgId, user.sub, dto);
  }

  @Post(':id/cancel-subscription')
  @Permissions('sales:sales:charge')
  cancelSubscription(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.salesService.cancelSubscription(id, orgId);
  }
}
