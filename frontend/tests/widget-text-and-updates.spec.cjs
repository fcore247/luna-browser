const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const source = 'https://wetter.example.org/hannover';
const go = fs.readFileSync(path.join(__dirname, '../../personalized.go'), 'utf8');
const sourceScript = go.match(/const personalizedSourceScript = `([\s\S]*?)`/)[1];

const recipe = {
  id: 'wetter',
  title: 'Wetter',
  subtitle: 'Hannover',
  url: source,
  scope: 'path',
  enabled: true,
  fields: [
    { title: 'Jetzt', kind: 'hero', selector: '#temp', icon: '🌡️' },
    { title: 'Niederschlag', kind: 'metric', selector: '#rain' },
    { title: 'Himmel', kind: 'metric', selector: '#sky' },
    { title: 'Bericht', kind: 'text', selector: '#report', width: 'wide' },
    { title: 'Meldungen', kind: 'timeline', selector: '#ticker' },
  ],
};
const data = {
  '#temp': { values: ['12.3°'] },
  '#rain': { values: ['0.0 l/m2 in 1 Std.'] },
  '#sky': { values: ['teils heiter mit Wolkenfeldern'] },
  '#report': {
    values: ['Bericht'],
    rich: [
      'Mix aus Sonne und Wolken.\n\nHeute weht ein böiger Wind\n• Sturmböen im Bergland\n• Sonst trocken',
    ],
  },
  '#ticker': { values: ['11:34 Uhr Dienstag wird’s mild', 'Ohne Uhrzeit'] },
};

async function setup(page) {
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
      'async(tab,fields)=>({url:window.nativeURLs?.[tab]||window.nativeURL,fields:fields.map(f=>({selector:f.selector,count:1,...(window.data[f.selector]||{values:["?"]})}))})',
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.addInitScript(
    ([saved, values]) => {
      window.recipes = [saved];
      window.data = values;
    },
    [recipe, data],
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await page.locator('#url').fill(source);
  await page.locator('#url').press('Enter');
  await expect(page.locator('.pp-hero .pp-num')).toHaveText('12.3');
}

test('numbers, units and notes are set apart; long values shrink instead of breaking the layout', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('.pp-hero .pp-unit')).toHaveText('°');
  const rain = page.locator('.pp-card', { hasText: 'Niederschlag' });
  await expect(rain.locator('.pp-num')).toHaveText('0.0');
  await expect(rain.locator('.pp-unit')).toHaveText('l/m2');
  await expect(rain.locator('.pp-metric-note')).toHaveText('in 1 Std.');
  await expect(rain.locator('.pp-metric-value')).toContainText('0.0 l/m2');
  const sky = page.locator('.pp-card', { hasText: 'Himmel' }).locator('.pp-metric-text');
  await expect(sky).toHaveClass(/pp-size-s/);
  const box = await sky.boundingBox();
  const card = await page.locator('.pp-card', { hasText: 'Himmel' }).boundingBox();
  expect(box.width).toBeLessThanOrEqual(card.width);
});

test('long texts keep paragraphs and bullet points', async ({ page }) => {
  await setup(page);
  const prose = page.locator('.pp-card', { hasText: 'Bericht' }).locator('.pp-prose');
  await expect(prose.locator('p')).toHaveText([
    'Mix aus Sonne und Wolken.',
    'Heute weht ein böiger Wind',
  ]);
  await expect(prose.locator('.pp-bullets li')).toHaveText([
    'Sturmböen im Bergland',
    'Sonst trocken',
  ]);
});

test('times in lists become chips', async ({ page }) => {
  await setup(page);
  const ticker = page.locator('.pp-card', { hasText: 'Meldungen' });
  await expect(ticker.locator('.pp-chip')).toHaveText(['11:34 Uhr']);
  await expect(ticker.locator('li').first()).toContainText('11:34 Uhr Dienstag wird’s mild');
  await expect(ticker.locator('li').nth(1)).toHaveText('Ohne Uhrzeit');
});

test('a refresh swaps only what changed: no rebuild, no replayed entrance, focus stays', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#personalizedPageView.pp-intro')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('.pp-updated')).toHaveCount(0, { timeout: 4000 });
  await page.evaluate(() =>
    document.querySelectorAll('.pp-card').forEach((el, index) => (el.__tag = index)),
  );
  await page.evaluate(() => (window.data['#rain'] = { values: ['1.4 l/m2 in 1 Std.'] }));
  await page.locator('[data-pp-refresh]').click();
  const rain = page.locator('.pp-card', { hasText: 'Niederschlag' });
  await expect(rain.locator('.pp-num')).toHaveText('1.4');
  await expect(rain).toHaveClass(/pp-updated/);
  expect(await page.evaluate(() => document.querySelectorAll('.pp-updated').length)).toBe(1);
  // The untouched cards are the very same elements as before.
  expect(
    await page.evaluate(() => [...document.querySelectorAll('.pp-card')].map((el) => el.__tag)),
  ).toEqual([0, undefined, 2, 3, 4]);
  await expect(page.locator('#personalizedPageView.pp-intro')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-pp-refresh'))).toBe(
    true,
  );
});

test('the automatic refresh is quiet: no loading text, no skeletons', async ({ page }) => {
  await page.clock.install();
  await setup(page);
  await page.evaluate(() => {
    window.noisy = 0;
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (
            node.nodeType === 1 &&
            (node.matches('.pp-skeleton, .pp-source-loading') ||
              node.querySelector?.('.pp-skeleton'))
          )
            window.noisy++;
    }).observe(document.getElementById('personalizedPageView'), { childList: true, subtree: true });
  });
  await page.evaluate(() => (window.data['#rain'] = { values: ['2.0 l/m2 in 1 Std.'] }));
  await page.clock.fastForward(16000);
  await expect(page.locator('.pp-card', { hasText: 'Niederschlag' }).locator('.pp-num')).toHaveText(
    '2.0',
  );
  expect(await page.evaluate(() => window.noisy)).toBe(0);
});

test('the reader keeps paragraphs, line breaks and bullets of a text', async ({ page }) => {
  await page.route('http://127.0.0.1:5174/prose-fixture', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<meta charset="utf-8"><article id="a"><p>Erster   Absatz.</p><p>Zweiter<br>mit Umbruch</p><ul><li>Eins</li><li>Zwei</li></ul><script>1</script><input value="geheim"></article>',
    }),
  );
  await page.goto('http://127.0.0.1:5174/prose-fixture');
  const result = await page.evaluate(
    `(function(){${sourceScript};return lunaPersonalizedSource(['#a'],{},[{kind:'text'}])})()`,
  );
  const field = result.fields[0];
  expect(field.rich).toEqual(['Erster Absatz.\n\nZweiter\nmit Umbruch\n\n• Eins\n• Zwei']);
  expect(JSON.stringify(field)).not.toContain('geheim');
  const plain = await page.evaluate(
    `(function(){${sourceScript};return lunaPersonalizedSource(['#a'],{},[{kind:'metric'}])})()`,
  );
  expect(plain.fields[0].rich).toBeUndefined();
});
