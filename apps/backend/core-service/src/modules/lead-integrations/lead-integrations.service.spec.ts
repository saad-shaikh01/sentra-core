import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '@sentra-core/prisma-client';
import { LeadSource, LeadType } from '@sentra-core/types';
import axios from 'axios';
import * as crypto from 'crypto';
import { LeadsService } from '../leads/leads.service';
import { LeadIntegrationsService } from './lead-integrations.service';

jest.mock('axios');

describe('LeadIntegrationsService', () => {
  let service: LeadIntegrationsService;
  const prismaMock = {
    brand: {
      findFirst: jest.fn(),
    },
    facebookIntegration: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const configMock = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        LEAD_INTEGRATIONS_ENCRYPTION_KEY: 'test-encryption-key',
        FACEBOOK_APP_SECRET: 'facebook-secret',
        FACEBOOK_WEBHOOK_VERIFY_TOKEN: 'verify-me',
      };

      return values[key];
    }),
  };
  const leadsServiceMock = {
    capture: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadIntegrationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: LeadsService, useValue: leadsServiceMock },
      ],
    }).compile();

    service = module.get<LeadIntegrationsService>(LeadIntegrationsService);
  });

  it('creates a Facebook integration and encrypts the access token', async () => {
    prismaMock.brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    prismaMock.facebookIntegration.create.mockImplementation(async ({ data }: any) => ({
      id: 'fb-1',
      organizationId: data.organizationId,
      brandId: data.brandId,
      pageId: data.pageId,
      formId: data.formId,
      accessToken: data.accessToken,
      isActive: true,
      label: data.label,
      createdAt: new Date('2026-03-16T00:00:00.000Z'),
      updatedAt: new Date('2026-03-16T00:00:00.000Z'),
    }));

    const integration = await service.createFacebookIntegration('org-1', {
      brandId: 'brand-1',
      pageId: 'page-1',
      formId: 'form-1',
      accessToken: 'plain-token',
      label: 'Main Form',
    });

    expect(prismaMock.facebookIntegration.create).toHaveBeenCalled();
    expect(prismaMock.facebookIntegration.create.mock.calls[0][0].data.accessToken).not.toBe('plain-token');
    expect(integration).toMatchObject({
      id: 'fb-1',
      brandId: 'brand-1',
      pageId: 'page-1',
      formId: 'form-1',
      label: 'Main Form',
      isActive: true,
    });
  });

  it('throws conflict when page/form pair already exists', async () => {
    prismaMock.brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    prismaMock.facebookIntegration.create.mockRejectedValue(
      new PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.createFacebookIntegration('org-1', {
        brandId: 'brand-1',
        pageId: 'page-1',
        formId: 'form-1',
        accessToken: 'plain-token',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('verifies the Facebook webhook challenge', async () => {
    await expect(
      service.verifyFacebookWebhook('subscribe', 'verify-me', 'challenge-token'),
    ).resolves.toBe('challenge-token');
  });

  it('rejects invalid verification tokens', async () => {
    await expect(
      service.verifyFacebookWebhook('subscribe', 'wrong-token', 'challenge-token'),
    ).rejects.toThrow(BadRequestException);
  });

  it('handles a Facebook lead webhook and captures a lead', async () => {
    const encryptedToken = (service as any).encryptValue('facebook-access-token');

    prismaMock.facebookIntegration.findFirst.mockResolvedValue({
      id: 'fb-1',
      organizationId: 'org-1',
      brandId: 'brand-1',
      pageId: 'page-1',
      formId: 'form-1',
      accessToken: encryptedToken,
      isActive: true,
      label: 'Main Form',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    (axios.get as jest.Mock).mockResolvedValue({
      data: {
        field_data: [
          { name: 'full_name', values: ['Jane Doe'] },
          { name: 'email', values: ['jane@example.com'] },
          { name: 'phone_number', values: ['+15551234567'] },
          { name: 'company_name', values: ['Acme'] },
        ],
      },
    });

    const body = {
      object: 'page',
      entry: [
        {
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: 'leadgen-1',
                page_id: 'page-1',
                form_id: 'form-1',
              },
            },
          ],
        },
      ],
    };
    const signature = `sha256=${crypto.createHmac('sha256', 'facebook-secret').update(JSON.stringify(body)).digest('hex')}`;

    const result = await service.handleFacebookWebhook('fb-1', signature, body);

    expect(result).toEqual({ received: true, processed: 1 });
    expect(leadsServiceMock.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+15551234567',
        source: LeadSource.FACEBOOK_ADS,
        leadType: LeadType.INBOUND,
        brandId: 'brand-1',
      }),
    );
  });

  it('blocks webhook processing when the signature is invalid', async () => {
    await expect(
      service.handleFacebookWebhook('fb-1', 'sha256=invalid', { object: 'page', entry: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks updates for integrations from another organization', async () => {
    prismaMock.facebookIntegration.findUnique.mockResolvedValue({
      id: 'fb-1',
      organizationId: 'other-org',
    });

    await expect(
      service.updateFacebookIntegration('fb-1', 'org-1', { label: 'Updated' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when deleting a missing integration', async () => {
    prismaMock.facebookIntegration.findUnique.mockResolvedValue(null);

    await expect(
      service.removeFacebookIntegration('fb-1', 'org-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
