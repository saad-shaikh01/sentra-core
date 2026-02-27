/**
 * Sentra Core — Database Seed
 * Run: npx prisma db seed --schema=libs/backend/prisma-client/prisma/schema.prisma
 *
 * Credentials seeded:
 *   Owner  : admin@madcom.com   / Admin@123
 *   Agents : sarah@madcom.com   / Agent@123
 *            alex@madcom.com    / Agent@123
 *            mike@madcom.com    / Agent@123
 */

import 'dotenv/config';
import { PrismaClient, UserRole, LeadStatus, SaleStatus, InvoiceStatus, LeadActivityType, TransactionStatus, TransactionType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────

function hash(plain: string) {
  return bcrypt.hashSync(plain, 10);
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Seeding Sentra Core database…\n');

  // ── 1. Organization ────────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: 'Madcom Digital',
      subscription: 'PRO',
    },
  });
  console.log(`✅  Organization: ${org.name} (${org.id})`);

  // ── 2. Users ───────────────────────────────────────────────────────────────
  const owner = await prisma.user.create({
    data: {
      name: 'Adam Hassan',
      email: 'admin@madcom.com',
      password: hash('Admin@123'),
      role: UserRole.OWNER,
      jobTitle: 'CEO',
      organizationId: org.id,
    },
  });

  const sarah = await prisma.user.create({
    data: {
      name: 'Sarah Khan',
      email: 'sarah@madcom.com',
      password: hash('Agent@123'),
      role: UserRole.SALES_MANAGER,
      jobTitle: 'Sales Manager',
      organizationId: org.id,
    },
  });

  const alex = await prisma.user.create({
    data: {
      name: 'Alex Rivera',
      email: 'alex@madcom.com',
      password: hash('Agent@123'),
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Sales Agent',
      organizationId: org.id,
    },
  });

  const mike = await prisma.user.create({
    data: {
      name: 'Mike Thomas',
      email: 'mike@madcom.com',
      password: hash('Agent@123'),
      role: UserRole.UPSELL_AGENT,
      jobTitle: 'Upsell Specialist',
      organizationId: org.id,
    },
  });

  const users = [owner, sarah, alex, mike];
  console.log(`✅  Users (${users.length}): ${users.map((u) => u.email).join(', ')}`);

  // ── 3. Brands ──────────────────────────────────────────────────────────────
  const pulpHouse = await prisma.brand.create({
    data: {
      name: 'The Pulp House',
      domain: 'thepulphouse.com',
      logoUrl: 'https://placehold.co/120x40/6366f1/fff?text=PulpHouse',
      organizationId: org.id,
    },
  });

  const urbanQuill = await prisma.brand.create({
    data: {
      name: 'Urban Quill',
      domain: 'urbanquill.com',
      logoUrl: 'https://placehold.co/120x40/f59e0b/fff?text=UrbanQuill',
      organizationId: org.id,
    },
  });

  const novaDigital = await prisma.brand.create({
    data: {
      name: 'Nova Digital',
      domain: 'novadigital.com',
      logoUrl: 'https://placehold.co/120x40/10b981/fff?text=Nova',
      organizationId: org.id,
    },
  });

  const brands = [pulpHouse, urbanQuill, novaDigital];
  console.log(`✅  Brands (${brands.length}): ${brands.map((b) => b.name).join(', ')}`);

  // ── 4. Brand Access (agents → all brands) ──────────────────────────────────
  const agentUsers = [sarah, alex, mike];
  for (const user of agentUsers) {
    for (const brand of brands) {
      await prisma.brandAccess.create({
        data: { userId: user.id, brandId: brand.id, role: 'EDITOR' },
      });
    }
  }
  console.log(`✅  BrandAccess: 3 agents × 3 brands = 9 records`);

  // ── 5. Leads ───────────────────────────────────────────────────────────────
  const leadData = [
    // NEW
    { title: 'Website Inquiry — John Smith',       status: LeadStatus.NEW,       brand: pulpHouse,   source: 'Website',  assignedTo: alex,  daysAgo: 2 },
    { title: 'FB Ad Lead — Maria Lopez',            status: LeadStatus.NEW,       brand: pulpHouse,   source: 'FB_ADS',   assignedTo: null,  daysAgo: 1 },
    { title: 'Cold Outreach — TechCorp',            status: LeadStatus.NEW,       brand: urbanQuill,  source: 'Cold',     assignedTo: alex,  daysAgo: 3 },
    { title: 'Referral — David Park',               status: LeadStatus.NEW,       brand: novaDigital, source: 'Referral', assignedTo: null,  daysAgo: 0 },
    // CONTACTED
    { title: 'PPC Lead — Sunrise Agency',           status: LeadStatus.CONTACTED, brand: pulpHouse,   source: 'PPC',      assignedTo: sarah, daysAgo: 7 },
    { title: 'LinkedIn — FinEdge Ltd',              status: LeadStatus.CONTACTED, brand: urbanQuill,  source: 'LinkedIn', assignedTo: mike,  daysAgo: 5 },
    { title: 'Website Form — Clara White',          status: LeadStatus.CONTACTED, brand: novaDigital, source: 'Website',  assignedTo: alex,  daysAgo: 6 },
    { title: 'Trade Show — GlobalBiz',              status: LeadStatus.CONTACTED, brand: novaDigital, source: 'Event',    assignedTo: sarah, daysAgo: 8 },
    // PROPOSAL
    { title: 'Enterprise Deal — NovaTech',          status: LeadStatus.PROPOSAL,  brand: pulpHouse,   source: 'Referral', assignedTo: sarah, daysAgo: 14 },
    { title: 'SEO Package — BlueWave',              status: LeadStatus.PROPOSAL,  brand: urbanQuill,  source: 'PPC',      assignedTo: mike,  daysAgo: 10 },
    { title: 'Branding Project — CreativeCo',       status: LeadStatus.PROPOSAL,  brand: novaDigital, source: 'Website',  assignedTo: sarah, daysAgo: 12 },
    // CLOSED
    { title: 'Social Media — Stellar Corp',         status: LeadStatus.CLOSED,    brand: pulpHouse,   source: 'Referral', assignedTo: alex,  daysAgo: 30 },
    { title: 'Content Strategy — BoldMoves',        status: LeadStatus.CLOSED,    brand: urbanQuill,  source: 'LinkedIn', assignedTo: mike,  daysAgo: 25 },
    { title: 'PPC Campaign — EcoFresh',             status: LeadStatus.CLOSED,    brand: novaDigital, source: 'Event',    assignedTo: sarah, daysAgo: 20 },
    { title: 'Full-Service Retainer — Apex Group',  status: LeadStatus.CLOSED,    brand: pulpHouse,   source: 'Website',  assignedTo: sarah, daysAgo: 45 },
  ];

  const leads = [];
  for (const l of leadData) {
    const lead = await prisma.lead.create({
      data: {
        title: l.title,
        status: l.status,
        source: l.source,
        brandId: l.brand.id,
        organizationId: org.id,
        assignedToId: l.assignedTo?.id ?? null,
        createdAt: daysAgo(l.daysAgo),
      },
    });

    // CREATED activity for every lead
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: LeadActivityType.CREATED,
        userId: owner.id,
        data: { message: 'Lead created' },
        createdAt: daysAgo(l.daysAgo),
      },
    });

    // Assignment activity if assigned
    if (l.assignedTo) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: LeadActivityType.ASSIGNMENT_CHANGE,
          userId: owner.id,
          data: { assignedTo: l.assignedTo.name },
          createdAt: daysAgo(l.daysAgo - 0.1),
        },
      });
    }

    // Status activity for non-NEW
    if (l.status !== LeadStatus.NEW) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: LeadActivityType.STATUS_CHANGE,
          userId: l.assignedTo?.id ?? owner.id,
          data: { from: 'NEW', to: l.status },
          createdAt: daysAgo(l.daysAgo - 1),
        },
      });
    }

    // Note on PROPOSAL + CLOSED
    if (l.status === LeadStatus.PROPOSAL || l.status === LeadStatus.CLOSED) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: LeadActivityType.NOTE,
          userId: l.assignedTo?.id ?? owner.id,
          data: { content: 'Client is interested. Follow up scheduled.' },
          createdAt: daysAgo(l.daysAgo - 2),
        },
      });
    }

    leads.push(lead);
  }
  console.log(`✅  Leads (${leads.length}) with activities`);

  // ── 6. Clients ─────────────────────────────────────────────────────────────
  const clientData = [
    { company: 'NovaTech Solutions',   contact: 'James Carter',   email: 'james@novatech.io',      brand: pulpHouse,   phone: '+1-555-0101' },
    { company: 'Stellar Corp',         contact: 'Mia Johnson',    email: 'mia@stellarcorp.com',     brand: pulpHouse,   phone: '+1-555-0102' },
    { company: 'BlueWave Media',       contact: 'Liam Brown',     email: 'liam@bluewave.media',     brand: urbanQuill,  phone: '+1-555-0201' },
    { company: 'BoldMoves Agency',     contact: 'Olivia Davis',   email: 'olivia@boldmoves.co',     brand: urbanQuill,  phone: '+1-555-0202' },
    { company: 'EcoFresh Brands',      contact: 'Noah Wilson',    email: 'noah@ecofresh.com',       brand: novaDigital, phone: '+1-555-0301' },
    { company: 'Apex Group',           contact: 'Emma Martinez',  email: 'emma@apexgroup.net',      brand: novaDigital, phone: '+1-555-0302' },
  ];

  const clients = [];
  for (const c of clientData) {
    const client = await prisma.client.create({
      data: {
        companyName: c.company,
        contactName: c.contact,
        email: c.email,
        password: hash('Client@123'),
        phone: c.phone,
        brandId: c.brand.id,
        organizationId: org.id,
        notes: 'Seeded client — ready for demo.',
      },
    });
    clients.push(client);
  }
  console.log(`✅  Clients (${clients.length}): ${clients.map((c) => c.companyName).join(', ')}`);

  // ── 7. Sales ───────────────────────────────────────────────────────────────
  const [novatechClient, stellarClient, bluewaveClient, boldmovesClient, ecofreshClient, apexClient] = clients;

  const salesData = [
    { client: novatechClient,  brand: pulpHouse,   amount: 4500,  currency: 'USD', status: SaleStatus.ACTIVE,     desc: 'Full-service retainer — Q1',   daysAgo: 30 },
    { client: stellarClient,   brand: pulpHouse,   amount: 1200,  currency: 'USD', status: SaleStatus.COMPLETED,  desc: 'Social media package',          daysAgo: 60 },
    { client: bluewaveClient,  brand: urbanQuill,  amount: 3200,  currency: 'USD', status: SaleStatus.ACTIVE,     desc: 'SEO + content strategy',        daysAgo: 15 },
    { client: boldmovesClient, brand: urbanQuill,  amount: 800,   currency: 'USD', status: SaleStatus.PENDING,    desc: 'Content audit',                 daysAgo: 5  },
    { client: ecofreshClient,  brand: novaDigital, amount: 2800,  currency: 'USD', status: SaleStatus.COMPLETED,  desc: 'PPC campaign — Google + Meta',  daysAgo: 45 },
    { client: apexClient,      brand: novaDigital, amount: 9500,  currency: 'USD', status: SaleStatus.ACTIVE,     desc: 'Enterprise retainer — 6 months', daysAgo: 20 },
    { client: novatechClient,  brand: pulpHouse,   amount: 650,   currency: 'USD', status: SaleStatus.CANCELLED,  desc: 'Add-on: analytics dashboard',   daysAgo: 90 },
    { client: apexClient,      brand: novaDigital, amount: 1800,  currency: 'USD', status: SaleStatus.PENDING,    desc: 'Brand identity refresh',        daysAgo: 3  },
  ];

  const sales = [];
  for (const s of salesData) {
    const sale = await prisma.sale.create({
      data: {
        totalAmount: s.amount,
        currency: s.currency,
        status: s.status,
        description: s.desc,
        clientId: s.client.id,
        brandId: s.brand.id,
        organizationId: org.id,
        createdAt: daysAgo(s.daysAgo),
      },
    });
    sales.push(sale);
  }
  console.log(`✅  Sales (${sales.length})`);

  // ── 8. Invoices + Transactions ─────────────────────────────────────────────
  const [sale1, sale2, sale3, sale4, sale5, sale6] = sales;

  const invoiceData = [
    // PAID (with successful transaction)
    { sale: sale1, amount: 2250, number: 'INV-2026-001', status: InvoiceStatus.PAID,   dueOffset: -30, paid: true },
    { sale: sale2, amount: 1200, number: 'INV-2026-002', status: InvoiceStatus.PAID,   dueOffset: -45, paid: true },
    { sale: sale5, amount: 2800, number: 'INV-2026-003', status: InvoiceStatus.PAID,   dueOffset: -20, paid: true },
    // OVERDUE
    { sale: sale3, amount: 1600, number: 'INV-2026-004', status: InvoiceStatus.OVERDUE, dueOffset: -10, paid: false },
    { sale: sale1, amount: 2250, number: 'INV-2026-005', status: InvoiceStatus.OVERDUE, dueOffset: -5,  paid: false },
    // UNPAID (upcoming)
    { sale: sale3, amount: 1600, number: 'INV-2026-006', status: InvoiceStatus.UNPAID, dueOffset: 14, paid: false },
    { sale: sale4, amount: 800,  number: 'INV-2026-007', status: InvoiceStatus.UNPAID, dueOffset: 21, paid: false },
    { sale: sale6, amount: 4750, number: 'INV-2026-008', status: InvoiceStatus.UNPAID, dueOffset: 30, paid: false },
    { sale: sale6, amount: 4750, number: 'INV-2026-009', status: InvoiceStatus.UNPAID, dueOffset: 60, paid: false },
    { sale: sale5, amount: 2800, number: 'INV-2026-010', status: InvoiceStatus.UNPAID, dueOffset: 7,  paid: false },
  ];

  let invoiceCount = 0;
  let txCount = 0;
  for (const inv of invoiceData) {
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: inv.number,
        amount: inv.amount,
        dueDate: daysFromNow(inv.dueOffset),
        status: inv.status,
        saleId: inv.sale.id,
        notes: inv.paid ? 'Payment received — thank you.' : undefined,
        createdAt: daysAgo(Math.abs(inv.dueOffset) + 5),
      },
    });
    invoiceCount++;

    // Payment transaction for paid invoices
    if (inv.paid) {
      await prisma.paymentTransaction.create({
        data: {
          type: TransactionType.ONE_TIME,
          amount: inv.amount,
          status: TransactionStatus.SUCCESS,
          transactionId: `AUTH-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
          responseCode: '1',
          responseMessage: 'This transaction has been approved.',
          saleId: inv.sale.id,
          invoiceId: invoice.id,
          createdAt: daysFromNow(inv.dueOffset - 2),
        },
      });
      txCount++;
    }
  }
  console.log(`✅  Invoices (${invoiceCount}), Transactions (${txCount})`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n🎉  Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Login credentials:');
  console.log('  Owner  →  admin@madcom.com  /  Admin@123');
  console.log('  Agent  →  sarah@madcom.com  /  Agent@123');
  console.log('  Agent  →  alex@madcom.com   /  Agent@123');
  console.log('  Agent  →  mike@madcom.com   /  Agent@123');
  console.log('  Client →  james@novatech.io /  Client@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
