const { createEcosystem } = require('./create-ecosystem.cjs');

module.exports = createEcosystem({
  defaultEnvFileName: '.env.testing',
  processSuffix: 'testing',
  appStage: 'testing',
  frontendPorts: {
    sales: 4200,
    pm: 4201,
    hrms: 4202,
  },
});
