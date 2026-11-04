const { test, expect } = require('@playwright/test');

async function setup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem('luna-setup-language-confirmed', '1');
    window.prefs = {};
    window.keys = {};
    window.calls = [];
    window.clip = { count: 0, eligible: false, loading: false, host: 'app.tavily.com' };
    window.clipCalls = [];
  });
  await page.route('**/src/api.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    export const prefs=async()=>window.prefs;
    export const setPref=async(k,v)=>{window.prefs[k]=v;return window.prefs};
    export const keyStatus=async()=>!!window.keys[window.prefs.tavilySearch===false?'brave':'tavily'];
    export const keySet=async key=>{window.keys[window.prefs.tavilySearch===false?'brave':'tavily']=key};
    export const spotifyAPIStatus=async()=>({});export const chatStatus=async()=>({providers:{}});
    export const show=async()=>{};export const focusUI=async()=>{};export const close=async()=>{};
    export const load=async(id,url)=>window.calls.push(url);export const setFrame=async()=>{};
    export const onboardingClipboard=async(id,provider,previous)=>{window.clipCalls.push([provider,previous]);return window.clip};
    export const gestureWriteSound=async()=>{};export const playClick=async()=>{};
  `,
    }),
  );
  await page.route('**/__tavily', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><link rel="stylesheet" href="/src/styles/foundation.css"></head><body><script type="module">
  import {createOnboarding} from '/src/onboarding.js';import {initSelectMenus} from '/src/select-menu.js';initSelectMenus();window.wizard=createOnboarding({onFinish(){},async refreshSearch(){}});await wizard.start();</script></body></html>`,
    }),
  );
  await page.goto('http://127.0.0.1:5174/__tavily');
  await expect(page.locator('.setup')).toBeVisible();
  return errors;
}

test('Tavily is recommended first, has accurate free allowance and stores separate provider keys', async ({
  page,
}, testInfo) => {
  const errors = await setup(page);
  await page.getByRole('button', { name: 'Luna kennenlernen' }).click();
  await expect(page.getByRole('radio').first()).toHaveAccessibleName('Tavily');
  await expect(page.getByRole('radio', { name: 'Tavily', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('.provider-badge')).toHaveText('Empfohlen');
  await expect(page.locator('.search-free-note')).toContainText('1 Credit');
  await page.locator('.setup-card').evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({
    path: testInfo.outputPath('tavily-search-setup.png'),
    animations: 'disabled',
  });
  await page.getByRole('radio', { name: 'Brave Search', exact: true }).click();
  await page.locator('#setupKey').fill('brave-test');
  await page.getByRole('button', { name: 'Speichern & weiter', exact: true }).click();
  await page.getByRole('button', { name: '← Zurück', exact: true }).click();
  await page.getByRole('radio', { name: 'Tavily', exact: true }).click();
  await expect(page.locator('#setupKey')).toHaveValue('');
  await page.locator('#setupKey').fill('tvly-test');
  await page.getByRole('button', { name: 'Speichern & weiter', exact: true }).click();
  expect(await page.evaluate(() => window.keys)).toEqual({
    brave: 'brave-test',
    tavily: 'tvly-test',
  });
  expect(await page.evaluate(() => window.prefs.tavilySearch)).toBe(true);
  expect(errors).toEqual([]);
});

test('new copies on the active Tavily dashboard fill the key field without saving', async ({
  page,
}) => {
  const errors = await setup(page);
  await page.getByRole('button', { name: 'Luna kennenlernen' }).click();
  await page.getByRole('button', { name: 'Dashboard öffnen' }).click();
  await expect(page.locator('.setup.portal')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.clipCalls.some(([provider]) => provider === 'tavily')))
    .toBe(true);
  // A clipboard update from an ineligible page/application must be ignored.
  await page.evaluate(
    () =>
      (window.clip = { count: 1, eligible: false, loading: false, text: 'not-a-dashboard-copy' }),
  );
  await expect.poll(() => page.evaluate(() => window.clipCalls.at(-1)?.[1])).toBe(1);
  await expect(page.locator('#setupKey')).toHaveValue('');
  await page.evaluate(
    () =>
      (window.clip = {
        count: 2,
        eligible: true,
        loading: false,
        host: 'app.tavily.com',
        text: 'tvly-new-copy',
      }),
  );
  await expect(page.locator('#setupKey')).toHaveValue('tvly-new-copy');
  await expect(page.locator('.setup.form')).toBeVisible();
  expect(await page.evaluate(() => window.keys)).toEqual({});
  expect(await page.locator('body').innerText()).not.toContain('tvly-new-copy');
  await page.getByRole('button', { name: 'Speichern & weiter', exact: true }).click();
  expect(await page.evaluate(() => window.keys)).toEqual({ tavily: 'tvly-new-copy' });
  expect(errors).toEqual([]);
});

test('Google works without a key and the radio cards support arrow keys', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Luna kennenlernen' }).click();
  await page.getByRole('radio', { name: 'Tavily', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Brave Search', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.locator('#setupKey').fill('do-not-save-this-draft');
  await page.getByRole('radio', { name: 'Google', exact: true }).click();
  await expect(page.locator('#setupKey')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mit Google weiter' }).click();
  await expect(page.getByRole('heading', { name: 'Deine Musik zieht mit ein.' })).toBeVisible();
  expect(await page.evaluate(() => window.prefs.googleSearch)).toBe(true);
  expect(await page.evaluate(() => window.keys)).toEqual({});
});

test('custom language dropdown supports keyboard, checkmarks, escape and English setup', async ({
  page,
}, testInfo) => {
  const errors = await setup(page);
  const picker = page.getByRole('combobox');
  await picker.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: 'Deutsch' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.screenshot({
    path: testInfo.outputPath('language-dropdown.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(picker).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Get to know Luna' }).click();
  await expect(page.locator('.provider-badge')).toHaveText('Recommended');
  await expect(page.locator('.connection-heading')).toContainText('Free: 1,000 credits/month');
  expect(errors).toEqual([]);
});
