import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { InternalServiceGuard } from './guards/internal-service.guard';
import { InternalContactsService } from './internal-contacts.service';
import { LookupContactsDto } from './dto/lookup-contacts.dto';

/**
 * Internal service-to-service endpoint.
 * @Public() skips JWT — protected by X-Service-Secret header instead.
 */
@Public()
@UseGuards(InternalServiceGuard)
@Controller('internal/contacts')
export class InternalContactsController {
  constructor(private readonly service: InternalContactsService) {}

  @Post('by-emails')
  async lookupByEmails(@Body() dto: LookupContactsDto) {
    const results = await this.service.lookupByEmails(dto.organizationId, dto.emails);
    return { data: results };
  }

  @Get('search')
  async searchContacts(
    @Query('organizationId') organizationId: string,
    @Query('q') q: string,
  ) {
    const results = await this.service.searchContacts(organizationId, q ?? '');
    return { data: results };
  }
}
