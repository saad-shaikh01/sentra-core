import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { ContactLookupResult } from './dto/lookup-contacts.dto';

@Injectable()
export class InternalContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async lookupByEmails(
    organizationId: string,
    emails: string[],
  ): Promise<ContactLookupResult[]> {
    const results: ContactLookupResult[] = [];

    // Lookup clients — direct email field
    const clients = await this.prisma.client.findMany({
      where: {
        organizationId,
        email: { in: emails },
      },
      select: {
        id: true,
        email: true,
        contactName: true,
      },
    });

    for (const client of clients) {
      results.push({
        email: client.email,
        id: client.id,
        entityType: 'client',
        name: client.contactName || client.email,
      });
    }

    // Lookup leads — email is stored in JSON data->>'email'
    const foundClientEmails = new Set(clients.map((c) => c.email));
    const leadEmails = emails.filter((e) => !foundClientEmails.has(e));

    if (leadEmails.length > 0) {
      const leads = await this.prisma.$queryRaw<
        Array<{ id: string; email: string; name: string | null }>
      >`
        SELECT id,
               data->>'email' AS email,
               COALESCE(data->>'name', data->>'contactName', title) AS name
        FROM "Lead"
        WHERE "organizationId" = ${organizationId}
          AND data->>'email' = ANY(${leadEmails}::text[])
      `;

      for (const lead of leads) {
        if (lead.email) {
          results.push({
            email: lead.email,
            id: lead.id,
            entityType: 'lead',
            name: lead.name ?? lead.email,
          });
        }
      }
    }

    return results;
  }
}
