import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { ContactLookupResult } from './dto/lookup-contacts.dto';

@Injectable()
export class InternalContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async searchContacts(
    organizationId: string,
    query: string,
    limit = 10,
  ): Promise<ContactLookupResult[]> {
    const q = query.trim();
    if (!q) return [];

    const clients = await this.prisma.client.findMany({
      where: {
        organizationId,
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { contactName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, contactName: true },
      take: limit,
    });

    const results: ContactLookupResult[] = clients.map((c) => ({
      email: c.email,
      id: c.id,
      entityType: 'client' as const,
      name: c.contactName || c.email,
    }));

    if (results.length < limit) {
      const leads = await this.prisma.lead.findMany({
        where: {
          organizationId,
          email: { not: null },
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, email: true, name: true },
        take: limit - results.length,
      });

      for (const lead of leads) {
        if (lead.email) {
          results.push({
            email: lead.email,
            id: lead.id,
            entityType: 'lead' as const,
            name: lead.name ?? lead.email,
          });
        }
      }
    }

    return results;
  }

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
      const leads = await this.prisma.lead.findMany({
        where: {
          organizationId,
          email: { in: leadEmails },
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      for (const lead of leads) {
        if (lead.email) {
          results.push({
            email: lead.email!,
            id: lead.id,
            entityType: 'lead' as const,
            name: lead.name ?? lead.email ?? '',
          });
        }
      }
    }

    return results;
  }
}
