/**
 * TokenEncryptionService
 *
 * AES-256-GCM encryption for Gmail OAuth tokens.
 * Key derivation: PBKDF2 with SHA-256, 100K iterations, per-orgId salt.
 *
 * Encoded format: base64(iv[12] + authTag[16] + ciphertext)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha256';

@Injectable()
export class TokenEncryptionService {
  private readonly logger = new Logger(TokenEncryptionService.name);
  private readonly masterKey: Buffer;

  constructor(private readonly config: ConfigService) {
    const masterKeyHex = this.config.get<string>('COMM_ENCRYPTION_MASTER_KEY', '');
    if (!masterKeyHex) {
      this.logger.warn('COMM_ENCRYPTION_MASTER_KEY is not set — token encryption will fail at runtime');
      this.masterKey = Buffer.alloc(32);
    } else {
      this.masterKey = Buffer.from(masterKeyHex, 'hex');
    }
  }

  /**
   * Derive a per-org encryption key using PBKDF2.
   * The orgId acts as the salt so each org has a unique derived key.
   */
  private deriveKey(organizationId: string): Buffer {
    return crypto.pbkdf2Sync(
      this.masterKey,
      organizationId,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
    );
  }

  /**
   * Encrypt a plaintext token string for a given org.
   * Returns base64(iv[12] + authTag[16] + ciphertext).
   */
  encrypt(plaintext: string, organizationId: string): string {
    const key = this.deriveKey(organizationId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a token blob for a given org.
   * Input: base64(iv[12] + authTag[16] + ciphertext)
   */
  decrypt(encryptedBase64: string, organizationId: string): string {
    const key = this.deriveKey(organizationId);
    const combined = Buffer.from(encryptedBase64, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext) + decipher.final('utf8');
  }
}
