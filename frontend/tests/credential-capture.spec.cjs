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
const messages = (page) =>
  page.evaluate(() => window.__messages.filter((message) => !message.kind));

async function loginForm(page, stage) {
  const ready = () =>
    page.evaluate(
      (stage) =>
        window.__messages.findLast((m) => m.kind === 'loginForm' && m.stage === stage)?.form,
      stage,
    );
  await expect.poll(ready).toBeTruthy();
  return ready();
}

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

test('transparent password fields and transparent ancestors prevent capture and filling', async ({
  page,
}) => {
  await open(
    page,
    `<form onsubmit="return false"><span id="wrap"><input id="p" type="password"
    autocomplete="current-password" value="hidden-test-value"></span><button>Sign in</button></form>`,
  );
  for (const selector of ['#p', '#wrap']) {
    await page.locator(selector).evaluate((el) => {
      el.style.opacity = '0';
    });
    await page.locator('button').click();
    expect(await messages(page)).toEqual([]);
    const fill = await page.evaluate(() => window.__lunaFill('test', 'replacement', true));
    expect(fill.ok).toBe(false);
    expect(await page.locator('#p').inputValue()).toBe('hidden-test-value');
    await page.locator(selector).evaluate((el) => {
      el.style.removeProperty('opacity');
    });
  }
});

test('associated controls outside the form supply its account and password', async ({ page }) => {
  await open(
    page,
    `
    <form id="other" onsubmit="return false">
      <input type="email" value="other@example.test"><input type="password" value="unrelated">
    </form>
    <form id="login" onsubmit="return false"></form>
    <input form="login" autocomplete="username" type="hidden" value="chosen@example.test">
    <input id="p" form="login" type="password" autocomplete="current-password">
    <button form="login" type="submit">Sign in</button>
  `,
  );
  await page.fill('#p', 'synthetic-selected');
  await page.locator('button').click();
  await expect
    .poll(() => messages(page))
    .toEqual([{ username: 'chosen@example.test', password: 'synthetic-selected' }]);
});

test('a read-only account is kept across a trusted SPA submit and DOM removal', async ({
  page,
}) => {
  await open(
    page,
    `
    <section id="card">
      <input autocomplete="username" readonly value="fixed@example.test">
      <input id="p" type="password">
      <button type="button" aria-label="Sign in" onclick="card.remove()"><span>→</span></button>
    </section>
  `,
  );
  await page.locator('#p').fill('synthetic-readonly');
  await page.locator('button span').click();
  await expect
    .poll(() => messages(page))
    .toEqual([{ username: 'fixed@example.test', password: 'synthetic-readonly' }]);
});

test('a trusted username step survives replacement by a password-only step', async ({ page }) => {
  await open(
    page,
    `
    <form id="first" onsubmit="event.preventDefault();this.remove();second.hidden=false">
      <input id="u" autocomplete="username"><button>Continue</button>
    </form>
    <form id="second" hidden onsubmit="return false">
      <input id="p" type="password" autocomplete="current-password"><button>Sign in</button>
    </form>
  `,
  );
  await page.locator('#u').fill('two-step@example.test');
  await page.locator('#first button').click();
  await page.locator('#p').fill('synthetic-second');
  await page.locator('#p').press('Enter');
  await expect
    .poll(() => messages(page))
    .toEqual([{ username: 'two-step@example.test', password: 'synthetic-second' }]);
});

test('showing an entered password keeps it available for the explicit save offer', async ({
  page,
}) => {
  await open(
    page,
    `
    <form onsubmit="return false">
      <input id="account" autocomplete="username" readonly value="visible@example.test">
      <input id="secret" type="password">
      <button type="button" onclick="secret.type='text'">Show password</button><button>Sign in</button>
    </form>
  `,
  );
  await page.fill('#secret', 'synthetic-revealed');
  await page.getByRole('button', { name: 'Show password' }).click();
  expect(await messages(page)).toEqual([]);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect
    .poll(() => messages(page))
    .toEqual([{ username: 'visible@example.test', password: 'synthetic-revealed' }]);
});

test('an unlabelled SPA action reports the edited login only when its fields disappear', async ({
  page,
}) => {
  await open(
    page,
    `
    <section role="form" id="widget">
      <input autocomplete="username" value="spa@example.test"><input id="p" type="password">
      <span id="info" tabindex="0">?</span><span id="go" tabindex="0" onclick="widget.remove()">→</span>
    </section>
  `,
  );
  await page.locator('#p').fill('synthetic-widget');
  await page.locator('#info').click();
  expect(await messages(page)).toEqual([]);
  await page.locator('#go').click();
  await expect
    .poll(() => messages(page))
    .toEqual([{ username: 'spa@example.test', password: 'synthetic-widget' }]);
});

test('programmatic clicks and unrelated SPA controls do not create save offers', async ({
  page,
}) => {
  await open(
    page,
    `
    <form id="login" onsubmit="return false">
      <input id="u" autocomplete="username"><input id="p" type="password">
      <button id="sign">Sign in</button>
    </form>
    <div><button type="button" id="other">Continue</button></div>
  `,
  );
  await page.locator('#u').fill('typed@example.test');
  await page.locator('#p').fill('synthetic-typed');
  await page.evaluate(() => document.querySelector('#sign').click());
  expect(await messages(page)).toEqual([]);
  await page.locator('#other').click();
  expect(await messages(page)).toEqual([]);
  await page.locator('#sign').click();
  await expect
    .poll(() => messages(page))
    .toEqual([{ username: 'typed@example.test', password: 'synthetic-typed' }]);
});

test('changing a password offers only a matching new password', async ({ page }) => {
  await open(
    page,
    `
    <form id="change" onsubmit="return false">
      <input autocomplete="username" readonly value="account@example.test">
      <input id="current" type="password" autocomplete="current-password">
      <input id="new" type="password" autocomplete="new-password">
      <input id="confirm" type="password" autocomplete="new-password"><button>Change password</button>
    </form>
  `,
  );
  await page.locator('#current').fill('synthetic-old');
  await page.locator('#new').fill('synthetic-new');
  await page.locator('button').click();
  expect(await messages(page)).toEqual([]);
  await page.locator('#confirm').fill('mismatch');
  await page.locator('button').click();
  expect(await messages(page)).toEqual([]);
  await page.locator('#confirm').fill('synthetic-new');
  await page.locator('button').click();
  await expect
    .poll(() => messages(page))
    .toEqual([{ username: 'account@example.test', password: 'synthetic-new' }]);
});

test('auto-login submits once to a matching login form and reports no password to the UI', async ({
  page,
}) => {
  await open(
    page,
    `
    <form action="/session" method="post" onsubmit="event.preventDefault();window.sent=(window.sent||0)+1">
      <input id="u" autocomplete="username"><input id="p" type="password" autocomplete="current-password">
      <button>Sign in</button>
    </form>
  `,
  );
  const form = await loginForm(page, 'password');
  const probe = await page.evaluate(
    (id) => window.__lunaFill('synthetic', '', 2, id, location.origin),
    form,
  );
  expect(probe).toMatchObject({ ok: true, stage: 'password' });
  expect(await page.inputValue('#u')).toBe('');
  expect(await page.inputValue('#p')).toBe('');
  const result = await page.evaluate(
    (id) => window.__lunaFill('synthetic', 'synthetic-fill', true, id, location.origin),
    form,
  );
  expect(result).toMatchObject({
    ok: true,
    submitted: true,
    username: true,
    password: true,
    stage: 'password',
  });
  expect(JSON.stringify(result)).not.toContain('synthetic-fill');
  expect(await page.inputValue('#u')).toBe('synthetic');
  expect(await page.inputValue('#p')).toBe('synthetic-fill');
  expect(await page.evaluate(() => window.sent)).toBe(1);
  const replay = await page.evaluate(
    (id) => window.__lunaFill('synthetic', 'synthetic-fill', true, id, location.origin),
    form,
  );
  expect(replay.ok).toBe(false);
  expect(await page.evaluate(() => window.sent)).toBe(1);
});

test('a different origin, stale form or another typed account prevents automatic sign-in', async ({
  page,
}) => {
  await open(
    page,
    `
    <form onsubmit="event.preventDefault();window.sent=true">
      <input id="u" autocomplete="username"><input id="p" type="password" autocomplete="current-password">
      <button>Log in</button>
    </form>
  `,
  );
  const form = await loginForm(page, 'password');
  const attempt = (id, expectedOrigin) =>
    page.evaluate(
      ([id, expectedOrigin]) =>
        window.__lunaFill('synthetic', 'synthetic-fill', true, id, expectedOrigin),
      [id, expectedOrigin],
    );
  expect((await attempt(form, 'https://other.example.test')).ok).toBe(false);
  expect((await attempt(form + '-stale', base)).ok).toBe(false);
  await page.locator('#u').fill('another-account');
  expect((await attempt(form, base)).ok).toBe(false);
  expect(await page.inputValue('#u')).toBe('another-account');
  expect(await page.inputValue('#p')).toBe('');
  expect(await page.evaluate(() => window.sent)).toBeUndefined();
});

test('auto-login waits for the page to enable its button and submits exactly once', async ({
  page,
}) => {
  await open(
    page,
    `
    <form method="post" onsubmit="event.preventDefault();window.submissions.push(event.submitter.id)">
      <input id="u" autocomplete="username"><input id="p" type="password" autocomplete="current-password">
      <button id="sign" disabled>Sign in</button>
    </form>
    <script>
      window.submissions = [];
      const form = document.querySelector('form');
      form.addEventListener('input', () => {
        if (u.value && p.value) setTimeout(() => { sign.disabled=false }, 120);
      });
    </script>
  `,
  );
  const form = await loginForm(page, 'password');
  await expect(page.locator('#sign')).toBeDisabled();
  const [attempt, duplicate] = await page.evaluate((id) => {
    const invoke = () =>
      window.__lunaFill('synthetic', 'synthetic-wait', true, id, location.origin);
    return Promise.all([invoke(), invoke()]);
  }, form);
  expect(attempt).toMatchObject({ ok: true, submitted: true, stage: 'password' });
  expect(duplicate.ok).toBe(false);
  expect(await page.evaluate(() => window.submissions)).toEqual(['sign']);
});

test('password GET forms are filled but left for the user to submit', async ({ page }) => {
  const requests = [];
  await page.route(base + '/session**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  for (const [method, override] of [
    ['', ''],
    ['method="get"', ''],
    ['method="invalid"', ''],
    ['method="post"', 'formmethod="get"'],
    ['method="post"', 'formmethod=""'],
  ]) {
    await open(
      page,
      `<form action="/session" ${method} onsubmit="window.sent=true">
      <input name="user" autocomplete="username">
      <input name="secret" type="password" autocomplete="current-password">
      <button ${override} onclick="window.activated=true">Sign in</button></form>`,
    );
    const token = await loginForm(page, 'password');
    const result = await page.evaluate(
      (token) => window.__lunaFill('example', 'synthetic-get-secret', true, token),
      token,
    );
    expect(result).toMatchObject({ ok: true, password: true, submitted: false });
    expect(await page.inputValue('[name=secret]')).toBe('synthetic-get-secret');
    expect(await page.evaluate(() => Boolean(window.activated || window.sent))).toBe(false);
  }
  expect(requests).toEqual([]);
});

test('a password GET submitted by an input handler during filling cannot navigate with credentials', async ({
  page,
}) => {
  const urls = [];
  await page.route(base + '/session**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await open(
    page,
    `<form action="/session" method="get">
    <input name="user" autocomplete="username"><input name="secret" type="password"
      oninput="this.form.requestSubmit()" onchange="this.form.submit()">
    <button>Sign in</button></form>`,
  );
  const token = await loginForm(page, 'password');
  const result = await page.evaluate(
    (token) => window.__lunaFill('example', 'synthetic-get-secret', true, token),
    token,
  );
  expect(result).toMatchObject({ ok: true, password: true, submitted: false });
  // Legacy form.submit() bypasses the submit event but still constructs form data.
  await expect.poll(() => urls.length).toBe(1);
  expect(new URL(urls[0]).searchParams.has('secret')).toBe(false);
  expect(urls[0]).not.toContain('synthetic-get-secret');
});

test('POST overrides submit and method changes in site handlers cannot put passwords in a URL', async ({
  page,
}) => {
  const requests = [];
  await page.route(base + '/session**', (route) => {
    requests.push({ method: route.request().method(), url: route.request().url() });
    return route.fulfill({ status: 204 });
  });
  for (const [method, button, onsubmit, submitted] of [
    ['get', 'formmethod="POST"', '', true],
    ['post', 'onclick="this.form.method=\'get\'"', '', false],
    ['post', '', "this.method='get';event.stopPropagation()", false],
  ]) {
    await open(
      page,
      `<form action="/session" method="${method}" onsubmit="${onsubmit}">
      <input name="user" autocomplete="username"><input name="secret" type="password">
      <button ${button}>Sign in</button></form>`,
    );
    const token = await loginForm(page, 'password');
    const result = await page.evaluate(
      (token) => window.__lunaFill('example', 'synthetic-get-secret', true, token),
      token,
    );
    expect(result).toMatchObject({ ok: true, submitted });
    if (submitted) await expect.poll(() => requests.length).toBe(1);
    if (onsubmit) await expect.poll(() => requests.length).toBe(2);
  }
  expect(requests[0]).toEqual({ method: 'POST', url: base + '/session' });
  expect(new URL(requests[1].url).searchParams.has('secret')).toBe(false);
  expect(requests[1].url).not.toContain('synthetic-get-secret');
});

test('payment and account deletion confirmations are never filled or submitted automatically', async ({
  page,
}) => {
  for (const [action, label] of [
    ['/checkout/confirm', 'Confirm payment'],
    ['/settings/delete-account', 'Delete account'],
  ]) {
    await open(
      page,
      `
      <form action="${action}" method="post" onsubmit="event.preventDefault();window.submitted=true">
        <input name="username" autocomplete="username">
        <input name="password" type="password" autocomplete="current-password">
        <button>${label}</button>
      </form>
    `,
    );
    const result = await page.evaluate(() =>
      window.__lunaFill('synthetic', 'synthetic-confirm', true, '', location.origin),
    );
    expect(result.ok).toBe(false);
    expect(await page.inputValue('input[name=username]')).toBe('');
    expect(await page.inputValue('input[name=password]')).toBe('');
    expect(await page.evaluate(() => window.submitted)).toBeUndefined();
    expect(
      await page.evaluate(() => window.__messages.some((m) => m.kind === 'loginForm' && m.form)),
    ).toBe(false);
  }
});

test('signup, ambiguous and cross-origin submission targets never get an automatic password', async ({
  page,
}) => {
  for (const forms of [
    '<form><input autocomplete="username"><input type="password" autocomplete="new-password"><button>Register</button></form>',
    '<form action="https://other.example.test/login"><input autocomplete="username"><input type="password" autocomplete="current-password"><button>Sign in</button></form>',
    '<form><input autocomplete="username"><input type="password"><button formaction="https://other.example.test/login">Sign in</button></form>',
    '<form><input autocomplete="username"><input type="password"><button>Sign in</button></form>'.repeat(
      2,
    ),
  ]) {
    await open(page, forms);
    const result = await page.evaluate(() =>
      window.__lunaFill('synthetic', 'synthetic-fill', true, '', location.origin),
    );
    expect(result.ok).toBe(false);
    expect(
      await page
        .locator('input[type="password"]')
        .evaluateAll((inputs) => inputs.every((i) => i.value === '')),
    ).toBe(true);
  }
});
