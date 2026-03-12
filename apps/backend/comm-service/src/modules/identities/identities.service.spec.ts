import { Logger } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { CommCacheService } from '../../common/cache/comm-cache.service';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { IdentitiesService } from './identities.service';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(),
}));

const mockGenerateAuthUrl = jest.fn();
const mockGetToken = jest.fn();
const mockSetCredentials = jest.fn();
const mockGmailGetProfile = jest.fn();
const mockGmailSendAsList = jest.fn();
const mockGmailLabelsList = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
      })),
    },
    gmail: jest.fn().mockImplementation(() => ({
      users: {
        getProfile: mockGmailGetProfile,
        labels: {
          list: mockGmailLabelsList,
        },
        settings: {
          sendAs: {
            list: mockGmailSendAsList,
          },
        },
      },
    })),
  },
}));

describe('IdentitiesService', () => {
  let service: IdentitiesService;
  let identityModel: {
    countDocuments: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let cache: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let config: {
    get: jest.Mock;
  };
  let encryption: {
    encrypt: jest.Mock;
  };

  beforeEach(() => {
    identityModel = {
      countDocuments: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    cache = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'CORE_SERVICE_URL') {
          return 'https://core-service';
        }
        return undefined;
      }),
    };
    encryption = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
    };
    mockGenerateAuthUrl.mockReset();
    mockGetToken.mockReset();
    mockSetCredentials.mockReset();
    mockGmailGetProfile.mockReset();
    mockGmailSendAsList.mockReset();
    mockGmailLabelsList.mockReset();
    (crypto.randomBytes as unknown as jest.Mock).mockReset();
    mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/auth');

    service = new IdentitiesService(
      identityModel as unknown as Model<CommIdentityDocument>,
      cache as unknown as CommCacheService,
      encryption as unknown as TokenEncryptionService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('markDegraded', () => {
    it('calls findByIdAndUpdate with the degraded sync state payload', async () => {
      identityModel.findByIdAndUpdate.mockResolvedValue(null);

      await service.markDegraded('identity-1', 'refresh failed');

      expect(identityModel.findByIdAndUpdate).toHaveBeenCalledWith('identity-1', {
        $set: {
          'syncState.status': 'error',
          'syncState.lastError': 'refresh failed',
        },
      });
    });

    it('swallows DB errors and logs them', async () => {
      identityModel.findByIdAndUpdate.mockRejectedValue(new Error('db down'));
      const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(service.markDegraded('identity-1', 'refresh failed')).resolves.toBeUndefined();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to mark identity identity-1 as degraded: db down',
      );
    });
  });

  describe('initiateOAuth', () => {
    it('stores the nonce in cache before returning the redirect URL', async () => {
      (crypto.randomBytes as unknown as jest.Mock).mockImplementation((size: number) => {
        expect(size).toBe(16);
        return Buffer.from('00112233445566778899aabbccddeeff', 'hex');
      });

      const url = await service.initiateOAuth('org-1', 'user-1', UserRole.ADMIN, 'brand-1');

      expect(url).toBe('https://accounts.google.com/o/oauth2/auth');
      expect(cache.set).toHaveBeenCalledWith(
        'oauth:nonce:00112233445566778899aabbccddeeff',
        JSON.stringify({ organizationId: 'org-1', userId: 'user-1' }),
        600000,
      );

      const generateAuthUrlArg = mockGenerateAuthUrl.mock.calls[0][0] as { state: string };
      const decodedState = JSON.parse(
        Buffer.from(generateAuthUrlArg.state, 'base64url').toString('utf8'),
      ) as { organizationId: string; userId: string; role: UserRole; brandId?: string; nonce: string };

      expect(decodedState).toEqual({
        organizationId: 'org-1',
        userId: 'user-1',
        role: UserRole.ADMIN,
        brandId: 'brand-1',
        nonce: '00112233445566778899aabbccddeeff',
      });
    });
  });

  describe('handleOAuthCallback', () => {
    const nonce = '00112233445566778899aabbccddeeff';
    const state = Buffer.from(
      JSON.stringify({
        organizationId: 'org-1',
        userId: 'user-1',
        role: UserRole.FRONTSELL_AGENT,
        brandId: 'brand-1',
        nonce,
      }),
    ).toString('base64url');
    const storedIdentity = { _id: 'identity-1' } as unknown as CommIdentityDocument;

    beforeEach(() => {
      cache.del.mockResolvedValue(undefined);
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expiry_date: Date.parse('2026-03-11T00:00:00.000Z'),
        },
      });
      mockGmailGetProfile.mockResolvedValue({
        data: {
          emailAddress: 'user@example.com',
        },
      });
      mockGmailSendAsList.mockResolvedValue({
        data: {
          sendAs: [
            {
              sendAsEmail: 'user@example.com',
              displayName: 'User',
              isDefault: true,
            },
          ],
        },
      });
      identityModel.findOne.mockResolvedValue(null);
      identityModel.countDocuments.mockResolvedValue(0);
      identityModel.findOneAndUpdate.mockResolvedValue(storedIdentity);
    });

    it('proceeds when the nonce exists and matches the cached org/user metadata', async () => {
      cache.get.mockResolvedValue(
        JSON.stringify({ organizationId: 'org-1', userId: 'user-1' }),
      );

      const result = await service.handleOAuthCallback('oauth-code', state);

      expect(result).toBe(storedIdentity);
      expect(cache.get).toHaveBeenCalledWith(`oauth:nonce:${nonce}`);
      expect(cache.del).toHaveBeenCalledWith(`oauth:nonce:${nonce}`);
      expect(mockGetToken).toHaveBeenCalledWith('oauth-code');
      expect(identityModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it('sets userId only in $setOnInsert on first connect', async () => {
      cache.get.mockResolvedValue(
        JSON.stringify({ organizationId: 'org-1', userId: 'user-1' }),
      );

      await service.handleOAuthCallback('oauth-code', state);

      expect(identityModel.findOneAndUpdate).toHaveBeenCalledWith(
        { organizationId: 'org-1', email: 'user@example.com' },
        {
          $set: {
            organizationId: 'org-1',
            email: 'user@example.com',
            encryptedAccessToken: 'encrypted:access-token',
            encryptedRefreshToken: 'encrypted:refresh-token',
            tokenExpiresAt: new Date('2026-03-11T00:00:00.000Z'),
            sendAsAliases: [
              {
                email: 'user@example.com',
                name: 'User',
                isDefault: true,
              },
            ],
            isActive: true,
            brandId: 'brand-1',
            isDefault: true,
          },
          $setOnInsert: {
            userId: 'user-1',
            syncState: { initialSyncDone: false, fullBackfillDone: false, status: 'active' },
          },
        },
        { upsert: true, new: true },
      );
    });

    it('allows reconnect for the same user without changing ownership', async () => {
      cache.get.mockResolvedValue(
        JSON.stringify({ organizationId: 'org-1', userId: 'user-1' }),
      );
      identityModel.findOne.mockResolvedValue({ userId: 'user-1' });

      await expect(service.handleOAuthCallback('oauth-code', state)).resolves.toBe(storedIdentity);

      const update = identityModel.findOneAndUpdate.mock.calls[0][1] as {
        $set: Record<string, unknown>;
        $setOnInsert: Record<string, unknown>;
      };
      expect(update.$set.userId).toBeUndefined();
      expect(update.$setOnInsert.userId).toBe('user-1');
    });

    it('throws when a different non-privileged user reconnects an existing mailbox', async () => {
      cache.get.mockResolvedValue(
        JSON.stringify({ organizationId: 'org-1', userId: 'user-1' }),
      );
      identityModel.findOne.mockResolvedValue({ userId: 'other-user' });

      await expect(service.handleOAuthCallback('oauth-code', state)).rejects.toThrow(
        new ForbiddenException('You do not own this mailbox'),
      );

      expect(identityModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('allows reconnect for a different user when the role is ADMIN', async () => {
      const adminState = Buffer.from(
        JSON.stringify({
          organizationId: 'org-1',
          userId: 'admin-user',
          role: UserRole.ADMIN,
          brandId: 'brand-1',
          nonce,
        }),
      ).toString('base64url');
      cache.get.mockResolvedValue(
        JSON.stringify({ organizationId: 'org-1', userId: 'admin-user' }),
      );
      identityModel.findOne.mockResolvedValue({ userId: 'other-user' });

      await expect(service.handleOAuthCallback('oauth-code', adminState)).resolves.toBe(storedIdentity);

      const update = identityModel.findOneAndUpdate.mock.calls[0][1] as {
        $set: Record<string, unknown>;
        $setOnInsert: Record<string, unknown>;
      };
      expect(update.$set.userId).toBeUndefined();
      expect(update.$setOnInsert.userId).toBe('admin-user');
    });

    it('throws when the nonce is missing or expired', async () => {
      cache.get.mockResolvedValue(undefined);

      await expect(service.handleOAuthCallback('oauth-code', state)).rejects.toThrow(
        new BadRequestException('OAuth state expired or invalid'),
      );

      expect(cache.del).not.toHaveBeenCalled();
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('throws when the cached org/user metadata does not match the callback state', async () => {
      cache.get.mockResolvedValue(
        JSON.stringify({ organizationId: 'org-2', userId: 'user-1' }),
      );

      await expect(service.handleOAuthCallback('oauth-code', state)).rejects.toThrow(
        new BadRequestException('OAuth state tampered'),
      );

      expect(cache.del).toHaveBeenCalledWith(`oauth:nonce:${nonce}`);
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('deletes a valid nonce after use so replaying the same callback fails', async () => {
      cache.get
        .mockResolvedValueOnce(JSON.stringify({ organizationId: 'org-1', userId: 'user-1' }))
        .mockResolvedValueOnce(undefined);

      await expect(service.handleOAuthCallback('oauth-code', state)).resolves.toBe(storedIdentity);
      await expect(service.handleOAuthCallback('oauth-code', state)).rejects.toThrow(
        new BadRequestException('OAuth state expired or invalid'),
      );

      expect(cache.del).toHaveBeenCalledTimes(1);
      expect(cache.del).toHaveBeenCalledWith(`oauth:nonce:${nonce}`);
    });
  });

  describe('getOAuthBrands', () => {
    it('returns brands transformed to id/name pairs', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [
            { id: 'brand-1', name: 'Brand One', domain: 'one.example.com' },
            { id: 'brand-2', name: 'Brand Two', domain: 'two.example.com' },
          ],
        }),
      } as unknown as Response);

      const result = await service.getOAuthBrands('Bearer test-token');

      expect(fetchSpy).toHaveBeenCalledWith('https://core-service/api/brands?limit=100', {
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(result).toEqual([
        { id: 'brand-1', name: 'Brand One' },
        { id: 'brand-2', name: 'Brand Two' },
      ]);
    });
  });
});
