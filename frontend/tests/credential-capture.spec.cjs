const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../src/credential-capture.js'), 'utf8');
const base = 'http://127.0.0.1:5174';

async function open(page, body) {
  await page.addInitScript(() => {
    window.__messages = [];
    window.webkit = {
      messageHandlers: { lunaCreds: { postMessage: (m) => window.__messages.push(m) } },
    };
  });
  await page.addInitScript(script);
  await page.route(base + '/login-fixture', (r) =>
    r.fulfill({ contentType: 'text/html', body: `<meta charset="utf-8">${body}` }),
  );
  await page.goto(base + '/login-fixture');
}
const messages = (page) => page.evaluate(() => window.__messages);

test('a submitted login form is reported with user name and password', async ({ page }) => {
  await open(
    page,
    '<form id="f" onsubmit="return false"><input name="u" type="email"><input name="p" type="password"><button type="submit">Anmelden</button></form>',
  );
  await page.fill('input[name=u]', 'max@schule.example');
  await page.fill('input[name=p]', 'geheim');
  await page.click('button');
  await expect
    .poll(() => messages(page))
    .toEqual([{ username: 'max@schule.example', password: 'geheim' }]);
  await page.click('button'); // the same values are not reported twice
  expect(await messages(page)).toHaveLength(1);
});

test('single page logins without a form are reported on Enter, empty passwords never', async ({
  page,
}) => {
  await open(page, '<div><input id="u" type="text"><input id="p" type="password"></div>');
  await page.fill('#u', 'anna');
  await page.press('#u', 'Enter');
  expect(await messages(page)).toHaveLength(0);
  await page.fill('#p', 'pw-1');
  await page.press('#p', 'Enter');
  await expect.poll(() => messages(page)).toEqual([{ username: 'anna', password: 'pw-1' }]);
});

test('show-password buttons do not count as a login', async ({ page }) => {
  await open(
    page,
    '<input id="u" type="text"><input id="p" type="password"><button id="eye" type="button">Passwort anzeigen</button>',
  );
  await page.fill('#u', 'max');
  await page.fill('#p', 'geheim');
  await page.click('#eye');
  expect(await messages(page)).toHaveLength(0);
});

test('forms in frames are never reported or filled', async ({ page }) => {
  await open(
    page,
    '<iframe id="frame" srcdoc="<form onsubmit=\'return false\'><input type=text><input type=password><button>Anmelden</button></form>"></iframe>',
  );
  const frame = page.frameLocator('#frame');
  await frame.locator('input[type=text]').fill('max');
  await frame.locator('input[type=password]').fill('geheim');
  await frame.locator('button').click();
  await page.waitForTimeout(300);
  expect(await messages(page)).toHaveLength(0);
  expect(await page.frames()[1].evaluate(() => typeof window.__lunaFill)).toBe('undefined');
});

test('filling sets user name and password and fires the events frameworks listen for', async ({
  page,
}) => {
  await open(
    page,
    '<form><input id="u" type="text"><input id="p" type="password"></form><script>window.events=[];for (const id of ["u","p"]) for (const type of ["input","change"]) document.getElementById(id).addEventListener(type,()=>events.push(id+":"+type))</script>',
  );
  const result = await page.evaluate(() => window.__lunaFill('max', 'geheim'));
  expect(result).toEqual({ ok: true, username: true, password: true });
  expect(await page.inputValue('#u')).toBe('max');
  expect(await page.inputValue('#p')).toBe('geheim');
  expect(await page.evaluate(() => window.events)).toEqual([
    'u:input',
    'u:change',
    'p:input',
    'p:change',
  ]);
});

test('two-step logins: first the user name, then the password', async ({ page }) => {
  await open(page, '<input id="u" type="email" autocomplete="username">');
  expect(await page.evaluate(() => window.__lunaFill('max@schule.example', 'geheim'))).toEqual({
    ok: true,
    username: true,
    password: false,
  });
  expect(await page.inputValue('#u')).toBe('max@schule.example');
  await page.evaluate(() => {
    document.body.innerHTML = '<input id="p" type="password">';
  });
  expect(await page.evaluate(() => window.__lunaFill('max@schule.example', 'geheim'))).toEqual({
    ok: true,
    username: false,
    password: true,
  });
  expect(await page.inputValue('#p')).toBe('geheim');
});

test('pages without any login field report no-form and change nothing', async ({ page }) => {
  await open(page, '<input id="q" type="search"><p>Hallo</p>');
  const result = await page.evaluate(() => window.__lunaFill('max', 'geheim'));
  expect(result.ok).toBe(false);
  expect(result.error).toBe('no-form');
  expect(await page.inputValue('#q')).toBe('');
});
