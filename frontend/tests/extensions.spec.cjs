const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
test('extension install requires an explicit reviewed permission step', async ({ page }) => {
  const names = [
    ...fs
      .readFileSync(path.join(__dirname, '../src/api.js'), 'utf8')
      .matchAll(/export const (\w+)/g),
  ].map((x) => x[1]);
  const mocks = {
    IS_NATIVE: 'false',
    prefs: 'async()=>({})',
    mcpStatus: 'async()=>({enabled:false,running:false})',
    keyStatus: 'async()=>false',
    bookmarks: 'async()=>[]',
    history: 'async()=>[]',
    downloads: 'async()=>[]',
    notes: 'async()=>[]',
    spotifyState: 'async()=>({status:"stopped"})',
    extensionsStatus:
      'async()=>({supported:true,message:"Chrome-Erweiterungen",entries:window.installed||[]})',
    extensionPrepare:
      'async()=>({id:"review-token",name:"<img src=x onerror=alert(1)>",version:"1.0",permissions:["https://example.org/*","storage"]})',
    extensionInstall:
      'async(id)=>{window.installCalls=(window.installCalls||0)+1;window.installed=[{id,name:"Example",version:"1.0",enabled:true}]}',
    extensionOpen: 'async(id,tab)=>{window.lastExtensionOpen={id,tab}}',
    extensionEnable: 'async(id,on)=>{window.installed[0].enabled=on}',
    extensionCancel: 'async()=>{}',
    extensionRemove: 'async()=>{window.installed=[]}',
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.addInitScript(() => localStorage.setItem('luna-onboarded', '1'));
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await page.locator('#bExtensions').click();
  await expect(page.locator('#extensions-menu')).toBeVisible();
  await page.locator('[data-ext-manage]').click();
  await expect(page.locator('#set-extensions')).toBeVisible();
  await page.locator('#extension-source').fill('eimadpbcbfnmbkopoojfekhnkhdbieeh');
  await page.locator('#extension-form button').click();
  await expect(page.locator('#set-extensions')).toContainText('https://example.org/*');
  await expect(page.locator('#set-extensions img')).toHaveCount(0);
  expect(await page.evaluate(() => window.installCalls || 0)).toBe(0);
  await page.locator('[data-extension="install"]').click();
  await expect(page.locator('#set-extensions')).toContainText('Example');
  expect(await page.evaluate(() => window.installCalls)).toBe(1);
  await page.locator('#bExtensions').click();
  await expect(page.locator('[data-ext-open]')).toHaveText(/Example/);
  await page.locator('[data-ext-open]').click();
  await expect(page.locator('#extensions-menu')).toBeHidden();
  expect(await page.evaluate(() => window.lastExtensionOpen)).toEqual({
    id: 'review-token',
    tab: -1,
  });
  await page.locator('#bExtensions').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#extensions-menu')).toBeHidden();
  await page.locator('[data-extension="toggle"]').click();
  await expect(page.locator('[data-extension="toggle"]')).toHaveText('Aktivieren');
  await page.locator('[data-extension="remove"]').click();
  await expect(page.locator('#set-extensions')).toContainText(
    'Noch keine Erweiterungen installiert',
  );
});
