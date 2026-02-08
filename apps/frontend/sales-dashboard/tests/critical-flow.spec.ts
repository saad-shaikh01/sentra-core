import { test, expect } from '@playwright/test';

// Generate unique test data for each run
const testId = Date.now();
const testUser = {
  email: `e2e-test-${testId}@example.com`,
  password: 'TestPassword123!',
  name: `E2E Test User ${testId}`,
  organizationName: `E2E Test Org ${testId}`,
};

test.describe('Critical Flow - Frontend Refactor Verification', () => {
  test.describe.configure({ mode: 'serial' });

  test('1. Signup Flow - Create new account and organization', async ({ page }) => {
    // Navigate to signup page
    await page.goto('/auth/signup');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');

    // Verify we're on the signup page
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible({ timeout: 10000 });

    // Fill in signup form using input IDs
    await page.locator('#name').fill(testUser.name);
    await page.locator('#email').fill(testUser.email);
    await page.locator('#organizationName').fill(testUser.organizationName);
    await page.locator('#password').fill(testUser.password);
    await page.locator('#confirmPassword').fill(testUser.password);

    // Submit the form
    await page.getByRole('button', { name: /create account/i }).click();

    // Wait for redirect to dashboard (this confirms signup worked + auth state updated)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });

    // Verify dashboard loaded with user data (confirms useUser hook works)
    // User name appears multiple times (sidebar, welcome message, profile card)
    await expect(page.getByText(testUser.name).first()).toBeVisible({ timeout: 10000 });
  });

  test('2. Logout Flow - Clear auth state', async ({ page }) => {
    // First, login to have an active session
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#email').fill(testUser.email);
    await page.locator('#password').fill(testUser.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });

    // Find and click logout button (it has title="Logout")
    await page.locator('button[title="Logout"]').click();

    // Verify redirect to login page
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
  });

  test('3. Login Flow - Authenticate with existing credentials', async ({ page }) => {
    // Navigate to login page
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Verify we're on the login page
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({ timeout: 10000 });

    // Fill in login form
    await page.locator('#email').fill(testUser.email);
    await page.locator('#password').fill(testUser.password);

    // Submit the form
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });

    // Verify dashboard loaded (confirms login worked)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });
  });

  test('4. Profile Verification - useUser hook returns correct data', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#email').fill(testUser.email);
    await page.locator('#password').fill(testUser.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });

    // Navigate to profile settings
    await page.goto('/dashboard/settings/profile');
    await page.waitForLoadState('networkidle');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /profile settings/i })).toBeVisible({ timeout: 10000 });

    // Verify user data is displayed (confirms useUser hook works with React Query)
    await expect(page.getByText(testUser.name).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(testUser.email).first()).toBeVisible({ timeout: 10000 });
  });

  test('5. Team Page - TanStack Query fetches members list', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#email').fill(testUser.email);
    await page.locator('#password').fill(testUser.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });

    // Navigate to team settings
    await page.goto('/dashboard/settings/team');
    await page.waitForLoadState('networkidle');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /team management/i })).toBeVisible({ timeout: 10000 });

    // Verify members list loads (confirms useMembers hook with TanStack Query works)
    // The user who created the org should be listed as OWNER
    await expect(page.getByText(testUser.name).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/owner/i).first()).toBeVisible({ timeout: 10000 });
  });
});
