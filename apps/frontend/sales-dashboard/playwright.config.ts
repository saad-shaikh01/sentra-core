import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const workspaceRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests sequentially for auth flow
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npx nx serve core-service',
      url: 'http://localhost:3001/api/auth/apps',
      reuseExistingServer: !process.env.CI,
      timeout: 240000,
      cwd: workspaceRoot,
    },
    {
      command: 'npx nx serve sales-dashboard',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env.CI,
      timeout: 240000,
      cwd: workspaceRoot,
    },
  ],
});
