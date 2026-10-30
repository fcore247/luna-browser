const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

for (const language of ['de', 'en']) {
  test(`saved monitor controls and statuses use ${language}`, async ({ page }) => {
    const label = (de, en) => (language === 'en' ? en : de);
    await page.addInitScript(
      (language) => localStorage.setItem('luna-language', language),
      language,
    );
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const names = [
      ...fs
        .readFileSync(path.join(__dirname, '../src/api.js'), 'utf8')
        .matchAll(/export const (\w+)/g),
    ].map((m) => m[1]);
    const mocks = {
      IS_NATIVE: 'false',
      prefs: 'async()=>({onboardingComplete:true})',
      keyStatus: 'async()=>false',
      bookmarks: 'async()=>[]',
      notes: 'async()=>[]',
      downloads: 'async()=>[]',
      history: 'async()=>[]',
      mcpStatus: 'async()=>({enabled:true,running:true})',
      spotifyState: 'async()=>({status:"stopped"})',
      onMCP: 'cb=>{window.mcpCommand=cb}',
      mcpCommandActive: 'async()=>true',
      mcpReply: 'async(id,value,error)=>window.replies.get(id)({value,error})',
      pageMonitors: 'async()=>structuredClone(window.watches)',
      pageMonitorAction:
        'async(id,action)=>{window.actions.push(action);const w=window.watches.find(w=>w.id===id);if(action==="remove")window.watches=[];else if(action==="pause")w.enabled=false;else if(action==="resume")w.enabled=true;else window.checked=true;window.monitorUpdated?.()}',
      pageMonitorConfigure:
        'async(id,interval,refresh)=>{Object.assign(window.watches.find(w=>w.id===id),{interval_minutes:interval,auto_refresh:refresh});window.monitorUpdated?.()}',
      onPageMonitorsUpdated: 'cb=>{window.monitorUpdated=cb}',
      onPageMonitor: 'cb=>{window.pageMonitorChanged=cb}',
    };
    await page.addInitScript(() => {
      window.actions = [];
      window.watches = [
        {
          id: 'test-watch',
          url: 'https://account.test/dashboard',
          source: 'browser',
          selector: '#private',
          interval_minutes: 5,
          enabled: true,
          last_checked: '2026-10-30T12:00:00Z',
          last_changed: '0001-01-01T00:00:00Z',
        },
      ];
      window.replies = new Map();
      window.sequence = 0;
      window.callMCP = (name, args = {}) =>
        new Promise((resolve) => {
          const id = String(++window.sequence);
          window.replies.set(id, resolve);
          window.mcpCommand({ id, name, args });
        });
    });
    await page.route('**/src/api.js*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
      }),
    );
    await page.goto('http://127.0.0.1:5174');
    await page.locator('#splash.gone').waitFor({ state: 'attached' });
    const call = async (name, args) => {
      const result = await page.evaluate(
        ([name, args]) => window.callMCP(name, args),
        [name, args],
      );
      if (result.error) throw Error(result.error);
      return result.value;
    };
    await call('browser_tab', { action: 'open', url: 'https://account.test/unwatched' });
    await expect(page.locator('#bMonitor')).toBeHidden();
    await call('browser_tab', { action: 'open', url: 'https://account.test/dashboard' });
    await expect(page.locator('#bMonitor')).toContainText(label('Überwacht', 'Monitored'));
    await page.locator('#bMonitor').click();
    const quick = page.locator('#themeDrop.monitor-drop');
    await expect(quick).toBeVisible();
    await expect(quick).toContainText(label('Letzte Prüfung:', 'Last checked:'));
    await expect(quick.getByRole('spinbutton')).toHaveAttribute(
      'aria-label',
      label('Prüfintervall in Minuten', 'Check interval in minutes'),
    );
    await expect(quick).toContainText(
      label('Seite vor jeder Prüfung neu laden', 'Reload the page before every check'),
    );
    await page.evaluate(() => {
      window.watches[0].error = 'Warte auf angemeldeten Inhaltsbereich';
      window.monitorUpdated();
    });
    await expect(quick.locator('.monitor-error')).toHaveText(
      label('Warte auf angemeldeten Inhaltsbereich', 'Waiting for signed-in page content'),
    );
    await expect(page.locator('#bMonitor')).toContainText(label('Wartet', 'Waiting'));
    await page.evaluate(() => {
      delete window.watches[0].error;
      window.monitorUpdated();
    });
    await expect(quick.getByRole('checkbox')).toBeChecked();
    await quick.getByRole('button', { name: label('Pausieren', 'Pause'), exact: true }).click();
    await expect(page.locator('#bMonitor')).toContainText(label('Pausiert', 'Paused'));
    await expect(
      quick.getByRole('button', { name: label('Fortsetzen', 'Resume'), exact: true }),
    ).toBeVisible();
    await quick.getByRole('button', { name: label('Fortsetzen', 'Resume'), exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => ({ enabled: window.watches[0].enabled, actions: window.actions })),
      )
      .toEqual({ enabled: true, actions: ['pause', 'resume'] });
    await quick.getByRole('spinbutton').fill('2');
    await quick.getByRole('spinbutton').press('Tab');
    await expect.poll(() => page.evaluate(() => window.watches[0].interval_minutes)).toBe(2);
    await quick.getByRole('checkbox').uncheck();
    await expect.poll(() => page.evaluate(() => window.watches[0].auto_refresh)).toBe(false);
    await quick
      .getByRole('button', { name: label('Jetzt prüfen', 'Check now'), exact: true })
      .click();
    await expect.poll(() => page.evaluate(() => window.checked)).toBe(true);
    await quick
      .getByRole('button', { name: label('Alle Überwachungen verwalten', 'Manage all monitors') })
      .click();
    await expect(page.locator('#set-monitors')).toBeVisible();
    await expect(page.locator('#set-monitors .monitor-card')).toHaveCount(1);
    await expect(page.locator('[data-s="monitors"]')).toHaveAttribute('aria-current', 'page');
    await page
      .locator('#set-monitors')
      .getByRole('button', { name: label('Entfernen', 'Remove'), exact: true })
      .click();
    await expect(page.locator('#set-monitors .monitor-card')).toHaveCount(0);
    await call('browser_tab', { action: 'open', url: 'https://account.test/dashboard' });
    const address = page.locator('#url');
    await expect(page.locator('#bMonitor')).toBeHidden();
    await address.fill('watch');
    await expect(page.locator('#themeDrop.monitor-drop')).toBeVisible();
    await expect(page.locator('#themeDrop')).toContainText(
      label('keine Überwachung gespeichert', 'No monitor is saved'),
    );
    await address.fill('theme');
    await expect(page.locator('#themeDrop')).toContainText(label('Dein Design', 'Your design'));
    await expect(page.locator('#themeDrop')).not.toHaveClass(/monitor-drop/);
    expect(errors).toEqual([]);
  });
}
