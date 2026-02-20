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
import { Roles, CurrentUser } from '../auth/decorators';
import { CreateInvoiceDto, UpdateInvoiceDto, QueryInvoicesDto } from './dto';
import { UserRole, IInvoice, IPaginatedResponse } from '@sentra-core/types';

@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

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
}
