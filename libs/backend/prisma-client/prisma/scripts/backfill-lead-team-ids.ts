import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillLeadTeamIds(): Promise<void> {
  console.log('Starting Lead.teamId backfill...');

  const teamBrands = await prisma.teamBrand.findMany({
    select: { teamId: true, brandId: true },
  });

  if (teamBrands.length === 0) {
    console.log('No team-brand mappings found. Nothing to backfill.');
    return;
  }

  const brandTeamMap = new Map(teamBrands.map((tb) => [tb.brandId, tb.teamId]));
  console.log(`Found ${teamBrands.length} brand-team mappings.`);

  const leadsToUpdate = await prisma.lead.findMany({
    where: {
      teamId: null,
      brandId: { in: [...brandTeamMap.keys()] },
    },
    select: { id: true, brandId: true },
  });

  console.log(`Found ${leadsToUpdate.length} leads to backfill.`);

  if (leadsToUpdate.length === 0) {
    console.log('All leads already have teamId set. Nothing to do.');
    return;
  }

  const BATCH_SIZE = 500;
  let updated = 0;

  for (let i = 0; i < leadsToUpdate.length; i += BATCH_SIZE) {
    const batch = leadsToUpdate.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((lead) =>
        prisma.lead.update({
          where: { id: lead.id },
          data: { teamId: brandTeamMap.get(lead.brandId!) },
        }),
      ),
    );

    updated += batch.length;
    console.log(`Updated ${updated}/${leadsToUpdate.length} leads...`);
  }

  console.log(`Backfill complete. ${updated} leads updated.`);
}

backfillLeadTeamIds()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
