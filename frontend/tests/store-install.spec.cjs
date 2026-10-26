const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const detail = 'https://chromewebstore.google.com/detail/example/majdfhpaihoncoakbjgbdhglocklcgno';
const urban =
  'https://chromewebstore.google.com/detail/urban-vpn-proxy/eppiocemhmnlbhjplcgkofciiegomcon';
const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvS8AAAAASUVORK5CYII=';
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
    show: 'async(id)=>{window.nativeVisible=id}',
    onWeb: 'cb=>{window.nativeState=cb}',
    extensionsStatus: 'async()=>({supported:true,entries:[]})',
    extensionStorePage: `async(url)=>{if(window.failPage)throw new Error('Store down');const delay=window.pageDelay||0;if(delay)await new Promise(r=>setTimeout(r,delay));return {id:url.match(/([a-p]{32})\\/?$/)[1],url,name:url.includes('eppiocem')?'Urban VPN Proxy':'Example',description:'Eine ausführliche Beschreibung.\\nMit zweitem Absatz.',icon:${JSON.stringify(pixel)},screenshots:[${JSON.stringify(pixel)},${JSON.stringify(pixel)}]}}`,
    extensionPrepare: `async(source)=>{window.reviewSource=source;if(window.prepareFails)throw new Error('Store nicht erreichbar');return window.preparedEntry||{id:'review-token',name:source.includes('eppiocem')?'Urban VPN Proxy':'Example',version:'1.0',permissions:['storage','https://example.org/*'],compatibilityLevel:'clear'}}`,
    extensionInstall: 'async(id)=>{window.installToken=id}',
    extensionCancel: 'async(id)=>{window.cancelToken=id}',
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
}
async function navigate(page, url) {
  await page.locator('#url').fill(url);
  await page.locator('#url').press('Enter');
}

test('Luna detail replaces the store with description screenshots permissions and inline install', async ({
  page,
}) => {
  await openApp(page);
  await navigate(page, detail);
  await expect(page.locator('#storeDetailView')).toBeVisible();
  await expect(page.locator('.store-detail-hero h1')).toHaveText('Example');
  await expect(page.locator('.store-description')).toContainText('Mit zweitem Absatz.');
  await expect(page.locator('.store-gallery-stage img')).toBeVisible();
  await page.locator('[data-store-image="1"]').click();
  await expect(page.locator('[data-store-image="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.store-permissions-card')).toContainText('https://example.org/*');
  await expect(page.locator('.store-compatibility')).toHaveText('Keine bekannten Probleme');
  expect(await page.evaluate(() => window.nativeVisible)).toBe(-1);
  expect(await page.evaluate(() => window.installToken)).toBeUndefined();
  await page.locator('[data-store-confirm]').click();
  await expect(page.locator('.store-review')).toBeVisible();
  await expect(page.locator('#settingsView')).toBeHidden();
  await page.locator('[data-store-confirm]').click();
  await expect(page.locator('[data-store-confirm]')).toHaveText('Installiert ✓');
  expect(await page.evaluate(() => window.installToken)).toBe('review-token');
});

test('original store and Luna view can be switched without a navigation loop', async ({ page }) => {
  await openApp(page);
  await navigate(page, detail);
  await expect(page.locator('.store-description')).toContainText('ausführliche');
  await page.locator('[data-store-original]').click();
  await expect(page.locator('#storeDetailView')).toBeHidden();
  await expect(page.locator('#bStoreInstall')).toBeVisible();
  expect(await page.evaluate(() => window.nativeVisible)).toBe(
    await page.evaluate(() => window.nativeTab),
  );
  await page.locator('#bStoreInstall').click();
  await expect(page.locator('#storeDetailView')).toBeVisible();
  await expect(page.locator('.store-description')).toContainText('ausführliche');
});

test('failed fetch falls back to original and ignores late results from the previous extension', async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    window.failPage = true;
  });
  await navigate(page, detail);
  await expect(page.locator('#bStoreInstall')).toBeVisible();
  await expect(page.locator('#storeDetailView')).toBeHidden();
  await page.evaluate(() => {
    window.failPage = false;
    window.pageDelay = 500;
  });
  await page.locator('#bStoreInstall').click();
  await navigate(page, urban);
  await expect(page.locator('.store-detail-hero h1')).toHaveText('Urban VPN Proxy');
  await expect(page.locator('#storeDetailView')).not.toContainText('Über Example');
  await expect.poll(() => page.evaluate(() => window.cancelToken)).toBe('review-token');
});

test('only detail URLs use Luna view and native SPA navigation updates or dismisses it', async ({
  page,
}) => {
  await openApp(page);
  for (const url of [
    'https://chromewebstore.google.com/search/vpn',
    'https://chromewebstore.google.com.evil.invalid/detail/x/majdfhpaihoncoakbjgbdhglocklcgno',
    'http://chromewebstore.google.com/detail/x/majdfhpaihoncoakbjgbdhglocklcgno',
  ]) {
    await navigate(page, url);
    await expect(page.locator('#storeDetailView')).toBeHidden();
  }
  await navigate(page, detail);
  await expect(page.locator('.store-detail-hero h1')).toHaveText('Example');
  await page.evaluate(
    (url) =>
      window.nativeState({
        t: 'state',
        tab: window.nativeTab,
        url,
        title: 'Urban VPN Proxy',
        loading: false,
      }),
    urban,
  );
  await expect(page.locator('.store-detail-hero h1')).toHaveText('Urban VPN Proxy');
  await page.evaluate(() =>
    window.nativeState({
      t: 'state',
      tab: window.nativeTab,
      url: 'https://chromewebstore.google.com/',
      title: 'Store',
      loading: false,
    }),
  );
  await expect(page.locator('#storeDetailView')).toBeHidden();
  expect(await page.evaluate(() => window.nativeVisible)).toBe(
    await page.evaluate(() => window.nativeTab),
  );
});

test('compatibility blocks unsupported packages and failed checks can be retried', async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    window.preparedEntry = {
      id: 'blocked',
      name: 'VPN',
      version: '1',
      permissions: ['proxy'],
      compatibilityLevel: 'unsupported',
      unsupported: true,
      compatibility: 'Chrome-Proxy-Funktionen fehlen.',
    };
  });
  await navigate(page, detail);
  await expect(page.locator('.store-compatibility')).toHaveText('Nicht kompatibel');
  await expect(page.locator('[data-store-confirm]')).toBeDisabled();
  await navigate(page, 'https://example.org');
  await page.evaluate(() => {
    window.preparedEntry = null;
    window.prepareFails = true;
  });
  await navigate(page, detail);
  await expect(page.locator('.store-compatibility')).toHaveText('Prüfung nicht möglich');
  await page.evaluate(() => {
    window.prepareFails = false;
  });
  await page.locator('[data-store-confirm]').click();
  await expect(page.locator('.store-compatibility')).toHaveText('Keine bekannten Probleme');
  expect(await page.evaluate(() => window.installToken)).toBeUndefined();
});
