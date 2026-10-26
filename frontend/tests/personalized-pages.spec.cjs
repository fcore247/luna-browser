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
    load: 'async(id,url)=>{window.nativeURL=url;window.nativeURLs||={};window.nativeURLs[id]=url;window.nativeTab=id}',
    show: 'async id=>{window.visibleNative=id}',
    onWeb: 'cb=>{window.nativeState=cb}',
    onMCP: 'cb=>{window.sendMCP=cb}',
    mcpCommandActive: 'async()=>true',
    mcpReply:
      'async(id,value,error)=>{window.mcpResults ||= {};window.mcpResults[id]={value,error}}',
    personalizedValidate: 'async()=>null',
    personalizedInspect: `async(tab,query,selector,offset)=>({url:window.nativeURLs?.[tab]||window.nativeURL,title:'Weather original',nodes:[{selector:selector||'#temperature',text:query||'18 °C',tag:'p',attributes:{alt:'',title:'', 'aria-label':'Temperature'}}]})`,
    personalizedRead: `async(tab,fields)=>({url:window.nativeURLs?.[tab]||window.nativeURL,fields:fields.map(field=>({selector:field.selector,count:field.selector==='#invented'?0:1,values:field.selector==='#invented'?[]:[window.temperature||'18 °C'],...(window.fixtureFields||{})}))})`,
    personalizedSource: `async(tab,selectors)=>selectors.length?{url:window.nativeURL,fields:selectors.map(selector=>({selector,values:[window.temperature||'18 °C'],...(window.fixtureFields||{})}))}:{url:window.nativeURL,title:'Weather original',nodes:[{selector:'#temperature',text:'18 °C',tag:'p'}]}`,
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
  expect(design.components).toHaveLength(19);
  expect(design.guide).toContain('No custom HTML');
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
      body: '<meta charset="utf-8"><main id="weather"><h1>Mein Ort</h1><p id="temperature">18 °C</p><div data-testid="card"><p>Prognose</p><input type="password" value="secret"><textarea>private token</textarea></div></main>',
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

test('expanded builder renders 16 components, tabs, live charts, tables and persistent accordions', async ({
  page,
}) => {
  await setup(page);
  const { design, inspect, recipe } = await create(page);
  await page.evaluate(() => {
    window.fixtureFields = {
      values: ['20 °C', '35 °C', '10 °C'],
      rows: [
        ['Tag', 'Temperatur'],
        ['Heute', '20 °C'],
      ],
      images: [{ src: 'https://weather.example.org/photo.png', alt: 'Wetterbild' }],
      links: [{ href: 'https://weather.example.org/details', text: 'Mehr zum Wetter' }],
    };
  });
  const kinds = [
    'metric',
    'text',
    'list',
    'heading',
    'divider',
    'notice',
    'badge',
    'progress',
    'gauge',
    'bars',
    'line',
    'table',
    'timeline',
    'image',
    'link',
    'accordion',
  ];
  recipe.fields = kinds.map((kind) => ({
    title: kind,
    kind,
    selector: ['heading', 'divider'].includes(kind) ? '' : '#temperature',
    width: ['line', 'table'].includes(kind) ? 'wide' : 'normal',
    group: ['metric', 'progress', 'gauge'].includes(kind)
      ? 'Heute'
      : ['line', 'bars', 'timeline'].includes(kind)
        ? 'Woche'
        : '',
    max: 40,
    firstRowHeader: kind === 'table',
    tone: kind === 'notice' ? 'warning' : 'neutral',
  }));
  const saved = await call(page, 'browser_personalized_pages', {
    action: 'save',
    recipe_json: JSON.stringify(recipe),
    inspection_token: inspect.inspection_token,
    design_token: design.design_token,
  });
  expect(saved.error).toBe('');
  await expect(page.locator('.pp-gauge')).toContainText('20 °C');
  await expect(page.locator('progress')).toHaveAttribute('value', '20');
  await expect(page.locator('.pp-line-chart polyline')).toHaveAttribute('points', /10,/);
  await expect(page.locator('.pp-table-scroll th').first()).toHaveText('Tag');
  await expect(page.locator('.pp-table-scroll td').last()).toHaveText('20 °C');
  await expect(page.locator('.pp-images img')).toHaveAttribute(
    'src',
    'https://weather.example.org/photo.png',
  );
  await expect(page.locator('.pp-links button')).toContainText('Mehr zum Wetter');
  await page.locator('.pp-accordion summary').click();
  await expect(page.locator('.pp-accordion')).toHaveAttribute('open', '');
  await page.locator('[data-pp-refresh]').click();
  await expect(page.locator('.pp-accordion')).toHaveAttribute('open', '');
  const read = await call(page, 'browser_page', { action: 'read', view: 'personalized' });
  expect(read.value.text).toContain('20 °C');
  await page.locator('[data-pp-group="Heute"]').click();
  await expect(page.locator('.pp-metric')).toBeVisible();
  await expect(page.locator('.pp-line')).toHaveCount(0);
  await expect(page.locator('.pp-table')).toBeVisible();
  await page.evaluate(() => (window.fixtureFields.values = ['30 °C']));
  await page.locator('[data-pp-refresh]').click();
  await expect(page.locator('progress')).toHaveAttribute('value', '30');
  await page.locator('[data-pp-group="Woche"]').click();
  await expect(page.locator('.pp-metric')).toHaveCount(0);
  await expect(page.locator('.pp-line')).toBeVisible();
  await expect(page.locator('.pp-chart-values')).toContainText('30 °C');
  await page.setViewportSize({ width: 560, height: 850 });
  expect(
    await page
      .locator('#personalizedPageView')
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: '../../builder-preview.png', fullPage: true });
});

test('source reader extracts original images, safe links, table cells and list values', async ({
  page,
}) => {
  const text = fs.readFileSync(path.join(__dirname, '../../personalized.go'), 'utf8');
  const script = text.match(/const personalizedSourceScript = `([\s\S]*?)`/)[1];
  await page.route('http://127.0.0.1:5174/builder-source', (r) =>
    r.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<meta charset="utf-8"><main><h1>Wetter</h1><ul id="days"><li>20 °C</li><li>35 °C</li></ul><table id="weather-table"><tr><th>Tag</th><th>Temperatur</th></tr><tr><td>Heute</td><td>20 °C</td></tr></table><a id="more" href="/details">Details</a><a id="bad" href="javascript:alert(1)">Bad</a><img id="photo" src="/photo.png" alt="Wetterbild"><input type="password" value="private"></main>',
    }),
  );
  await page.goto('http://127.0.0.1:5174/builder-source');
  const result = await page.evaluate(
    '(function(){' +
      script +
      ';return lunaPersonalizedSource(["#days","#weather-table","#more","#bad","#photo"])})()',
  );
  expect(result.fields[0].values).toEqual(['20 °C', '35 °C']);
  expect(result.fields[1].rows).toEqual([
    ['Tag', 'Temperatur'],
    ['Heute', '20 °C'],
  ]);
  expect(result.fields[2].links[0].href).toBe('http://127.0.0.1:5174/details');
  expect(result.fields[3].links).toEqual([]);
  expect(result.fields[4].images[0].alt).toBe('Wetterbild');
  const inspected = await page.evaluate(
    '(function(){' + script + ';return lunaPersonalizedSource([])})()',
  );
  expect(inspected.nodes.map((n) => n.selector)).toEqual(
    expect.arrayContaining(['#days', '#weather-table', '#photo']),
  );
  expect(JSON.stringify(inspected)).not.toContain('private');
});

test('preview is not saved, accepts real selectors beyond initial inspect, and combines two inspected tabs', async ({
  page,
}) => {
  await setup(page);
  const { design, inspect, recipe } = await create(page);
  const mainID = await page.evaluate(() => window.nativeTab);
  await call(page, 'browser_tab', { action: 'open', url: 'https://radar.example.org/rain' });
  const radarInspect = (
    await call(page, 'browser_personalized_pages', { action: 'inspect', query: 'Regen' })
  ).value;
  recipe.sources = [{ id: 'radar', url: 'https://radar.example.org/rain' }];
  recipe.fields = [
    { title: 'Temperatur', selector: '#real-but-not-in-initial-inspect', kind: 'hero' },
    {
      title: 'Regen',
      source: 'radar',
      selector: '#rain',
      kind: 'badge',
      thresholds: [{ op: 'gt', value: 10, tone: 'warning' }],
    },
  ];
  const args = {
    action: 'preview',
    tab_id: mainID,
    recipe_json: JSON.stringify(recipe),
    design_token: design.design_token,
    inspection_token: inspect.inspection_token,
    source_tokens_json: JSON.stringify({ radar: radarInspect.inspection_token }),
  };
  const preview = await call(page, 'browser_personalized_pages', args);
  expect(preview.error).toBe('');
  expect(preview.value.persisted).toBe(false);
  expect(await page.evaluate(() => window.recipes || [])).toEqual([]);
  await call(page, 'browser_page', { action: 'read', view: 'personalized', tab_id: mainID });
  await expect(page.locator('#personalizedPageView')).toContainText('NOCH NICHT GESPEICHERT');
  await expect(page.locator('.pp-hero')).toContainText('18 °C');
  await expect(page.locator('.pp-badge')).toHaveClass(/pp-tone-warning/);
  const rejected = await call(page, 'browser_personalized_pages', {
    ...args,
    recipe_json: JSON.stringify({
      ...recipe,
      fields: [{ title: 'Missing gusts', selector: '#invented', kind: 'metric' }],
    }),
  });
  expect(rejected.error).toContain('#invented');
  expect(rejected.error).toContain('Missing gusts');
  const saved = await call(page, 'browser_personalized_pages', { ...args, action: 'save' });
  expect(saved.error).toBe('');
  expect((await page.evaluate(() => window.recipes))[0].sources[0].id).toBe('radar');
  await expect(page.locator('#personalizedPageView')).not.toContainText('NOCH NICHT GESPEICHERT');
});

test('inspect searches attributes, pages all results, uses short anchors and reads repeated custom rows', async ({
  page,
}) => {
  const go = fs.readFileSync(path.join(__dirname, '../../personalized.go'), 'utf8');
  const script = go.match(/const personalizedSourceScript = `([\s\S]*?)`/)[1];
  const nesting = '<div>'.repeat(35),
    closing = '</div>'.repeat(35);
  const body =
    '<meta charset="utf-8"><nav><p>Navigation 999</p></nav><main><h1>Vorhersage</h1><div data-testid="forecast">' +
    nesting +
    '<wo-temperature-dots><section class="day"><span class="name">Morgen</span><img src="/sun.png" alt="Sonnig"><span class="min" aria-label="Minimum 8 Grad">8</span><span class="max">14</span><span class="wind" title="SW 3 Böen 36 km/h"></span></section><section class="day"><span class="name">Mittwoch</span><img src="/rain.png" alt="Regen"><span class="min">9</span><span class="max">15</span></section></wo-temperature-dots>' +
    closing +
    '</div>' +
    Array.from({ length: 140 }, (_, i) => '<p data-id="value-' + i + '">' + i + ' Grad</p>').join(
      '',
    ) +
    '</main><footer>Footer 888</footer>';
  await page.route('http://127.0.0.1:5174/deep-source', (r) =>
    r.fulfill({ contentType: 'text/html; charset=utf-8', body }),
  );
  await page.goto('http://127.0.0.1:5174/deep-source');
  async function inspect(options) {
    return page.evaluate(
      ({ script, options }) =>
        eval(
          '(function(){' +
            script +
            ';return lunaPersonalizedSource([],' +
            JSON.stringify(options) +
            ')})()',
        ),
      { script, options },
    );
  }
  const first = await inspect({ values_only: true });
  expect(first.nodes).toHaveLength(100);
  expect(first.next_offset).toBe(100);
  expect(JSON.stringify(first)).not.toContain('Navigation 999');
  const next = await inspect({ values_only: true, offset: first.next_offset });
  expect(next.nodes.length).toBeGreaterThan(30);
  const find = await inspect({ query: 'Minimum 8' });
  expect(find.nodes.some((node) => node.attributes['aria-label'] === 'Minimum 8 Grad')).toBe(true);
  const min = find.nodes.find((node) => node.attributes['aria-label'] === 'Minimum 8 Grad');
  expect(min.selector.length).toBeLessThan(150);
  expect(min.anchors.some((anchor) => anchor.selector === 'wo-temperature-dots')).toBe(true);
  const columns = [
    { title: 'Tag', selector: '.name' },
    { title: 'Icon', selector: 'img', format: { attribute: 'alt' } },
    { title: 'Min', selector: '.min' },
    { title: 'Max', selector: '.max' },
  ];
  const rows = await page.evaluate(
    ({ script, columns }) =>
      eval(
        '(function(){' +
          script +
          ';return lunaPersonalizedSource(["wo-temperature-dots > section"],{},' +
          JSON.stringify([{ columns }]) +
          ')})()',
      ),
    { script, columns },
  );
  expect(rows.fields[0].count).toBe(2);
  expect(rows.fields[0].items[0].cells.map((cell) => cell.text)).toEqual([
    'Morgen',
    'Sonnig',
    '8',
    '14',
  ]);
  expect(rows.fields[0].items[1].cells.map((cell) => cell.text)).toEqual([
    'Mittwoch',
    'Regen',
    '9',
    '15',
  ]);
  const attribute = await page.evaluate(
    ({ script }) =>
      eval(
        '(function(){' +
          script +
          ';return lunaPersonalizedSource([".wind"],{},[{format:{attribute:"title"}}])})()',
      ),
    { script },
  );
  expect(attribute.fields[0].values).toEqual(['SW 3 Böen 36 km/h']);
});

test('custom forecast columns render as one table and repeating horizontal/grid cards', async ({
  page,
}) => {
  await setup(page);
  const { design, inspect, recipe } = await create(page);
  await page.evaluate(() => {
    window.fixtureFields = {
      values: ['Vorhersage'],
      count: 2,
      items: [
        {
          cells: [
            { text: 'Morgen' },
            { text: 'Sonnig', image: 'https://weather.example.org/sun.png' },
            { text: '8 °C' },
            { text: '14 °C' },
          ],
        },
        {
          cells: [
            { text: 'Mittwoch' },
            { text: 'Regen', image: 'https://weather.example.org/rain.png' },
            { text: '9 °C' },
            { text: '15 °C' },
          ],
        },
      ],
    };
  });
  const columns = [
    { title: 'Tag', selector: '.day' },
    { title: 'Icon', selector: 'img' },
    { title: 'Min', selector: '.min' },
    { title: 'Max', selector: '.max' },
  ];
  recipe.fields = ['table', 'cards', 'grid'].map((kind) => ({
    kind,
    title: kind,
    selector: '#temperature',
    columns,
    width: 'full',
  }));
  const result = await call(page, 'browser_personalized_pages', {
    action: 'preview',
    recipe_json: JSON.stringify(recipe),
    inspection_token: inspect.inspection_token,
    design_token: design.design_token,
  });
  expect(result.error).toBe('');
  await expect(page.locator('.pp-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.pp-table thead th')).toHaveText(['Tag', 'Icon', 'Min', 'Max']);
  await expect(page.locator('.pp-cards article')).toHaveCount(2);
  await expect(page.locator('.pp-block-grid article')).toHaveCount(2);
  await expect(page.locator('.pp-cards article').first()).toContainText('Morgen');
  await expect(page.locator('.pp-cards article').first()).toContainText('8 °C');
  await expect(page.locator('.pp-cards article img').first()).toHaveAttribute(
    'src',
    'https://weather.example.org/sun.png',
  );
});
