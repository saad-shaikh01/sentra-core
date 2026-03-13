import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { ISearchResult } from '@sentra-core/types';

const MAX_PER_TYPE = 5;

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(orgId: string, q: string): Promise<ISearchResult[]> {
    if (!q || q.trim().length < 2) return [];

    const term = q.trim();

    const [leads, clients, sales, invoices] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { name: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, title: true, status: true, source: true },
        take: MAX_PER_TYPE,
      }),
      this.prisma.client.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { companyName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { contactName: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, companyName: true, email: true, contactName: true },
        take: MAX_PER_TYPE,
      }),
      this.prisma.sale.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { description: { contains: term, mode: 'insensitive' } },
            { client: { companyName: { contains: term, mode: 'insensitive' } } },
          ],
        },
        select: { id: true, totalAmount: true, currency: true, status: true, description: true, client: { select: { companyName: true } } },
        take: MAX_PER_TYPE,
      }),
      this.prisma.invoice.findMany({
        where: {
          sale: { organizationId: orgId },
          OR: [
            { invoiceNumber: { contains: term, mode: 'insensitive' } },
            { notes: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, invoiceNumber: true, amount: true, status: true },
        take: MAX_PER_TYPE,
      }),
    ]);

    const results: ISearchResult[] = [
      ...leads.map((l): ISearchResult => ({
        type: 'lead',
        id: l.id,
        title: l.title,
        subtitle: `Lead · ${l.status}${l.source ? ` · ${l.source}` : ''}`,
        url: `/dashboard/leads?highlight=${l.id}`,
      })),
      ...clients.map((c): ISearchResult => ({
        type: 'client',
        id: c.id,
        title: c.companyName,
        subtitle: `Client · ${c.contactName ?? c.email}`,
        url: `/dashboard/clients?highlight=${c.id}`,
      })),
      ...sales.map((s): ISearchResult => ({
        type: 'sale',
        id: s.id,
        title: s.description ?? `${s.currency} ${Number(s.totalAmount).toFixed(2)}`,
        subtitle: `Sale · ${s.status} · ${s.client?.companyName ?? ''}`,
        url: `/dashboard/sales?highlight=${s.id}`,
      })),
      ...invoices.map((i): ISearchResult => ({
        type: 'invoice',
        id: i.id,
        title: i.invoiceNumber,
        subtitle: `Invoice · ${i.status} · $${Number(i.amount).toFixed(2)}`,
        url: `/dashboard/invoices?highlight=${i.id}`,
      })),
    ];

    return results;
  }
}
