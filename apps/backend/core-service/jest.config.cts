module.exports = {
  displayName: 'core-service',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: [
    '**/?(*.)+(spec|test).[tj]s?(x)',
    '**/test/**/*.e2e-spec.[tj]s',
  ],
  coverageDirectory: '../../../coverage/apps/backend/core-service',
};
