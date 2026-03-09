import { test, expect } from '@playwright/test';
import type { IBrand, IPaginatedResponse } from '@sentra-core/types';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
  };
}

test('kanban follow-up drag sends followUpDate after dialog confirmation', async ({ page, request }) => {
  test.setTimeout(60000);
  const leadTitle = `Kanban Follow Up ${Date.now()}`;

  const loginResponse = await request.post('http://localhost:3001/api/auth/login', {
    data: {
      email: 'sarah@sentra.com',
      password: 'Admin@123',
    },
  });
  expect(loginResponse.ok()).toBeTruthy();

  const { accessToken, refreshToken, user } = (await loginResponse.json()) as LoginResponse;

  await page.addInitScript(
    ({ accessToken: token, refreshToken: refresh }) => {
      window.localStorage.setItem('accessToken', token);
      window.localStorage.setItem('refreshToken', refresh);
    },
    { accessToken, refreshToken },
  );

  const brandsResponse = await request.get('http://localhost:3001/api/brands?limit=1', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  expect(brandsResponse.ok()).toBeTruthy();

  const brandsPayload = (await brandsResponse.json()) as IPaginatedResponse<IBrand>;
  const [brand] = brandsPayload.data;
  expect(brand).toBeTruthy();

  const createLeadResponse = await request.post('http://localhost:3001/api/leads', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      title: leadTitle,
      brandId: brand.id,
      assignedToId: user.id,
    },
  });
  const createLeadBody = await createLeadResponse.text();
  expect(createLeadResponse.ok(), createLeadBody).toBeTruthy();

  await page.goto(`/dashboard/leads?view=kanban&search=${encodeURIComponent(leadTitle)}`);
  await expect(page).toHaveURL(/\/dashboard\/leads/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');

  const card = page.locator('div[tabindex="0"]').filter({ hasText: leadTitle }).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.focus();

  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Set Follow-Up Date' })).toBeVisible({ timeout: 10000 });

  const statusRequestPromise = page.waitForRequest((req) => {
    return req.method() === 'PATCH' && /\/api\/leads\/[^/]+\/status$/.test(req.url());
  });

  const dateInput = dialog.locator('input[type="date"]');
  await dateInput.fill('2026-06-01');
  await page.getByRole('button', { name: 'Confirm' }).click();

  const statusRequest = await statusRequestPromise;
  const body = statusRequest.postDataJSON() as { status: string; followUpDate: string };

  expect(body.status).toBe('FOLLOW_UP');
  expect(body.followUpDate).toBeTruthy();
});
