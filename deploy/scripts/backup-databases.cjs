#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = rawLine.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    let value = rawLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value.replace(/\\n/g, '\n');
  }

  return env;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function hasCommand(command) {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], {
    stdio: 'ignore',
  });

  return result.status === 0;
}

async function deleteOldBackups({ bucket, prefix, retentionDays, env }) {
  const s3 = new S3Client({
    endpoint: env.WASABI_ENDPOINT,
    region: env.WASABI_REGION || 'us-east-1',
    credentials: {
      accessKeyId: env.WASABI_ACCESS_KEY_ID,
      secretAccessKey: env.WASABI_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix + '/' }),
  );

  const toDelete = (listed.Contents || [])
    .filter((obj) => obj.LastModified < cutoff)
    .map((obj) => ({ Key: obj.Key }));

  if (toDelete.length === 0) {
    console.log(`No old backups to delete (retention: ${retentionDays} days).`);
    return;
  }

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: toDelete },
    }),
  );

  console.log(`Deleted ${toDelete.length} old backup(s) from Wasabi.`);
}

async function uploadFile({ filePath, bucket, key, env }) {
  const s3 = new S3Client({
    endpoint: env.WASABI_ENDPOINT,
    region: env.WASABI_REGION || 'us-east-1',
    credentials: {
      accessKeyId: env.WASABI_ACCESS_KEY_ID,
      secretAccessKey: env.WASABI_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: 'application/gzip',
    }),
  );
}

async function main() {
  const envName = process.argv[2];
  if (!envName || !['testing', 'live'].includes(envName)) {
    console.error('Usage: node deploy/scripts/backup-databases.cjs <testing|live>');
    process.exit(1);
  }

  const appDir =
    envName === 'testing'
      ? process.env.APP_DIR || '/home/sentra-core'
      : process.env.APP_DIR || '/home/sentra-live';
  const backendEnvFile =
    envName === 'testing'
      ? process.env.BACKEND_ENV_FILE || path.join(appDir, '.env.testing')
      : process.env.BACKEND_ENV_FILE || path.join(appDir, '.env.live');
  const infraEnvFile =
    envName === 'testing'
      ? process.env.INFRA_ENV_FILE || path.join(appDir, 'deploy/env/infra.testing.env')
      : process.env.INFRA_ENV_FILE || path.join(appDir, 'deploy/env/infra.live.env');

  const env = {
    ...process.env,
    ...parseEnvFile(backendEnvFile),
    ...parseEnvFile(infraEnvFile),
  };

  const bucket = env.DB_BACKUP_WASABI_BUCKET || env.WASABI_BUCKET;
  const prefix =
    env.DB_BACKUP_WASABI_PREFIX || `system-backups/databases/${envName}`;

  if (!bucket) {
    throw new Error('Missing DB_BACKUP_WASABI_BUCKET or WASABI_BUCKET');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(appDir, 'tmp', 'db-backups', envName);
  const backupDir = path.join(backupRoot, timestamp);
  const archivePath = `${backupDir}.tar.gz`;

  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`Creating PostgreSQL backup for ${envName}...`);
  // Strip query params (e.g. ?schema=public) — pg_dump doesn't support them
  const pgUrl = env.DATABASE_URL.split('?')[0];
  runCommand(
    'pg_dump',
    ['--format=custom', `--file=${path.join(backupDir, 'postgres.dump')}`, pgUrl],
    { env },
  );

  console.log(`Creating MongoDB backup for ${envName}...`);
  runCommand(
    'mongodump',
    [`--uri=${env.MONGO_URI}`, `--archive=${path.join(backupDir, 'mongo.archive.gz')}`, '--gzip'],
    { env },
  );

  if (hasCommand('redis-cli') && env.REDIS_URL) {
    console.log(`Creating Redis backup for ${envName}...`);
    runCommand(
      'redis-cli',
      ['-u', env.REDIS_URL, '--rdb', path.join(backupDir, 'redis.rdb')],
      { env },
    );
  } else {
    console.log('Skipping Redis backup because redis-cli is not available.');
  }

  console.log(`Compressing backup for ${envName}...`);
  runCommand('tar', ['-czf', archivePath, '-C', backupRoot, timestamp], { env });

  const key = `${prefix}/${timestamp}.tar.gz`;
  console.log(`Uploading backup to Wasabi: ${bucket}/${key}`);
  await uploadFile({ filePath: archivePath, bucket, key, env });

  console.log(`Backup uploaded successfully: ${bucket}/${key}`);

  // Delete backups older than retention period
  const retentionDays = parseInt(env.DB_BACKUP_RETENTION_DAYS || '7', 10);
  await deleteOldBackups({ bucket, prefix, retentionDays, env });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
