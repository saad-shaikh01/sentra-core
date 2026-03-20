#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');

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

const [, , envFile, command, ...args] = process.argv;

if (!envFile || !command) {
  console.error('Usage: run-with-env.cjs <env-file> <command> [args...]');
  process.exit(1);
}

const env = {
  ...process.env,
  ...parseEnvFile(envFile),
};

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
