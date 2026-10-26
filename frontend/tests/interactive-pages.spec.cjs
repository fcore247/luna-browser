const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const source = 'https://mail.example.org/inbox';
const go = fs.readFileSync(path.join(__dirname, '../../personalized.go'), 'utf8');
const sourceScript = go.match(/const personalizedSourceScript = `([\s\S]*?)`/)[1];
const clickScript = go.match(/const personalizedClickScript = `([\s\S]*?)`/)[1];

const recipe = {
  id: 'mail',
  title: 'Mein Postfach',
  subtitle: 'Alles auf einen Blick',
  url: source,
  scope: 'path',
  enabled: true,
  fields: [
    { title: 'Posteingang', kind: 'list', selector: '.mail-row', open: {} },
    { title: 'Ohne Klick', kind: 'list', selector: '.mail-row' },
  ],
  detail: {
    when: '.mail-open',
    title: 'Nachricht',
    fields: [
      { title: 'Betreff', kind: 'metric', selector: '.mail-subject' },
      { title: 'Text', kind: 'text', selector: '.mail-body' },
    ],
  },
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
    back: 'async id=>{window.wentBack=id;window.detailOpen=false}',
    personalizedClick: `async(tab,selector,index,sig,target)=>{
      if(window.clickError) throw new Error(window.clickError);
      window.clicked={tab,selector,index,sig,target};window.openedMail=sig;window.detailOpen=true}`,
    personalizedRead: `async(tab,fields)=>({url:window.nativeURLs?.[tab]||window.nativeURL,fields:fields.map(f=>{
      const mails=['Anna · Hallo','Max · Plan','Lea · Fest'];
      if(f.selector==='.mail-open')return{selector:f.selector,count:window.detailOpen?1:0,values:window.detailOpen?['offen']:[]};
      if(f.selector==='.mail-row')return{selector:f.selector,count:3,values:mails,valueIdx:[0,1,2],...(window.noSigs?{}:{sigs:mails})};
      if(f.selector==='.mail-subject')return{selector:f.selector,count:1,values:[window.openedMail||'']};
      if(f.selector==='.mail-body')return{selector:f.selector,count:1,values:['Text von '+(window.openedMail||'')]};
      return{selector:f.selector,count:1,values:['x']}})})`,
  };
  await page.route('**/src/api.js*', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: names.map((n) => `export const ${n}=${mocks[n] || 'async()=>null'};`).join('\n'),
    }),
  );
  await page.addInitScript((saved) => (window.recipes = [saved]), recipe);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('#splash.gone').waitFor({ state: 'attached' });
  await page.locator('#url').fill(source);
  await page.locator('#url').press('Enter');
  await expect(page.locator('.pp-view h1')).toHaveText('Mein Postfach');
}
const rows = (page) => page.locator('.pp-card li[data-pp-open]');

test('only blocks with open get clickable rows', async ({ page }) => {
  await setup(page);
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.pp-card li')).toHaveCount(6);
  await expect(rows(page).nth(1)).toHaveAttribute('data-pp-open', '0:1');
  await expect(rows(page).nth(1)).toHaveAttribute('role', 'button');
});

test('clicking a row opens it on the page and shows what opened, with a way back', async ({
  page,
}) => {
  await setup(page);
  await rows(page).nth(1).click();
  await expect(page.locator('.pp-detail-bar')).toContainText('Nachricht');
  await expect(page.locator('.pp-detail-bar')).toContainText('Zurück zur Liste');
  await expect(page.locator('.pp-metric')).toContainText('Max · Plan');
  await expect(page.locator('.pp-card', { hasText: 'Text' })).toContainText('Text von Max · Plan');
  await expect(rows(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.clicked)).toMatchObject({
    selector: '.mail-row',
    index: 1,
    sig: 'Max · Plan',
    target: '',
  });
  await page.locator('[data-pp-back]').click();
  expect(await page.evaluate(() => typeof window.wentBack)).toBe('number');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.pp-detail-bar')).toHaveCount(0);
});

test('rows open from the keyboard as well', async ({ page }) => {
  await setup(page);
  await rows(page).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pp-detail-bar')).toBeVisible();
  expect((await page.evaluate(() => window.clicked)).index).toBe(0);
});

test('a refused click shows the reason and keeps the list', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => (window.clickError = 'Die Liste hat sich geändert.'));
  await rows(page).nth(2).click();
  await expect(page.locator('.luna-toast-message')).toContainText('Die Liste hat sich geändert.');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.pp-detail-bar')).toHaveCount(0);
});

test('without row signatures from the reader nothing is clickable', async ({ page }) => {
  await page.addInitScript(() => (window.noSigs = true));
  await setup(page);
  await expect(page.locator('.pp-card li')).toHaveCount(6);
  await expect(rows(page)).toHaveCount(0);
});

const fixture = `<meta charset="utf-8"><ul id="inbox">
<li class="row" onclick="log.push('row-anna')">Anna Hallo <button class="del" onclick="log.push('delete')">Löschen</button></li>
<li class="row"></li>
<li class="row" onclick="log.push('row-max')">Max Plan <a class="open" href="#m" onclick="log.push('link-max')">Öffnen</a></li>
<li class="row" role="button" onclick="log.push('role-button')">Knopf</li>
<li class="row" aria-disabled="true" onclick="log.push('disabled')">Gesperrt</li>
</ul><script>window.log=[]</script>`;

async function openFixture(page) {
  await page.route('http://127.0.0.1:5174/click-fixture', (r) =>
    r.fulfill({ contentType: 'text/html', body: fixture }),
  );
  await page.goto('http://127.0.0.1:5174/click-fixture');
  const read = await page.evaluate(
    `(function(){${sourceScript};return lunaPersonalizedSource(['#inbox'],{},[{}])})()`,
  );
  return read.fields[0];
}
const click = (page, args) =>
  page.evaluate(
    `(function(){${clickScript};return lunaPersonalizedClick(${JSON.stringify(args)})})()`,
  );

test('the reader reports each row position and text signature, even when empty rows are skipped', async ({
  page,
}) => {
  const field = await openFixture(page);
  expect(field.values).toHaveLength(4);
  expect(field.valueIdx).toEqual([0, 2, 3, 4]);
  expect(field.sigs).toHaveLength(5);
  expect(field.sigs[2]).toBe('Max Plan Öffnen');
});

test('clicking uses the real row position and checks that the row is still the one that was shown', async ({
  page,
}) => {
  const field = await openFixture(page);
  const position = field.valueIdx[1];
  expect(
    await click(page, {
      selector: '#inbox',
      index: position,
      sig: field.sigs[position],
      target: '',
    }),
  ).toEqual({ ok: true });
  expect(await page.evaluate(() => window.log)).toEqual(['row-max']);
  // The list changed under the user's finger: nothing is clicked.
  await page.evaluate(() => (window.log.length = 0));
  expect(
    await click(page, { selector: '#inbox', index: 0, sig: 'Max Plan Öffnen', target: '' }),
  ).toEqual({ ok: false, error: 'changed' });
  expect(await click(page, { selector: '#inbox', index: 40, sig: '', target: '' })).toEqual({
    ok: false,
    error: 'row',
  });
  expect(await page.evaluate(() => window.log)).toEqual([]);
});

test('buttons, role=button, disabled rows and unknown targets are never clicked', async ({
  page,
}) => {
  const field = await openFixture(page);
  const sig = field.sigs;
  expect(await click(page, { selector: '#inbox', index: 0, sig: sig[0], target: '.del' })).toEqual({
    ok: false,
    error: 'blocked',
  });
  expect(await click(page, { selector: '#inbox', index: 3, sig: sig[3], target: '' })).toEqual({
    ok: false,
    error: 'blocked',
  });
  expect(await click(page, { selector: '#inbox', index: 4, sig: sig[4], target: '' })).toEqual({
    ok: false,
    error: 'disabled',
  });
  expect(
    await click(page, { selector: '#inbox', index: 0, sig: sig[0], target: '.missing' }),
  ).toEqual({ ok: false, error: 'target' });
  expect(await page.evaluate(() => window.log)).toEqual([]);
  // A link inside the row is a legitimate target.
  expect(
    await click(page, { selector: '#inbox', index: 2, sig: sig[2], target: 'a.open' }),
  ).toEqual({ ok: true });
  expect((await page.evaluate(() => window.log))[0]).toBe('link-max');
});
