import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

const TEST_EMAIL = `e2e-auth-${Date.now()}@example.com`;
const TEST_PASSWORD = 'E2eTestPass1!';

test.describe('Authentication flows', () => {
  test('user can register with email + password', async ({ page }) => {
    await page.goto('/register');
    await injectAxe(page);

    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).first().fill(TEST_PASSWORD);

    const confirmField = page.getByLabel(/confirm password/i);
    if (await confirmField.isVisible()) {
      await confirmField.fill(TEST_PASSWORD);
    }

    await page.getByRole('button', { name: /register|sign up|create account/i }).click();

    // Should redirect to dashboard or drill page after registration
    await expect(page).not.toHaveURL('/register');
    await checkA11y(page);
  });

  test('registered user can log in', async ({ page }) => {
    // Register first via API
    await page.request.post('/api/auth/register', {
      data: { email: `login-e2e-${Date.now()}@example.com`, password: TEST_PASSWORD },
    });

    const uniqueEmail = `login-e2e-${Date.now()}@example.com`;
    await page.request.post('/api/auth/register', {
      data: { email: uniqueEmail, password: TEST_PASSWORD },
    });

    await page.goto('/login');
    await injectAxe(page);

    await page.getByLabel(/email/i).fill(uniqueEmail);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    // Should navigate away from login on success
    await expect(page).not.toHaveURL('/login');
    await checkA11y(page);
  });

  test('logged-in user can access protected page', async ({ page }) => {
    const email = `protected-e2e-${Date.now()}@example.com`;

    // Register and set cookie
    const regRes = await page.request.post('/api/auth/register', {
      data: { email, password: TEST_PASSWORD },
    });
    const { accessToken } = await regRes.json();

    // Navigate to protected page with token
    await page.goto('/drill');
    await page.evaluate((token: string) => {
      localStorage.setItem('accessToken', token);
    }, accessToken);
    await page.reload();

    // Should be on the drill page, not redirected to login
    await expect(page).not.toHaveURL('/login');
    await injectAxe(page);
    await checkA11y(page);
  });

  test('user is redirected to login when accessing protected page unauthenticated', async ({ page }) => {
    // Clear any existing auth
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/drill');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
    await injectAxe(page);
    await checkA11y(page);
  });

  test('user can log out and is redirected', async ({ page }) => {
    const email = `logout-e2e-${Date.now()}@example.com`;

    const regRes = await page.request.post('/api/auth/register', {
      data: { email, password: TEST_PASSWORD },
    });
    const { accessToken } = await regRes.json();

    await page.goto('/drill');
    await page.evaluate((token: string) => {
      localStorage.setItem('accessToken', token);
    }, accessToken);
    await page.reload();

    // Click logout
    const logoutButton = page.getByRole('button', { name: /log out|sign out/i });
    await logoutButton.click();

    // Should be redirected to login or home
    await expect(page).toHaveURL(/\/login|\/$/);
    await injectAxe(page);
    await checkA11y(page);
  });

  test('JWT alg:none attack is blocked (send crafted request)', async ({ page }) => {
    // Craft a token with alg:none
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const payload = btoa(JSON.stringify({ userId: 'attacker-user-id', iat: Math.floor(Date.now() / 1000) }))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const algNoneToken = `${header}.${payload}.`;

    const response = await page.request.get('/api/drill/session', {
      headers: { authorization: `Bearer ${algNoneToken}` },
    });

    expect(response.status()).toBe(401);
    await injectAxe(page);
    await checkA11y(page);
  });
});
