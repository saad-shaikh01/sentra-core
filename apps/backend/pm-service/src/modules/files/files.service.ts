/**
 * FilesService — PM-BE-017
 *
 * Upload-once, link-many file metadata layer.
 *
 * Upload flow:
 *  1. Client requests upload token → backend creates FileAsset record and
 *     returns a presigned PUT URL (placeholder: returns a storage key hint)
 *  2. Client uploads directly to object storage (Wasabi/S3)
 *  3. Client calls complete-upload → backend creates FileVersion and marks isLatest
 *  4. Client links the file to a scope via POST /files/:id/link
 *
 * Access flow:
 *  - GET /files/:id/signed-url → backend checks permission and returns a
 *    short-lived signed GET URL for the latest (or specified) version
 *
 * Rules:
 *  - file versions are append-only; no overwriting
 *  - actual files stay in object storage — only metadata in DB
 *  - never return permanent public URLs
 *
 * Tenant isolation: every query is scoped to organizationId.
 */

import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@sentra-core/prisma-client';
import { CreateFileAssetDto } from './dto/create-file-asset.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { LinkFileDto } from './dto/link-file.dto';

@Injectable()
export class FilesService {
  private readonly storageBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.storageBucket = this.config.get<string>('STORAGE_BUCKET', 'pm-assets');
  }

  // -------------------------------------------------------------------------
  // Request upload token
  // Backend creates the FileAsset record and returns a storage key the
  // client should use when uploading to object storage.
  // In production this would return a presigned PUT URL from the S3 client.
  // -------------------------------------------------------------------------

  async requestUploadToken(
    organizationId: string,
    userId: string,
    dto: CreateFileAssetDto,
  ) {
    // Verify project belongs to org
    const project = await this.prisma.pmProject.findFirst({
      where: { id: dto.projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const fileAsset = await this.prisma.pmFileAsset.create({
      data: {
        organizationId,
        projectId: dto.projectId,
        assetType: dto.assetType,
        name: dto.name,
        mimeType: dto.mimeType ?? null,
        createdById: userId,
      },
    });

    // Generate a deterministic storage key hint for the client to use
    // Format: org/{orgId}/projects/{projectId}/assets/{assetId}/{timestamp}
    const storageKeyHint = `org/${organizationId}/projects/${dto.projectId}/assets/${fileAsset.id}/${Date.now()}`;

    return {
      fileAssetId: fileAsset.id,
      storageKeyHint,
      bucket: this.storageBucket,
      // In production: presignedPutUrl from S3 client
    };
  }

  // -------------------------------------------------------------------------
  // Complete upload — create FileVersion
  // -------------------------------------------------------------------------

  async completeUpload(
    organizationId: string,
    userId: string,
    dto: CompleteUploadDto,
  ) {
    const asset = await this.prisma.pmFileAsset.findFirst({
      where: { id: dto.fileAssetId, organizationId },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('File asset not found');

    // Get next version number
    const lastVersion = await this.prisma.pmFileVersion.findFirst({
      where: { fileAssetId: dto.fileAssetId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true, id: true },
    });
    const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      // Unmark previous latest
      if (lastVersion) {
        await tx.pmFileVersion.update({
          where: { id: lastVersion.id },
          data: { isLatest: false },
        });
      }

      const version = await tx.pmFileVersion.create({
        data: {
          fileAssetId: dto.fileAssetId,
          versionNumber,
          storageKey: dto.storageKey,
          originalFilename: dto.originalFilename,
          sizeBytes: dto.sizeBytes ?? null,
          checksum: dto.checksum ?? null,
          uploadedById: userId,
          uploadedAt: new Date(),
          isLatest: true,
          isApproved: false,
          isPublished: false,
        },
      });

      return version;
    });
  }

  // -------------------------------------------------------------------------
  // Get file asset detail
  // -------------------------------------------------------------------------

  async findOne(organizationId: string, fileAssetId: string) {
    const asset = await this.prisma.pmFileAsset.findFirst({
      where: { id: fileAssetId, organizationId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            isLatest: true,
            isApproved: true,
            isPublished: true,
            uploadedById: true,
            uploadedAt: true,
          },
        },
        _count: { select: { links: true } },
      },
    });
    if (!asset) throw new NotFoundException('File not found');
    return asset;
  }

  // -------------------------------------------------------------------------
  // Link file to a scope
  // -------------------------------------------------------------------------

  async linkFile(
    organizationId: string,
    fileAssetId: string,
    userId: string,
    dto: LinkFileDto,
  ) {
    const asset = await this.prisma.pmFileAsset.findFirst({
      where: { id: fileAssetId, organizationId },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('File not found');

    // Resolve fileVersionId to latest if not specified
    let fileVersionId = dto.fileVersionId ?? null;
    if (!fileVersionId) {
      const latest = await this.prisma.pmFileVersion.findFirst({
        where: { fileAssetId, isLatest: true },
        select: { id: true },
      });
      fileVersionId = latest?.id ?? null;
    }

    return this.prisma.pmFileLink.create({
      data: {
        fileAssetId,
        fileVersionId,
        scopeType: dto.scopeType,
        scopeId: dto.scopeId,
        linkType: dto.linkType ?? 'REFERENCE',
        createdById: userId,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Get signed URL for file access
  // Logs the access attempt. In production: generate S3 presigned GET URL.
  // -------------------------------------------------------------------------

  async getSignedUrl(
    organizationId: string,
    fileAssetId: string,
    userId: string,
    versionId?: string,
  ) {
    const asset = await this.prisma.pmFileAsset.findFirst({
      where: { id: fileAssetId, organizationId },
      select: { id: true, projectId: true },
    });
    if (!asset) throw new NotFoundException('File not found');

    const version = versionId
      ? await this.prisma.pmFileVersion.findFirst({
          where: { id: versionId, fileAssetId },
          select: { id: true, storageKey: true },
        })
      : await this.prisma.pmFileVersion.findFirst({
          where: { fileAssetId, isLatest: true },
          select: { id: true, storageKey: true },
        });

    if (!version) throw new NotFoundException('File version not found');

    // Log access attempt
    await this.prisma.pmFileAccessLog.create({
      data: {
        fileAssetId,
        fileVersionId: version.id,
        userId,
        actionType: 'PREVIEW',
      },
    });

    // In production: return S3 presigned URL (15-minute TTL)
    // const signedUrl = await s3.getSignedUrlPromise('getObject', {
    //   Bucket: this.storageBucket,
    //   Key: version.storageKey,
    //   Expires: 900,
    // });

    return {
      fileAssetId,
      fileVersionId: version.id,
      storageKey: version.storageKey,
      expiresInSeconds: 900,
      // signedUrl, — populated once S3 client is wired
    };
  }

  // -------------------------------------------------------------------------
  // List file links for a scope
  // -------------------------------------------------------------------------

  async listLinksByScope(
    organizationId: string,
    scopeType: string,
    scopeId: string,
  ) {
    // Validate scope indirectly by checking the file links — no explicit org check
    // needed here since fileAsset is org-scoped
    const links = await this.prisma.pmFileLink.findMany({
      where: {
        scopeType: scopeType as never,
        scopeId,
        fileAsset: { organizationId },
      },
      include: {
        fileAsset: { select: { id: true, name: true, assetType: true, mimeType: true } },
        fileVersion: { select: { versionNumber: true, originalFilename: true, sizeBytes: true, isLatest: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return links;
  }
}
