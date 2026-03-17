import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { Roles, CurrentUser, Public } from '../auth/decorators';
import { CreateInvoiceDto, UpdateInvoiceDto, QueryInvoicesDto } from './dto';
import { UserRole, IInvoice, IPaginatedResponse } from '@sentra-core/types';

@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
  getSummary(
    @CurrentUser('orgId') orgId: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.invoicesService.getSummary(orgId, brandId);
  }

  @Get('public/:id')
  @Public()
  findPublic(@Param('id') id: string) {
    return this.invoicesService.findPublic(id);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  create(@Body() dto: CreateInvoiceDto, @CurrentUser('orgId') orgId: string): Promise<IInvoice> {
    return this.invoicesService.create(orgId, dto);
  }

  @Get()
  findAll(@Query() query: QueryInvoicesDto, @CurrentUser('orgId') orgId: string): Promise<IPaginatedResponse<IInvoice>> {
    return this.invoicesService.findAll(orgId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.invoicesService.findOne(id, orgId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser('orgId') orgId: string): Promise<IInvoice> {
    return this.invoicesService.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('orgId') orgId: string): Promise<{ message: string }> {
    return this.invoicesService.remove(id, orgId);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.invoicesService.generatePdf(id, orgId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post(':id/pay')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  pay(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.invoicesService.pay(id, orgId);
  }

  @Post(':id/regenerate-token')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async regenerateToken(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ paymentToken: string }> {
    return this.invoicesService.regenerateToken(id, orgId);
  }
}
