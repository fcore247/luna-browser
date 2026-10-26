const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const source = 'https://weather.example.org/today';
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
    personalizedSave: 'async recipe=>{window.recipes=[recipe]}',
    personalizedEnable: 'async(id,on)=>{window.recipes[0].enabled=on;window.changedPages?.()}',
    personalizedRemove: 'async()=>{window.recipes=[];window.changedPages?.()}',
    onPersonalizedPages: 'cb=>{window.changedPages=cb}',
    load: 'async(id,url)=>{window.nativeURL=url;window.nativeTab=id}',
    show: 'async id=>{window.visibleNative=id}',
    onWeb: 'cb=>{window.nativeState=cb}',
    onMCP: 'cb=>{window.sendMCP=cb}',
    mcpCommandActive: 'async()=>true',
    mcpReply:
      'async(id,value,error)=>{window.mcpResults ||= {};window.mcpResults[id]={value,error}}',
    personalizedSource: `async(tab,selectors)=>selectors.length?{url:window.nativeURL,fields:selectors.map(selector=>({selector,values:[window.temperature||'18 °C']}))}:{url:window.nativeURL,title:'Weather original',nodes:[{selector:'#temperature',text:'18 °C',tag:'p'}]}`,
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await page.locator('#url').fill(source);
  await page.locator('#url').press('Enter');
}
let sequence = 0;
async function call(page, name, args = {}) {
  const id = String(++sequence);
  await page.evaluate(({ id, name, args }) => window.sendMCP({ id, name, args }), {
    id,
    name,
    args,
  });
  await expect.poll(() => page.evaluate((id) => window.mcpResults?.[id], id)).toBeTruthy();
  return page.evaluate((id) => window.mcpResults[id], id);
}
async function create(page) {
  const design = (await call(page, 'browser_design_skill')).value;
  const inspect = (await call(page, 'browser_personalized_pages', { action: 'inspect' })).value;
  const recipe = {
    id: 'weather',
    title: 'Mein Wetter',
    subtitle: 'Dein persönlicher Überblick',
    url: source,
    scope: 'path',
    enabled: true,
    fields: [{ title: 'Temperatur', selector: '#temperature', kind: 'metric', icon: '☀️' }],
  };
  return { design, inspect, recipe };
}

test('MCP requires source inspection and Luna design skill before saving; live values render', async ({
  page,
}) => {
  await setup(page);
  const { design, inspect, recipe } = await create(page);
  expect(design.tokens['--card']).toBeTruthy();
  expect(design.guide).toContain('never supply HTML');
  let result = await call(page, 'browser_personalized_pages', {
    action: 'save',
    recipe_json: JSON.stringify(recipe),
    inspection_token: inspect.inspection_token,
  });
  expect(result.error).toContain('browser_design_skill');
  result = await call(page, 'browser_personalized_pages', {
    action: 'save',
    recipe_json: JSON.stringify({
      ...recipe,
      fields: [{ title: 'Bad', selector: '#invented', kind: 'text' }],
    }),
    inspection_token: inspect.inspection_token,
    design_token: design.design_token,
  });
  expect(result.error).toContain('Quellselektoren');
  result = await call(page, 'browser_personalized_pages', {
    action: 'save',
    recipe_json: JSON.stringify(recipe),
    inspection_token: inspect.inspection_token,
    design_token: design.design_token,
  });
  expect(result.error).toBe('');
  await expect(page.locator('#personalizedPageView')).toContainText('Mein Wetter');
  await expect(page.locator('.pp-metric')).toContainText('18 °C');
  expect(await page.evaluate(() => window.visibleNative)).toBe(-1);
  const before = await page.locator('.pp-card').evaluate((el) => getComputedStyle(el).borderColor);
  await call(page, 'browser_customize', { color_theme: 'ocean' });
  const after = await page.locator('.pp-card').evaluate((el) => getComputedStyle(el).borderColor);
  expect(after).not.toBe(before);
  await page.evaluate(() => (window.temperature = '21 °C'));
  await page.locator('[data-pp-refresh]').click();
  await expect(page.locator('.pp-metric')).toContainText('21 °C');
  await page.locator('[data-pp-original]').click();
  await expect(page.locator('#personalizedPageView')).toBeHidden();
});

test('settings manage saved personalized pages and restore the native page on disable', async ({
  page,
}) => {
  await setup(page);
  const { design, inspect, recipe } = await create(page);
  await call(page, 'browser_personalized_pages', {
    action: 'save',
    recipe_json: JSON.stringify(recipe),
    inspection_token: inspect.inspection_token,
    design_token: design.design_token,
  });
  await call(page, 'browser_settings', { section: 'personalized' });
  await expect(page.locator('#set-personalized')).toContainText('Mein Wetter');
  await page.locator('[data-personal-page="toggle"]').click();
  await expect(page.locator('[data-personal-page="toggle"]')).toHaveText('Aktivieren');
  await page.locator('[data-personal-page="open"]').click();
  await expect(page.locator('#personalizedPageView')).toBeHidden();
  expect(await page.evaluate(() => window.visibleNative)).toBe(
    await page.evaluate(() => window.nativeTab),
  );
  await call(page, 'browser_settings', { section: 'personalized' });
  await page.locator('[data-personal-page="toggle"]').click();
  await expect(page.locator('[data-personal-page="toggle"]')).toHaveText('Deaktivieren');
  await page.locator('[data-personal-page="remove"]').click();
  await expect(page.locator('#set-personalized')).toContainText(
    'Noch keine personalisierten Seiten',
  );
});

test('actual source reader excludes credentials and derives usable selectors', async ({ page }) => {
  const text = fs.readFileSync(path.join(__dirname, '../../personalized.go'), 'utf8');
  const script = text.match(/const personalizedSourceScript = `([\s\S]*?)`/)[1];
  await page.route('http://127.0.0.1:5174/source-fixture', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<main id="weather"><h1>Mein Ort</h1><p id="temperature">18 °C</p><div data-testid="card"><p>Prognose</p><input type="password" value="secret"><textarea>private token</textarea></div></main>',
    }),
  );
  await page.goto('http://127.0.0.1:5174/source-fixture');
  const result = await page.evaluate(
    '(function(){' + script + ';return lunaPersonalizedSource([])})()',
  );
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(JSON.stringify(result)).not.toContain('private token');
  for (const node of result.nodes) expect(await page.locator(node.selector).count()).toBe(1);
  await page.locator('#temperature').evaluate((el) => (el.textContent = '22 °C'));
  const live = await page.evaluate(
    '(function(){' + script + ';return lunaPersonalizedSource(["#temperature"])})()',
  );
  expect(live.fields[0].values).toEqual(['22 °C']);
});
