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

function createEcosystem({
  defaultEnvFileName,
  processSuffix = '',
  appStage = 'production',
  frontendPorts,
}) {
  const repoRoot = path.resolve(__dirname, '../..');
  const nxCli = path.join(repoRoot, 'node_modules', 'nx', 'bin', 'nx.js');
  const backendEnvFile =
    process.env.BACKEND_ENV_FILE || path.join(repoRoot, defaultEnvFileName);
  const backendEnv = parseEnvFile(backendEnvFile);

  const sharedNodeEnv = {
    NODE_ENV: 'production',
    NX_DAEMON: 'false',
    APP_STAGE: appStage,
  };

  const nameFor = (baseName) =>
    processSuffix ? `${baseName}-${processSuffix}` : baseName;

  return {
    apps: [
      {
        name: nameFor('core-service'),
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
        name: nameFor('comm-service'),
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
        name: nameFor('pm-service'),
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
        name: nameFor('sales-dashboard'),
        cwd: repoRoot,
        script: nxCli,
        args: `run sales-dashboard:serve:production --port=${frontendPorts.sales}`,
        env: {
          ...sharedNodeEnv,
          ...backendEnv,
          ENV_FILE: backendEnvFile,
        },
      },
      {
        name: nameFor('pm-dashboard'),
        cwd: repoRoot,
        script: nxCli,
        args: `run pm-dashboard:serve:production --port=${frontendPorts.pm}`,
        env: {
          ...sharedNodeEnv,
          ...backendEnv,
          ENV_FILE: backendEnvFile,
        },
      },
      {
        name: nameFor('hrms-service'),
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
        name: nameFor('hrms-dashboard'),
        cwd: repoRoot,
        script: nxCli,
        args: `run hrms-dashboard:serve:production --port=${frontendPorts.hrms}`,
        env: {
          ...sharedNodeEnv,
          ...backendEnv,
          ENV_FILE: backendEnvFile,
        },
      },
    ],
  };
}

module.exports = {
  createEcosystem,
};
