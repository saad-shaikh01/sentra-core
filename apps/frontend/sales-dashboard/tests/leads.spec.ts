import { test, expect, APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import type { IBrand, IOrganizationMember, IPaginatedResponse } from '@sentra-core/types';

interface Credentials {
  email: string;
  password: string;
}

interface AuthenticatedSession {
  accessToken: string;
  user: {
    id: string;
  };
}

interface LeadApiResponse {
  id: string;
  title: string;
}

interface CreateLeadInput {
  title: string;
  assignedToId?: string;
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
}

const managerCredentials: Credentials = {
  email: 'sarah@sentra.com',
  password: 'Admin@123',
};

const ownerCredentials: Credentials = {
  email: 'admin@sentra.com',
  password: 'Admin@123',
};

const agentCredentials: Credentials = {
  email: 'alex@sentra.com',
  password: 'Agent@123',
};

async function fetchCurrentUser(
  request: APIRequestContext,
  accessToken: string,
): Promise<AuthenticatedSession['user']> {
  const response = await request.get('http://localhost:3001/api/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as AuthenticatedSession['user'];
}

async function fetchFirstBrand(request: APIRequestContext, accessToken: string): Promise<IBrand> {
  const response = await request.get('http://localhost:3001/api/brands?limit=1', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  const payload = JSON.parse(body) as IPaginatedResponse<IBrand>;
  const [brand] = payload.data;
  expect(brand).toBeTruthy();
  return brand;
}

async function fetchMembers(request: APIRequestContext, accessToken: string): Promise<IOrganizationMember[]> {
  const response = await request.get('http://localhost:3001/api/organization/members', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as IOrganizationMember[];
}

async function createLead(
  request: APIRequestContext,
  accessToken: string,
  brandId: string,
  input: CreateLeadInput,
): Promise<LeadApiResponse> {
  const response = await request.post('http://localhost:3001/api/leads', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      title: input.title,
      brandId,
      ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.website ? { website: input.website } : {}),
      ...(input.source ? { source: input.source } : {}),
    },
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as LeadApiResponse;
}

function getLeadSheet(page: Page) {
  return page.locator('div.fixed.right-0.top-0.z-50').first();
}

async function openLeadSheet(page: Page, title: string): Promise<void> {
  const row = page.locator('tbody tr').filter({ hasText: title }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
  await expect(page.getByRole('button', { name: 'Edit lead' })).toBeVisible({ timeout: 10000 });
}

async function closeLeadSheet(page: Page): Promise<void> {
  const sheet = getLeadSheet(page);
  await sheet.locator('button.ml-4').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit lead' })).toHaveCount(0);
}

async function selectBrandInLeadModal(page: Page, brandName: string): Promise<void> {
  const dialog = page.getByRole('dialog').first();
  const brandSelect = dialog.getByRole('combobox').first();
  await brandSelect.click();
  await page.getByRole('option', { name: brandName }).click();
}

async function selectAssigneeInLeadModal(page: Page, assigneeName: string): Promise<void> {
  const dialog = page.getByRole('dialog').first();
  const assigneeSelect = dialog.getByRole('combobox').nth(1);
  await assigneeSelect.click();
  await page.getByRole('option', { name: assigneeName }).click();
}

async function loginThroughForm(page: Page, credentials: Credentials): Promise<void> {
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|app-picker)/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

async function createAuthenticatedPage(
  browser: Browser,
  credentials: Credentials,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginThroughForm(page, credentials);
  return { context, page };
}

async function getAccessToken(page: Page): Promise<string> {
  const accessToken = await page.evaluate(() => window.localStorage.getItem('accessToken'));
  if (!accessToken) {
    throw new Error('Missing access token after form login');
  }

  return accessToken;
}

test.describe('Lead module e2e', () => {
  test.describe.configure({ mode: 'serial' });

  let managerContext: BrowserContext;
  let managerPage: Page;
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let agentContext: BrowserContext;
  let agentPage: Page;
  let brand: IBrand;
  let agentUserId: string;
  let managerSession: AuthenticatedSession;

  async function openLeads(page: Page, search?: string): Promise<void> {
    const leadsUrl = search
      ? `/dashboard/leads?view=table&search=${encodeURIComponent(search)}`
      : '/dashboard/leads?view=table';

    await page.goto(leadsUrl);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible({ timeout: 10000 });
  }

  test.beforeAll(async ({ browser, request }) => {
    ({ context: managerContext, page: managerPage } = await createAuthenticatedPage(browser, managerCredentials));
    ({ context: ownerContext, page: ownerPage } = await createAuthenticatedPage(browser, ownerCredentials));
    ({ context: agentContext, page: agentPage } = await createAuthenticatedPage(browser, agentCredentials));

    const managerAccessToken = await getAccessToken(managerPage);
    managerSession = {
      accessToken: managerAccessToken,
      user: await fetchCurrentUser(request, managerAccessToken),
    };
    brand = await fetchFirstBrand(request, managerSession.accessToken);

    const members = await fetchMembers(request, managerSession.accessToken);
    const agentMember = members.find((member) => member.name === 'Agent Alex');
    expect(agentMember).toBeTruthy();
    agentUserId = agentMember!.id;
  });

  test.afterAll(async () => {
    await managerContext.close();
    await ownerContext.close();
    await agentContext.close();
  });

  test('TC-1: Create lead - happy path (as SALES_MANAGER)', async () => {
    const leadTitle = `TC1-Lead-${Date.now()}`;

    await openLeads(managerPage);
    await managerPage.getByRole('button', { name: 'New Lead' }).click();
    await managerPage.waitForLoadState('networkidle');
    await managerPage.getByPlaceholder('Lead title').fill(leadTitle);
    await selectBrandInLeadModal(managerPage, brand.name);
    await selectAssigneeInLeadModal(managerPage, 'Manager Sarah');
    await managerPage.getByRole('button', { name: 'Create Lead' }).click();
    await managerPage.waitForLoadState('networkidle');

    await openLeads(managerPage, leadTitle);
    await expect(managerPage.locator('tbody tr').filter({ hasText: leadTitle }).first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-2: Create lead - brandId missing shows validation error', async () => {
    const leadTitle = `TC2-Lead-${Date.now()}`;

    await openLeads(managerPage);
    const initialRowCount = await managerPage.locator('tbody tr').count();

    await managerPage.getByRole('button', { name: 'New Lead' }).click();
    await managerPage.waitForLoadState('networkidle');
    await managerPage.getByPlaceholder('Lead title').fill(leadTitle);
    await managerPage.getByRole('button', { name: 'Create Lead' }).click();

    await expect(managerPage.getByText('Brand is required')).toBeVisible({ timeout: 10000 });
    await expect(managerPage.locator('tbody tr')).toHaveCount(initialRowCount);

    await managerPage.getByRole('button', { name: 'Cancel' }).click();
    await managerPage.waitForLoadState('networkidle');
  });

  test('TC-3: Read lead detail', async ({ request }) => {
    const leadTitle = `TC3-Lead-${Date.now()}`;
    await createLead(request, managerSession.accessToken, brand.id, {
      title: leadTitle,
      assignedToId: managerSession.user.id,
    });

    await openLeads(managerPage, leadTitle);
    await openLeadSheet(managerPage, leadTitle);

    const sheet = getLeadSheet(managerPage);
    await expect(sheet.getByText(leadTitle)).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByText(/^New$/).first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-4: Edit lead', async ({ request }) => {
    const originalTitle = `TC4-Lead-${Date.now()}`;
    const updatedTitle = `${originalTitle}-Updated`;
    const leadName = `TC4 Name ${Date.now()}`;

    await createLead(request, managerSession.accessToken, brand.id, {
      title: originalTitle,
      assignedToId: managerSession.user.id,
      name: leadName,
      email: `tc4-${Date.now()}@example.com`,
      phone: '+15550001000',
      website: 'https://tc4.example.com',
      source: 'TC4',
    });

    await openLeads(managerPage, originalTitle);
    await expect(managerPage.locator('tbody tr button')).toHaveCount(0);

    await openLeadSheet(managerPage, originalTitle);
    const sheet = getLeadSheet(managerPage);
    await expect(sheet.getByText('Assign To')).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByRole('button', { name: 'Convert to Client' })).toBeVisible({ timeout: 10000 });

    await managerPage.getByRole('button', { name: 'Edit lead' }).click();
    await expect(managerPage.getByRole('heading', { name: 'Edit Lead' })).toBeVisible({ timeout: 10000 });
    await expect(managerPage.getByPlaceholder('Lead title')).toHaveValue(originalTitle);
    await expect(managerPage.getByPlaceholder('e.g. John Doe')).toHaveValue(leadName);

    await managerPage.getByPlaceholder('Lead title').fill(updatedTitle);
    await managerPage.getByRole('button', { name: 'Save Changes' }).click();
    await managerPage.waitForLoadState('networkidle');
    await expect(getLeadSheet(managerPage).getByText(updatedTitle)).toBeVisible({ timeout: 10000 });

    await closeLeadSheet(managerPage);
    await openLeads(managerPage, updatedTitle);
    await expect(managerPage.locator('tbody tr').filter({ hasText: updatedTitle }).first()).toBeVisible({ timeout: 10000 });

    await openLeadSheet(managerPage, updatedTitle);
    await expect(getLeadSheet(managerPage).getByText(updatedTitle)).toBeVisible({ timeout: 10000 });
  });

  test('TC-5: Delete lead (as ADMIN)', async ({ request }) => {
    const leadTitle = `TC5-Lead-${Date.now()}`;
    await createLead(request, managerSession.accessToken, brand.id, {
      title: leadTitle,
      assignedToId: managerSession.user.id,
    });

    await openLeads(ownerPage, leadTitle);
    const row = ownerPage.locator('tbody tr').filter({ hasText: leadTitle }).first();
    await expect(row).toBeVisible({ timeout: 10000 });

    const deleteResponsePromise = ownerPage.waitForResponse((response) => {
      return response.request().method() === 'DELETE' && /\/api\/leads\/[^/]+$/.test(response.url());
    });

    await row.locator('button').click();
    await ownerPage.getByRole('button', { name: 'Confirm' }).click();
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.ok()).toBeTruthy();
    await ownerPage.waitForLoadState('networkidle');
    await ownerPage.reload();
    await ownerPage.waitForLoadState('networkidle');

    await expect
      .poll(async () => ownerPage.locator('tbody tr').filter({ hasText: leadTitle }).count(), {
        timeout: 15000,
      })
      .toBe(0);
  });

  test('TC-6: Status change to FOLLOW_UP via detail sheet', async ({ request }) => {
    const leadTitle = `TC6-Lead-${Date.now()}`;
    const futureDate = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

    await createLead(request, managerSession.accessToken, brand.id, {
      title: leadTitle,
      assignedToId: managerSession.user.id,
    });

    await openLeads(managerPage, leadTitle);
    await openLeadSheet(managerPage, leadTitle);

    await getLeadSheet(managerPage).getByRole('button', { name: /FOLLOW_UP/ }).click();
    await expect(managerPage.getByRole('heading', { name: 'Set Follow-Up Date' })).toBeVisible({ timeout: 10000 });
    await managerPage.getByRole('dialog').locator('input[type="date"]').fill(futureDate);
    await managerPage.getByRole('button', { name: 'Confirm' }).click();
    await managerPage.waitForLoadState('networkidle');

    await expect(getLeadSheet(managerPage).getByText(/^FOLLOW_UP$/)).toBeVisible({ timeout: 10000 });
  });

  test('TC-7: Status change to non-FOLLOW_UP - no dialog appears', async ({ request }) => {
    const leadTitle = `TC7-Lead-${Date.now()}`;

    await createLead(request, managerSession.accessToken, brand.id, {
      title: leadTitle,
      assignedToId: managerSession.user.id,
    });

    await openLeads(managerPage, leadTitle);
    await openLeadSheet(managerPage, leadTitle);

    await getLeadSheet(managerPage).getByRole('button', { name: /CONTACTED/ }).click();
    await managerPage.waitForLoadState('networkidle');

    await expect(managerPage.getByRole('heading', { name: 'Set Follow-Up Date' })).toHaveCount(0);
    await expect(getLeadSheet(managerPage).getByText('Contacted')).toBeVisible({ timeout: 10000 });
  });

  test('TC-8: Permission gating - FRONTSELL_AGENT cannot see delete', async ({ request }) => {
    const leadTitle = `TC8-Lead-${Date.now()}`;

    await createLead(request, managerSession.accessToken, brand.id, {
      title: leadTitle,
      assignedToId: agentUserId,
    });

    await openLeads(agentPage, leadTitle);
    const row = agentPage.locator('tbody tr').filter({ hasText: leadTitle }).first();

    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByText('Assigned')).toBeVisible({ timeout: 10000 });
    await expect(row.locator('button')).toHaveCount(0);
  });

  test('TC-9: Permission gating - FRONTSELL_AGENT cannot see convert', async ({ request }) => {
    const leadTitle = `TC9-Lead-${Date.now()}`;

    await createLead(request, managerSession.accessToken, brand.id, {
      title: leadTitle,
      assignedToId: agentUserId,
    });

    await openLeads(agentPage, leadTitle);
    await openLeadSheet(agentPage, leadTitle);

    const sheet = getLeadSheet(agentPage);
    await expect(sheet.getByText('Assigned To')).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByText('Agent Alex')).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByRole('button', { name: 'Convert to Client' })).toHaveCount(0);
  });
});
