const { expect, test } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('choose the TV, save a Netflix title and show the confirmed delivery', async ({ page }) => {
  const names = Array.from(
    fs.readFileSync(path.join(__dirname, '../src/api.js'), 'utf8').matchAll(/export const (\w+)/g),
    (x) => x[1],
  );
  await page.addInitScript(() => {
    window.tvState = { device: {}, pending: [] };
  });
  const mocks = {
    IS_NATIVE: 'false',
    prefs: 'async()=>({onboardingComplete:true})',
    keyStatus: 'async()=>false',
    bookmarks: 'async()=>[]',
    downloads: 'async()=>[]',
    notes: 'async()=>[]',
    history: 'async()=>[]',
    mcpStatus: 'async()=>({enabled:false,running:false})',
    spotifyState: 'async()=>({status:"stopped"})',
    openNavaConnect: 'async(address)=>{window.connected=address}',
    openNavaDevices: 'async()=>window.connected?[{serial:"TEST-FIRE",name:"Fire TV Stick"}]:[]',
    openNavaPair: 'async(serial)=>window.tvState.device={serial,name:"Fire TV Stick"}',
    openNavaSave: 'async(url,title)=>window.tvState.pending.push({url,title})',
    openNavaStatus: 'async()=>structuredClone(window.tvState)',
  };
  await page.route('**/src/api.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await page.locator('#bMenu').click();
  await page.getByRole('button', { name: 'OpenNava-Merkliste' }).click();
  const dialog = page.getByRole('dialog', { name: 'OpenNava' });
  await expect(dialog.getByRole('button', { name: 'Auf dem TV vormerken' })).toBeDisabled();
  await dialog.getByText('Mit TV-IP verbinden').click();
  await dialog.getByLabel('Lokale IP-Adresse des Fernsehers').fill('192.168.1.17');
  await dialog.getByRole('button', { name: 'Adresse verbinden' }).click();
  await expect.poll(() => page.evaluate(() => window.connected)).toBe('192.168.1.17');
  await dialog.getByRole('button', { name: /Fire TV Stick/ }).click();
  await expect(dialog.getByText('Fernseher verbunden.')).toBeVisible();
  await dialog.getByLabel('Sendung', { exact: true }).fill('Diese Serie');
  await dialog.getByLabel('Link zur Sendung').fill('https://www.netflix.com/title/12345678');
  await dialog.getByRole('button', { name: 'Auf dem TV vormerken' }).click();
  await expect(dialog.locator('#nava-items')).toContainText('Diese Serie');
  await page.evaluate(() => (window.tvState.pending = []));
  await expect(dialog.getByRole('status').filter({ hasText: 'angekommen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
