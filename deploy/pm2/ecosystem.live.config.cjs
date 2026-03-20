const { createEcosystem } = require('./create-ecosystem.cjs');

module.exports = createEcosystem({
  defaultEnvFileName: '.env.live',
  processSuffix: 'live',
  appStage: 'live',
  frontendPorts: {
    sales: 4300,
    pm: 4301,
    hrms: 4302,
  },
});
