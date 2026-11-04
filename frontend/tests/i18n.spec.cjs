const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function browserApp(page, { onboarding = true, language } = {}) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ onboarding, language }) => {
      if (!sessionStorage.getItem('language-test-initialized')) {
        sessionStorage.setItem('language-test-initialized', 'yes');
        sessionStorage.setItem(
          'language-test-prefs',
          JSON.stringify({ onboardingComplete: !onboarding }),
        );
        if (language) localStorage.setItem('luna-language', language);
      }
    },
    { onboarding, language },
  );
  const source = fs.readFileSync(path.join(__dirname, '../src/api.js'), 'utf8');
  const names = [...source.matchAll(/export const (\w+)/g)].map((m) => m[1]);
  const mocks = {
    IS_NATIVE: 'true',
    prefs: 'async()=>JSON.parse(sessionStorage.getItem("language-test-prefs"))',
    setPref:
      'async(k,v)=>{if(window.failLanguageSave&&k==="englishUI")throw Error("write failed");const p=JSON.parse(sessionStorage.getItem("language-test-prefs"));p[k]=v;sessionStorage.setItem("language-test-prefs",JSON.stringify(p));return p}',
    keyStatus: 'async()=>true',
    bookmarks: 'async()=>[{url:"https://example.com",title:"Einstellungen",added:1}]',
    downloads: 'async()=>[]',
    notes: 'async()=>[]',
    history: 'async()=>[]',
    gestureBindings: 'async()=>({O:{action:"notes"},S:{action:"screenshot"}})',
    spotifyState: 'async()=>({status:"off"})',
    spotifyAPIStatus: 'async()=>({})',
    chatStatus: 'async()=>({providers:{},favorites:[]})',
    mcpStatus: 'async()=>({enabled:false})',
    sonosStatus: 'async()=>({enabled:false,devices:[],selected:[]})',
    sessionLoad: 'async()=>sessionStorage.getItem("test-browser-session")',
    sessionSave: 'async(value)=>sessionStorage.setItem("test-browser-session",value)',
  };
  await page.route('**/src/api.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: names
        .map((name) => `export const ${name}=${mocks[name] || 'async()=>null'};`)
        .join('\n'),
    }),
  );
  await page.goto('http://127.0.0.1:5174');
  await expect(page.locator('#splash')).toHaveClass(/gone/);
  return errors;
}

test('choose English in first-run setup, finish in English and retain the choice after restart', async ({
  page,
}, testInfo) => {
  const errors = await browserApp(page);
  await expect(page.locator('#setup-language')).toHaveValue('de');
  await expect(page.locator('#setup-language')).toBeInViewport();
  await page.locator('#setup-language').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#setup-language')).toHaveValue('en');
  await expect(page.getByRole('button', { name: 'Get to know Luna' })).toBeVisible();
  await expect(page.locator('.setup-card h1')).toHaveText('Make yourselfat home on the web.');
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem('language-test-prefs')).englishUI),
  ).toBe(true);
  await page.locator('.setup-card').evaluate((card) => {
    card.scrollTop = 0;
  });
  await page.screenshot({ path: testInfo.outputPath('english-setup.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Get to know Luna' }).click();
  await expect(page.getByRole('heading', { name: /Find your way/ })).toBeVisible();
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Skip this step', exact: true }).click();
  await expect(page.locator('.setup')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#splash')).toHaveClass(/gone/);
  await expect(page.locator('.setup')).toHaveCount(0);
  await expect(page.locator('#bBack')).toHaveAttribute('aria-label', 'Back');
  await expect(page.locator('#bmbar')).toContainText('Einstellungen');
  expect(await page.evaluate(() => localStorage.getItem('luna-language'))).toBe('en');
  expect(errors).toEqual([]);
});

test('settings switch both ways, keep open tabs and do not translate user bookmarks', async ({
  page,
}, testInfo) => {
  const errors = await browserApp(page, { onboarding: false, language: 'en' });
  await page.locator('#url').fill('https://example.org');
  await page.locator('#url').press('Enter');
  await page.locator('#newtab').click();
  await page.locator('#url').fill('settings');
  await page.locator('#url').press('Enter');
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect(page.locator('#luna-language')).toHaveValue('en');
  await expect(page.locator('[data-act="set-nav"][data-s="look"]')).toHaveText('Appearance›');
  await page.screenshot({
    path: testInfo.outputPath('english-settings.png'),
    animations: 'disabled',
  });
  await page.locator('#luna-language').selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#luna-language')).toHaveValue('de');
  await expect(page.locator('#tabs')).toContainText('example.org');
  await expect(page.locator('#bmbar')).toContainText('Einstellungen');
  await page.locator('#luna-language').selectOption('en');
  await expect(page.locator('#luna-language')).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#tabs')).toContainText('example.org');
  expect(errors).toEqual([]);
});

test('failed preference save keeps the old language and a usable picker', async ({ page }) => {
  await browserApp(page, { onboarding: false });
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.evaluate(() => (window.failLanguageSave = true));
  await page.locator('#luna-language').selectOption('en');
  await expect(page.locator('#luna-language')).toHaveValue('de');
  await expect(page.locator('#luna-language')).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#toast')).toContainText(
    'Die Sprache konnte nicht gespeichert werden.',
  );
});

test('catalogue preserves markup, interpolated user text, escaping and locale formats', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:5174');
  const result = await page.evaluate(async () => {
    const { setLanguage, t, msg, locale } = await import('/src/i18n.js');
    const { esc } = await import('/src/ui.js');
    setLanguage('en');
    const user = 'Einstellungen <img src=x onerror=alert(1)> {{0}}';
    const html = msg`<button data-act="delete" aria-label="Löschen">${esc(user)}</button>`;
    const el = document.createElement('div');
    el.innerHTML = html;
    let rejected = false;
    try {
      setLanguage('fr');
    } catch {
      rejected = true;
    }
    return {
      label: t('Einstellungen'),
      raw: msg`<b>${'Einstellungen'}</b>`,
      text: el.textContent,
      images: el.querySelectorAll('img').length,
      action: el.firstChild.dataset.act,
      aria: el.firstChild.getAttribute('aria-label'),
      month: new Date(2026, 9, 28).toLocaleDateString(locale(), { month: 'long' }),
      rejected,
    };
  });
  expect(result).toEqual({
    label: 'Settings',
    raw: '<b>Einstellungen</b>',
    text: 'Einstellungen <img src=x onerror=alert(1)> {{0}}',
    images: 0,
    action: 'delete',
    aria: 'Delete',
    month: 'October',
    rejected: true,
  });
});
