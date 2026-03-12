import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService', () => {
  const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  function createService() {
    return new TokenEncryptionService(
      {
        get: jest.fn((key: string, defaultValue?: string) =>
          key === 'COMM_ENCRYPTION_MASTER_KEY' ? masterKey : defaultValue,
        ),
      } as unknown as ConfigService,
    );
  }

  it('encrypts and decrypts a token round-trip for the same organization', () => {
    const service = createService();

    const encrypted = service.encrypt('refresh-token-123', 'org-1');
    const decrypted = service.decrypt(encrypted, 'org-1');

    expect(encrypted).not.toBe('refresh-token-123');
    expect(decrypted).toBe('refresh-token-123');
  });

  it('throws when the ciphertext has been tampered with', () => {
    const service = createService();
    const encrypted = service.encrypt('refresh-token-123', 'org-1');
    const combined = Buffer.from(encrypted, 'base64');
    combined[combined.length - 1] ^= 0xff;
    const tampered = combined.toString('base64');

    expect(() => service.decrypt(tampered, 'org-1')).toThrow();
  });
});
