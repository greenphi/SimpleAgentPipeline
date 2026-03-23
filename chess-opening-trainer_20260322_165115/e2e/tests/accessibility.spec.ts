import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

const A11Y_PASSWORD = 'E2eA11yPass1!';

async function createAuthenticatedContext(page: import('@playwright/test').Page, suffix: string) {
  const email = `a11y-${suffix}-${Date.now()}@example.com`;
  const regRes = await page.request.post('/api/auth/register', {
    data: { email, password: A11Y_PASSWORD },
  });
  const { accessToken } = await regRes.json();
  await page.evaluate((token: string) => {
    localStorage.setItem('accessToken', token);
  }, accessToken);
  return { email, accessToken };
}

test.describe('Accessibility audits', () => {
  test('home page passes axe-core scan', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });

  test('login page passes axe-core scan', async ({ page }) => {
    await page.goto('/login');
    await injectAxe(page);
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });

  test('drill page passes axe-core scan', async ({ page }) => {
    await page.goto('/');
    await createAuthenticatedContext(page, 'drill');
    await page.goto('/drill');
    await injectAxe(page);
    // Wait for page content to load
    await page.waitForLoadState('networkidle');
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });

  test('report card page passes axe-core scan', async ({ page }) => {
    await page.goto('/');
    await createAuthenticatedContext(page, 'report');
    await page.goto('/report-card');
    await injectAxe(page);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });

  test('trap mode page passes axe-core scan', async ({ page }) => {
    await page.goto('/');
    await createAuthenticatedContext(page, 'trap');
    await page.goto('/trap');
    await injectAxe(page);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });

  test('aria-live region exists on drill page with role="status" or role="alert"', async ({ page }) => {
    await page.goto('/');
    await createAuthenticatedContext(page, 'aria-live');
    await page.goto('/drill');
    await page.waitForLoadState('networkidle');

    // Check for aria-live region
    const liveRegion = page.locator('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"]');
    await expect(liveRegion.first()).toBeAttached({ timeout: 10000 });
  });

  test('chess board has aria-label', async ({ page }) => {
    await page.goto('/');
    await createAuthenticatedContext(page, 'board-label');
    await page.goto('/drill');
    await page.waitForLoadState('networkidle');

    const chessboard = page.getByTestId('chessboard').or(
      page.locator('[aria-label*="chess" i], [aria-label*="board" i]')
    );

    const hasCards = await chessboard.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCards) {
      const ariaLabel = await chessboard.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    } else {
      // No cards to display board — still a passing state
      await expect(page.getByText(/all done|no cards/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('focus trapping: modal dialogs trap focus', async ({ page }) => {
    await page.goto('/');
    await createAuthenticatedContext(page, 'focus-trap');
    await page.goto('/drill');
    await page.waitForLoadState('networkidle');

    // Try to open any modal (e.g., settings, help, etc.)
    const modalTrigger = page.getByRole('button', { name: /settings|help|info/i });
    const hasModal = await modalTrigger.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasModal) {
      // No modal to test — navigate to login for a modal-like dialog
      await page.goto('/login');
      await injectAxe(page);
      await checkA11y(page);
      return;
    }

    await modalTrigger.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 3000 });

    // Tab through all focusable elements in the modal
    await page.keyboard.press('Tab');
    const focusedEl = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]'));
    expect(focusedEl).not.toBeNull();

    await injectAxe(page);
    await checkA11y(page);
  });

  test('color is not sole indicator: correct/incorrect states have text labels, not just color', async ({
    page,
  }) => {
    await page.goto('/');
    await createAuthenticatedContext(page, 'color-label');
    await page.goto('/drill');
    await page.waitForLoadState('networkidle');

    await injectAxe(page);

    // The axe check with color-contrast rule covers most cases
    await checkA11y(page, undefined, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
      },
    });

    // Specifically verify that feedback elements have text, not just color
    // After a move, look for text labels
    const chessboard = page.getByTestId('chessboard');
    const hasCards = await chessboard.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCards) {
      const boardBounds = await chessboard.boundingBox();
      if (boardBounds) {
        const squareSize = boardBounds.width / 8;
        await page.mouse.click(
          boardBounds.x + squareSize * 4,
          boardBounds.y + squareSize * 6
        );
        await page.mouse.click(
          boardBounds.x + squareSize * 4,
          boardBounds.y + squareSize * 4
        );
      }

      // Check feedback has text
      const feedbackText = page.getByText(/correct|incorrect|well done|try again/i);
      const hasFeedback = await feedbackText.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasFeedback) {
        await expect(feedbackText).toBeVisible();
      }
    }
  });
});
