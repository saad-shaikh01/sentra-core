import { Logger } from '@nestjs/common';

const REQUIRED_ENV_VARS = [
  'COMM_ENCRYPTION_MASTER_KEY',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REDIRECT_URI',
  'WASABI_ENDPOINT',
  'WASABI_REGION',
  'WASABI_ACCESS_KEY_ID',
  'WASABI_SECRET_ACCESS_KEY',
  'WASABI_BUCKET',
  'BUNNY_CDN_BASE_URL',
] as const;

const OPTIONAL_ENV_VARS = [
  'GOOGLE_PUBSUB_TOPIC',
  'COMM_PUBSUB_AUDIENCE',
  'COMM_TRACKING_BASE_URL',
] as const;

export function validateCommEnv(env: NodeJS.ProcessEnv, logger = new Logger('EnvValidation')): void {
  const missingRequired = REQUIRED_ENV_VARS.filter((key) => !env[key]?.trim());
  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  }

  for (const key of OPTIONAL_ENV_VARS) {
    if (!env[key]?.trim()) {
      logger.warn(`Optional environment variable ${key} is not set`);
    }
  }
}

export {
  REQUIRED_ENV_VARS,
  OPTIONAL_ENV_VARS,
};
