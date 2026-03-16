import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '@sentra-core/prisma-client';
import { IFacebookIntegration, LeadSource, LeadType } from '@sentra-core/types';
import axios from 'axios';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { LeadsService } from '../leads/leads.service';
import {
  CreateFacebookIntegrationDto,
  UpdateFacebookIntegrationDto,
} from './dto';

type FacebookIntegrationRecord = {
  id: string;
  organizationId: string;
  brandId: string;
  pageId: string;
  formId: string;
  accessToken: string;
  isActive: boolean;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FacebookWebhookBody = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        leadgen_id?: string;
        form_id?: string;
        page_id?: string;
      };
    }>;
  }>;
};

type FacebookLeadResponse = {
  field_data?: Array<{
    name: string;
    values?: string[];
  }>;
};

@Injectable()
export class LeadIntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly leadsService: LeadsService,
  ) {}

  private getEncryptionKey(): Buffer {
    const secret =
      this.config.get<string>('LEAD_INTEGRATIONS_ENCRYPTION_KEY') ||
      this.config.get<string>('JWT_SECRET') ||
      'lead-integrations-dev-key';

    return createHash('sha256').update(secret).digest();
  }

  private encryptValue(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptValue(value: string): string {
    const [iv, tag, encrypted] = value.split(':');
    if (!iv || !tag || !encrypted) {
      throw new BadRequestException('Invalid encrypted token format');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private mapToFacebookIntegration(
    integration: FacebookIntegrationRecord,
  ): IFacebookIntegration {
    return {
      id: integration.id,
      organizationId: integration.organizationId,
      brandId: integration.brandId,
      pageId: integration.pageId,
      formId: integration.formId,
      label: integration.label ?? undefined,
      isActive: integration.isActive,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }

  private async assertBrandBelongsToOrg(orgId: string, brandId: string): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, organizationId: orgId },
      select: { id: true },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
  }

  private verifyFacebookSignature(signature: string, payload: string): void {
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET');
    if (!appSecret) {
      throw new BadRequestException('Facebook app secret is not configured');
    }

    if (!signature?.startsWith('sha256=')) {
      throw new BadRequestException('Invalid Facebook signature header');
    }

    const expectedSignature = createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');
    const receivedSignature = signature.replace('sha256=', '');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new BadRequestException('Invalid Facebook signature');
    }
  }

  async createFacebookIntegration(
    orgId: string,
    dto: CreateFacebookIntegrationDto,
  ): Promise<IFacebookIntegration> {
    await this.assertBrandBelongsToOrg(orgId, dto.brandId);

    try {
      const integration = await this.prisma.facebookIntegration.create({
        data: {
          organizationId: orgId,
          brandId: dto.brandId,
          pageId: dto.pageId.trim(),
          formId: dto.formId.trim(),
          accessToken: this.encryptValue(dto.accessToken.trim()),
          label: dto.label?.trim() || null,
        },
      });

      return this.mapToFacebookIntegration(integration);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A Facebook integration already exists for this page and form');
      }

      throw error;
    }
  }

  async listFacebookIntegrations(orgId: string): Promise<IFacebookIntegration[]> {
    const integrations = await this.prisma.facebookIntegration.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    return integrations.map((integration) => this.mapToFacebookIntegration(integration));
  }

  async updateFacebookIntegration(
    id: string,
    orgId: string,
    dto: UpdateFacebookIntegrationDto,
  ): Promise<IFacebookIntegration> {
    const existing = await this.prisma.facebookIntegration.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Facebook integration not found');
    }

    if (existing.organizationId !== orgId) {
      throw new ForbiddenException('Facebook integration belongs to another organization');
    }

    if (dto.brandId) {
      await this.assertBrandBelongsToOrg(orgId, dto.brandId);
    }

    try {
      const updated = await this.prisma.facebookIntegration.update({
        where: { id },
        data: {
          ...(dto.brandId ? { brandId: dto.brandId } : {}),
          ...(dto.pageId ? { pageId: dto.pageId.trim() } : {}),
          ...(dto.formId ? { formId: dto.formId.trim() } : {}),
          ...(dto.accessToken ? { accessToken: this.encryptValue(dto.accessToken.trim()) } : {}),
          ...(dto.label !== undefined ? { label: dto.label.trim() || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      return this.mapToFacebookIntegration(updated);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A Facebook integration already exists for this page and form');
      }

      throw error;
    }
  }

  async removeFacebookIntegration(id: string, orgId: string): Promise<{ message: string }> {
    const existing = await this.prisma.facebookIntegration.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (!existing) {
      throw new NotFoundException('Facebook integration not found');
    }

    if (existing.organizationId !== orgId) {
      throw new ForbiddenException('Facebook integration belongs to another organization');
    }

    await this.prisma.facebookIntegration.delete({ where: { id } });
    return { message: 'Facebook integration removed successfully' };
  }

  async verifyFacebookWebhook(
    mode?: string,
    verifyToken?: string,
    challenge?: string,
  ): Promise<string> {
    const expectedToken = this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN');

    if (!mode || !verifyToken || !challenge) {
      throw new BadRequestException('Missing Facebook verification parameters');
    }

    if (!expectedToken || verifyToken !== expectedToken) {
      throw new BadRequestException('Invalid Facebook verification token');
    }

    if (mode !== 'subscribe') {
      throw new BadRequestException('Unsupported Facebook verification mode');
    }

    return challenge;
  }

  async handleFacebookWebhook(
    webhookId: string,
    signature: string,
    body: FacebookWebhookBody,
  ): Promise<{ received: true; processed: number }> {
    if (!webhookId) {
      throw new BadRequestException('webhookId is required');
    }

    if (!signature) {
      throw new BadRequestException('Missing Facebook signature');
    }

    this.verifyFacebookSignature(signature, JSON.stringify(body));

    const changes = (body.entry ?? []).flatMap((entry) => entry.changes ?? []);
    let processed = 0;

    for (const change of changes) {
      if (change.field !== 'leadgen' || !change.value?.leadgen_id) {
        continue;
      }

      const integration = await this.prisma.facebookIntegration.findFirst({
        where: {
          id: webhookId,
          isActive: true,
          pageId: change.value.page_id,
          formId: change.value.form_id,
        },
      });

      if (!integration) {
        continue;
      }

      const accessToken = this.decryptValue(integration.accessToken);
      const response = await axios.get<FacebookLeadResponse>(
        `https://graph.facebook.com/v20.0/${change.value.leadgen_id}`,
        {
          params: { access_token: accessToken },
        },
      );

      const fieldMap = new Map(
        (response.data.field_data ?? []).map((field) => [
          field.name,
          field.values?.find(Boolean)?.trim() ?? '',
        ]),
      );

      const name =
        fieldMap.get('full_name') ||
        [fieldMap.get('first_name'), fieldMap.get('last_name')].filter(Boolean).join(' ') ||
        undefined;
      const email = fieldMap.get('email') || undefined;
      const phone = fieldMap.get('phone_number') || fieldMap.get('phone') || undefined;
      const website = fieldMap.get('website') || undefined;
      const companyName = fieldMap.get('company_name') || undefined;

      await this.leadsService.capture({
        name,
        email,
        phone,
        website,
        title: companyName ? `Facebook Lead - ${companyName}` : undefined,
        source: LeadSource.FACEBOOK_ADS,
        leadType: LeadType.INBOUND,
        brandId: integration.brandId,
        data: {
          facebookLeadId: change.value.leadgen_id,
          pageId: change.value.page_id,
          formId: change.value.form_id,
          companyName,
          rawFields: response.data.field_data ?? [],
        },
      });

      processed += 1;
    }

    return { received: true, processed };
  }
}
