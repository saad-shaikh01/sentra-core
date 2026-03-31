/**
 * backfill-upsell-sales.ts
 *
 * Targets ALL Sales where saleType = 'UPSELL' (not deleted).
 *
 * Updates:
 *   1. Sale.status                    = ACTIVE
 *   2. Invoice.invoiceDate            = Sale.saleDate
 *      Invoice.status                 = PAID
 *      Invoice.paidAt                 = Sale.saleDate
 *   3. Existing PaymentTransactions   → gateway = MANUAL, status = SUCCESS, createdAt = invoiceDate
 *   4. Invoices with NO transaction   → INSERT new ONE_TIME / MANUAL / SUCCESS transaction
 *
 * Idempotent — safe to re-run.
 *
 * Run on live:
 *   DATABASE_URL="<live-url>" ts-node \
 *     --project libs/backend/prisma-client/tsconfig.seed.json \
 *     libs/backend/prisma-client/prisma/scripts/backfill-upsell-sales.ts
 */

import { PrismaClient } from '@prisma/client';

const rawUrl = process.env['DATABASE_URL'];
if (!rawUrl) { console.error('ERROR: DATABASE_URL not set.'); process.exit(1); }

function maskedUrl(url: string): string {
  try { const u = new URL(url); if (u.password) u.password = '***'; return u.toString(); }
  catch { return url.replace(/:([^@]+)@/, ':***@'); }
}

function fmtDate(d: unknown): string {
  if (d == null) return 'NULL';
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? String(d) : date.toISOString().slice(0, 10);
}

const prisma = new PrismaClient();

type DbInfoRow   = { current_database: string; inet_server_addr: string; inet_server_port: string };
type CountRow    = { count: bigint };
type SaleSample  = { sale_id: string; sale_date: Date; sale_status: string };
type InvSample   = { invoice_id: string; sale_date: Date; inv_date: Date; inv_status: string };
type TxSample    = { tx_id: string; inv_date: Date; tx_created: Date; tx_gateway: string; tx_status: string };

async function main(): Promise<void> {

  // ── DB identity ────────────────────────────────────────────────────────────
  console.log('DATABASE_URL (masked):', maskedUrl(rawUrl!));
  const [db] = await prisma.$queryRaw<DbInfoRow[]>`
    SELECT current_database() AS current_database,
           COALESCE(inet_server_addr()::text, 'socket/localhost') AS inet_server_addr,
           inet_server_port()::text AS inet_server_port
  `;
  console.log('\n── Connected database ────────────────────────────────────');
  console.log('  Database :', db!.current_database);
  console.log('  Host     :', db!.inet_server_addr);
  console.log('  Port     :', db!.inet_server_port);
  console.log('  Target   : saleType = UPSELL');
  console.log('─────────────────────────────────────────────────────────\n');

  // ── Counts ─────────────────────────────────────────────────────────────────
  const [salesCount] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "Sale"
    WHERE "saleType" = 'UPSELL' AND "deletedAt" IS NULL
  `;
  const [invoicesCount] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "Invoice" i
    JOIN "Sale" s ON s.id = i."saleId"
    WHERE s."saleType" = 'UPSELL' AND s."deletedAt" IS NULL
  `;
  const [txUpdateCount] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "PaymentTransaction" pt
    JOIN "Invoice" i ON i.id = pt."invoiceId"
    JOIN "Sale"    s ON s.id = i."saleId"
    WHERE s."saleType" = 'UPSELL' AND s."deletedAt" IS NULL
  `;
  const [txInsertCount] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "Invoice" i
    JOIN "Sale" s ON s.id = i."saleId"
    WHERE s."saleType" = 'UPSELL'
      AND s."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "PaymentTransaction" pt WHERE pt."invoiceId" = i.id
      )
  `;

  console.log(`Sales (UPSELL)          : ${Number(salesCount!.count)}`);
  console.log(`Invoices to update         : ${Number(invoicesCount!.count)}`);
  console.log(`Existing transactions      : ${Number(txUpdateCount!.count)}`);
  console.log(`Invoices needing new tx    : ${Number(txInsertCount!.count)}`);

  if (Number(salesCount!.count) === 0) {
    console.log('\nNo UPSELL sales found. Nothing to do.');
    return;
  }

  // ── Samples ────────────────────────────────────────────────────────────────
  const saleSample = await prisma.$queryRaw<SaleSample[]>`
    SELECT id AS sale_id, "saleDate" AS sale_date, status AS sale_status
    FROM "Sale"
    WHERE "saleType" = 'UPSELL' AND "deletedAt" IS NULL
    ORDER BY "saleDate" DESC LIMIT 5
  `;
  console.log('\nSample Sales (up to 5):');
  console.log('─'.repeat(75));
  console.log('saleDate'.padEnd(14), 'status'.padEnd(12), 'saleId');
  console.log('─'.repeat(75));
  saleSample.forEach((r) =>
    console.log(fmtDate(r.sale_date).padEnd(14), r.sale_status.padEnd(12), r.sale_id),
  );
  console.log('─'.repeat(75));

  const invSample = await prisma.$queryRaw<InvSample[]>`
    SELECT i.id AS invoice_id, s."saleDate" AS sale_date, i."invoiceDate" AS inv_date, i.status AS inv_status
    FROM "Invoice" i
    JOIN "Sale" s ON s.id = i."saleId"
    WHERE s."saleType" = 'UPSELL' AND s."deletedAt" IS NULL
    ORDER BY s."saleDate" DESC LIMIT 5
  `;
  console.log('\nSample Invoices (up to 5):');
  console.log('─'.repeat(85));
  console.log('saleDate'.padEnd(14), 'invoiceDate'.padEnd(14), 'status'.padEnd(10), 'invoiceId');
  console.log('─'.repeat(85));
  invSample.forEach((r) =>
    console.log(
      fmtDate(r.sale_date).padEnd(14),
      fmtDate(r.inv_date).padEnd(14),
      r.inv_status.padEnd(10),
      r.invoice_id,
    ),
  );
  console.log('─'.repeat(85));

  if (Number(txUpdateCount!.count) > 0) {
    const txSample = await prisma.$queryRaw<TxSample[]>`
      SELECT pt.id AS tx_id, i."invoiceDate" AS inv_date, pt."createdAt" AS tx_created,
             pt.gateway AS tx_gateway, pt.status AS tx_status
      FROM "PaymentTransaction" pt
      JOIN "Invoice" i ON i.id = pt."invoiceId"
      JOIN "Sale"    s ON s.id = i."saleId"
      WHERE s."saleType" = 'UPSELL' AND s."deletedAt" IS NULL
      ORDER BY s."saleDate" DESC LIMIT 5
    `;
    console.log('\nSample Existing Transactions (up to 5):');
    console.log('─'.repeat(95));
    console.log('invoiceDate'.padEnd(14), 'tx.createdAt'.padEnd(14), 'gateway'.padEnd(14), 'status'.padEnd(10), 'txId');
    console.log('─'.repeat(95));
    txSample.forEach((r) =>
      console.log(
        fmtDate(r.inv_date).padEnd(14),
        fmtDate(r.tx_created).padEnd(14),
        r.tx_gateway.padEnd(14),
        r.tx_status.padEnd(10),
        r.tx_id,
      ),
    );
    console.log('─'.repeat(95));
  }

  // ── Step 1: Sale.status = ACTIVE ───────────────────────────────────────────
  console.log('\nStep 1: Updating Sale.status → ACTIVE...');
  const salesUpdated = await prisma.$executeRaw`
    UPDATE "Sale"
    SET    status      = 'ACTIVE',
           "updatedAt" = NOW()
    WHERE  "saleType"  = 'UPSELL'
      AND  "deletedAt" IS NULL
      AND  status     != 'ACTIVE'
  `;
  console.log(`  Sales updated: ${salesUpdated}`);

  // ── Step 2: Invoice dates + PAID ──────────────────────────────────────────
  console.log('Step 2: Updating Invoice (invoiceDate, status=PAID, paidAt)...');
  const invoicesUpdated = await prisma.$executeRaw`
    UPDATE "Invoice" i
    SET    "invoiceDate" = s."saleDate",
           status        = 'PAID',
           "paidAt"      = s."saleDate",
           "updatedAt"   = NOW()
    FROM   "Sale" s
    WHERE  s.id          = i."saleId"
      AND  s."saleType"  = 'UPSELL'
      AND  s."deletedAt" IS NULL
  `;
  console.log(`  Invoices updated: ${invoicesUpdated}`);

  // ── Step 3: Update existing transactions ──────────────────────────────────
  console.log('Step 3: Updating existing PaymentTransactions (gateway=MANUAL, status=SUCCESS, createdAt=invoiceDate)...');
  const txUpdated = await prisma.$executeRaw`
    UPDATE "PaymentTransaction" pt
    SET    gateway     = 'MANUAL',
           status      = 'SUCCESS',
           "createdAt" = i."invoiceDate"
    FROM   "Invoice" i
    JOIN   "Sale"    s ON s.id = i."saleId"
    WHERE  i.id          = pt."invoiceId"
      AND  s."saleType"  = 'UPSELL'
      AND  s."deletedAt" IS NULL
  `;
  console.log(`  Transactions updated: ${txUpdated}`);

  // ── Step 4: Insert new transactions for invoices with none ────────────────
  console.log('Step 4: Inserting new transactions for invoices with no existing transaction...');
  const txInserted = await prisma.$executeRaw`
    INSERT INTO "PaymentTransaction" (id, type, amount, status, gateway, "saleId", "invoiceId", "createdAt")
    SELECT
      gen_random_uuid(),
      'ONE_TIME',
      i.amount,
      'SUCCESS',
      'MANUAL',
      i."saleId",
      i.id,
      i."invoiceDate"
    FROM "Invoice" i
    JOIN "Sale"    s ON s.id = i."saleId"
    WHERE s."saleType"  = 'UPSELL'
      AND s."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "PaymentTransaction" pt WHERE pt."invoiceId" = i.id
      )
  `;
  console.log(`  Transactions inserted: ${txInserted}`);

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('\nVerifying...');

  const [invNotPaid] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "Invoice" i
    JOIN "Sale" s ON s.id = i."saleId"
    WHERE s."saleType" = 'UPSELL' AND s."deletedAt" IS NULL
      AND (i.status != 'PAID' OR i."paidAt" IS NULL OR i."invoiceDate" != s."saleDate")
  `;
  const [txNoSuccess] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "PaymentTransaction" pt
    JOIN "Invoice" i ON i.id = pt."invoiceId"
    JOIN "Sale"    s ON s.id = i."saleId"
    WHERE s."saleType" = 'UPSELL' AND s."deletedAt" IS NULL
      AND (pt.status != 'SUCCESS' OR pt.gateway != 'MANUAL')
  `;
  const [invNoTx] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "Invoice" i
    JOIN "Sale" s ON s.id = i."saleId"
    WHERE s."saleType" = 'UPSELL' AND s."deletedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "PaymentTransaction" pt WHERE pt."invoiceId" = i.id)
  `;

  console.log('─'.repeat(55));
  console.log(`  Invoices not PAID / date mismatch : ${Number(invNotPaid!.count)}`);
  console.log(`  Transactions not SUCCESS/MANUAL   : ${Number(txNoSuccess!.count)}`);
  console.log(`  Invoices still without transaction: ${Number(invNoTx!.count)}`);
  console.log('─'.repeat(55));

  const allGood =
    Number(invNotPaid!.count) === 0 &&
    Number(txNoSuccess!.count) === 0 &&
    Number(invNoTx!.count) === 0;

  if (allGood) {
    console.log(`\n✓ Done.`);
    console.log(`  ${salesUpdated} sales → ACTIVE`);
    console.log(`  ${invoicesUpdated} invoices → PAID + invoiceDate fixed`);
    console.log(`  ${txUpdated} transactions updated (MANUAL/SUCCESS)`);
    console.log(`  ${txInserted} new transactions inserted`);
  } else {
    console.error('\nWARNING: Some records still need attention. Check above counts.');
    process.exit(1);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
