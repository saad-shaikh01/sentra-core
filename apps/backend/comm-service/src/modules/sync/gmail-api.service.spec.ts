import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { google } from 'googleapis';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { IdentitiesService } from '../identities/identities.service';
import { GmailApiService } from './gmail-api.service';

type TokensHandler = (tokens: {
  access_token?: string | null;
  expiry_date?: number | null;
}) => Promise<void>;

const mockOAuthEventHandlers: Record<string, TokensHandler> = {};
const mockSetCredentials = jest.fn();
const mockOn = jest.fn((event: string, handler: TokensHandler) => {
  mockOAuthEventHandlers[event] = handler;
});

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: mockSetCredentials,
        on: mockOn,
      })),
    },
    gmail: jest.fn(),
  },
}));

describe('GmailApiService', () => {
  let service: GmailApiService;
  let identityModel: {
    findByIdAndUpdate: jest.Mock;
  };
  let identitiesService: {
    getDecryptedCredentials: jest.Mock;
    markDegraded: jest.Mock;
  };
  let encryption: {
    encrypt: jest.Mock;
  };
  let metrics: {
    incrementTokenRefresh: jest.Mock;
  };

  const identity = {
    _id: 'identity-1',
    organizationId: 'org-1',
  } as unknown as CommIdentityDocument;

  beforeEach(() => {
    for (const key of Object.keys(mockOAuthEventHandlers)) {
      delete mockOAuthEventHandlers[key];
    }
    mockSetCredentials.mockReset();
    mockOn.mockClear();

    identityModel = {
      findByIdAndUpdate: jest.fn(),
    };
    identitiesService = {
      getDecryptedCredentials: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: new Date('2026-03-11T00:00:00.000Z'),
      }),
      markDegraded: jest.fn().mockResolvedValue(undefined),
    };
    encryption = {
      encrypt: jest.fn().mockReturnValue('encrypted-token'),
    };
    metrics = {
      incrementTokenRefresh: jest.fn(),
    };

    service = new GmailApiService(
      identityModel as unknown as Model<CommIdentityDocument>,
      identitiesService as unknown as IdentitiesService,
      encryption as unknown as TokenEncryptionService,
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      metrics as unknown as MetricsService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls markDegraded when the token refresh persistence write fails', async () => {
    identityModel.findByIdAndUpdate.mockRejectedValue(new Error('write failed'));

    await service.getAuthenticatedClient(identity);
    await mockOAuthEventHandlers.tokens({
      access_token: 'new-access-token',
      expiry_date: Date.now(),
    });

    expect(metrics.incrementTokenRefresh).toHaveBeenCalledWith('identity-1', 'error');
    expect(identitiesService.markDegraded).toHaveBeenCalledWith('identity-1', 'write failed');
  });

  it('swallows markDegraded failures inside the token refresh event handler', async () => {
    const loggerErrorSpy = jest
      .spyOn((service as unknown as { logger: { error: (message: string) => void } }).logger, 'error')
      .mockImplementation();
    identityModel.findByIdAndUpdate.mockRejectedValue(new Error('write failed'));
    identitiesService.markDegraded.mockRejectedValue(new Error('degraded write failed'));

    await service.getAuthenticatedClient(identity);

    await expect(
      mockOAuthEventHandlers.tokens({
        access_token: 'new-access-token',
        expiry_date: Date.now(),
      }),
    ).resolves.toBeUndefined();

    expect(identitiesService.markDegraded).toHaveBeenCalledWith('identity-1', 'write failed');
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Failed to mark identity identity-1 degraded after token refresh error: degraded write failed',
    );
  });
});
