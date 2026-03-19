const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
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

const repoRoot = path.resolve(__dirname, '../..');
const nxCli = path.join(repoRoot, 'node_modules', 'nx', 'bin', 'nx.js');
const backendEnvFile =
  process.env.BACKEND_ENV_FILE || path.join(repoRoot, '.env.production');
const backendEnv = parseEnvFile(backendEnvFile);
const sharedNodeEnv = {
  NODE_ENV: 'production',
  NX_DAEMON: 'false',
};

module.exports = {
  apps: [
    {
      name: 'core-service',
      cwd: repoRoot,
      script: nxCli,
      args: 'run core-service:serve:production',
      env: {
        ...sharedNodeEnv,
        ...backendEnv,
        ENV_FILE: backendEnvFile,
        PORT_CORE: backendEnv.PORT_CORE || '3001',
      },
    },
    {
      name: 'comm-service',
      cwd: repoRoot,
      script: nxCli,
      args: 'run comm-service:serve:production',
      env: {
        ...sharedNodeEnv,
        ...backendEnv,
        ENV_FILE: backendEnvFile,
        PORT_COMM: backendEnv.PORT_COMM || '3002',
      },
    },
    {
      name: 'pm-service',
      cwd: repoRoot,
      script: nxCli,
      args: 'run pm-service:serve:production',
      env: {
        ...sharedNodeEnv,
        ...backendEnv,
        ENV_FILE: backendEnvFile,
        PORT_PM: backendEnv.PORT_PM || '3003',
      },
    },
    {
      name: 'sales-dashboard',
      cwd: repoRoot,
      script: nxCli,
      args: 'run sales-dashboard:serve:production --port=4200',
      env: {
        ...sharedNodeEnv,
      },
    },
    {
      name: 'pm-dashboard',
      cwd: repoRoot,
      script: nxCli,
      args: 'run pm-dashboard:serve:production --port=4201',
      env: {
        ...sharedNodeEnv,
      },
    },
    {
      name: 'hrms-service',
      cwd: repoRoot,
      script: nxCli,
      args: 'run hrms-service:serve:production',
      env: {
        ...sharedNodeEnv,
        ...backendEnv,
        ENV_FILE: backendEnvFile,
        PORT_HRMS: backendEnv.PORT_HRMS || '3004',
      },
    },
    {
      name: 'hrms-dashboard',
      cwd: repoRoot,
      script: nxCli,
      args: 'run hrms-dashboard:serve:production --port=4202',
      env: {
        ...sharedNodeEnv,
      },
    },
  ],
};
