import { Logger } from '@nestjs/common';
import { validateCommEnv } from './env-validation';

describe('validateCommEnv', () => {
  const validEnv: NodeJS.ProcessEnv = {
    COMM_ENCRYPTION_MASTER_KEY: 'a'.repeat(64),
    GMAIL_CLIENT_ID: 'gmail-client-id',
    GMAIL_CLIENT_SECRET: 'gmail-client-secret',
    GMAIL_REDIRECT_URI: 'https://example.com/oauth/callback',
    WASABI_ENDPOINT: 'https://s3.wasabisys.com',
    WASABI_REGION: 'us-east-1',
    WASABI_ACCESS_KEY_ID: 'access-key',
    WASABI_SECRET_ACCESS_KEY: 'secret-key',
    WASABI_BUCKET: 'comm-bucket',
    BUNNY_CDN_BASE_URL: 'https://cdn.example.com',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not throw when all required environment variables are present', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    expect(() => validateCommEnv(validEnv)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      'Optional environment variable GOOGLE_PUBSUB_TOPIC is not set',
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      'Optional environment variable COMM_PUBSUB_AUDIENCE is not set',
    );
  });

  it('throws when a required environment variable is missing', () => {
    const envMissingRequired = {
      ...validEnv,
      GMAIL_CLIENT_SECRET: '',
    };

    expect(() => validateCommEnv(envMissingRequired)).toThrow(
      'Missing required environment variables: GMAIL_CLIENT_SECRET',
    );
  });
});
