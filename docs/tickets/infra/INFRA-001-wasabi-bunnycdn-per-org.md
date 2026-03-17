# INFRA-001: Per-Org Wasabi Bucket + BunnyCDN Pull Zone Auto-Provisioning

## Overview
Automatically create a dedicated Wasabi S3 bucket and a BunnyCDN Pull Zone for each new organization when it is created. Store the bucket name and CDN URL on the organization record. All file uploads use the org's bucket; all file serving uses the org's CDN URL.

## Background / Context
Currently, a single bucket is used for all orgs (configured via env var). As we move toward per-org data isolation, each org should have its own storage bucket and CDN. This ticket implements auto-provisioning on org creation and provides a service for uploading/generating CDN URLs.

## Acceptance Criteria
- [ ] When a new Organization is created, a Wasabi bucket `sentra-org-{orgId}` is auto-created
- [ ] When a new Organization is created, a BunnyCDN Pull Zone is auto-created pointing to the Wasabi bucket
- [ ] `Organization.storageBucket`, `Organization.cdnHostname`, `Organization.cdnPullZoneId` fields are populated after creation
- [ ] File upload service uses `org.storageBucket` (not a static env bucket)
- [ ] File download URLs are constructed using `org.cdnHostname` (CDN URL, not direct S3 URL)
- [ ] If bucket/CDN creation fails, organization creation rolls back cleanly (no partial org)
- [ ] A script `scripts/provision-storage.ts` exists to manually provision storage for existing orgs that don't have it yet

## Technical Specification

### Schema Updates

```prisma
model Organization {
  // ... existing fields ...
  storageBucket    String?   // "sentra-org-{id}"
  cdnPullZoneId    Int?      // BunnyCDN pull zone ID
  cdnHostname      String?   // "{zoneName}.b-cdn.net" or custom hostname
}
```

### Wasabi Bucket Creation

```typescript
// storage-provisioning.service.ts

import { S3Client, CreateBucketCommand, PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: process.env.WASABI_ENDPOINT,     // "https://s3.wasabisys.com"
  region: process.env.WASABI_REGION,         // "us-east-1"
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY,
  },
});

async createOrgBucket(orgId: string): Promise<string> {
  const bucketName = `sentra-org-${orgId}`;

  // Create bucket
  await s3.send(new CreateBucketCommand({ Bucket: bucketName }));

  // Set CORS policy (allow uploads from our domains)
  await s3.send(new PutBucketCorsCommand({
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [{
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE'],
        AllowedOrigins: [
          'https://sales.sentracore.com',
          'https://pm.sentracore.com',
          'https://hrms.sentracore.com',
          process.env.NODE_ENV === 'development' ? 'http://localhost:*' : ''
        ].filter(Boolean),
        MaxAgeSeconds: 3600,
      }]
    }
  }));

  return bucketName;
}
```

### BunnyCDN Pull Zone Creation

```typescript
// BunnyCDN REST API — not an SDK, use axios

async createOrgPullZone(orgId: string, bucketName: string): Promise<{ id: number; hostname: string }> {
  const zoneName = `sentra-org-${orgId.substring(0, 12)}`; // max 20 chars for zone name
  const originUrl = `https://s3.wasabisys.com/${bucketName}`; // Wasabi public endpoint for the bucket

  const response = await axios.post(
    'https://api.bunny.net/pullzone',
    {
      Name: zoneName,
      OriginUrl: originUrl,
      Type: 0,                    // 0 = PremiumTier
      CacheControlMaxAgeOverride: 31536000,  // 1 year cache for static files
      CacheControlPublicMaxAgeOverride: 31536000,
    },
    {
      headers: {
        AccessKey: process.env.BUNNYCDN_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  const zone = response.data;

  return {
    id: zone.Id,
    hostname: zone.Hostnames.find(h => h.Value.includes('b-cdn.net'))?.Value || `${zoneName}.b-cdn.net`,
  };
}
```

### Organization Creation Flow (with provisioning)

```typescript
// organization.service.ts

async createOrganization(dto: CreateOrganizationDto) {
  // 1. Create org record first (without storage fields)
  const org = await this.prisma.organization.create({
    data: { ...dto }
  });

  try {
    // 2. Create Wasabi bucket
    const bucketName = await this.storageProvisioning.createOrgBucket(org.id);

    // 3. Create BunnyCDN Pull Zone
    const { id: cdnPullZoneId, hostname: cdnHostname } = await this.storageProvisioning.createOrgPullZone(org.id, bucketName);

    // 4. Update org with storage details
    const updatedOrg = await this.prisma.organization.update({
      where: { id: org.id },
      data: { storageBucket: bucketName, cdnPullZoneId, cdnHostname }
    });

    return updatedOrg;
  } catch (err) {
    // Rollback: delete the org if provisioning failed
    await this.prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    throw new InternalServerErrorException('Failed to provision storage for organization. Please try again.');
  }
}
```

### File Upload Service

```typescript
// file-upload.service.ts

async upload(file: Buffer, filename: string, orgId: string, folder: string = 'files'): Promise<string> {
  const org = await this.getOrgStorage(orgId);
  const key = `${folder}/${Date.now()}-${sanitizeFilename(filename)}`;

  await this.s3.send(new PutObjectCommand({
    Bucket: org.storageBucket,
    Key: key,
    Body: file,
    ContentType: getMimeType(filename),
    CacheControl: 'public, max-age=31536000',
  }));

  // Return CDN URL (not direct S3 URL)
  return `https://${org.cdnHostname}/${key}`;
}

async getOrgStorage(orgId: string): Promise<{ storageBucket: string; cdnHostname: string }> {
  // Cache org storage config in Redis (5 min) — avoid DB hit on every upload
  const cacheKey = `org_storage:${orgId}`;
  const cached = await this.redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const org = await this.prisma.organization.findUnique({
    where: { id: orgId },
    select: { storageBucket: true, cdnHostname: true }
  });

  if (!org?.storageBucket) throw new InternalServerErrorException('Organization storage not provisioned');

  await this.redis.setex(cacheKey, 300, JSON.stringify(org));
  return org;
}

// File delete
async delete(cdnUrl: string, orgId: string): Promise<void> {
  const org = await this.getOrgStorage(orgId);
  // Extract key from CDN URL
  const key = cdnUrl.replace(`https://${org.cdnHostname}/`, '');

  await this.s3.send(new DeleteObjectCommand({
    Bucket: org.storageBucket,
    Key: key,
  }));
}
```

### Provisioning Script for Existing Orgs

```typescript
// scripts/provision-storage.ts
// Usage: npx ts-node scripts/provision-storage.ts --dry-run

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const orgs = await prisma.organization.findMany({
    where: { storageBucket: null }
  });

  console.log(`Found ${orgs.length} orgs without storage provisioned`);

  for (const org of orgs) {
    console.log(`Provisioning: ${org.name} (${org.id})`);
    if (!isDryRun) {
      try {
        await storageProvisioningService.provisionForOrg(org.id);
        console.log(`  ✓ Done`);
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
      }
    }
  }
}
```

### Environment Variables Required

```env
# Wasabi
WASABI_ACCESS_KEY=your_access_key
WASABI_SECRET_KEY=your_secret_key
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.wasabisys.com

# BunnyCDN
BUNNYCDN_API_KEY=your_bunnycdn_api_key
```

## Testing Requirements

### Unit Tests
- `createOrgBucket()` generates correct bucket name `sentra-org-{orgId}`
- `createOrgPullZone()` sends correct origin URL to BunnyCDN API
- `upload()` uses org's storageBucket from DB (not env var)
- `upload()` returns CDN URL (starts with `https://{cdnHostname}/`)
- `getOrgStorage()` throws if org has no storageBucket

### Integration Tests
- Create org → bucket exists in Wasabi → `storageBucket` field populated
- Create org → pull zone exists in BunnyCDN → `cdnHostname` populated
- Upload file → accessible via CDN URL
- Delete file → no longer accessible via CDN URL
- Wasabi down during org creation → org not created (rollback)

### Edge Cases
- `orgId` contains characters not safe in bucket names → bucket name must only use alphanumeric + hyphen (cuid is alphanumeric safe ✓)
- BunnyCDN zone name max 20 chars → truncate orgId if needed
- Org already has storageBucket → provisioning script skips it
- CDN URL cached in Redis → cache invalidated if org storage changes
