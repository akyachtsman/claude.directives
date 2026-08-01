// Playwright UI test for the repo map (docs/site/logical-map.html — this repo's
// only interactive Pages artifact; the physical view was retired 2026-07-21).
// Applies the exported UI-testing standard (test.md / templates/ui-tests) to
// claude.directives itself: a real browser asserts the map renders and that its
// interactions don't regress.
//
// Every assertion here exists because the behaviour it guards was broken at
// least once. Run in CI by qa.yml, which installs Chromium first.
// ESM (matches the other check-*.js).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const MAP = 'file://' + (process.env.REPO_MAP_FILE
  ? resolve(process.env.REPO_MAP_FILE)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/site/logical-map.html'));
const fail = m => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = m => console.log('OK: ' + m);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, hasTouch: true });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(MAP);
await page.waitForTimeout(400);

/* ---------------------------------------------------------------- renders */
const counts = await page.evaluate(() => ({
  frames: document.querySelectorAll('.fr').length,
  chips: document.querySelectorAll('.f').length,
  edges: document.querySelectorAll('.edge').length,
}));
if (counts.frames < 8) fail(`expected >=8 frames, found ${counts.frames}`);
else ok(`${counts.frames} frames, ${counts.chips} file chips, ${counts.edges} edges render`);
if (counts.chips < 90) fail(`expected >=90 file chips, found ${counts.chips}`);
if (counts.edges < 1) fail('no edges drawn');

// No frame may clip its own contents. The generator cannot measure text, so the
// page auto-fits on load — when that broke, files silently vanished off the
// bottom of a box with nothing on screen to say so.
const clipped = await page.$$eval('.fr', fs => fs
  .filter(f => f.scrollHeight > f.clientHeight + 1)
  .map(f => `${f.dataset.id} needs ${f.scrollHeight} has ${f.clientHeight}`));
if (clipped.length) fail(`frames clip their contents: ${clipped.join(', ')}`);
else ok('every frame fits its contents');

/* ------------------------------------------------------------ move/resize */
const geomOf = id => page.evaluate(i => {
  const f = document.querySelector(`.fr[data-id="${i}"]`);
  return { x: parseFloat(f.style.left), y: parseFloat(f.style.top),
           w: parseFloat(f.style.width), h: parseFloat(f.style.height) };
}, id);

const drag = async (selector, dx, dy) => {
  const bb = await (await page.$(selector)).boundingBox();
  if (!bb) return fail(`${selector} has no bounding box`);
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(bb.x + bb.width / 2 + dx * i / 8, bb.y + bb.height / 2 + dy * i / 8);
  }
  await page.mouse.up();
  await page.waitForTimeout(80);
};

// Resize first, and on the top-left frame: moving a frame can slide its corner
// handle under the legend overlay, which makes a working resize look broken.
const before = await geomOf('orchestrator');
await drag('.fr[data-id="orchestrator"] .rs', 90, 70);
const resized = await geomOf('orchestrator');
if (resized.w <= before.w || resized.h <= before.h) {
  fail(`dragging the corner did not resize (${JSON.stringify(before)} -> ${JSON.stringify(resized)})`);
} else if (resized.x !== before.x || resized.y !== before.y) {
  fail('resizing a frame also moved it');
} else ok('dragging the corner resizes a frame');

// Drag by the BODY, not the title. The title bar alone is a ~15px strip — about
// 10px on screen at the default zoom — and was far too small to grab.
await drag('.fr[data-id="orchestrator"] .fd', 120, 60);
const moved = await geomOf('orchestrator');
if (moved.x <= resized.x || moved.y <= resized.y) {
  fail(`dragging a frame body did not move it (${JSON.stringify(resized)} -> ${JSON.stringify(moved)})`);
} else if (moved.w !== resized.w || moved.h !== resized.h) {
  fail('moving a frame also resized it');
} else ok('dragging a frame body moves it');

// The layout the reader arranges is theirs, so it has to survive a reload.
await page.reload();
await page.waitForTimeout(400);
const restored = await geomOf('orchestrator');
if (Math.abs(restored.x - moved.x) > 1 || Math.abs(restored.w - moved.w) > 1) {
  fail(`layout not persisted across reload (${JSON.stringify(moved)} -> ${JSON.stringify(restored)})`);
} else ok('a moved and resized frame survives a reload');

/* ----------------------------------------------------------------- toggles */
// Header controls must stay clickable — a wrapped header once let the canvas
// overlay them, and page.click is what caught it.
await page.click('#t_reset');
await page.waitForTimeout(250);
const afterReset = await geomOf('orchestrator');
if (Math.abs(afterReset.x - restored.x) < 1 && Math.abs(afterReset.w - restored.w) < 1) {
  fail('reset did not restore the default layout');
} else ok('reset restores the default layout');

const selfState = () => page.evaluate(() => ({
  hidden: getComputedStyle(document.querySelector('.fr[data-id="self"]')).display === 'none',
  othersVisible: [...document.querySelectorAll('.fr')]
    .filter(f => f.dataset.id !== 'self')
    .every(f => getComputedStyle(f).display !== 'none'),
  edges: document.querySelectorAll('.edge').length,
}));
const allShown = await selfState();
await page.click('#t_self');
await page.waitForTimeout(250);
const onlyExports = await selfState();
if (!onlyExports.hidden) fail('"exports only" did not hide the self frame');
else if (!onlyExports.othersVisible) fail('"exports only" hid an exported frame');
else if (onlyExports.edges >= allShown.edges) fail('"exports only" left the self frame\'s edges dangling');
else ok('"exports only" hides the self frame and its edges');
await page.click('#t_self');
await page.waitForTimeout(200);
if ((await selfState()).hidden) fail('"exports only" is not reversible');
else ok('"exports only" is reversible');

for (const [id, sel, what] of [
  ['#t_cmp', '.f .cmp', 'compartment labels'],
  ['#t_del', '.f .pill', 'delivery pills'],
]) {
  await page.click(id);
  await page.waitForTimeout(150);
  if (!(await page.$eval(sel, n => getComputedStyle(n).display === 'none'))) {
    fail(`${id} did not hide the ${what}`);
  } else ok(`${id} hides the ${what}`);
  await page.click(id);
  await page.waitForTimeout(150);
  if (await page.$eval(sel, n => getComputedStyle(n).display === 'none')) {
    fail(`${id} is not reversible`);
  }
}

await page.click('#t_edge');
await page.waitForTimeout(200);
if (await page.$$eval('.edge', e => e.length) > 0) fail('"hide arrows" left arrows drawn');
else ok('"hide arrows" hides the arrows');
await page.click('#t_edge');
await page.waitForTimeout(200);
if (await page.$$eval('.edge', e => e.length) === 0) fail('"hide arrows" is not reversible');

/* ------------------------------------------------------------------ legend */
// The legend is a child of #wrap. When #wrap's pan handler captured the pointer
// on press, the click never reached <summary> and the panel would not open.
const legendOpen = () => page.$eval('.legend', d => d.open);
if (await legendOpen()) fail('legend starts open and covers the canvas');
await page.click('.legend summary');
await page.waitForTimeout(200);
if (!(await legendOpen())) fail('clicking the legend does not open it (pan handler eating the click?)');
else ok('the legend opens on click');
const legendBody = await page.$$eval('.legend li', ns => ns.length);
if (legendBody < 15) fail(`legend opened but lists only ${legendBody} entries`);
else ok(`the legend lists ${legendBody} entries`);
await page.click('.legend summary');
await page.waitForTimeout(150);
if (await legendOpen()) fail('the legend does not close again');
else ok('the legend closes again');

/* ------------------------------------------------------------ search/isolate */
await page.fill('#search', 'qa-pipeline');
await page.waitForTimeout(200);
const hits = await page.$$eval('.f.hit', ns => ns.length);
const misses = await page.$$eval('.f.miss', ns => ns.length);
if (hits < 1) fail('search matched nothing for "qa-pipeline"');
else if (misses < 1) fail('search did not dim non-matching files');
else ok(`search highlights ${hits} file(s) and dims ${misses}`);
await page.fill('#search', '');
await page.waitForTimeout(150);

// A press that does not travel is a click (isolate); one that travels is a drag.
await page.click('.fr[data-id="artifact"] .fd');
await page.waitForTimeout(250);
const faded = await page.$$eval('.fr.faded', fs => fs.map(f => f.dataset.id));
if (!faded.length) fail('clicking a frame did not isolate it');
else if (faded.includes('behavioral')) fail('isolate dimmed a frame connected to the clicked one');
else ok(`clicking a frame isolates it (${faded.length} unrelated frames dimmed)`);
await page.click('.fr[data-id="artifact"] .fd');
await page.waitForTimeout(200);

// Dragging a frame must NOT also isolate it — the click fires after pointerup.
const preDrag = await geomOf('reference');
await drag('.fr[data-id="reference"] .fd', 60, 40);
if ((await geomOf('reference')).x <= preDrag.x) fail('dragging a frame body did not move it');
else if ((await page.$$eval('.fr.faded', fs => fs.length)) > 0) {
  fail('dragging a frame also isolated it');
} else ok('dragging a frame body moves it without isolating');

/* -------------------------------------------------------------- pan / zoom */
// Scroll must PAN, on both axes. Treating every wheel event as zoom walled the
// map in: a trackpad swipe sends deltaX with deltaY 0, and `deltaY < 0` is false
// for 0, so sideways swipes silently zoomed out instead of moving.
const view = () => page.evaluate(() => {
  const t = getComputedStyle(document.getElementById('viewport')).transform;
  const m = new DOMMatrixReadOnly(t);
  return { x: m.e, y: m.f, scale: m.a };
});
await page.mouse.move(600, 500);
const v0 = await view();
for (let i = 0; i < 4; i++) await page.mouse.wheel(-150, 0);
await page.waitForTimeout(150);
const vx = await view();
if (Math.abs(vx.x - v0.x) < 100) fail('horizontal scroll does not pan');
else if (Math.abs(vx.scale - v0.scale) > 0.001) fail('horizontal scroll changed the zoom');
else ok('horizontal scroll pans without zooming');

for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -150);
await page.waitForTimeout(150);
const vy = await view();
if (Math.abs(vy.y - vx.y) < 100) fail('vertical scroll does not pan');
else if (Math.abs(vy.scale - vx.scale) > 0.001) fail('vertical scroll changed the zoom');
else ok('vertical scroll pans without zooming');

await page.keyboard.down('Control');
await page.mouse.wheel(0, -240);
await page.keyboard.up('Control');
await page.waitForTimeout(150);
if ((await view()).scale <= vy.scale) fail('ctrl+scroll does not zoom in');
else ok('ctrl/pinch+scroll zooms');

await page.click('#zin'); await page.waitForTimeout(120);
const zoomed = await view();
await page.click('#zout'); await page.waitForTimeout(120);
if ((await view()).scale >= zoomed.scale) fail('the zoom buttons do not work');
else ok('the +/- buttons zoom');

/* ------------------------------------------- input surface: touch, keys, pan */
// These cover the ways INTO the map that a mouse-driven test never exercises.
// Each was found by auditing the input surface deliberately rather than by
// waiting for the next bug report.

// Pinch, via real multi-touch. A trackpad pinch is a ctrlKey wheel event, but on
// a touch screen it is two pointers — without handling them there was no way to
// zoom on a tablet at all.
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent',
  { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i })) });
const beforePinch = await view();
await touch('touchStart', [{ x: 600, y: 500 }, { x: 800, y: 500 }]);
for (let i = 1; i <= 8; i++) {
  await touch('touchMove', [{ x: 600 - i * 18, y: 500 }, { x: 800 + i * 18, y: 500 }]);
}
await touch('touchEnd', []);
await page.waitForTimeout(150);
if ((await view()).scale <= beforePinch.scale) fail('two-finger pinch does not zoom');
else ok('two-finger pinch zooms on touch');

// Space- and middle-drag must pan even when a frame is under the cursor, because
// once you zoom in the frames cover nearly all of the canvas.
const overFrame = await (await page.$('.fr[data-id="standard"] .fd')).boundingBox();
const vMid = await view();
await page.mouse.move(overFrame.x + 40, overFrame.y + 4);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(overFrame.x + 220, overFrame.y + 60, { steps: 6 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(150);
if (Math.abs((await view()).x - vMid.x) < 50) fail('middle-drag does not pan over a frame');
else ok('middle-drag pans over a frame');

// Keyboard: none of this was reachable without a pointer.
if (!(await page.$('.fr[tabindex]'))) fail('frames are not reachable by keyboard');
else ok('frames are reachable by keyboard');
const vKey = await view();
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(120);
if ((await view()).x <= vKey.x) fail('arrow keys do not pan');
else ok('arrow keys pan');

// "fit" recentres WITHOUT discarding the arranged layout. reset was previously
// the only way back from an off-screen pan, and it also wiped every moved frame.
await drag('.fr[data-id="behavioral"] .fd', 100, 50);
const arranged = await geomOf('behavioral');
await page.click('#t_fit');
await page.waitForTimeout(200);
const keptLayout = await geomOf('behavioral');
if (Math.abs(keptLayout.x - arranged.x) > 1 || Math.abs(keptLayout.y - arranged.y) > 1) {
  fail('"fit" moved the frames — it must only recentre the view');
} else ok('"fit" recentres without disturbing the arranged layout');

/* ------------------------------------------------------------------ canvas */
// Dragging empty canvas must pan, not select the page text.
await page.mouse.move(120, 880);
await page.mouse.down();
await page.mouse.move(260, 800, { steps: 8 });
await page.mouse.move(340, 760, { steps: 8 });
await page.mouse.up();
const sel = await page.evaluate(() => String(window.getSelection()));
if (sel !== '') fail(`dragging selected text: ${JSON.stringify(sel)}`);
else ok('dragging the canvas selects no text');

if (errors.length) fail('console/page errors: ' + errors.join(' | '));
else ok('no console or page errors');

await browser.close();
console.log(process.exitCode ? 'REPO-MAP UI CHECK: FAILED' : 'REPO-MAP UI CHECK: PASS');
