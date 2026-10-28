const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
test('Windows first run opens even when media-session discovery never returns', async ({
  browser,
}) => {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36',
  });
  const names = [
    ...fs
      .readFileSync(path.join(__dirname, '../src/api.js'), 'utf8')
      .matchAll(/export const (\w+)/g),
  ].map((x) => x[1]);
  const mocks = {
    IS_NATIVE: 'true',
    prefs: 'async()=>({})',
    keyStatus: 'async()=>false',
    bookmarks: 'async()=>[]',
    downloads: 'async()=>[]',
    notes: 'async()=>[]',
    spotifyState: 'async()=>new Promise(()=>{})',
    spotifyAPIStatus: 'async()=>({})',
    chatStatus: 'async()=>({providers:{}})',
    mcpStatus: 'async()=>({enabled:false})',
  };
  await page.route('**/src/api.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.goto('http://127.0.0.1:5174');
  await expect(page.locator('.setup')).toBeVisible({ timeout: 7000 });
  await expect(page.locator('#splash')).toHaveClass(/gone/);
  await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Luna kennenlernen' }).click();
  await expect(page.getByRole('radio', { name: 'Google', exact: true })).toBeVisible();
  await page.close();
});
