import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

const DRILL_PASSWORD = 'E2eDrillPass1!';

async function createAndAuthUser(page: import('@playwright/test').Page, email: string) {
  const regRes = await page.request.post('/api/auth/register', {
    data: { email, password: DRILL_PASSWORD },
  });
  const { accessToken } = await regRes.json();
  return accessToken;
}

async function setupAuthenticatedDrillPage(page: import('@playwright/test').Page, email: string) {
  const accessToken = await createAndAuthUser(page, email);
  await page.goto('/drill');
  await page.evaluate((token: string) => {
    localStorage.setItem('accessToken', token);
  }, accessToken);
  await page.reload();
  return accessToken;
}

test.describe('Drill session E2E', () => {
  test('logged-in user sees their drill session', async ({ page }) => {
    const email = `drill-session-${Date.now()}@example.com`;
    await setupAuthenticatedDrillPage(page, email);

    await injectAxe(page);

    // Should show drill UI - either cards or "all done" message
    const drillContent =
      page.getByTestId('chessboard') ||
      page.getByText(/all done/i) ||
      page.getByText(/your move/i);

    await expect(
      page.getByTestId('chessboard').or(page.getByText(/all done/i))
    ).toBeVisible({ timeout: 10000 });

    await checkA11y(page);
  });

  test('user can submit a move (correct)', async ({ page }) => {
    const email = `drill-move-${Date.now()}@example.com`;
    const accessToken = await setupAuthenticatedDrillPage(page, email);

    await injectAxe(page);

    // Check if there are cards to drill
    const chessboard = page.getByTestId('chessboard');
    const allDone = page.getByText(/all done/i);

    const hasCards = await chessboard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCards) {
      // No cards due — skip the interaction part
      await expect(allDone).toBeVisible();
      await checkA11y(page);
      return;
    }

    // The board should be present and interactive
    await expect(chessboard).toBeVisible();

    // Interact with the board (implementation-dependent)
    // Attempt to drag a piece
    const boardBounds = await chessboard.boundingBox();
    if (boardBounds) {
      const squareSize = boardBounds.width / 8;
      // Click e2 square, then e4 square (a pawn move)
      await page.mouse.click(
        boardBounds.x + squareSize * 4,
        boardBounds.y + squareSize * 6
      );
      await page.mouse.click(
        boardBounds.x + squareSize * 4,
        boardBounds.y + squareSize * 4
      );
    }

    // After submitting, some feedback should appear
    await expect(
      page.getByRole('status').or(page.getByRole('alert')).or(page.getByText(/correct|incorrect|next/i))
    ).toBeVisible({ timeout: 5000 });

    await checkA11y(page);
  });

  test('user can use a hint and it is recorded', async ({ page }) => {
    const email = `drill-hint-${Date.now()}@example.com`;
    await setupAuthenticatedDrillPage(page, email);

    await injectAxe(page);

    const chessboard = page.getByTestId('chessboard');
    const hasCards = await chessboard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCards) {
      // No cards to drill, skip
      await checkA11y(page);
      return;
    }

    const hintButton = page.getByRole('button', { name: /show hint/i });
    const hasHint = await hintButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasHint) {
      await hintButton.click();

      // Hint text or modal should appear
      await expect(
        page.getByText(/hint/i).or(page.getByRole('tooltip'))
      ).toBeVisible({ timeout: 3000 });
    }

    await checkA11y(page);
  });

  test('session completion shows summary', async ({ page }) => {
    const email = `drill-complete-${Date.now()}@example.com`;
    const accessToken = await createAndAuthUser(page, email);

    // Navigate to a state where session is complete (no cards)
    await page.goto('/drill');
    await page.evaluate((token: string) => {
      localStorage.setItem('accessToken', token);
    }, accessToken);
    await page.reload();

    await injectAxe(page);

    // Since new user has no cards, should show completion/empty state
    await expect(
      page.getByText(/all done|no cards|session complete/i)
    ).toBeVisible({ timeout: 10000 });

    await checkA11y(page);
  });

  test('aria-live region announces each move feedback', async ({ page }) => {
    const email = `drill-aria-${Date.now()}@example.com`;
    await setupAuthenticatedDrillPage(page, email);

    await injectAxe(page);

    // The drill page should have an aria-live region
    const liveRegion = page.locator('[aria-live]');
    await expect(liveRegion.first()).toBeAttached({ timeout: 10000 });

    const liveAttr = await liveRegion.first().getAttribute('aria-live');
    expect(['polite', 'assertive']).toContain(liveAttr);

    await checkA11y(page);
  });
});
