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

const repoRoot      = path.resolve(__dirname, '../..');
const envFile       = process.env.BACKEND_ENV_FILE || path.join(repoRoot, '.env.live');
const backendEnv    = parseEnvFile(envFile);
const nxCli         = path.join(repoRoot, 'node_modules', 'nx', 'bin', 'nx.js');

const sharedEnv = {
  NODE_ENV: 'production',
  NX_DAEMON: 'false',
  APP_STAGE: 'live',
  ...backendEnv,
  ENV_FILE: envFile,
};

// Backend dist dir helper
const backendDist = (service) =>
  path.join(repoRoot, 'dist', 'apps', 'backend', service);

// Only switch to direct node if dist/main.js exists — fallback to NX serve
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

  // fallback: NX serve (original behaviour)
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
    // ── Backends (direct node — no NX daemon/executor overhead) ─────────────
    backendApp('core-service-live', 'core-service', 'PORT_CORE', '3001'),
    backendApp('comm-service-live', 'comm-service', 'PORT_COMM', '3002'),
    backendApp('pm-service-live',   'pm-service',   'PORT_PM',   '3003'),
    backendApp('hrms-service-live', 'hrms-service', 'PORT_HRMS', '3004'),

    // ── Frontends (NX serve — until .next build exists) ──────────────────────
    {
      name:   'sales-dashboard-live',
      cwd:    repoRoot,
      script: nxCli,
      args:   'run sales-dashboard:serve:production --port=4300',
      env:    sharedEnv,
    },
    {
      name:   'pm-dashboard-live',
      cwd:    repoRoot,
      script: nxCli,
      args:   'run pm-dashboard:serve:production --port=4301',
      env:    sharedEnv,
    },
    {
      name:   'hrms-dashboard-live',
      cwd:    repoRoot,
      script: nxCli,
      args:   'run hrms-dashboard:serve:production --port=4302',
      env:    sharedEnv,
    },
  ],
};
