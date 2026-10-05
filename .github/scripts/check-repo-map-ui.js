// Playwright UI test for the repo map (docs/site/logical-map.html), the
// lifecycle-flow view. Applies the exported UI-testing standard (test.md /
// templates/ui-tests) to claude.directives itself: a real browser asserts the
// map renders, that every connection is DRAWN, that no arrow crosses a box it
// does not connect, and that the interactions work and reverse.
//
// The generator (build-logical-map.js) proves the geometry on the numbers it
// computes; this proves it on what the browser actually rendered — a CSS or
// script change can break the second without touching the first.
//
// Run in CI by qa.yml, which installs Chromium first. Locally:
//   CHROMIUM_PATH=/path/to/chrome node .github/scripts/check-repo-map-ui.js
// ESM (matches the other check-*.js).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const MAP = 'file://' + (process.env.REPO_MAP_FILE
  ? resolve(process.env.REPO_MAP_FILE)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/site/logical-map.html'));
const fail = m => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = m => console.log('OK: ' + m);

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, hasTouch: true });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(MAP);
await page.waitForTimeout(400);

const data = await page.evaluate(() => JSON.parse(document.getElementById('mapdata').textContent));
const view = () => page.evaluate(() => window.__map.state());
const settle = () => page.waitForTimeout(220);   // opacity transitions are 120ms

/* ---------------------------------------------------------------- renders */
const counts = await page.evaluate(() => ({
  boxes: document.querySelectorAll('.n').length,
  edges: document.querySelectorAll('.e').length,
  stages: document.querySelectorAll('.st').length,
}));
const nNodes = Object.keys(data.nodes).length;
if (counts.boxes !== nNodes) fail(`${counts.boxes} boxes rendered, data has ${nNodes}`);
else if (counts.edges !== data.edges.length) fail(`${counts.edges} connections rendered, data has ${data.edges.length}`);
else if (counts.stages !== data.stages.length) fail(`${counts.stages} stage columns rendered, data has ${data.stages.length}`);
else ok(`${counts.boxes} boxes, ${counts.edges} connections, ${counts.stages} stages render`);

// Every exported file and every vendor is on the map — the generator places
// them, this checks the page actually carries them.
const ids = new Set(await page.$$eval('.n', ns => ns.map(n => n.dataset.id)));
const missing = Object.keys(data.nodes).filter(id => !ids.has(id));
if (missing.length) fail(`boxes missing from the page: ${missing.join(', ')}`);

/* ------------------------------------------------------ drawn, at rest */
// The previous map drew nothing until a frame was clicked, and the owner asked
// for the connections wired start to finish. So: every line is visible now.
const invisible = await page.$$eval('.e .ln', ls => ls.filter(l => {
  const cs = getComputedStyle(l);
  return cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.15
    || !l.getAttribute('d') || l.getTotalLength() < 10;
}).length);
if (invisible) fail(`${invisible} connections are not visibly drawn at rest`);
else ok('every connection is drawn at rest');

/* --------------------------------------------------- visual invariants */
// No arrow passes through a box it does not connect, measured on the rendered
// SVG path against the rendered boxes, both in canvas coordinates.
const crossings = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.n')].map(n => ({
    id: n.dataset.id, x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight }));
  const bad = [];
  for (const g of document.querySelectorAll('.e')) {
    const p = g.querySelector('.ln'), len = p.getTotalLength();
    for (let s = 0; s <= len; s += 3) {
      const { x, y } = p.getPointAtLength(s);
      const hit = boxes.find(b => b.id !== g.dataset.a && b.id !== g.dataset.b
        && x > b.x + 1 && x < b.x + b.w - 1 && y > b.y + 1 && y < b.y + b.h - 1);
      if (hit) { bad.push(`${g.dataset.a} → ${g.dataset.b} crosses ${hit.id}`); break; }
    }
  }
  return bad;
});
if (crossings.length) fail(`connections cross boxes they do not connect:\n  ${crossings.slice(0, 10).join('\n  ')}`);
else ok('no connection crosses a box it does not connect');

const overlaps = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.n')].map(n => [n.dataset.id, n.getBoundingClientRect()]);
  const out = [];
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const [p, r] = b[i], [q, s] = b[j];
    if (r.left < s.right - 0.5 && s.left < r.right - 0.5 && r.top < s.bottom - 0.5 && s.top < r.bottom - 0.5) out.push(`${p} / ${q}`);
  }
  return out;
});
if (overlaps.length) fail(`boxes overlap: ${overlaps.join(', ')}`);
else ok('no two boxes overlap');

// Every box sits inside its own stage column.
const strays = await page.evaluate(() => {
  const cols = [...document.querySelectorAll('.st')].map(s => [s.offsetLeft, s.offsetLeft + s.offsetWidth]);
  const order = JSON.parse(document.getElementById('mapdata').textContent).stages.map(s => s.id);
  return [...document.querySelectorAll('.n')].filter(n => {
    const [l, r] = cols[order.indexOf(n.dataset.stage)];
    return n.offsetLeft < l || n.offsetLeft + n.offsetWidth > r;
  }).map(n => n.dataset.id);
});
if (strays.length) fail(`boxes outside their stage column: ${strays.join(', ')}`);
else ok('every box sits in its stage column');

/* ------------------------------------------------------------------ trace */
// The trace must match an INDEPENDENT walk of the same data: everything that
// leads to the box and everything it leads to, not following a re-sync loop.
function expected(id) {
  const walk = dir => {
    const seen = new Set([id]), used = new Set(), q = [id];
    while (q.length) {
      const n = q.shift();
      data.edges.forEach((e, i) => {
        if (e.kind === 'ret') return;
        const from = dir === 'down' ? e.a : e.b, to = dir === 'down' ? e.b : e.a;
        if (from !== n) return;
        used.add(i);
        if (!seen.has(to)) { seen.add(to); q.push(to); }
      });
    }
    return { seen, used };
  };
  const u = walk('up'), d = walk('down');
  return { nodes: new Set([...u.seen, ...d.seen]), edges: new Set([...u.used, ...d.used]) };
}
const box = id => `.n[data-id="${id}"]`;
const traced = () => page.evaluate(() => ({
  tracing: document.getElementById('wrap').classList.contains('tracing'),
  nodes: [...document.querySelectorAll('.n.on')].map(n => n.dataset.id),
  edges: [...document.querySelectorAll('.e.on')].map(g => +g.dataset.i),
  panel: !document.getElementById('panel').hidden,
  title: document.querySelector('#panel h3')?.textContent ?? null,
  ins: document.querySelectorAll('#panel h4 + ul')[0]?.children.length ?? 0,
  ev: [...document.querySelectorAll('#panel .ev')].map(e => e.textContent),
}));
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

const QA = 'plugins/directives-toolkit/agents/qa-pipeline.md';
await page.click(box(QA));
await settle();
{
  const t = await traced(), want = expected(QA);
  if (!t.tracing || !t.panel) fail('clicking a box did not start a trace with its panel');
  else if (!sameSet(new Set(t.nodes), want.nodes)) fail(`trace lit ${t.nodes.length} boxes, the data says ${want.nodes.size}`);
  else if (!sameSet(new Set(t.edges), want.edges)) fail(`trace lit ${t.edges.length} connections, the data says ${want.edges.size}`);
  else if (t.title !== 'qa-pipeline') fail(`panel shows "${t.title}", expected qa-pipeline`);
  else if (t.ev.some(e => !/^\S+\.\w+ — \S/.test(e))) fail('a panel entry has no file — quoted-line evidence');
  else ok(`trace lights ${t.nodes.length} boxes and ${t.edges.length} connections — exactly the data's chain, each with evidence`);
}
// Every box's trace matches the data — not just one hand-picked case.
{
  const bad = [];
  for (const id of Object.keys(data.nodes)) {
    await page.evaluate(i => window.__map.trace(i, false), id);
    const t = await page.evaluate(() => [...document.querySelectorAll('.n.on')].map(n => n.dataset.id));
    if (!sameSet(new Set(t), expected(id).nodes)) bad.push(id);
  }
  if (bad.length) fail(`trace disagrees with the data for: ${bad.join(', ')}`);
  else ok(`trace matches the data for all ${nNodes} boxes`);
}
// A link in the panel moves the trace to that box.
await page.click(box(QA));
await settle();
await page.click('#panel [data-go]');
await settle();
{
  const t = await traced();
  if (t.title === 'qa-pipeline' || !t.title) fail('a panel link did not move the trace');
  else ok(`a panel link moves the trace (to ${t.title})`);
}
await page.keyboard.press('Escape');
await settle();
{
  const t = await traced();
  if (t.tracing || t.panel || t.nodes.length) fail('Escape did not clear the trace');
  else ok('Escape clears the trace');
}
// Clicking the traced box again clears it too.
await page.click(box(QA)); await settle();
await page.click(box(QA)); await settle();
if ((await traced()).tracing) fail('clicking the traced box again did not clear it');
else ok('clicking the traced box again clears it');

/* ----------------------------------------------------------------- search */
await page.fill('#search', 'qa-pipeline');
{
  const hits = await page.$$eval('.n.hit', ns => ns.map(n => n.dataset.id));
  if (!hits.includes(QA)) fail('search for "qa-pipeline" did not mark it');
  else ok(`search marks ${hits.length} match(es)`);
}
await page.press('#search', 'Enter');
await settle();
{
  const t = await traced();
  const inView = await page.evaluate(id => {
    const r = document.querySelector(`.n[data-id="${id}"]`).getBoundingClientRect();
    const w = document.getElementById('wrap').getBoundingClientRect();
    return r.left >= w.left && r.right <= w.right && r.top >= w.top && r.bottom <= w.bottom;
  }, QA);
  if (t.title !== 'qa-pipeline') fail('Enter in search did not trace the first match');
  else if (!inView) fail('the traced search match was not brought into view');
  else ok('Enter traces the first match and brings it into view');
}
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
if (await page.$('.n.hit, .n.miss')) fail('Escape did not clear the search marks');

/* ---------------------------------------------------------------- toggles */
const shown = sel => page.$$eval(sel, ns => ns.filter(n => getComputedStyle(n).display !== 'none').length);
async function toggleCase(btn, sel, what) {
  const before = await shown(sel);
  await page.click(btn); await settle();
  const during = await shown(sel);
  await page.click(btn); await settle();
  const after = await shown(sel);
  if (!(before > 0 && during === 0 && after === before)) fail(`${what}: ${before} → ${during} → ${after}`);
  else ok(`${what} hides ${before} and reverses`);
}
await toggleCase('#t_self', '.n[data-id^="self:"]', '"exports only"');
await toggleCase('#t_vendor', '.n[data-id^="vendor:"]', '"hide vendors"');
{
  const nSelf = data.edges.filter(e => e.a.startsWith('self:') || e.b.startsWith('self:')).length;
  await page.click('#t_self'); await settle();
  const vis = await shown('.e');
  await page.click('#t_self'); await settle();
  if (vis !== data.edges.length - nSelf) fail(`"exports only" left ${vis} connections, expected ${data.edges.length - nSelf}`);
  else ok('"exports only" also hides the connections that touch this repo');
}
await page.click('.legend summary');
{
  const open = await page.$eval('.legend', d => d.open);
  if (!open) fail('the legend does not open');
  const kind = 'cop', n = data.edges.filter(e => e.kind === kind).length;
  await page.click(`.kt[data-kind="${kind}"]`); await settle();
  const hiddenNow = await page.$$eval(`.e[data-kind="${kind}"]`, gs => gs.filter(g => getComputedStyle(g).display === 'none').length);
  await page.click(`.kt[data-kind="${kind}"]`); await settle();
  const back = await page.$$eval(`.e[data-kind="${kind}"]`, gs => gs.filter(g => getComputedStyle(g).display === 'none').length);
  if (hiddenNow !== n || back !== 0) fail(`legend kind toggle: hid ${hiddenNow} of ${n}, then ${back} still hidden`);
  else ok(`the legend opens; a kind toggle hides its ${n} connections and reverses`);
}
await page.click('.legend summary');

/* ---------------------------------------------------------- input surface */
await page.click('#t_fit');
const v0 = await view();
await page.mouse.move(700, 500);
await page.mouse.wheel(0, 200);
await page.waitForTimeout(60);
{
  const v = await view();
  if (v.scale !== v0.scale || v.py === v0.py) fail('scroll should pan without zooming');
  await page.mouse.wheel(150, 0);
  await page.waitForTimeout(60);
  const v2 = await view();
  if (v2.px === v.px || v2.scale !== v.scale) fail('sideways scroll should pan sideways');
  else ok('scroll pans on both axes without zooming');
}
await page.keyboard.down('Control');
await page.mouse.wheel(0, -200);
await page.keyboard.up('Control');
await page.waitForTimeout(60);
if ((await view()).scale <= v0.scale) fail('ctrl+scroll does not zoom');
else ok('ctrl/pinch+scroll zooms');
{
  const a = (await view()).scale;
  await page.click('#zin');
  const b = (await view()).scale;
  await page.click('#zout');
  const c = (await view()).scale;
  if (!(b > a && c < b)) fail(`zoom buttons: ${a} → ${b} → ${c}`);
  else ok('the zoom buttons zoom in and out');
}
await page.click('#t_fit');
{
  const v = await view();
  const fits = await page.evaluate(() => {
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const w = document.getElementById('wrap').getBoundingClientRect();
    return vp.left >= w.left - 1 && vp.right <= w.right + 1 && vp.top >= w.top - 1 && vp.bottom <= w.bottom + 1;
  });
  if (!fits) fail(`"fit" does not fit the whole map in view (scale ${v.scale})`);
  else ok('"fit" fits the whole map in view');
}
// Drag empty canvas → pans, selects nothing, no text selected. Then drag that
// starts ON a box → still pans, and does not select the box.
{
  const v = await view();
  await page.mouse.move(400, 900);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(400 + i * 15, 900 - i * 10);
  await page.mouse.up();
  const v2 = await view();
  const sel = await page.evaluate(() => getSelection().toString());
  if (v2.px === v.px && v2.py === v.py) fail('dragging the canvas does not pan');
  else if (sel) fail(`dragging the canvas selected text: "${sel.slice(0, 40)}"`);
  else ok('dragging the canvas pans and selects no text');
  const bb = await (await page.$(box(QA))).boundingBox();
  await page.mouse.move(bb.x + 20, bb.y + bb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(bb.x + 20 + i * 12, bb.y + bb.height / 2 + i * 6);
  await page.mouse.up();
  await settle();
  const v3 = await view();
  if (v3.selected) fail('a drag that started on a box selected it');
  else if (v3.px === v2.px && v3.py === v2.py) fail('a drag that started on a box did not pan');
  else ok('a drag that starts on a box pans and does not select it');
}
// Middle-drag pans over a box.
{
  const v = await view();
  const bb = await (await page.$(box(QA))).boundingBox();
  await page.mouse.move(bb.x + 30, bb.y + bb.height / 2);
  await page.mouse.down({ button: 'middle' });
  for (let i = 1; i <= 6; i++) await page.mouse.move(bb.x + 30 - i * 10, bb.y + bb.height / 2);
  await page.mouse.up({ button: 'middle' });
  if ((await view()).px === v.px) fail('middle-drag does not pan');
  else ok('middle-drag pans');
}
// Keyboard: arrows pan; Tab reaches a box; Enter traces it.
{
  await page.click('#t_fit');
  await page.evaluate(() => document.activeElement?.blur());
  const v = await view();
  await page.keyboard.press('ArrowLeft');
  if ((await view()).px === v.px) fail('arrow keys do not pan');
  else ok('arrow keys pan');
  await page.focus(box(QA));
  await page.keyboard.press('Enter');
  await settle();
  if ((await traced()).title !== 'qa-pipeline') fail('Enter on a focused box does not trace it');
  else ok('a box is keyboard-reachable and Enter traces it');
  await page.keyboard.press('Escape');
}
// Two-finger pinch on a touch screen.
{
  await page.click('#t_fit');
  const before = await view();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent',
    { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i })) });
  await touch('touchStart', [{ x: 600, y: 500 }, { x: 800, y: 500 }]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: 600 - i * 18, y: 500 }, { x: 800 + i * 18, y: 500 }]);
  await touch('touchEnd', []);
  if ((await view()).scale <= before.scale) fail('two-finger pinch does not zoom');
  else ok('two-finger pinch zooms on touch');
  // One finger pans. The page sets touch-action:none, so if this breaks there
  // is no other way to move around a zoomed map on a phone (Codex, #393).
  const v = await view();
  await touch('touchStart', [{ x: 500, y: 600 }]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: 500 + i * 15, y: 600 - i * 10 }]);
  await touch('touchEnd', []);
  const v2 = await view();
  if (v2.px === v.px && v2.py === v.py) fail('one-finger touch drag does not pan');
  else ok('one-finger touch drag pans');
}

/* ------------------------------------------------------------- phone size */
{
  const phone = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true });
  await phone.goto(MAP);
  await phone.waitForTimeout(300);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await phone.evaluate(id => window.__map.trace(id), QA);
  await phone.waitForTimeout(200);
  const p = await phone.$eval('#panel', el => { const r = el.getBoundingClientRect(); return [r.left, r.right, innerWidth]; });
  if (overflow > 0) fail(`phone width scrolls sideways by ${overflow}px`);
  else if (p[0] < 0 || p[1] > p[2]) fail(`the panel leaves a phone screen (${p.join(', ')})`);
  else ok('at phone width: no sideways scroll, and the panel stays on screen');
  await phone.close();
}

if (errors.length) fail(`browser errors:\n  ${errors.join('\n  ')}`);
else ok('no console or page errors');
await browser.close();
console.log(process.exitCode ? 'check-repo-map-ui: FAIL' : 'check-repo-map-ui: OK');
