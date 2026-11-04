const { test, expect } = require('@playwright/test');

async function boot(page, age = null, dismissed = false) {
  await page.route('**/star-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="host"></div>' }),
  );
  await page.goto('http://127.0.0.1:5174/star-test');
  await page.evaluate(
    async ({ age, dismissed }) => {
      const { initStarPrompt, STAR_PROMPT_KEY } = await import('/src/star-prompt.js');
      window.testNow = Date.now();
      if (age !== null)
        localStorage.setItem(
          STAR_PROMPT_KEY,
          JSON.stringify({ firstUsedAt: window.testNow - age, dismissed }),
        );
      initStarPrompt({
        host: document.querySelector('#host'),
        now: () => window.testNow,
        openURL: (url) => {
          window.openedURL = url;
        },
      });
    },
    { age, dismissed },
  );
}

test('waits more than two days, including within an open session', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#lunaStarPrompt')).toBeHidden();
  await page.evaluate(() => {
    window.testNow += 48 * 60 * 60 * 1000;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#lunaStarPrompt')).toBeHidden();
  await page.evaluate(() => {
    window.testNow += 1;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Gefällt dir Luna?' })).toBeVisible();
});

test('asks for a star only after positive feedback and opens the correct repo', async ({
  page,
}) => {
  await boot(page, 49 * 60 * 60 * 1000);
  await page.getByRole('button', { name: 'Gefällt dir Luna?' }).click();
  expect(await page.evaluate(() => window.openedURL)).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Nicht mehr fragen' })).toBeVisible();
  await page.getByRole('button', { name: 'Ja? Gib Luna einen GitHub-Stern!' }).click();
  expect(await page.evaluate(() => window.openedURL)).toBe(
    'https://github.com/fcore247/luna-browser',
  );
  await expect(page.locator('#lunaStarPrompt')).toHaveCount(0);
});

test('dismissal persists across restarts', async ({ page }) => {
  await boot(page, 49 * 60 * 60 * 1000);
  await page.getByRole('button', { name: 'Nicht mehr fragen' }).click();
  await page.reload();
  await page.evaluate(async () => {
    const { initStarPrompt } = await import('/src/star-prompt.js');
    initStarPrompt({ host: document.querySelector('#host'), openURL: () => {} });
  });
  await expect(page.locator('#lunaStarPrompt')).toHaveCount(0);
});
