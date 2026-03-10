import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';

function verificationPath(filename: string): string {
  const verificationDir = path.resolve(process.cwd(), '../../..', 'docs/verification');
  mkdirSync(verificationDir, { recursive: true });
  return path.join(verificationDir, filename);
}

test('PROJECT_MANAGER sees create and edit but no delete or billing controls', async ({ page }) => {
  const loginResponse = await page.request.post('http://localhost:3001/api/auth/login', {
    data: {
      email: 'hira@sentra.com',
      password: 'PmLead@123',
    },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const auth = (await loginResponse.json()) as {
    accessToken: string;
    refreshToken: string;
  };

  await expect
    .poll(async () => {
      try {
        const response = await page.request.get('http://localhost:4200');
        return response.status();
      } catch {
        return 0;
      }
    }, { timeout: 30000 })
    .toBe(200);

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.evaluate(({ accessToken, refreshToken }) => {
    window.localStorage.setItem('accessToken', accessToken);
    window.localStorage.setItem('refreshToken', refreshToken);
  }, auth);

  await page.goto('/dashboard/sales');
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('button', { name: 'Simple Sale' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Quick Sale' })).toBeVisible({ timeout: 10000 });

  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 10000 });
  await expect(firstRow.locator('button')).toHaveCount(1);

  await page.screenshot({
    path: verificationPath('sale-project-manager-gating-page.png'),
    fullPage: true,
  });

  await firstRow.click();

  const sheet = page.locator('div.fixed.right-0.top-0.z-50').first();
  await expect(sheet).toBeVisible({ timeout: 10000 });
  await expect(sheet.getByRole('button', { name: 'Charge Now' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Subscribe' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  await sheet.screenshot({
    path: verificationPath('sale-project-manager-gating-detail.png'),
  });
});
