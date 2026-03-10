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
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CreateFileAssetDto } from './dto/create-file-asset.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { LinkFileDto } from './dto/link-file.dto';

@Injectable()
export class FilesService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('WASABI_BUCKET', 'sentra-pm-assets');
    const accessKeyId =
      this.config.get<string>('WASABI_ACCESS_KEY_ID') ??
      this.config.get<string>('WASABI_ACCESS_KEY', '');
    const secretAccessKey =
      this.config.get<string>('WASABI_SECRET_ACCESS_KEY') ??
      this.config.get<string>('WASABI_SECRET_KEY', '');

    this.s3Client = new S3Client({
      endpoint: this.config.get<string>('WASABI_ENDPOINT', 'https://s3.wasabisys.com'),
      region: this.config.get<string>('WASABI_REGION', 'us-east-1'),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for Wasabi
    });
  }

  // -------------------------------------------------------------------------
  // Request upload token
  // Backend creates the FileAsset record and returns a presigned PUT URL
  // for direct-to-S3 upload.
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

    // Generate a deterministic storage key
    const storageKey = `org/${organizationId}/projects/${dto.projectId}/assets/${fileAsset.id}/${Date.now()}_${dto.name}`;

    // Generate presigned PUT URL (valid for 15 minutes)
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: dto.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });

    return {
      fileAssetId: fileAsset.id,
      storageKey,
      uploadUrl,
      bucket: this.bucket,
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
  // Logs the access attempt and returns a presigned GET URL.
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

    // Generate presigned GET URL (valid for 15 minutes)
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: version.storageKey,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });

    return {
      fileAssetId,
      fileVersionId: version.id,
      storageKey: version.storageKey,
      signedUrl,
      expiresInSeconds: 900,
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

  async unlink(organizationId: string, linkId: string) {
    const link = await this.prisma.pmFileLink.findFirst({
      where: {
        id: linkId,
        fileAsset: { organizationId },
      },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('File link not found');

    await this.prisma.pmFileLink.delete({ where: { id: linkId } });
  }

  async archiveAsset(organizationId: string, fileAssetId: string) {
    const asset = await this.prisma.pmFileAsset.findFirst({
      where: { id: fileAssetId, organizationId },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('File not found');

    // "Archive" in current schema means unlinking from all scopes,
    // while retaining immutable version history for auditability.
    const result = await this.prisma.pmFileLink.deleteMany({
      where: { fileAssetId },
    });

    return {
      fileAssetId,
      unlinkedCount: result.count,
      archived: true,
    };
  }
}
