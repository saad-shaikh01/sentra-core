/**
 * backfill-lead-converted-at.ts
 *
 * Updates Lead.convertedAt = Lead.leadDate for every row where:
 *   - leadDate IS NOT NULL
 *   - convertedAt IS NULL OR convertedAt != leadDate
 *
 * Uses raw SQL throughout — safe if the generated Prisma client is stale.
 *
 * Dev:  ts-node --project libs/backend/prisma-client/tsconfig.seed.json \
 *         libs/backend/prisma-client/prisma/scripts/backfill-lead-converted-at.ts
 *
 * Live: DATABASE_URL="<live-url>" ts-node ... (same script, different URL)
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

type DbInfoRow = { current_database: string; current_schema: string; inet_server_addr: string; inet_server_port: string };
type ColumnRow = { column_name: string; data_type: string; is_nullable: string };
type SampleRow = { id: string; leadDate: Date | null; convertedAt: Date | null };
type CountRow  = { count: bigint };

async function main(): Promise<void> {

  // ── Step 1: Print DB identity ─────────────────────────────────────────────
  console.log('DATABASE_URL (masked):', maskedUrl(rawUrl!));

  const [dbInfo] = await prisma.$queryRaw<DbInfoRow[]>`
    SELECT
      current_database()                                     AS current_database,
      current_schema()                                       AS current_schema,
      COALESCE(inet_server_addr()::text, 'socket/localhost') AS inet_server_addr,
      inet_server_port()::text                               AS inet_server_port
  `;
  console.log('\n── Connected database ────────────────────────────────────────');
  console.log('  Database :', dbInfo!.current_database);
  console.log('  Schema   :', dbInfo!.current_schema);
  console.log('  Host     :', dbInfo!.inet_server_addr);
  console.log('  Port     :', dbInfo!.inet_server_port);
  console.log('──────────────────────────────────────────────────────────────\n');

  // ── Step 2: Locate Lead table ─────────────────────────────────────────────
  const tableRows = await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
    SELECT table_schema, table_name
    FROM   information_schema.tables
    WHERE  table_name = 'Lead'
      AND  table_type = 'BASE TABLE'
  `;
  if (tableRows.length === 0) {
    console.error('ERROR: No table named "Lead" found. Aborting.');
    process.exit(1);
  }
  const { table_schema, table_name } = tableRows[0]!;
  console.log(`Table : "${table_schema}"."${table_name}"`);

  // ── Step 3: Verify required columns exist ─────────────────────────────────
  const colRows = await prisma.$queryRaw<ColumnRow[]>`
    SELECT column_name, data_type, is_nullable
    FROM   information_schema.columns
    WHERE  table_schema = ${table_schema}
      AND  table_name   = ${table_name}
      AND  column_name  = ANY(ARRAY['id','leadDate','convertedAt'])
    ORDER  BY column_name
  `;
  const foundCols = new Set(colRows.map((r) => r.column_name));
  const missing   = ['id', 'leadDate', 'convertedAt'].filter((c) => !foundCols.has(c));

  console.log('\nColumn check:');
  colRows.forEach((c) =>
    console.log(`  ✓  ${c.column_name.padEnd(14)} ${c.data_type}  nullable=${c.is_nullable}`),
  );

  if (missing.length > 0) {
    console.error(`\nERROR: Missing columns: ${missing.join(', ')} — migration may not have run.`);
    process.exit(1);
  }

  // ── Step 4: Count affected rows ───────────────────────────────────────────
  const [countResult] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM   "Lead"
    WHERE  "leadDate"    IS NOT NULL
      AND  "convertedAt" IS NOT NULL
      AND  "convertedAt" != "leadDate"
  `;
  const affectedCount = Number(countResult!.count);
  console.log(`\nRows to update: ${affectedCount}`);

  if (affectedCount === 0) {
    console.log('All leads already have matching convertedAt. Nothing to do.');
    return;
  }

  // ── Step 5: Sample rows before update ────────────────────────────────────
  const sample = await prisma.$queryRaw<SampleRow[]>`
    SELECT id, "leadDate", "convertedAt"
    FROM   "Lead"
    WHERE  "leadDate"    IS NOT NULL
      AND  "convertedAt" IS NOT NULL
      AND  "convertedAt" != "leadDate"
    ORDER  BY "leadDate" DESC
    LIMIT  5
  `;
  console.log('\nSample (up to 5 rows) BEFORE update:');
  console.log('─'.repeat(95));
  console.log('id'.padEnd(38), 'leadDate'.padEnd(28), 'convertedAt (current)');
  console.log('─'.repeat(95));
  sample.forEach((r) =>
    console.log(
      r.id.padEnd(38),
      String(r.leadDate).padEnd(28),
      r.convertedAt !== null ? String(r.convertedAt) : 'NULL',
    ),
  );
  console.log('─'.repeat(95));

  // ── Step 6: Update ────────────────────────────────────────────────────────
  console.log('\nRunning update...');
  const updatedCount = await prisma.$executeRaw`
    UPDATE "Lead"
    SET    "convertedAt" = "leadDate"
    WHERE  "leadDate"    IS NOT NULL
      AND  "convertedAt" IS NOT NULL
      AND  "convertedAt" != "leadDate"
  `;
  console.log(`Rows affected: ${updatedCount}`);

  // ── Step 7: Verify zero mismatches remain ─────────────────────────────────
  const [remaining] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM   "Lead"
    WHERE  "leadDate"    IS NOT NULL
      AND  "convertedAt" IS NOT NULL
      AND  "convertedAt" != "leadDate"
  `;
  const remainingCount = Number(remaining!.count);

  if (remainingCount === 0) {
    console.log(`\n✓ Done. ${updatedCount} rows updated. No mismatches remain.`);
  } else {
    console.error(`\nWARNING: ${remainingCount} rows still mismatched after update.`);
    process.exit(1);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
