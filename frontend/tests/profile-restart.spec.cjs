const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
test('saved access and deferred setup survive restarting the local browser', async ({ page }) => {
  const names = [
    ...fs
      .readFileSync(path.join(__dirname, '../src/api.js'), 'utf8')
      .matchAll(/export const (\w+)/g),
  ].map((x) => x[1]);
  const mocks = {
    IS_NATIVE: 'true',
    prefs: 'async()=>JSON.parse(localStorage.getItem("test-prefs")||"{}")',
    setPref:
      'async(k,v)=>{const p=JSON.parse(localStorage.getItem("test-prefs")||"{}");p[k]=v;localStorage.setItem("test-prefs",JSON.stringify(p));return p}',
    keyStatus: 'async()=>true',
    keySet: 'async()=>{throw Error("Saved key must not be requested again")}',
    mcpStatus: 'async()=>({enabled:false})',
    bookmarks: 'async()=>[]',
    downloads: 'async()=>[]',
    history: 'async()=>[]',
    notes: 'async()=>[]',
    spotifyState: 'async()=>({status:"stopped"})',
    spotifyAPIStatus: 'async()=>({configured:true,connected:true})',
    chatStatus: 'async()=>({providers:{groq:true}})',
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.goto('http://127.0.0.1:5174');
  await expect(page.locator('.setup')).toBeVisible();
  await page.getByRole('button', { name: 'Später fortsetzen', exact: true }).click();
  await expect(page.locator('.setup')).toHaveCount(0);
  await expect(page.locator('.st-status')).toContainText('Luna Search · bereit');
  await page.reload();
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await expect(page.locator('.st-status')).toContainText('Luna Search · bereit');
  await expect(page.locator('.setup')).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('test-prefs')).onboardingDeferred),
  ).toBe(true);
});
