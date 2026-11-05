const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function openSearch(page, reducedMotion = 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript(() => {
    localStorage.setItem('luna-onboarding-done', '1');
    localStorage.setItem('luna-language', 'en');
    window.searchCalls = 0;
  });
  const names = [
    ...fs
      .readFileSync(path.join(__dirname, '../src/api.js'), 'utf8')
      .matchAll(/export const (\w+)/g),
  ].map((m) => m[1]);
  const mocks = {
    IS_NATIVE: 'false',
    prefs: 'async()=>({})',
    mcpStatus: 'async()=>({enabled:false,running:false})',
    keyStatus: 'async()=>true',
    bookmarks: 'async()=>[]',
    history: 'async()=>[]',
    downloads: 'async()=>[]',
    notes: 'async()=>[]',
    spotifyState: 'async()=>({status:"stopped"})',
    search:
      'async q=>{window.searchCalls++;return {query:q,provider:"Brave",results:[{title:"Coast",url:"https://example.com/",host:"example.com",desc:"A coast"}],millis:10}}',
    searchImages:
      'q=>new Promise(resolve=>{window.finishImages=()=>resolve({query:q,images:[1,2].map(n=>({title:"Coast "+n,host:"example.com",url:"https://example.com/",thumb:"https://images.example/"+n+".svg",full:"https://images.example/"+n+".svg",w:400,h:300}))})})',
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.route('https://images.example/**', (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="teal"/></svg>',
    }),
  );
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
}

test('time search runs locally and the flip disk matrix keeps ticking', async ({ page }) => {
  await openSearch(page);
  await page.locator('#url').fill('time');
  await page.locator('#url').press('Enter');
  await expect(page.locator('.fm-screen')).toBeVisible();
  await expect(page.locator('.fm-disk')).toHaveCount(341);
  const lit = await page.locator('.fm-screen').innerHTML();
  await expect.poll(() => page.locator('.fm-screen').innerHTML()).not.toBe(lit);
  expect(await page.evaluate(() => window.searchCalls)).toBe(0);
  await expect(page.locator('#urlPills')).toBeHidden();
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`image search loads, translates and navigates with ${reducedMotion}`, async ({ page }) => {
    await openSearch(page, reducedMotion);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('#url').fill('coast');
    await page.locator('#url').press('Enter');
    const pills = page.locator('#urlPills');
    await expect(pills).toBeVisible();
    await pills.locator('[data-k="images"]').click();
    await expect(page.locator('.tn-title')).toContainText('Luna is searching');
    if (reducedMotion === 'reduce') {
      expect(
        await page
          .locator('.tn-card')
          .first()
          .evaluate((el) => getComputedStyle(el).display),
      ).toBe('none');
      expect(
        await page.locator('.tn-copy').evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('none');
    }
    await page.evaluate(() => window.finishImages());
    await expect(page.locator('.im')).toHaveCount(2);
    await expect(page.locator('.fog-veil')).toHaveCount(0);
    await page.locator('.im').first().click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Coast 1');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Visit page' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Coast 2');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Coast 1');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
