const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test.beforeAll(() => {
  // Exercise Rollup's frozen namespace objects, not Vite's development modules.
  execFileSync(
    process.execPath,
    [path.join(__dirname, '../node_modules/vite/bin/vite.js'), 'build'],
    {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
    },
  );
});

test('production bundle reaches setup through the real API adapter and switches language', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.nativeCalls = [];
    window.chrome ??= {};
    window.chrome.webview = { postMessage() {} };
    window.runtime = new Proxy({}, { get: () => () => {} });
    const prefs = JSON.parse(sessionStorage.getItem('production-prefs') || '{}');
    window.go = {
      main: {
        App: new Proxy(
          {},
          {
            get:
              (_, method) =>
              async (...args) => {
                window.nativeCalls.push(method);
                if (method === 'Prefs') return prefs;
                if (method === 'SetPref') {
                  prefs[args[0]] = args[1];
                  sessionStorage.setItem('production-prefs', JSON.stringify(prefs));
                  return prefs;
                }
                if (
                  [
                    'Bookmarks',
                    'Downloads',
                    'Notes',
                    'History',
                    'PersonalizedPages',
                    'ChatList',
                  ].includes(method)
                )
                  return [];
                if (method === 'ChatStatus') return { providers: {}, favorites: [] };
                if (method === 'SpotifyState') return { status: 'off' };
                if (method === 'SearchKeyStatus') return false;
                if (method === 'SessionLoad') return '';
                if (method === 'GestureBindings')
                  return { O: { action: 'notes' }, S: { action: 'screenshot' } };
                return {};
              },
          },
        ),
      },
    };
  });
  const dist = path.join(__dirname, '../dist');
  await page.route('http://127.0.0.1:5174/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: fs.readFileSync(path.join(dist, 'index.html')),
      });
    if (url.pathname.startsWith('/assets/')) {
      const filename = path.join(dist, 'assets', path.basename(url.pathname));
      return route.fulfill({
        contentType: filename.endsWith('.js')
          ? 'application/javascript'
          : filename.endsWith('.css')
            ? 'text/css'
            : 'application/octet-stream',
        body: fs.readFileSync(filename),
      });
    }
    return route.continue();
  });
  await page.goto('http://127.0.0.1:5174');
  await expect(page.locator('.setup')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#splash')).toHaveClass(/gone/);
  expect(await page.evaluate(() => nativeCalls)).toContain('Prefs');
  await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get to know Luna' })).toHaveCount(0);
  await page.locator('#setup-language').selectOption('en');
  await expect(page.getByRole('button', { name: 'Get to know Luna' })).toBeVisible({
    timeout: 10000,
  });
  expect(errors).toEqual([]);
});
