import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { Prisma } from '@prisma/client';
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
            email: lead.email,
            id: lead.id,
            entityType: 'lead' as const,
            name: lead.name ?? lead.email ?? '',
          });
        }
      }
    }

    return results;
  }

  async lookupByPhones(
    organizationId: string,
    phones: string[],
  ): Promise<ContactLookupResult[]> {
    const normalizedPhones = Array.from(
      new Set(
        phones
          .map((phone) => this.normalizePhoneDigits(phone))
          .filter((phone): phone is string => Boolean(phone)),
      ),
    );

    if (normalizedPhones.length === 0) {
      return [];
    }

    const last10Digits = Array.from(
      new Set(
        normalizedPhones
          .map((phone) => (phone.length > 10 ? phone.slice(-10) : phone))
          .filter((phone) => phone.length >= 7),
      ),
    );

    const clientRows = await this.prisma.$queryRaw<
      Array<{ id: string; email: string; phone: string | null; contactName: string | null }>
    >(Prisma.sql`
      SELECT id, email, phone, "contactName"
      FROM "Client"
      WHERE "organizationId" = ${organizationId}
        AND "deletedAt" IS NULL
        AND phone IS NOT NULL
        AND (
          regexp_replace(phone, '[^0-9]', '', 'g') IN (${Prisma.join(normalizedPhones)})
          ${
            last10Digits.length > 0
              ? Prisma.sql`OR right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) IN (${Prisma.join(last10Digits)})`
              : Prisma.empty
          }
        )
    `);

    const leadRows = await this.prisma.$queryRaw<
      Array<{ id: string; email: string | null; phone: string | null; name: string | null }>
    >(Prisma.sql`
      SELECT id, email, phone, name
      FROM "Lead"
      WHERE "organizationId" = ${organizationId}
        AND "deletedAt" IS NULL
        AND phone IS NOT NULL
        AND (
          regexp_replace(phone, '[^0-9]', '', 'g') IN (${Prisma.join(normalizedPhones)})
          ${
            last10Digits.length > 0
              ? Prisma.sql`OR right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) IN (${Prisma.join(last10Digits)})`
              : Prisma.empty
          }
        )
    `);

    const results: ContactLookupResult[] = [];

    for (const client of clientRows) {
      results.push({
        id: client.id,
        entityType: 'client',
        name: client.contactName || client.email,
        email: client.email,
        phone: client.phone ?? undefined,
      });
    }

    for (const lead of leadRows) {
      results.push({
        id: lead.id,
        entityType: 'lead',
        name: lead.name || lead.email || lead.phone || 'Lead',
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
      });
    }

    return results;
  }

  private normalizePhoneDigits(value?: string | null): string | undefined {
    const digits = value?.replace(/\D/g, '');
    return digits && digits.length >= 7 ? digits : undefined;
  }
}
