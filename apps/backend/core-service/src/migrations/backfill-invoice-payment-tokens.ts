import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

async function main() {
  const prisma = new PrismaClient();
  const invoices = await prisma.invoice.findMany({
    where: { paymentToken: null },
    select: { id: true },
  });
  console.log(`Backfilling ${invoices.length} invoices...`);
  for (const invoice of invoices) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paymentToken: crypto.randomBytes(32).toString('hex') },
    });
  }
  console.log('Done.');
  await prisma.$disconnect();
}

main().catch(console.error);
