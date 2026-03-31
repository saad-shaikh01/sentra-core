const path = require('path');
const fs   = require('fs');

// ── Env loader ────────────────────────────────────────────────────────────────
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = rawLine.indexOf('=');
    if (sep === -1) continue;
    let value = rawLine.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[rawLine.slice(0, sep).trim()] = value.replace(/\\n/g, '\n');
  }
  return env;
}

const repoRoot   = path.resolve(__dirname, '../..');
const envFile    = process.env.BACKEND_ENV_FILE || path.join(repoRoot, '.env.testing');
const backendEnv = parseEnvFile(envFile);
const nxCli      = path.join(repoRoot, 'node_modules', 'nx', 'bin', 'nx.js');

const sharedEnv = {
  NODE_ENV: 'production',
  NX_DAEMON: 'false',
  APP_STAGE: 'testing',
  ...backendEnv,
  ENV_FILE: envFile,
};

const backendDist = (service) =>
  path.join(repoRoot, 'dist', 'apps', 'backend', service);

// Use direct node if dist exists, fallback to NX serve
function backendApp(name, service, portKey, defaultPort) {
  const distMain = path.join(backendDist(service), 'main.js');
  const useDirectNode = fs.existsSync(distMain);

  if (useDirectNode) {
    return {
      name,
      cwd:    backendDist(service),
      script: 'main.js',
      env: { ...sharedEnv, [portKey]: backendEnv[portKey] || defaultPort },
    };
  }

  return {
    name,
    cwd:    repoRoot,
    script: nxCli,
    args:   `run ${service}:serve:production`,
    env: { ...sharedEnv, [portKey]: backendEnv[portKey] || defaultPort },
  };
}

module.exports = {
  apps: [
    // ── Backends ──────────────────────────────────────────────────────────────
    backendApp('core-service-testing', 'core-service', 'PORT_CORE', '3001'),
    backendApp('comm-service-testing', 'comm-service', 'PORT_COMM', '3002'),
    backendApp('pm-service-testing',   'pm-service',   'PORT_PM',   '3003'),
    backendApp('hrms-service-testing', 'hrms-service', 'PORT_HRMS', '3004'),

    // ── Frontends ─────────────────────────────────────────────────────────────
    {
      name:   'sales-dashboard-testing',
      cwd:    repoRoot,
      script: nxCli,
      args:   'run sales-dashboard:serve:production --port=4200',
      env:    sharedEnv,
    },
    {
      name:   'pm-dashboard-testing',
      cwd:    repoRoot,
      script: nxCli,
      args:   'run pm-dashboard:serve:production --port=4201',
      env:    sharedEnv,
    },
    {
      name:   'hrms-dashboard-testing',
      cwd:    repoRoot,
      script: nxCli,
      args:   'run hrms-dashboard:serve:production --port=4202',
      env:    sharedEnv,
    },
  ],
};
