import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommEmailTemplate, CommEmailTemplateDocument } from '../../schemas/comm-email-template.schema';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto } from './dto/email-template.dto';

@Injectable()
export class EmailTemplatesService {
  constructor(
    @InjectModel(CommEmailTemplate.name)
    private readonly templateModel: Model<CommEmailTemplateDocument>,
  ) {}

  async list(organizationId: string): Promise<CommEmailTemplateDocument[]> {
    return this.templateModel
      .find({ organizationId, isArchived: false })
      .sort({ createdAt: -1 })
      .exec();
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateEmailTemplateDto,
  ): Promise<CommEmailTemplateDocument> {
    return this.templateModel.create({
      organizationId,
      createdBy: userId,
      name: dto.name,
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      bodyText: dto.bodyText,
    });
  }

  async update(
    organizationId: string,
    templateId: string,
    dto: UpdateEmailTemplateDto,
  ): Promise<CommEmailTemplateDocument> {
    const template = await this.templateModel.findOneAndUpdate(
      { _id: templateId, organizationId, isArchived: false },
      { $set: dto },
      { new: true },
    );
    if (!template) throw new NotFoundException(`Template ${templateId} not found`);
    return template;
  }

  async delete(organizationId: string, templateId: string): Promise<void> {
    const result = await this.templateModel.findOneAndUpdate(
      { _id: templateId, organizationId },
      { $set: { isArchived: true } },
    );
    if (!result) throw new NotFoundException(`Template ${templateId} not found`);
  }
}
