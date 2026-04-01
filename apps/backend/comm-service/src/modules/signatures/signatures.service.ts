import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommSignature, CommSignatureDocument } from '../../schemas/comm-signature.schema';
import { CreateSignatureDto, UpdateSignatureDto } from './dto/signature.dto';

@Injectable()
export class SignaturesService {
  constructor(
    @InjectModel(CommSignature.name)
    private readonly signatureModel: Model<CommSignatureDocument>,
  ) {}

  async list(organizationId: string): Promise<CommSignatureDocument[]> {
    return this.signatureModel
      .find({ organizationId, isArchived: false })
      .sort({ isDefault: -1, createdAt: -1 })
      .exec();
  }

  async getDefaultForIdentity(
    organizationId: string,
    identityId?: string,
  ): Promise<CommSignatureDocument | null> {
    // Prefer identity-specific default, fall back to org-wide default
    if (identityId) {
      const specific = await this.signatureModel
        .findOne({ organizationId, identityId, isDefault: true, isArchived: false })
        .exec();
      if (specific) return specific;
    }
    return this.signatureModel
      .findOne({ organizationId, identityId: { $exists: false }, isDefault: true, isArchived: false })
      .exec();
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateSignatureDto,
  ): Promise<CommSignatureDocument> {
    if (dto.isDefault) {
      // Unset other defaults in the same scope
      await this.signatureModel.updateMany(
        { organizationId, identityId: dto.identityId ?? { $exists: false }, isDefault: true },
        { $set: { isDefault: false } },
      );
    }
    return this.signatureModel.create({
      organizationId,
      createdBy: userId,
      name: dto.name,
      bodyHtml: dto.bodyHtml,
      identityId: dto.identityId,
      isDefault: dto.isDefault ?? false,
    });
  }

  async update(
    organizationId: string,
    signatureId: string,
    dto: UpdateSignatureDto,
  ): Promise<CommSignatureDocument> {
    if (dto.isDefault) {
      const existing = await this.signatureModel.findOne({ _id: signatureId, organizationId }).exec();
      if (existing) {
        await this.signatureModel.updateMany(
          { organizationId, identityId: existing.identityId ?? { $exists: false }, isDefault: true },
          { $set: { isDefault: false } },
        );
      }
    }
    const signature = await this.signatureModel.findOneAndUpdate(
      { _id: signatureId, organizationId, isArchived: false },
      { $set: dto },
      { new: true },
    );
    if (!signature) throw new NotFoundException(`Signature ${signatureId} not found`);
    return signature;
  }

  async delete(organizationId: string, signatureId: string): Promise<void> {
    const result = await this.signatureModel.findOneAndUpdate(
      { _id: signatureId, organizationId },
      { $set: { isArchived: true } },
    );
    if (!result) throw new NotFoundException(`Signature ${signatureId} not found`);
  }
}
