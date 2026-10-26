const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const detail =
  'https://chromewebstore.google.com/detail/free-vpn-for-chrome-vpn-p/majdfhpaihoncoakbjgbdhglocklcgno';
async function openApp(page) {
  const names = [
    ...fs
      .readFileSync(path.join(__dirname, '../src/api.js'), 'utf8')
      .matchAll(/export const (\w+)/g),
  ].map((x) => x[1]);
  const mocks = {
    IS_NATIVE: 'false',
    prefs: 'async()=>({})',
    mcpStatus: 'async()=>({enabled:false})',
    keyStatus: 'async()=>false',
    bookmarks: 'async()=>[]',
    history: 'async()=>[]',
    downloads: 'async()=>[]',
    notes: 'async()=>[]',
    spotifyState: 'async()=>({status:"stopped"})',
    load: 'async(id,url)=>{window.nativeURL=url;window.nativeTab=id}',
    onWeb: '(cb)=>{window.nativeState=cb}',
    extensionStoreDetails:
      'async()=>window.customMetadata||({url:window.nativeURL,name:"Free VPN for Chrome - VPN Proxy VeePN",icon:"https://lh3.googleusercontent.com/luna-test.png"})',
    extensionsStatus: 'async()=>({supported:true,entries:[]})',
    extensionPrepare:
      'async(source)=>{window.reviewSource=source;return {id:"review-vpn",name:"Free VPN for Chrome - VPN Proxy VeePN",version:"5.0",permissions:["proxy","storage"]}}',
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.route('https://lh3.googleusercontent.com/luna-test.png', (r) =>
    r.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvS8AAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
}
async function navigate(page, url) {
  await page.locator('#url').fill(url);
  await page.locator('#url').press('Enter');
}
test('store detail automatically offers installation without covering the live page', async ({
  page,
}) => {
  await openApp(page);
  await navigate(page, 'https://chromewebstore.google.com/');
  await expect(page.locator('#bStoreInstall')).toBeHidden();
  const originalTop = (await page.locator('#page').boundingBox()).y;
  await navigate(page, detail);
  const chip = page.locator('#bStoreInstall');
  await expect(chip).toBeVisible();
  await expect(chip.locator('img')).toBeVisible();
  await expect(page.locator('#storeInstallDrop')).toBeVisible();
  expect(await page.evaluate(() => window.reviewSource)).toBeUndefined();
  await expect(page.locator('#urlbox')).toHaveClass(/store-drop-open/);
  await expect(page.locator('#storeInstallDrop')).toContainText(
    'Free VPN for Chrome - VPN Proxy VeePN',
  );
  expect(await page.evaluate(() => window.reviewSource)).toBeUndefined();
  const drop = await page.locator('#storeInstallDrop').boundingBox();
  const livePage = await page.locator('#page').boundingBox();
  expect(livePage.y).toBeGreaterThan(originalTop + 80);
  expect(livePage.y).toBeGreaterThanOrEqual(drop.y + drop.height);
  await expect(page.locator('#pageShot')).toBeHidden();
  await page.locator('[data-store-close]').last().click();
  await expect(page.locator('#storeInstallDrop')).toHaveCount(0);
  await page.evaluate(() =>
    window.nativeState({
      t: 'state',
      tab: window.nativeTab,
      url: window.nativeURL,
      title: 'Free VPN for Chrome - VPN Proxy VeePN - Chrome Web Store',
      loading: false,
      progress: 1,
    }),
  );
  await expect(page.locator('#bStoreInstall')).toBeVisible();
  await expect(page.locator('#storeInstallDrop')).toHaveCount(0);
  await chip.click();
  await page.locator('[data-store-confirm]').click();
  await expect(page.locator('#set-extensions')).toContainText('proxy');
  expect(await page.evaluate(() => window.reviewSource)).toBe(detail);
});
test('store chip ignores search pages and lookalike hosts and closes when leaving detail', async ({
  page,
}) => {
  await openApp(page);
  for (const url of [
    'https://chromewebstore.google.com/search/vpn',
    'https://chromewebstore.google.com.evil.invalid/detail/vpn/majdfhpaihoncoakbjgbdhglocklcgno',
    'http://chromewebstore.google.com/detail/vpn/majdfhpaihoncoakbjgbdhglocklcgno',
  ]) {
    await navigate(page, url);
    await expect(page.locator('#bStoreInstall')).toBeHidden();
  }
  await navigate(page, detail);
  await expect(page.locator('#storeInstallDrop')).toBeVisible();
  await page.locator('#url').fill('https://example.org');
  await expect(page.locator('#storeInstallDrop')).toHaveCount(0);
  await page.locator('#url').press('Enter');
  await expect(page.locator('#bStoreInstall')).toBeHidden();
});

test('changing store extensions discards stale name and icon until the new detail is ready', async ({
  page,
}) => {
  await openApp(page);
  await navigate(page, detail);
  await expect(page.locator('#bStoreInstall')).toHaveAttribute('aria-label', /VeePN installieren/);
  await expect(page.locator('#storeInstallDrop')).toContainText('VeePN');
  const urban =
    'https://chromewebstore.google.com/detail/urban-vpn-proxy/eppiocemhmnlbhjplcgkofciiegomcon';
  await page.evaluate((url) => {
    window.nativeURL = url;
    window.customMetadata = {
      url,
      name: 'Free VPN for Chrome - VPN Proxy VeePN',
      icon: 'https://lh3.googleusercontent.com/old.png',
    };
    window.nativeState({
      t: 'state',
      tab: window.nativeTab,
      url,
      title: 'Urban VPN Proxy - Chrome Web Store',
      loading: false,
      progress: 1,
    });
  }, urban);
  await expect(page.locator('#storeInstallDrop')).toContainText('urban vpn proxy');
  await expect(page.locator('#storeInstallDrop')).not.toContainText('VeePN');
  await expect(page.locator('#bStoreInstall')).toBeVisible();
  await page.evaluate((url) => {
    window.customMetadata = {
      url,
      name: 'Urban VPN Proxy',
      icon: 'https://lh3.googleusercontent.com/luna-test.png',
    };
  }, urban);
  await expect(page.locator('#bStoreInstall')).toHaveAttribute(
    'aria-label',
    'Urban VPN Proxy installieren',
  );
  await expect(page.locator('#storeInstallDrop')).toContainText('Urban VPN Proxy');
  await expect(page.locator('#storeInstallDrop')).not.toContainText('VeePN');
});

test('actual native metadata script works and rejects stale SPA headings', async ({ page }) => {
  const source = fs.readFileSync(path.join(__dirname, '../../extensions.go'), 'utf8');
  const script = source.match(/const extensionStoreDetailsScript = `([\s\S]*?)`/)[1];
  await page.route('https://chromewebstore.google.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<link rel="canonical" href="${detail}"><title>Free VPN - Chrome Web Store</title><h1>Free VPN</h1><img alt="Item logo image" src="https://lh3.googleusercontent.com/logo.png">`,
    }),
  );
  await page.goto(detail);
  const info = JSON.parse(await page.evaluate(script));
  expect(info.name).toBe('Free VPN');
  expect(info.icon).toContain('logo.png');
  await page.evaluate(() => (document.querySelector('h1').textContent = 'Old extension'));
  expect(JSON.parse(await page.evaluate(script))).toEqual({});
});

test('valid detail URL offers installation even while metadata is unavailable', async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    window.customMetadata = {};
  });
  await navigate(page, detail);
  await expect(page.locator('#storeInstallDrop')).toBeVisible();
  await expect(page.locator('#bStoreInstall')).toBeVisible();
  await expect(page.locator('[data-store-confirm]')).toBeEnabled();
  await page.locator('[data-store-confirm]').click();
  await expect(page.locator('#set-extensions')).toContainText('proxy');
  expect(await page.evaluate(() => window.reviewSource)).toBe(detail);
});
