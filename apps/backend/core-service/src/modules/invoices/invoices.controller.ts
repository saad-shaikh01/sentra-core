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
import { CurrentUser, Public } from '../auth/decorators';
import { Permissions } from '../../common';
import { CreateInvoiceDto, UpdateInvoiceDto, QueryInvoicesDto } from './dto';
import { UserRole, IInvoice, IPaginatedResponse, JwtPayload } from '@sentra-core/types';

@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Get('summary')
  @Permissions('sales:invoices:view')
  getSummary(
    @CurrentUser() user: JwtPayload,
    @Query('brandId') brandId?: string,
  ) {
    return this.invoicesService.getSummary(user.orgId, user.sub, user.role, brandId);
  }

  @Get('public/:id')
  @Public()
  findPublic(@Param('id') id: string) {
    return this.invoicesService.findPublic(id);
  }

  @Post()
  @Permissions('sales:invoices:create')
  create(@Body() dto: CreateInvoiceDto, @CurrentUser('orgId') orgId: string): Promise<IInvoice> {
    return this.invoicesService.create(orgId, dto);
  }

  @Get()
  findAll(
    @Query() query: QueryInvoicesDto,
    @CurrentUser('orgId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
  ): Promise<IPaginatedResponse<IInvoice>> {
    return this.invoicesService.findAll(orgId, query, userId, role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    return this.invoicesService.findOne(id, orgId);
  }

  @Patch(':id')
  @Permissions('sales:invoices:edit')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser('orgId') orgId: string): Promise<IInvoice> {
    return this.invoicesService.update(id, orgId, dto);
  }

  @Delete(':id')
  @Permissions('sales:invoices:delete')
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
  @Permissions('sales:invoices:pay')
  pay(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.invoicesService.pay(id, orgId, userId);
  }

  @Post(':id/regenerate-token')
  @Permissions('sales:invoices:edit')
  async regenerateToken(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ paymentToken: string }> {
    return this.invoicesService.regenerateToken(id, orgId);
  }
}
