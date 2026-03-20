#!/usr/bin/env node
/**
 * Injects Firebase config into firebase-messaging-sw.js before deploy.
 * Service workers cannot read NEXT_PUBLIC_* env vars, so we bake them in.
 *
 * Usage:
 *   node deploy/scripts/generate-firebase-sw.cjs <testing|live>
 *
 * Reads NEXT_PUBLIC_FIREBASE_* from the appropriate .env file and writes
 * the config into apps/frontend/sales-dashboard/public/firebase-messaging-sw.js
 */

const fs = require('fs');
const path = require('path');

const envName = process.argv[2];
if (!envName || !['testing', 'live'].includes(envName)) {
  console.error('Usage: node deploy/scripts/generate-firebase-sw.cjs <testing|live>');
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, '../..');
const envFile = path.join(repoRoot, envName === 'testing' ? '.env.testing' : '.env.live');

if (!fs.existsSync(envFile)) {
  console.error(`Env file not found: ${envFile}`);
  process.exit(1);
}

// Parse env file
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  let val = line.slice(idx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const missing = required.filter((k) => !env[k] || env[k].includes('replace-me') || env[k].includes('your-'));
if (missing.length > 0) {
  console.error(`Missing or placeholder Firebase env vars in ${envFile}:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const config = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const swPath = path.join(repoRoot, 'apps/frontend/sales-dashboard/public/firebase-messaging-sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');

// Replace or inject the config assignment
const configLine = `const firebaseConfig = self.__FIREBASE_CONFIG__ || ${JSON.stringify(config, null, 2)};`;
swContent = swContent.replace(
  /const firebaseConfig = self\.__FIREBASE_CONFIG__ \|\| \{[\s\S]*?\};/,
  configLine,
);

fs.writeFileSync(swPath, swContent, 'utf8');
console.log(`✓ Firebase SW config injected for [${envName}] → ${swPath}`);
console.log(`  projectId: ${config.projectId}`);
console.log(`  messagingSenderId: ${config.messagingSenderId}`);
