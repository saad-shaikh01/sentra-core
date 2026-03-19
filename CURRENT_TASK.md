# INFRA-001: Per-Org Wasabi Bucket + BunnyCDN Pull Zone Auto-Provisioning

Read `docs/tickets/infra/INFRA-001-wasabi-bunnycdn-per-org.md` for full spec.

## Critical context to read FIRST:

1. `libs/backend/prisma-client/prisma/schema.prisma` lines 428-455 — Organization model (no storage fields yet)
2. `apps/backend/core-service/src/common/storage/storage.service.ts` — existing StorageService (uses global bucket)
3. `apps/backend/core-service/src/common/storage/storage.module.ts` — current exports
4. `apps/backend/core-service/src/modules/auth/auth.service.ts` lines 213-300 — signup() creates org inside $transaction
5. `apps/backend/core-service/src/modules/auth/auth.module.ts` — current imports
6. `.env` — existing Wasabi/BunnyCDN env vars

## Environment variable naming (CRITICAL — match existing names exactly):

```env
# Existing (already in .env — do NOT rename):
WASABI_ACCESS_KEY_ID=...       # used by StorageService
WASABI_SECRET_ACCESS_KEY=...   # used by StorageService
WASABI_ENDPOINT=...            # e.g. https://s3.us-central-1.wasabisys.com
WASABI_REGION=...              # e.g. us-central-1
WASABI_BUCKET=...              # global fallback bucket (keep using this for non-per-org uploads)
BUNNY_CDN_HOSTNAME=...         # global CDN hostname (keep for fallback)

# New (add to .env with placeholder value):
BUNNYCDN_API_KEY=your_bunnycdn_api_key_here
```

---

## Step 1: Schema changes

Add to the **Organization model** (after the `updatedAt` line, before the closing `}`):
```prisma
  storageBucket String?    // "sentra-org-{id}" — Wasabi bucket name
  cdnPullZoneId Int?       // BunnyCDN pull zone ID
  cdnHostname   String?    // "{zoneName}.b-cdn.net" — CDN base hostname
```

Run migration:
```bash
cd libs/backend/prisma-client
npx prisma migrate dev --name infra-001-org-storage-fields
```

If `prisma migrate dev` is blocked by migration drift (as in previous tickets), create the migration manually:
```bash
mkdir -p prisma/migrations/20260319170000_infra-001-org-storage-fields
cat > prisma/migrations/20260319170000_infra-001-org-storage-fields/migration.sql << 'EOF'
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "storageBucket" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "cdnPullZoneId" INTEGER;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "cdnHostname" TEXT;
EOF
npx prisma migrate resolve --applied 20260319170000_infra-001-org-storage-fields
npx prisma generate
```

Verify with `npx prisma validate`.

---

## Step 2: StorageProvisioningService

Create `apps/backend/core-service/src/common/storage/storage-provisioning.service.ts`:

```typescript
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import axios from 'axios';
import { PrismaService } from '@sentra-core/prisma-client';

@Injectable()
export class StorageProvisioningService {
  private readonly logger = new Logger(StorageProvisioningService.name);
  private readonly s3: S3Client;
  private readonly bunnyCdnApiKey: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.s3 = new S3Client({
      endpoint:  this.config.getOrThrow<string>('WASABI_ENDPOINT'),
      region:    this.config.get<string>('WASABI_REGION', 'us-east-1'),
      credentials: {
        accessKeyId:     this.config.getOrThrow<string>('WASABI_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('WASABI_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    });
    this.bunnyCdnApiKey = this.config.getOrThrow<string>('BUNNYCDN_API_KEY');
  }

  async provisionForOrg(orgId: string): Promise<void> {
    const bucketName = await this.createOrgBucket(orgId);
    const { id: cdnPullZoneId, hostname: cdnHostname } =
      await this.createOrgPullZone(orgId, bucketName);

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { storageBucket: bucketName, cdnPullZoneId, cdnHostname },
    });
  }

  async createOrgBucket(orgId: string): Promise<string> {
    const bucketName = `sentra-org-${orgId}`;

    try {
      // Check if bucket already exists (idempotent)
      await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
      this.logger.log(`Bucket ${bucketName} already exists — skipping create`);
    } catch {
      // Bucket doesn't exist — create it
      await this.s3.send(new CreateBucketCommand({ Bucket: bucketName }));
      this.logger.log(`Created Wasabi bucket: ${bucketName}`);
    }

    // Set CORS policy
    await this.s3.send(
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
                ...(this.config.get('NODE_ENV') === 'development'
                  ? ['http://localhost:3000', 'http://localhost:3001',
                     'http://localhost:3002', 'http://localhost:3003',
                     'http://localhost:3004', 'http://localhost:3005']
                  : []),
              ],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );

    return bucketName;
  }

  async createOrgPullZone(
    orgId: string,
    bucketName: string,
  ): Promise<{ id: number; hostname: string }> {
    // BunnyCDN zone name: max 20 chars, alphanumeric + hyphen only
    // orgId is a UUID (36 chars with hyphens) — use first 12 hex chars after removing hyphens
    const shortId = orgId.replace(/-/g, '').substring(0, 12);
    const zoneName = `sentra-${shortId}`;

    const wasabiEndpoint = this.config.getOrThrow<string>('WASABI_ENDPOINT');
    // Build origin URL: strip protocol prefix from endpoint and use path-style
    const endpointHost = wasabiEndpoint.replace(/^https?:\/\//, '');
    const originUrl = `https://${endpointHost}/${bucketName}`;

    try {
      const response = await axios.post(
        'https://api.bunny.net/pullzone',
        {
          Name: zoneName,
          OriginUrl: originUrl,
          Type: 0,
          CacheControlMaxAgeOverride: 31536000,
          CacheControlPublicMaxAgeOverride: 31536000,
        },
        {
          headers: {
            AccessKey: this.bunnyCdnApiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      const zone = response.data as {
        Id: number;
        Hostnames: Array<{ Value: string }>;
      };

      const hostname =
        zone.Hostnames.find((h) => h.Value.includes('b-cdn.net'))?.Value ??
        `${zoneName}.b-cdn.net`;

      this.logger.log(`Created BunnyCDN pull zone: ${zoneName} → ${hostname}`);
      return { id: zone.Id, hostname };
    } catch (err) {
      // If zone already exists with this name, try to fetch it
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        this.logger.warn(`BunnyCDN zone ${zoneName} may already exist — attempting lookup`);
        // Return a deterministic hostname as fallback; admin can fix manually
        return { id: 0, hostname: `${zoneName}.b-cdn.net` };
      }
      throw err;
    }
  }
}
```

---

## Step 3: Update StorageModule

READ `apps/backend/core-service/src/common/storage/storage.module.ts`.

Update to include and export `StorageProvisioningService`:
```typescript
import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageProvisioningService } from './storage-provisioning.service';

@Module({
  providers: [StorageService, StorageProvisioningService],
  exports: [StorageService, StorageProvisioningService],
})
export class StorageModule {}
```

---

## Step 4: Update StorageService.upload() for per-org bucket support

READ `apps/backend/core-service/src/common/storage/storage.service.ts` fully.

Update the `upload()` method to accept an optional `orgId`. When provided, it uses the org's
`storageBucket` from the DB and constructs the CDN URL from `cdnHostname`. Otherwise it falls
back to the global `WASABI_BUCKET` + `BUNNY_CDN_HOSTNAME`.

Update the constructor to inject `PrismaService`:
```typescript
constructor(
  private config: ConfigService,
  private prisma: PrismaService,
) { ... }
```

Add a private helper to get org storage config (with Redis-like caching via CacheService if available,
or just a direct DB call — keep it simple):

```typescript
private async getOrgBucket(orgId: string): Promise<{ bucket: string; cdnBase: string }> {
  const org = await this.prisma.organization.findUnique({
    where: { id: orgId },
    select: { storageBucket: true, cdnHostname: true },
  });
  if (!org?.storageBucket || !org.cdnHostname) {
    // Fall back to global bucket for orgs not yet provisioned
    return { bucket: this.bucket, cdnBase: this.cdnBaseUrl };
  }
  const cdnBase = org.cdnHostname.startsWith('http')
    ? org.cdnHostname
    : `https://${org.cdnHostname}`;
  return { bucket: org.storageBucket, cdnBase };
}
```

Update the `upload()` signature:
```typescript
async upload(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: string,
  orgId?: string,   // optional — if provided, uses per-org bucket
): Promise<string>
```

Inside `upload()`, if `orgId` is provided, call `this.getOrgBucket(orgId)` and use those values;
otherwise use `this.bucket` and `this.cdnBaseUrl`.

Update `delete()` similarly to accept optional `orgId` and resolve the correct bucket.

**Important**: All existing callers of `upload()` pass 4 args — they continue to work unchanged
(fallback to global bucket). The signature change is fully backward compatible.

---

## Step 5: Wire StorageProvisioningService into auth.service.ts

READ `apps/backend/core-service/src/modules/auth/auth.service.ts` fully.
READ `apps/backend/core-service/src/modules/auth/auth.module.ts`.

### 5a. Update AuthModule to import StorageModule

In `auth.module.ts`, add `StorageModule` to imports:
```typescript
import { StorageModule } from '../../common/storage/storage.module';
// ... existing imports ...

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({ ... }),
    MailClientModule,
    IamModule,
    StorageModule,   // ADD THIS
  ],
  ...
})
```

### 5b. Inject StorageProvisioningService in AuthService

Update `auth.service.ts` constructor to inject `StorageProvisioningService`:
```typescript
import { StorageProvisioningService } from '../../common/storage/storage-provisioning.service';

@Injectable()
export class AuthService {
  constructor(
    // ... existing injections ...
    private storageProvisioning: StorageProvisioningService,
  ) {}
```

### 5c. Update signup() to provision storage after transaction

The org is created inside `this.prisma.$transaction()` at around line 240. The storage provisioning
MUST happen OUTSIDE the transaction (it makes async HTTP calls to Wasabi + BunnyCDN).

After the `$transaction` call returns `result`, add this block:

```typescript
// Provision per-org storage (outside transaction — involves external HTTP calls)
try {
  await this.storageProvisioning.provisionForOrg(result.organization.id);
} catch (provisionErr) {
  this.logger.error(
    `Storage provisioning failed for org ${result.organization.id}: ${(provisionErr as Error).message}`,
  );
  // Rollback: delete the org and user (cascades via Prisma relation delete)
  await this.prisma.organization.delete({
    where: { id: result.organization.id },
  }).catch(() => {});
  throw new InternalServerErrorException(
    'Failed to provision storage for your organization. Please try again.',
  );
}
```

Add Logger to AuthService if not already present:
```typescript
import { Injectable, Logger, ... } from '@nestjs/common';
// In class:
private readonly logger = new Logger(AuthService.name);
```

Also add `InternalServerErrorException` to the import from `@nestjs/common`.

---

## Step 6: Update common/storage/index.ts

READ `apps/backend/core-service/src/common/storage/index.ts`.

Add the export if not already present:
```typescript
export * from './storage-provisioning.service';
```

---

## Step 7: Add BUNNYCDN_API_KEY to .env

READ `.env` (at repo root).

Add the following line (with placeholder — do NOT add real keys):
```env
BUNNYCDN_API_KEY=your_bunnycdn_api_key_here
```

---

## Step 8: Provisioning script for existing orgs

Create `scripts/provision-storage.ts` at the repo root:

```typescript
/**
 * Provision Wasabi bucket + BunnyCDN pull zone for orgs that don't have storage yet.
 * Usage:
 *   npx ts-node scripts/provision-storage.ts --dry-run
 *   npx ts-node scripts/provision-storage.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import axios from 'axios';

const prisma = new PrismaClient();

const s3 = new S3Client({
  endpoint:  process.env.WASABI_ENDPOINT!,
  region:    process.env.WASABI_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId:     process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

async function createBucket(orgId: string): Promise<string> {
  const bucketName = `sentra-org-${orgId}`;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`  Bucket ${bucketName} already exists — skipping`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE'],
          AllowedOrigins: ['https://sales.sentracore.com', 'https://pm.sentracore.com', 'https://hrms.sentracore.com'],
          MaxAgeSeconds: 3600,
        }],
      },
    }));
    console.log(`  ✓ Created bucket: ${bucketName}`);
  }
  return bucketName;
}

async function createPullZone(orgId: string, bucketName: string): Promise<{ id: number; hostname: string }> {
  const shortId = orgId.replace(/-/g, '').substring(0, 12);
  const zoneName = `sentra-${shortId}`;
  const endpointHost = (process.env.WASABI_ENDPOINT ?? '').replace(/^https?:\/\//, '');
  const originUrl = `https://${endpointHost}/${bucketName}`;

  const res = await axios.post(
    'https://api.bunny.net/pullzone',
    { Name: zoneName, OriginUrl: originUrl, Type: 0, CacheControlMaxAgeOverride: 31536000 },
    { headers: { AccessKey: process.env.BUNNYCDN_API_KEY!, 'Content-Type': 'application/json' } },
  );
  const zone = res.data as { Id: number; Hostnames: Array<{ Value: string }> };
  const hostname = zone.Hostnames.find(h => h.Value.includes('b-cdn.net'))?.Value ?? `${zoneName}.b-cdn.net`;
  console.log(`  ✓ Created CDN zone: ${zoneName} → ${hostname}`);
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
      const { id: cdnPullZoneId, hostname: cdnHostname } = await createPullZone(org.id, bucketName);
      await prisma.organization.update({
        where: { id: org.id },
        data: { storageBucket: bucketName, cdnPullZoneId, cdnHostname },
      });
      console.log(`  ✓ DB updated`);
    } catch (err) {
      console.error(`  ✗ FAILED: ${(err as Error).message}`);
    }
  }

  await prisma.$disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## Step 9: TypeScript check

```bash
cd apps/backend/core-service && npx tsc --noEmit
```

Fix any errors. Common issues to watch for:
- `PrismaService` import in `StorageService` (make sure it's in StorageModule's providers or globally available via PrismaClientModule being `@Global()`)
- `InternalServerErrorException` added to imports in auth.service.ts
- `StorageProvisioningService` not in `AuthModule` providers (it comes from `StorageModule` import — should be fine)

---

## Hard Rules
- Existing `upload()` callers must NOT break — the new `orgId` param is optional with fallback
- `StorageProvisioningService` provisions OUTSIDE the `$transaction` (async HTTP calls can't be in a Prisma transaction)
- If provisioning fails after org creation, the org is DELETED (rollback)
- Use existing env var names (`WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`) — do NOT rename
- `BUNNYCDN_API_KEY` is the new env var (for BunnyCDN REST API authentication)
- `forcePathStyle: true` is required for Wasabi S3

## Report back:
  ✅ INFRA-001 COMPLETE
  - Migration: `<name>`
  - Organization schema: storageBucket, cdnPullZoneId, cdnHostname added ✓
  - StorageProvisioningService created ✓
  - StorageService.upload() updated (backward compatible) ✓
  - auth.service.ts: provisioning wired into signup() ✓
  - scripts/provision-storage.ts created ✓
  - BUNNYCDN_API_KEY added to .env ✓
  - tsc --noEmit passes ✓
  - Deviations: <list or "none">
