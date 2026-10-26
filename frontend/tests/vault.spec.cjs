const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const source = 'https://schule.example.org/start';
const origin = 'https://schule.example.org';

async function setup(page, { supported = true, saved = [] } = {}) {
  const names = [
    ...fs
      .readFileSync(path.join(__dirname, '../src/api.js'), 'utf8')
      .matchAll(/export const (\w+)/g),
  ].map((m) => m[1]);
  const mocks = {
    IS_NATIVE: 'false',
    prefs: 'async()=>({})',
    setPref: 'async(key,value)=>{window.pref=[key,value];window.vaultOffers=value;return {}}',
    mcpStatus: 'async()=>({enabled:true,running:true})',
    keyStatus: 'async()=>false',
    bookmarks: 'async()=>[]',
    history: 'async()=>[]',
    downloads: 'async()=>[]',
    notes: 'async()=>[]',
    spotifyState: 'async()=>({status:"stopped"})',
    personalizedPages: 'async()=>[]',
    onPersonalizedPages: 'cb=>{window.changedPages=cb}',
    load: 'async(id,url)=>{window.nativeURL=url;window.nativeTab=id}',
    show: 'async id=>{window.visibleNative=id}',
    onWeb: 'cb=>{window.nativeState=cb}',
    onMCP: 'cb=>{window.sendMCP=cb}',
    mcpCommandActive: 'async()=>true',
    mcpReply: 'async()=>{}',
    vaultStatus: `async()=>({supported:${supported},ready:${supported},count:(window.vault||[]).length,offers:window.vaultOffers!==false})`,
    vaultEntries: 'async(url)=>(window.vault||[]).filter(e=>url.startsWith(e.origin))',
    vaultAll: 'async()=>window.vault||[]',
    vaultSavePending:
      'async(tab)=>{window.saved=tab;(window.vault ||= []).push({origin:window.offer.origin,username:window.offer.username,updated:1730000000});return {}}',
    vaultDismissPending: 'async(tab)=>{window.dismissed=tab}',
    vaultFill:
      'async(tab,url,username)=>{window.filled={tab,url,username};return {filled:true,username:true,password:true}}',
    vaultDelete:
      'async(o,u)=>{window.vault=window.vault.filter(e=>!(e.origin===o&&e.username===u))}',
    vaultDeleteAll: 'async()=>{window.vault=[]}',
    onVaultOffer: 'cb=>{window.sendOffer=cb}',
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.addInitScript((entries) => (window.vault = entries), saved);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await page.locator('#url').fill(source);
  await page.locator('#url').press('Enter');
}
const max = { origin, username: 'max', updated: 1730000000 };
const anna = { origin, username: 'anna', updated: 1730000100 };

test('the key stays hidden without a saved login', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#url')).toHaveValue(/schule\.example\.org/);
  await expect(page.locator('#bVault')).toBeHidden();
});

test('a saved login shows the key and fills it for exactly the page origin', async ({ page }) => {
  await setup(page, { saved: [max, { origin: 'https://anders.example.org', username: 'x' }] });
  const key = page.locator('#bVault');
  await expect(key).toBeVisible();
  await expect(key).toHaveAttribute('data-state', 'fill');
  await expect(key).toHaveAttribute('title', /max/);
  await key.click();
  await expect.poll(() => page.evaluate(() => window.filled?.username)).toBe('max');
  const filled = await page.evaluate(() => window.filled);
  expect(filled.url).toBe(source);
  expect(typeof filled.tab).toBe('number');
  expect(JSON.stringify(filled)).not.toMatch(/passwor/i);
});

test('several saved logins open a chooser before anything is filled', async ({ page }) => {
  await setup(page, { saved: [max, anna] });
  await page.locator('#bVault').click();
  const dialog = page.locator('.vault-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.vault-row')).toHaveCount(2);
  expect(await page.evaluate(() => window.filled)).toBeUndefined();
  await dialog.locator('.vault-row', { hasText: 'anna' }).click();
  await expect.poll(() => page.evaluate(() => window.filled?.username)).toBe('anna');
});

test('after a login Luna offers to save it, never showing the password', async ({ page }) => {
  await setup(page);
  await page.evaluate(
    (o) => {
      window.offer = o;
      window.sendOffer({ tab: window.nativeTab, ...o, update: false });
    },
    { origin, username: 'max' },
  );
  const key = page.locator('#bVault');
  await expect(key).toBeVisible();
  await expect(key).toHaveAttribute('data-state', 'offer');
  await expect(key).toContainText('Speichern');
  await key.click();
  const dialog = page.locator('.vault-dialog');
  await expect(dialog).toContainText('Passwort speichern?');
  await expect(dialog).toContainText('schule.example.org');
  await expect(dialog).toContainText('max');
  await dialog.locator('.vault-primary').click();
  await expect.poll(() => page.evaluate(() => window.saved)).toBeTruthy();
  await expect(key).toHaveAttribute('data-state', 'fill');
  await expect(key).toHaveAttribute('title', /max/);
});

test('"Nicht jetzt" drops the offer without saving', async ({ page }) => {
  await setup(page);
  await page.evaluate(
    (o) => {
      window.offer = o;
      window.sendOffer({ tab: window.nativeTab, ...o, update: true });
    },
    { origin, username: 'max' },
  );
  await expect(page.locator('#bVault')).toContainText('Aktualisieren');
  await page.locator('#bVault').click();
  await page.locator('.vault-dialog [data-vault-choice=""]').click();
  await expect.poll(() => page.evaluate(() => window.dismissed)).toBeTruthy();
  expect(await page.evaluate(() => window.saved)).toBeUndefined();
  await expect(page.locator('#bVault')).toBeHidden();
});

async function openPasswordSettings(page) {
  // The AI tool may open other chapters, but deliberately not the password list.
  await page.evaluate(() =>
    window.sendMCP({ id: 'settings', name: 'browser_settings', args: { section: 'personalized' } }),
  );
  await page.locator('button[data-act="set-nav"][data-s="passwords"]').click();
}

test('settings list logins without passwords, delete them and switch the save offer', async ({
  page,
}) => {
  await setup(page, { saved: [max, anna] });
  await openPasswordSettings(page);
  const section = page.locator('#set-passwords');
  await expect(section).toContainText('schule.example.org');
  await expect(section).toContainText('max');
  await expect(section).toContainText('Deine KI kann Passwörter weder lesen noch ausfüllen');
  await expect(section.locator('.pp-settings-entry')).toHaveCount(2);
  await section.locator('[data-vault="delete"][data-user="max"]').click();
  await expect(section.locator('.pp-settings-entry')).toHaveCount(1);
  await section.locator('[data-vault="offers"]').click();
  await expect.poll(() => page.evaluate(() => window.pref)).toEqual(['vaultOffers', false]);
  await section.locator('[data-vault="delete-all"]').click();
  await expect(section).toContainText('Noch nichts gespeichert');
});

test('where the vault is not available the settings say so and no key is shown', async ({
  page,
}) => {
  await setup(page, { supported: false, saved: [max] });
  await expect(page.locator('#bVault')).toBeHidden();
  await openPasswordSettings(page);
  await expect(page.locator('#set-passwords')).toContainText('noch nicht verfügbar');
});
