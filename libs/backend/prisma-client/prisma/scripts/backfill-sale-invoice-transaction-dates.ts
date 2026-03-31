/**
 * backfill-sale-invoice-transaction-dates.ts
 *
 * For Sales in November & December 2025:
 *   1. Invoice.invoiceDate        = Sale.saleDate
 *   2. PaymentTransaction.createdAt = Invoice.invoiceDate  (= Sale.saleDate)
 *
 * Only updates rows where the value is already wrong (idempotent).
 * Uses raw SQL — safe if generated Prisma client is stale.
 *
 * Dev:  ts-node --project libs/backend/prisma-client/tsconfig.seed.json \
 *         libs/backend/prisma-client/prisma/scripts/backfill-sale-invoice-transaction-dates.ts
 *
 * Live: DATABASE_URL="<live-url>" ts-node ... (same script)
 */

import { PrismaClient } from '@prisma/client';

const rawUrl = process.env['DATABASE_URL'];
if (!rawUrl) {
  console.error('ERROR: DATABASE_URL is not set. Aborting.');
  process.exit(1);
}

function maskedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ':***@');
  }
}

const prisma = new PrismaClient();

type DbInfoRow    = { current_database: string; inet_server_addr: string; inet_server_port: string };
type CountRow     = { count: bigint };
type SampleRow    = { sale_id: string; sale_date: Date; invoice_id: string; invoice_date: Date };
type TxSampleRow  = { tx_id: string; invoice_id: string; invoice_date: Date; tx_created_at: Date };

function fmtDate(d: unknown): string {
  if (d == null) return 'NULL';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? String(d) : date.toISOString().slice(0, 10);
}

// No date range — applies to ALL sales

async function main(): Promise<void> {

  // ── Step 1: Print DB identity ─────────────────────────────────────────────
  console.log('DATABASE_URL (masked):', maskedUrl(rawUrl!));
  const [db] = await prisma.$queryRaw<DbInfoRow[]>`
    SELECT
      current_database()                                     AS current_database,
      COALESCE(inet_server_addr()::text, 'socket/localhost') AS inet_server_addr,
      inet_server_port()::text                               AS inet_server_port
  `;
  console.log('\n── Connected database ────────────────────────────────────────');
  console.log('  Database :', db!.current_database);
  console.log('  Host     :', db!.inet_server_addr);
  console.log('  Port     :', db!.inet_server_port);
  console.log('  Range    : ALL sales (no filter)');
  console.log('──────────────────────────────────────────────────────────────\n');

  // ── Step 2: Count affected Invoices ──────────────────────────────────────
  const [invoiceCount] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM   "Invoice"  i
    JOIN   "Sale"     s ON s.id = i."saleId"
    WHERE  s."deletedAt" IS NULL
      AND  i."invoiceDate" != s."saleDate"
  `;
  console.log(`Invoices to fix   : ${Number(invoiceCount!.count)}`);

  // ── Step 3: Count affected PaymentTransactions ────────────────────────────
  const [txCount] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM   "PaymentTransaction" pt
    JOIN   "Invoice" i ON i.id = pt."invoiceId"
    JOIN   "Sale"    s ON s.id = i."saleId"
    WHERE  s."deletedAt" IS NULL
      AND  pt."createdAt" != i."invoiceDate"
  `;
  console.log(`Transactions to fix: ${Number(txCount!.count)}`);

  if (Number(invoiceCount!.count) === 0 && Number(txCount!.count) === 0) {
    console.log('\nAll dates already correct. Nothing to do.');
    return;
  }

  // ── Step 4: Sample invoices before update ────────────────────────────────
  if (Number(invoiceCount!.count) > 0) {
    const invSample = await prisma.$queryRaw<SampleRow[]>`
      SELECT s.id AS sale_id, s."saleDate" AS sale_date, i.id AS invoice_id, i."invoiceDate" AS invoice_date
      FROM   "Invoice" i
      JOIN   "Sale"    s ON s.id = i."saleId"
      WHERE  s."deletedAt"  IS NULL
        AND  i."invoiceDate" != s."saleDate"
      ORDER  BY s."saleDate" DESC
      LIMIT  5
    `;
    console.log('\nSample Invoices BEFORE update (up to 5):');
    console.log('─'.repeat(100));
    console.log('saleDate'.padEnd(14), 'invoiceDate (wrong)'.padEnd(14), 'invoiceId');
    console.log('─'.repeat(100));
    invSample.forEach((r) =>
      console.log(
        fmtDate(r.sale_date).padEnd(14),
        fmtDate(r.invoice_date).padEnd(14),
        r.invoice_id,
      ),
    );
    console.log('─'.repeat(100));
  }

  // ── Step 5: Sample transactions before update ────────────────────────────
  if (Number(txCount!.count) > 0) {
    const txSample = await prisma.$queryRaw<TxSampleRow[]>`
      SELECT pt.id AS tx_id, i.id AS invoice_id, i."invoiceDate" AS invoice_date, pt."createdAt" AS tx_created_at
      FROM   "PaymentTransaction" pt
      JOIN   "Invoice" i ON i.id = pt."invoiceId"
      JOIN   "Sale"    s ON s.id = i."saleId"
      WHERE  s."deletedAt"  IS NULL
        AND  pt."createdAt" != i."invoiceDate"
      ORDER  BY s."saleDate" DESC
      LIMIT  5
    `;
    console.log('\nSample Transactions BEFORE update (up to 5):');
    console.log('─'.repeat(100));
    console.log('invoiceDate'.padEnd(14), 'tx.createdAt (wrong)'.padEnd(14), 'transactionId');
    console.log('─'.repeat(100));
    txSample.forEach((r) =>
      console.log(
        fmtDate(r.invoice_date).padEnd(14),
        fmtDate(r.tx_created_at).padEnd(14),
        r.tx_id,
      ),
    );
    console.log('─'.repeat(100));
  }

  // ── Step 6: Update Invoice.invoiceDate = Sale.saleDate ───────────────────
  console.log('\nUpdating Invoice.invoiceDate...');
  const invoicesUpdated = await prisma.$executeRaw`
    UPDATE "Invoice" i
    SET    "invoiceDate" = s."saleDate"
    FROM   "Sale" s
    WHERE  s.id           = i."saleId"
      AND  s."deletedAt"  IS NULL
      AND  i."invoiceDate" != s."saleDate"
  `;
  console.log(`  Invoices updated: ${invoicesUpdated}`);

  // ── Step 7: Update PaymentTransaction.createdAt = Invoice.invoiceDate ────
  console.log('Updating PaymentTransaction.createdAt...');
  const txUpdated = await prisma.$executeRaw`
    UPDATE "PaymentTransaction" pt
    SET    "createdAt" = i."invoiceDate"
    FROM   "Invoice" i
    JOIN   "Sale"    s ON s.id = i."saleId"
    WHERE  i.id           = pt."invoiceId"
      AND  s."deletedAt"  IS NULL
      AND  pt."createdAt" != i."invoiceDate"
  `;
  console.log(`  Transactions updated: ${txUpdated}`);

  // ── Step 8: Verify zero mismatches remain ─────────────────────────────────
  const [invRemaining] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM   "Invoice"  i
    JOIN   "Sale"     s ON s.id = i."saleId"
    WHERE  s."deletedAt" IS NULL
      AND  i."invoiceDate" != s."saleDate"
  `;
  const [txRemaining] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM   "PaymentTransaction" pt
    JOIN   "Invoice" i ON i.id = pt."invoiceId"
    JOIN   "Sale"    s ON s.id = i."saleId"
    WHERE  s."deletedAt" IS NULL
      AND  pt."createdAt" != i."invoiceDate"
  `;

  const invLeft = Number(invRemaining!.count);
  const txLeft  = Number(txRemaining!.count);

  console.log('\n── Verification ──────────────────────────────────────────────');
  console.log(`  Invoice mismatches remaining   : ${invLeft}`);
  console.log(`  Transaction mismatches remaining: ${txLeft}`);

  if (invLeft === 0 && txLeft === 0) {
    console.log(`\n✓ Done. ${invoicesUpdated} invoices + ${txUpdated} transactions updated. No mismatches remain.`);
  } else {
    console.error('\nWARNING: Some mismatches still remain after update.');
    process.exit(1);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
