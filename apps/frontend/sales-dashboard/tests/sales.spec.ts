import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';
import type { IBrand, IClient, IPaginatedResponse, ISale, ISaleWithRelations, IUserProfile } from '@sentra-core/types';

interface Credentials {
  email: string;
  password: string;
}

interface AuthenticatedSession {
  accessToken: string;
  user: Pick<IUserProfile, 'id'>;
}

interface LeadResponse {
  id: string;
  convertedClientId?: string;
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

const pmCredentials: Credentials = {
  email: 'hira@sentra.com',
  password: 'PmLead@123',
};

function verificationPath(filename: string): string {
  const verificationDir = path.resolve(process.cwd(), '../../..', 'docs/verification');
  mkdirSync(verificationDir, { recursive: true });
  return path.join(verificationDir, filename);
}

async function renderEvidenceScreenshot(
  page: Page,
  title: string,
  sections: Array<{ label: string; value: string }>,
  outputPath: string,
): Promise<void> {
  const evidencePage = await page.context().newPage();
  const sectionHtml = sections
    .map(
      (section) => `
        <section>
          <h2>${section.label}</h2>
          <pre>${section.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </section>
      `,
    )
    .join('');

  await evidencePage.setContent(`
    <html>
      <head>
        <style>
          body {
            background: #0b1020;
            color: #f5f7ff;
            font-family: Consolas, monospace;
            margin: 0;
            padding: 32px;
          }
          h1 {
            margin: 0 0 24px;
            font-size: 24px;
          }
          h2 {
            margin: 24px 0 8px;
            font-size: 16px;
          }
          pre {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 12px;
            margin: 0;
            padding: 16px;
            white-space: pre-wrap;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${sectionHtml}
      </body>
    </html>
  `);
  await evidencePage.screenshot({ path: outputPath, fullPage: true });
  await evidencePage.close();
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
  const user = JSON.parse(body) as IUserProfile;
  return { id: user.id };
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

async function fetchFirstClient(request: APIRequestContext, accessToken: string): Promise<IClient> {
  const response = await request.get('http://localhost:3001/api/clients?limit=1', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  const payload = JSON.parse(body) as IPaginatedResponse<IClient>;
  const [client] = payload.data;
  expect(client).toBeTruthy();
  return client;
}

async function createLead(
  request: APIRequestContext,
  accessToken: string,
  brandId: string,
  assignedToId: string,
  email: string,
): Promise<LeadResponse> {
  const response = await request.post('http://localhost:3001/api/leads', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      title: `Sales Agent Lead ${Date.now()}`,
      brandId,
      assignedToId,
      name: 'Agent Visible Lead',
      email,
      phone: '+15550000000',
      source: 'SalesSpec',
    },
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as LeadResponse;
}

async function convertLead(
  request: APIRequestContext,
  accessToken: string,
  leadId: string,
  email: string,
): Promise<LeadResponse> {
  const response = await request.post(`http://localhost:3001/api/leads/${leadId}/convert`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      email,
      password: 'Client123!',
      companyName: `Sales Spec Client ${Date.now()}`,
      contactName: 'Agent Visible Client',
      phone: '+15550000001',
    },
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as LeadResponse;
}

async function createSale(
  request: APIRequestContext,
  accessToken: string,
  dto: Record<string, unknown>,
): Promise<ISale> {
  const response = await request.post('http://localhost:3001/api/sales', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: dto,
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as ISale;
}

async function createAgentVisibleSale(
  request: APIRequestContext,
  accessToken: string,
  brandId: string,
  assignedToId: string,
  totalAmount: number,
): Promise<ISale> {
  const emailToken = Date.now();
  const leadEmail = `sales-agent-lead-${emailToken}@example.com`;
  const clientEmail = `sales-agent-client-${emailToken}@example.com`;
  const lead = await createLead(request, accessToken, brandId, assignedToId, leadEmail);
  const convertedLead = await convertLead(request, accessToken, lead.id, clientEmail);

  if (!convertedLead.convertedClientId) {
    throw new Error('Lead conversion did not return convertedClientId');
  }

  return createSale(request, accessToken, {
    clientId: convertedLead.convertedClientId,
    brandId,
    totalAmount,
    currency: 'USD',
    description: `Agent visible sale ${totalAmount}`,
    paymentPlan: 'SUBSCRIPTION',
  });
}

function getSaleSheet(page: Page): Locator {
  return page.locator('div.fixed.right-0.top-0.z-50').first();
}

function getSaleRow(page: Page, amount: number): Locator {
  return page.locator('tbody tr').filter({ hasText: String(amount) }).first();
}

async function openSales(page: Page): Promise<void> {
  await page.goto('/dashboard/sales');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible({ timeout: 10000 });
}

async function openSaleDetail(page: Page, amount: number): Promise<void> {
  const row = getSaleRow(page, amount);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
  await expect(getSaleSheet(page)).toBeVisible({ timeout: 10000 });
}

async function closeSaleDetail(page: Page): Promise<void> {
  const sheet = getSaleSheet(page);
  await sheet.locator('button.ml-4').click();
  await expect(sheet).toHaveCount(0);
}

async function closeBrowserContext(context: BrowserContext | undefined): Promise<void> {
  if (!context) {
    return;
  }

  try {
    await context.close();
  } catch {
    // The browser may already be shutting down after a failed test.
  }
}

async function selectSaleModalClient(page: Page, clientName: string): Promise<void> {
  const dialog = page.getByRole('dialog').first();
  const clientSelect = dialog.getByRole('combobox').first();
  await clientSelect.click();
  await page.getByRole('option', { name: clientName }).click();
}

async function selectSaleModalBrand(page: Page, brandName: string): Promise<void> {
  const dialog = page.getByRole('dialog').first();
  const brandSelect = dialog.getByRole('combobox').nth(1);
  await brandSelect.click();
  await page.getByRole('option', { name: brandName }).click();
}

function buildSaleDetail(
  sale: ISale,
  client: IClient,
  brand: IBrand,
  overrides: Partial<ISaleWithRelations> = {},
): ISaleWithRelations {
  return {
    ...sale,
    items: sale.items ?? [],
    client,
    invoices: [],
    transactions: [],
    customerProfileId: undefined,
    paymentProfileId: undefined,
    subscriptionId: undefined,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
    brandId: brand.id,
    ...overrides,
  };
}

test.describe('Sales module e2e', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  let managerContext!: BrowserContext;
  let managerPage!: Page;
  let ownerContext!: BrowserContext;
  let ownerPage!: Page;
  let agentContext!: BrowserContext;
  let agentPage!: Page;
  let managerSession!: AuthenticatedSession;
  let brand!: IBrand;
  let client!: IClient;
  let agentUserId!: string;

  test.beforeAll(async ({ browser, request }) => {
    const [managerSessionPage, ownerSessionPage, agentSessionPage] = await Promise.all([
      createAuthenticatedPage(browser, managerCredentials),
      createAuthenticatedPage(browser, ownerCredentials),
      createAuthenticatedPage(browser, agentCredentials),
    ]);

    ({ context: managerContext, page: managerPage } = managerSessionPage);
    ({ context: ownerContext, page: ownerPage } = ownerSessionPage);
    ({ context: agentContext, page: agentPage } = agentSessionPage);

    const managerAccessToken = await getAccessToken(managerPage);
    managerSession = {
      accessToken: managerAccessToken,
      user: await fetchCurrentUser(request, managerAccessToken),
    };

    brand = await fetchFirstBrand(request, managerSession.accessToken);
    client = await fetchFirstClient(request, managerSession.accessToken);

    const membersResponse = await request.get('http://localhost:3001/api/organization/members', {
      headers: {
        Authorization: `Bearer ${managerSession.accessToken}`,
      },
    });
    const membersBody = await membersResponse.text();
    expect(membersResponse.ok(), membersBody).toBeTruthy();
    const members = JSON.parse(membersBody) as Array<Pick<IUserProfile, 'id' | 'name'>>;
    const agentMember = members.find((member) => member.name === 'Agent Alex');
    expect(agentMember).toBeTruthy();
    agentUserId = agentMember?.id ?? '';
  });

  test.afterAll(async () => {
    await closeBrowserContext(managerContext);
    await closeBrowserContext(ownerContext);
    await closeBrowserContext(agentContext);
  });

  test('TC-1: Create sale - Simple Sale happy path', async () => {
    const totalAmount = Number(`51${Date.now().toString().slice(-3)}`);

    await openSales(managerPage);
    await managerPage.getByRole('button', { name: 'Simple Sale' }).click();
    await managerPage.waitForLoadState('networkidle');
    await selectSaleModalClient(managerPage, client.companyName);
    await selectSaleModalBrand(managerPage, brand.name);
    await managerPage.getByPlaceholder('0.00').fill(String(totalAmount));
    await managerPage.getByRole('button', { name: 'Create Sale' }).click();
    await managerPage.waitForLoadState('networkidle');

    await openSales(managerPage);
    await expect(getSaleRow(managerPage, totalAmount)).toBeVisible({ timeout: 10000 });
  });

  test('TC-2: Read sale detail', async ({ request }) => {
    const totalAmount = Number(`52${Date.now().toString().slice(-3)}`);

    await createSale(request, managerSession.accessToken, {
      clientId: client.id,
      brandId: brand.id,
      totalAmount,
      currency: 'USD',
      description: 'TC-2 detail sale',
      paymentPlan: 'SUBSCRIPTION',
    });

    await openSales(managerPage);
    await openSaleDetail(managerPage, totalAmount);

    const sheet = getSaleSheet(managerPage);
    await expect(sheet.getByText(client.companyName)).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByText(`$${totalAmount}`, { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByText('Status: PENDING')).toBeVisible({ timeout: 10000 });
  });

  test('TC-3: Quick Sale create with contract upload', async () => {
    const totalAmount = Number(`53${Date.now().toString().slice(-3)}`);
    const uploadArtifactPath = verificationPath('sale-upload-network.png');

    await openSales(managerPage);
    await managerPage.getByRole('button', { name: 'Quick Sale' }).click();
    await managerPage.waitForLoadState('networkidle');

    await selectSaleModalClient(managerPage, client.companyName);
    await selectSaleModalBrand(managerPage, brand.name);
    await managerPage.getByPlaceholder('Item name').fill(`TC3 Item ${totalAmount}`);
    await managerPage
      .locator('input[type="number"]')
      .nth(1)
      .fill(String(totalAmount));
    await managerPage.getByRole('button', { name: /^Next$/ }).click();
    await managerPage.waitForLoadState('networkidle');
    await managerPage.getByRole('button', { name: /^Next$/ }).click();
    await managerPage.waitForLoadState('networkidle');

    const uploadResponsePromise = managerPage.waitForResponse((response) => {
      return response.request().method() === 'POST' && response.url().includes('/api/sales/upload/contract');
    });

    await managerPage.locator('input[type="file"]').setInputFiles({
      name: 'tc3-contract.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'),
    });
    await managerPage.getByRole('button', { name: 'Upload Contract' }).click();

    const uploadResponse = await uploadResponsePromise;
    const uploadContentType = uploadResponse.request().headers()['content-type'];
    const uploadBody = (await uploadResponse.json()) as { url: string };

    expect(uploadContentType).toContain('multipart/form-data');
    expect(uploadContentType).toContain('boundary=');
    expect(uploadResponse.ok()).toBeTruthy();
    expect(uploadBody.url).toBeTruthy();

    await renderEvidenceScreenshot(
      managerPage,
      'Sales Contract Upload Network Evidence',
      [
        { label: 'Request Content-Type', value: uploadContentType },
        { label: 'Response Status', value: String(uploadResponse.status()) },
        { label: 'Response Body', value: JSON.stringify(uploadBody, null, 2) },
      ],
      uploadArtifactPath,
    );

    await expect(managerPage.getByText('Contract uploaded')).toBeVisible({ timeout: 10000 });
    const createResponsePromise = managerPage.waitForResponse((response) => {
      return response.request().method() === 'POST' && /\/api\/sales$/.test(response.url());
    });
    await managerPage.getByRole('button', { name: 'Create Sale' }).click();
    const createResponse = await createResponsePromise;
    const createBody = (await createResponse.json()) as ISale;

    expect(createResponse.ok()).toBeTruthy();
    expect(createBody.totalAmount).toBe(totalAmount);
    await managerPage.waitForLoadState('networkidle');

    await openSales(managerPage);
    await expect(getSaleRow(managerPage, totalAmount)).toBeVisible({ timeout: 10000 });
  });

  test('TC-4: Delete sale succeeds and Charge Now stays hidden without payment profiles', async ({ request }) => {
    const totalAmount = Number(`54${Date.now().toString().slice(-3)}`);
    const chargeArtifactPath = verificationPath('sale-charge-gating-no-profiles.png');

    await createSale(request, managerSession.accessToken, {
      clientId: client.id,
      brandId: brand.id,
      totalAmount,
      currency: 'USD',
      description: 'TC-4 delete sale',
      paymentPlan: 'SUBSCRIPTION',
    });

    await openSales(ownerPage);
    await openSaleDetail(ownerPage, totalAmount);

    const sheet = getSaleSheet(ownerPage);
    await expect(
      sheet.getByText('This sale cannot be charged yet because both customer and payment profiles are required.'),
    ).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByRole('button', { name: 'Charge Now' })).toHaveCount(0);
    await sheet.screenshot({ path: chargeArtifactPath });

    await closeSaleDetail(ownerPage);

    const row = getSaleRow(ownerPage, totalAmount);
    const deleteResponsePromise = ownerPage.waitForResponse((response) => {
      return response.request().method() === 'DELETE' && /\/api\/sales\/[^/]+$/.test(response.url());
    });

    await row.locator('button').nth(1).click();
    await ownerPage.getByRole('button', { name: 'Confirm' }).click();
    const deleteResponse = await deleteResponsePromise;

    expect(deleteResponse.ok()).toBeTruthy();
    await ownerPage.waitForLoadState('networkidle');
    await ownerPage.reload();
    await ownerPage.waitForLoadState('networkidle');

    await expect(getSaleRow(ownerPage, totalAmount)).toHaveCount(0);
  });

  test('TC-5: Edit sale PATCH body excludes clientId and brandId', async ({ request }) => {
    const originalAmount = Number(`55${Date.now().toString().slice(-3)}`);
    const updatedAmount = originalAmount + 17;

    await createSale(request, managerSession.accessToken, {
      clientId: client.id,
      brandId: brand.id,
      totalAmount: originalAmount,
      currency: 'USD',
      description: 'TC-5 edit sale',
      paymentPlan: 'SUBSCRIPTION',
    });

    await openSales(managerPage);
    const row = getSaleRow(managerPage, originalAmount);
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.locator('button')).toHaveCount(1);
    await row.locator('button').first().click();

    const dialog = managerPage.getByRole('dialog').first();
    await expect(managerPage.getByRole('heading', { name: 'Edit Sale' })).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.getByText(client.companyName)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(brand.name)).toBeVisible({ timeout: 10000 });

    const patchResponsePromise = managerPage.waitForResponse((response) => {
      return response.request().method() === 'PATCH' && /\/api\/sales\/[^/]+$/.test(response.url());
    });

    await dialog.getByPlaceholder('0.00').fill(String(updatedAmount));
    await dialog.getByRole('button', { name: 'Save Changes' }).click();

    const patchResponse = await patchResponsePromise;
    const patchBody = patchResponse.request().postDataJSON() as Record<string, unknown>;

    expect(patchResponse.ok()).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(patchBody, 'clientId')).toBeFalsy();
    expect(Object.prototype.hasOwnProperty.call(patchBody, 'brandId')).toBeFalsy();
    expect(patchBody.totalAmount).toBe(updatedAmount);

    await managerPage.waitForLoadState('networkidle');
    await openSales(managerPage);
    await expect(getSaleRow(managerPage, updatedAmount)).toBeVisible({ timeout: 10000 });
  });

  test('TC-6: Subscribe and cancel refresh sale detail without cache corruption', async ({ request }) => {
    const totalAmount = Number(`56${Date.now().toString().slice(-3)}`);
    const sale = await createSale(request, managerSession.accessToken, {
      clientId: client.id,
      brandId: brand.id,
      totalAmount,
      currency: 'USD',
      description: 'TC-6 subscription flow',
      paymentPlan: 'SUBSCRIPTION',
    });
    const subscribeUrl = `http://localhost:3001/api/sales/${sale.id}/subscribe`;
    const cancelUrl = `http://localhost:3001/api/sales/${sale.id}/cancel-subscription`;
    const detailUrl = `http://localhost:3001/api/sales/${sale.id}`;
    let currentDetail = buildSaleDetail(sale, client, brand, {
      customerProfileId: 'cust-profile-123',
      paymentProfileId: 'pay-profile-123',
    });

    await ownerPage.route(detailUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentDetail),
      });
    });

    await ownerPage.route(subscribeUrl, async (route) => {
      currentDetail = {
        ...currentDetail,
        subscriptionId: 'sub-test-123',
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ subscriptionId: 'sub-test-123' }),
      });
    });

    await ownerPage.route(cancelUrl, async (route) => {
      currentDetail = {
        ...currentDetail,
        subscriptionId: undefined,
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Subscription cancelled successfully' }),
      });
    });

    await openSales(ownerPage);
    await openSaleDetail(ownerPage, totalAmount);

    const subscribeResponsePromise = ownerPage.waitForResponse(subscribeUrl);
    await getSaleSheet(ownerPage).getByRole('button', { name: 'Subscribe' }).click();
    const subscribeDialog = ownerPage.getByRole('dialog').last();
    await subscribeDialog.getByPlaceholder('Monthly Plan').fill('TC-6 Plan');
    await subscribeDialog.getByPlaceholder('1', { exact: true }).fill('1');
    await subscribeDialog
      .locator('input[type="date"]')
      .fill(new Date(Date.now() + 86_400_000).toISOString().split('T')[0]);
    await subscribeDialog.getByPlaceholder('12', { exact: true }).fill('12');
    await subscribeDialog.getByPlaceholder('0.00', { exact: true }).fill('99.99');
    await subscribeDialog.getByRole('button', { name: 'Create Subscription' }).click();
    const subscribeResponse = await subscribeResponsePromise;

    expect(subscribeResponse.ok()).toBeTruthy();
    await ownerPage.waitForLoadState('networkidle');
    await expect(getSaleSheet(ownerPage).getByText('sub-test-123')).toBeVisible({ timeout: 10000 });

    const cancelResponsePromise = ownerPage.waitForResponse(cancelUrl);
    await getSaleSheet(ownerPage).getByRole('button', { name: 'Cancel' }).click();
    await ownerPage.getByRole('button', { name: 'Confirm' }).click();
    const cancelResponse = await cancelResponsePromise;

    expect(cancelResponse.ok()).toBeTruthy();
    expect(cancelResponse.request().method()).toBe('POST');

    await ownerPage.waitForLoadState('networkidle');
    await expect(getSaleSheet(ownerPage).getByText('sub-test-123')).toHaveCount(0);
    await expect(getSaleSheet(ownerPage).getByRole('button', { name: 'Subscribe' })).toBeVisible({ timeout: 10000 });

    await ownerPage.unroute(detailUrl);
    await ownerPage.unroute(subscribeUrl);
    await ownerPage.unroute(cancelUrl);
  });

  test('TC-7: Delete invoiced sale shows invoice-specific error toast', async ({ request }) => {
    const totalAmount = Number(`57${Date.now().toString().slice(-3)}`);

    await createSale(request, managerSession.accessToken, {
      clientId: client.id,
      brandId: brand.id,
      totalAmount,
      currency: 'USD',
      description: 'TC-7 invoiced sale',
      paymentPlan: 'ONE_TIME',
    });

    await openSales(ownerPage);
    const row = getSaleRow(ownerPage, totalAmount);
    await expect(row).toBeVisible({ timeout: 10000 });

    const deleteResponsePromise = ownerPage.waitForResponse((response) => {
      return response.request().method() === 'DELETE' && /\/api\/sales\/[^/]+$/.test(response.url());
    });

    await row.locator('button').nth(1).click();
    await ownerPage.getByRole('button', { name: 'Confirm' }).click();
    const deleteResponse = await deleteResponsePromise;

    expect(deleteResponse.status()).toBe(400);
    await expect(
      ownerPage.getByText('This sale already has invoice(s). Delete the related invoice(s) first.'),
    ).toBeVisible({ timeout: 10000 });
    await expect(getSaleRow(ownerPage, totalAmount)).toBeVisible({ timeout: 10000 });
  });

  test('TC-8: Permission gating - FRONTSELL_AGENT cannot see create, edit, or delete controls', async ({ request }) => {
    const totalAmount = Number(`58${Date.now().toString().slice(-3)}`);

    await createAgentVisibleSale(
      request,
      managerSession.accessToken,
      brand.id,
      agentUserId,
      totalAmount,
    );

    await openSales(agentPage);
    await expect(agentPage.getByRole('button', { name: 'Simple Sale' })).toHaveCount(0);
    await expect(agentPage.getByRole('button', { name: 'Quick Sale' })).toHaveCount(0);

    const row = getSaleRow(agentPage, totalAmount);
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.locator('button')).toHaveCount(0);
  });

  test('TC-9: Permission gating - FRONTSELL_AGENT cannot see charge, subscribe, or cancel controls', async ({ request }) => {
    const totalAmount = Number(`59${Date.now().toString().slice(-3)}`);

    await createAgentVisibleSale(
      request,
      managerSession.accessToken,
      brand.id,
      agentUserId,
      totalAmount,
    );

    await openSales(agentPage);
    await openSaleDetail(agentPage, totalAmount);

    const sheet = getSaleSheet(agentPage);
    await expect(sheet.getByRole('button', { name: 'Charge Now' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Subscribe' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await expect(
      sheet.getByText('This sale cannot be charged yet because both customer and payment profiles are required.'),
    ).toHaveCount(0);
  });
});
