import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext } from '../../common/decorators/org-context.decorator';
import { InternalContactsClient } from '../../common/http/internal-contacts.client';

@UseGuards(OrgContextGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsClient: InternalContactsClient) {}

  @Get('search')
  async search(
    @GetOrgContext() { organizationId }: { organizationId: string },
    @Query('q') q: string,
  ) {
    const results = await this.contactsClient.searchContacts(organizationId, q ?? '');
    return { data: results };
  }
}
