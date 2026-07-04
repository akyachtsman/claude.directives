// Playwright UI smoke test for the repo map (this repo's only interactive
// Pages artifact). Applies the exported UI-testing standard (test.md /
// templates/ui-tests) to claude.directives itself: a real browser asserts the
// map renders and that its interactions don't regress. Run in CI by qa.yml,
// which installs Chromium first. ESM (matches the other check-*.js).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const MAP = 'file://' + (process.env.REPO_MAP_FILE
  ? resolve(process.env.REPO_MAP_FILE)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/repo-map.html'));
const fail = m => { console.error('FAIL: ' + m); process.exitCode = 1; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(MAP);
await page.waitForTimeout(400);

const ids = await page.$$eval('.node', ns => ns.map(n => n.dataset.id));
if (ids.length < 8) fail(`expected >=8 boxes, found ${ids.length}`);
else console.log(`OK: ${ids.length} boxes render`);

const effOpacity = () => page.$$eval('.node', ns => ns.map(n => {
  let o = 1, el = n;
  while (el && el.nodeType === 1) { const v = getComputedStyle(el).opacity; o *= (v === '' ? 1 : parseFloat(v)); el = el.parentElement; }
  return { id: n.dataset.id, op: +o.toFixed(3) };
}));

// Core regression guard: clicking a box must never fade another box.
for (const id of ['plugin', 'directives', 'docsint']) {
  const rect = await page.$(`#n_${id} rect`);
  if (!rect) { fail(`box #n_${id} not found`); continue; }
  const bb = await rect.boundingBox();
  if (!bb) { fail(`box #n_${id} has no bounding box (hidden?)`); continue; }
  await page.mouse.click(bb.x + bb.width / 2, bb.y + 18);
  await page.waitForTimeout(200);
  const faint = (await effOpacity()).filter(x => x.op < 0.95);
  if (faint.length) fail(`clicking ${id} faded boxes: ${faint.map(x => x.id + '=' + x.op).join(', ')}`);
  else console.log(`OK: clicking ${id} fades no box`);
  const sw = await page.$eval(`#n_${id} rect`, r => parseFloat(getComputedStyle(r).strokeWidth));
  if (!(sw >= 3.5)) fail(`focused box ${id} not emphasised (stroke-width ${sw})`);
  await page.mouse.click(5, 5);
  await page.waitForTimeout(100);
}

// Dragging the canvas must not select the SVG text.
await page.mouse.move(700, 400); await page.mouse.down();
await page.mouse.move(500, 300, { steps: 8 }); await page.mouse.move(400, 250, { steps: 8 });
await page.mouse.up();
const sel = await page.evaluate(() => String(window.getSelection()));
if (sel !== '') fail(`dragging selected text: ${JSON.stringify(sel)}`);
else console.log('OK: dragging selects no text');

if (errors.length) fail('console/page errors: ' + errors.join(' | '));
else console.log('OK: no console or page errors');

await browser.close();
console.log(process.exitCode ? 'REPO-MAP UI CHECK: FAILED' : 'REPO-MAP UI CHECK: PASS');
