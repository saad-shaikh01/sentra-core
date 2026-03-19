/**
 * Provision Wasabi bucket + BunnyCDN pull zone for orgs that don't have storage yet.
 * Usage:
 *   npx ts-node scripts/provision-storage.ts --dry-run
 *   npx ts-node scripts/provision-storage.ts
 */

require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const axios = require('axios');

const prisma = new PrismaClient();

const s3 = new S3Client({
  endpoint: process.env.WASABI_ENDPOINT!,
  region: process.env.WASABI_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

async function createBucket(orgId: string): Promise<string> {
  const bucketName = `sentra-org-${orgId}`;

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`  Bucket ${bucketName} already exists - skipping`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE'],
              AllowedOrigins: [
                'https://sales.sentracore.com',
                'https://pm.sentracore.com',
                'https://hrms.sentracore.com',
              ],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    console.log(`  Created bucket: ${bucketName}`);
  }

  return bucketName;
}

async function createPullZone(
  orgId: string,
  bucketName: string,
): Promise<{ id: number; hostname: string }> {
  const shortId = orgId.replace(/-/g, '').substring(0, 12);
  const zoneName = `sentra-${shortId}`;
  const endpointHost = (process.env.WASABI_ENDPOINT ?? '').replace(/^https?:\/\//, '');
  const originUrl = `https://${endpointHost}/${bucketName}`;

  const response = await axios.post(
    'https://api.bunny.net/pullzone',
    {
      Name: zoneName,
      OriginUrl: originUrl,
      Type: 0,
      CacheControlMaxAgeOverride: 31536000,
    },
    {
      headers: {
        AccessKey: process.env.BUNNYCDN_API_KEY!,
        'Content-Type': 'application/json',
      },
    },
  );

  const zone = response.data as { Id: number; Hostnames: Array<{ Value: string }> };
  const hostname =
    zone.Hostnames.find((host) => host.Value.includes('b-cdn.net'))?.Value ??
    `${zoneName}.b-cdn.net`;

  console.log(`  Created CDN zone: ${zoneName} -> ${hostname}`);
  return { id: zone.Id, hostname };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(isDryRun ? '--- DRY RUN ---' : '--- LIVE RUN ---');

  const orgs = await prisma.organization.findMany({
    where: { storageBucket: null },
    select: { id: true, name: true },
  });

  console.log(`Found ${orgs.length} org(s) without storage provisioned`);

  for (const org of orgs) {
    console.log(`\nProvisioning: ${org.name} (${org.id})`);

    if (isDryRun) {
      console.log('  [dry-run] would create bucket + CDN zone');
      continue;
    }

    try {
      const bucketName = await createBucket(org.id);
      const { id: cdnPullZoneId, hostname: cdnHostname } = await createPullZone(
        org.id,
        bucketName,
      );

      await prisma.organization.update({
        where: { id: org.id },
        data: { storageBucket: bucketName, cdnPullZoneId, cdnHostname },
      });
      console.log('  DB updated');
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }

  await prisma.$disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
