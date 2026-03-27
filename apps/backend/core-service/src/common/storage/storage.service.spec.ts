import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../cache';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const env = {
    WASABI_ENDPOINT: 'https://s3.us-central-1.wasabisys.com',
    WASABI_REGION: 'us-central-1',
    WASABI_BUCKET: 'sentra-assets-live',
    WASABI_ACCESS_KEY_ID: 'test-access-key',
    WASABI_SECRET_ACCESS_KEY: 'test-secret-key',
    BUNNY_CDN_BASE_URL: 'https://cdn.sentracore.com',
  };

  let service: StorageService;
  let configMock: {
    getOrThrow: jest.Mock<string, [string]>;
    get: jest.Mock<string | undefined, [string, (string | undefined)?]>;
  };
  let prismaMock: {
    organization: {
      findUnique: jest.Mock<Promise<any>, [unknown]>;
    };
  };
  let cacheMock: {
    get: jest.Mock<Promise<any>, [string]>;
    set: jest.Mock<Promise<void>, [string, unknown, number]>;
  };

  beforeEach(() => {
    configMock = {
      getOrThrow: jest.fn((key: string) => env[key as keyof typeof env]),
      get: jest.fn((key: string, defaultValue?: string) => env[key as keyof typeof env] ?? defaultValue),
    };
    prismaMock = {
      organization: {
        findUnique: jest.fn(),
      },
    };
    cacheMock = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };

    service = new StorageService(
      configMock as unknown as ConfigService,
      prismaMock as unknown as PrismaService,
      cacheMock as unknown as CacheService,
    );
  });

  it('uses the global Bunny CDN base URL for default-bucket assets', () => {
    expect(service.buildUrl('/brands/org-1/logos/logo.png')).toBe(
      'https://cdn.sentracore.com/brands/org-1/logos/logo.png',
    );
  });

  it('uses the organization Bunny hostname for org-scoped assets', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      storageBucket: 'sentra-org-123',
      cdnHostname: 'org-assets.b-cdn.net',
    });

    await expect(service.getUrl('brands/org-1/logos/logo.png', 'org-1')).resolves.toBe(
      'https://org-assets.b-cdn.net/brands/org-1/logos/logo.png',
    );
  });

  it('falls back to Wasabi when an org bucket has no CDN hostname', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      storageBucket: 'sentra-org-123',
      cdnHostname: null,
    });

    await expect(service.getUrl('brands/org-1/logos/logo.png', 'org-1')).resolves.toBe(
      'https://s3.us-central-1.wasabisys.com/sentra-org-123/brands/org-1/logos/logo.png',
    );
  });
});
