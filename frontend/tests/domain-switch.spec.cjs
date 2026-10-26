const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const view = (id, title, url) => ({
  id,
  title,
  subtitle: 'Test',
  url,
  scope: 'path',
  enabled: true,
  fields: [{ title: 'Wert', kind: 'metric', selector: '#v' }],
});
const recipes = [
  view('hannover', 'Hannover', 'https://wetter.example.org/hannover'),
  view('berlin', 'Berlin', 'https://www.wetter.example.org/berlin'),
  view('anderswo', 'Anderswo', 'https://other.example.net/x'),
];

async function boot(page) {
  const names = [
    ...fs
      .readFileSync(path.join(__dirname, '../src/api.js'), 'utf8')
      .matchAll(/export const (\w+)/g),
  ].map((m) => m[1]);
  const mocks = {
    IS_NATIVE: 'false',
    prefs: 'async()=>({})',
    mcpStatus: 'async()=>({enabled:true,running:true})',
    keyStatus: 'async()=>false',
    bookmarks: 'async()=>[]',
    history: 'async()=>[]',
    downloads: 'async()=>[]',
    notes: 'async()=>[]',
    spotifyState: 'async()=>({status:"stopped"})',
    personalizedPages: 'async()=>window.recipes||[]',
    onPersonalizedPages: 'cb=>{window.changedPages=cb}',
    load: 'async(id,url)=>{window.nativeURL=url;window.nativeURLs||={};window.nativeURLs[id]=url;window.nativeTab=id}',
    show: 'async id=>{window.visibleNative=id}',
    onWeb: 'cb=>{window.nativeState=cb}',
    onMCP: 'cb=>{window.sendMCP=cb}',
    mcpCommandActive: 'async()=>true',
    mcpReply: 'async()=>{}',
    personalizedRead:
      'async(tab,fields)=>({url:window.nativeURLs?.[tab]||window.nativeURL,fields:fields.map(f=>({selector:f.selector,count:1,values:["21 °C"]}))})',
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.addInitScript((saved) => (window.recipes = saved), recipes);
  await page.setViewportSize({ width: 1280, height: 900 });
}
async function open(page, url) {
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await go(page, url);
}
async function go(page, url) {
  await page.locator('#url').fill(url);
  await page.locator('#url').press('Enter');
}
const overlay = (page) => page.locator('#personalizedPageView');
const chip = (page) => page.locator('#bLunaView');

test('switching off hides every Luna view of the domain, on any of its pages, until it is switched on', async ({
  page,
}) => {
  await boot(page);
  await open(page, 'https://wetter.example.org/hannover');
  await expect(page.locator('.pp-view h1')).toHaveText('Hannover');
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page)).toHaveAttribute('title', /wetter\.example\.org sind an \(2\)/);
  await chip(page).click();
  await expect(overlay(page)).toBeHidden();
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page)).toHaveAttribute('title', /sind aus \(2 gespeichert\)/);
  // Another page of the same domain with its own view: still off (www. counts as the same domain).
  await go(page, 'https://www.wetter.example.org/berlin');
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(overlay(page)).toBeHidden();
  // A page of the domain without a view keeps showing the switch, so it can be switched on from anywhere.
  await go(page, 'https://wetter.example.org/ohne-ansicht');
  await expect(chip(page)).toBeVisible();
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false');
  // Other domains are not affected.
  await go(page, 'https://other.example.net/x');
  await expect(page.locator('.pp-view h1')).toHaveText('Anderswo');
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'true');
  // The choice survives a restart of the app.
  await page.reload();
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await go(page, 'https://wetter.example.org/hannover');
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(overlay(page)).toBeHidden();
  // Switching on brings back all views of the domain.
  await chip(page).click();
  await expect(page.locator('.pp-view h1')).toHaveText('Hannover');
  await go(page, 'https://www.wetter.example.org/berlin');
  await expect(page.locator('.pp-view h1')).toHaveText('Berlin');
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'true');
});

test('switching on also undoes "open the original" on single pages', async ({ page }) => {
  await boot(page);
  await open(page, 'https://wetter.example.org/hannover');
  await expect(page.locator('.pp-view h1')).toHaveText('Hannover');
  await page.locator('[data-pp-original]').click();
  await expect(overlay(page)).toBeHidden();
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page)).toHaveAttribute('title', /Originalseite/);
  await chip(page).click();
  await expect(page.locator('.pp-view h1')).toHaveText('Hannover');
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'true');
});
