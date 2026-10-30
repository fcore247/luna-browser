const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('login monitor reads content, waits through logout and resumes on reopen', async ({
  page,
}) => {
  // Exercise the exact trusted script passed to both native browser engines.
  const go = fs.readFileSync(path.join(__dirname, '../../page_monitors.go'), 'utf8');
  const script = go.match(
    /web\.Evaluate\(int\(id\), `([\s\S]*?)`\+string\(config\)\+`([\s\S]*?)`\)/,
  );
  expect(script).not.toBeNull();
  const config = { url: 'https://account.test/orders', selector: '#private-orders' };
  const read = () => page.evaluate(script[1] + JSON.stringify(config) + script[2]).then(JSON.parse);
  await page.route('https://account.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<main id="private-orders">Order one<input value="secret"><script>/*noise*/</script></main>',
    }),
  );
  await page.goto(config.url);
  expect(await read()).toEqual({ text: 'Order one', can_refresh: true });
  await page.locator('input').fill('unsaved');
  expect((await read()).can_refresh).toBe(false);
  await page.locator('input').fill('secret');
  await page.locator('input').blur();
  expect((await read()).can_refresh).toBe(true);
  await page.evaluate(() => {
    document.body.innerHTML = '<form><input type="password"></form>';
  });
  expect((await read()).error).toContain('Anmeldung');
  await page.evaluate(() => {
    document.body.innerHTML = '<p>Sign in through SSO</p>';
  });
  expect((await read()).error).toContain('Inhaltsbereich');
  await page.goto('https://account.test/login');
  expect((await read()).error).toContain('Zielseite');
  await page.goto(config.url);
  await page.evaluate(() => {
    document.querySelector('#private-orders').textContent = 'Order two';
  });
  expect(await read()).toEqual({ text: 'Order two', can_refresh: true });
});
