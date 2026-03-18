import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const SYSTEM_TEAM_TYPES = [
  { name: 'Ebook', slug: 'ebook' },
  { name: 'Design', slug: 'design' },
  { name: 'Social Media', slug: 'social_media' },
  { name: 'Video', slug: 'video' },
  { name: 'SEO', slug: 'seo' },
  { name: 'Development', slug: 'development' },
  { name: 'Content Writing', slug: 'content_writing' },
] as const;

export async function runHrmsTeamsSeed(prisma: PrismaClient): Promise<void> {
  for (const teamType of SYSTEM_TEAM_TYPES) {
    const existing = await prisma.teamType.findFirst({
      where: {
        organizationId: null,
        slug: teamType.slug,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.teamType.update({
        where: { id: existing.id },
        data: {
          name: teamType.name,
          slug: teamType.slug,
          isSystem: true,
        },
      });
      continue;
    }

    await prisma.teamType.create({
      data: {
        organizationId: null,
        name: teamType.name,
        slug: teamType.slug,
        isSystem: true,
      },
    });
  }
}

async function main() {
  const prisma = new PrismaClient();

  try {
    await runHrmsTeamsSeed(prisma);
    console.log('HRMS teams seed completed successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error('HRMS teams seed failed:', error);
    process.exit(1);
  });
}
