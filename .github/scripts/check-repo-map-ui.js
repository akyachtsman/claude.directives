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

// CI runs `npx playwright install chromium` first. Sandboxed dev environments
// often ship a pinned Chromium instead, which the bundled version will not find
// — CHROMIUM_PATH points the run at it so the gate is runnable before pushing.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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
// counts.edges is expected to be 0 here — arrows are drawn on demand, and the
// dedicated section below asserts that. See "arrows on demand".

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
// All four fields: a save() that dropped y or h passed the old x/w-only check.
const lost = ['x', 'y', 'w', 'h'].filter(k => Math.abs(restored[k] - moved[k]) > 1);
if (lost.length) {
  fail(`layout not persisted across reload (${lost.join('/')} lost: ${JSON.stringify(moved)} -> ${JSON.stringify(restored)})`);
} else ok('a moved and resized frame survives a reload (x, y, w, h)');

/* ----------------------------------------------------------------- toggles */
// Header controls must stay clickable — a wrapped header once let the canvas
// overlay them, and page.click is what caught it.
await page.click('#t_reset');
await page.waitForTimeout(250);
const afterReset = await geomOf('orchestrator');
// Compare against `before` — the geometry of a clean first load, which is the
// default AFTER autofit has settled it and therefore exactly what reset must
// reproduce. (The generator's raw data-x/y/w/h is the wrong target: autofit
// legitimately grows frames and pushes the rows below them down, so reset lands
// ~18px below the declared y by design.)
// The old check only asserted afterReset DIFFERED from the dragged state by >=1px,
// which any wrong layout also satisfies.
const offBy = ['x', 'y', 'w', 'h'].filter(k => Math.abs(afterReset[k] - before[k]) > 1);
if (offBy.length) {
  fail(`reset did not restore the default layout (${offBy.map(k => `${k}: ${afterReset[k]} vs ${before[k]}`).join(', ')})`);
} else ok('reset restores the default layout exactly');

// A frame must be draggable past the canvas origin. Clamping x/y at 0 made
// frames stop dead when dragged left or up, with empty canvas still beside them.
// Runs AFTER the persistence checks — it ends in a reset, which clears the
// stored layout those checks depend on.
await drag('.fr[data-id="standard"] .fd', -400, -300);
const pushed = await geomOf('standard');
// `||`, not `&&`: a clamp restored on ONE axis leaves the other negative, and a
// conjunction then reports the drag as free while half of it is pinned.
if (pushed.x >= 0 || pushed.y >= 0) {
  fail(`a frame cannot be dragged past the origin on both axes (landed at ${pushed.x},${pushed.y})`);
} else ok('a frame drags past the canvas origin into negative space');
await page.click('#t_fit');
await page.waitForTimeout(250);
const backInView = await page.evaluate(() => {
  const f = document.querySelector('.fr[data-id="standard"]').getBoundingClientRect();
  const w = document.getElementById('wrap').getBoundingClientRect();
  return f.right > w.left && f.left < w.right && f.bottom > w.top && f.top < w.bottom;
});
if (!backInView) fail('"fit" does not bring a negatively-positioned frame back into view');
else ok('"fit" frames negative coordinates correctly');
await page.click('#t_reset');
await page.waitForTimeout(250);

const selfState = () => page.evaluate(() => ({
  hidden: getComputedStyle(document.querySelector('.fr[data-id="self"]')).display === 'none',
  othersVisible: [...document.querySelectorAll('.fr')]
    .filter(f => f.dataset.id !== 'self')
    .every(f => getComputedStyle(f).display !== 'none'),
  edges: document.querySelectorAll('.edge').length,
}));
// Draw the whole graph first: edge counts are 0 at rest now, so comparing them
// would compare nothing.
await page.click('#t_edge');
await page.waitForTimeout(250);
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
await page.click('#t_edge');
await page.waitForTimeout(200);

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

/* --------------------------------------------------- progressive disclosure */
// 109 filenames at 10px is a reference table, not a map. A frame leads with what
// the class IS and how it is delivered; the files are one click away.
const visibleFiles = () => page.$$eval('.f', fs => fs.filter(f => f.offsetParent !== null).length);
if (await visibleFiles() !== 0) fail('filenames are shown before any frame is opened');
else ok('no filenames at rest — each frame leads with its meaning');
const bars = await page.$$eval('.bar', b => b.length);
if (bars < 6) fail(`expected a delivery-mix bar per class, found ${bars}`);
else ok(`${bars} delivery-mix bars — a class's shape is readable without counting chips`);

await page.click('.fr[data-id="mechanical"] .more');
await page.waitForTimeout(300);
const opened = await visibleFiles();
if (opened < 20) fail(`opening a frame revealed ${opened} files`);
else ok(`opening a frame reveals its ${opened} files`);
await page.click('.fr[data-id="mechanical"] .more');
await page.waitForTimeout(300);
if (await visibleFiles() !== 0) fail('closing a frame left its files shown');
else ok('closing a frame hides them again');

// A match inside a collapsed frame would be invisible, so search must open it.
await page.fill('#search', 'qa-pipeline');
await page.waitForTimeout(400);
const shown = await visibleFiles();
const hitsNow = await page.$$eval('.f.hit', f => f.length);
if (hitsNow < 1) fail('search matched nothing');
else if (shown === 0) fail('search matched but left every frame collapsed — the hit is invisible');
else if (shown > 30) fail(`search opened too much (${shown} files shown for ${hitsNow} hit)`);
else ok(`search opens only the frame holding the hit (${shown} files shown)`);
await page.fill('#search', '');
await page.waitForTimeout(300);

/* ------------------------------------------------------- arrows on demand */
// Ten arrows across eight draggable boxes cannot be read no matter how well
// each is routed, so nothing is drawn until a frame is selected. The
// relationships are still stated in words on every frame, so no information is
// hidden by this — check that first, because the text is what makes the quiet
// default acceptable.
const rels = await page.$$eval('.rel', ns => ns.length);
const framesWithRels = await page.$$eval('.fr', fs =>
  fs.filter(f => f.querySelector('.rel')).length);
if (rels < 15) fail(`expected every relationship stated in words, found ${rels} chips`);
else if (framesWithRels < 8) fail(`${8 - framesWithRels} frame(s) state no relationships`);
else ok(`all 8 frames state their relationships in words (${rels} chips)`);

if (await page.$$eval('.edge', e => e.length) !== 0) {
  fail('arrows are drawn before any frame is selected');
} else ok('no arrows at rest — the map is quiet until you ask');

// ONE arrow at a time. Crossing-free routing is not achievable in general once
// the reader fixes node positions by dragging, so "no lines cross" can only be
// guaranteed by drawing a single line. Every relationship chip must draw exactly
// one — this is the assertion that makes the guarantee real rather than hoped for.
const chips = await page.$$('.rel');
// EVERY count, not a running max: `Math.max` passes as long as ONE chip draws a
// single arrow, so a routing regression that drew nothing for the other 19 would
// still report "exactly one arrow" for all of them.
const chipCounts = [];
for (const c of chips) {
  await c.click();
  await page.waitForTimeout(80);
  chipCounts.push(await page.$$eval('.edge', e => e.length));
  await c.click();
  await page.waitForTimeout(50);
}
const badChip = chipCounts.findIndex(n => n !== 1);
if (chips.length < 15) fail(`expected a chip per relationship, found ${chips.length}`);
else if (badChip !== -1) fail(`relationship chip #${badChip + 1} drew ${chipCounts[badChip]} arrows — every chip must draw exactly 1 (counts: ${chipCounts.join(',')})`);
else ok(`each of the ${chips.length} relationship chips draws exactly one arrow`);
if (await page.$$eval('.edge', e => e.length) !== 0) fail('clicking a chip twice left it drawn');
else ok('clicking a chip again clears it');

// Selecting a frame shows its whole fan again — the one-arrow restriction was a
// workaround for a router that could not keep several lines legible.
await page.click('.fr[data-id="standard"] .fd');
await page.waitForTimeout(250);
const fan = await page.$$eval('.edge', e => e.length);
if (fan < 2) fail(`selecting a frame drew ${fan} arrows — expected its whole fan`);
else ok(`selecting a frame draws its ${fan} connections`);
await page.click('.fr[data-id="standard"] .fd');
await page.waitForTimeout(150);

// THE invariant the channel routing guarantees: a run lives in a row gap or a
// margin, never behind a frame. Checked with every arrow drawn, and again after
// the layout is rearranged.
const throughFrames = () => page.evaluate(() => {
  const fr = [...document.querySelectorAll('.fr')]
    .filter(f => getComputedStyle(f).display !== 'none')
    .map(f => ({ id: f.dataset.id, x: parseFloat(f.style.left), y: parseFloat(f.style.top),
                 w: parseFloat(f.style.width), h: parseFloat(f.style.height) }));
  const out = [];
  for (const g of document.querySelectorAll('.edge')) {
    const ends = new Set([g.dataset.a, g.dataset.b]);
    const path = g.querySelector('.line'), L = path.getTotalLength();
    const bad = new Set();
    for (let i = 0; i <= 300; i++) {
      const q = path.getPointAtLength(L * i / 300);
      for (const f of fr) {
        if (ends.has(f.id)) continue;
        if (q.x > f.x + 3 && q.x < f.x + f.w - 3 && q.y > f.y + 3 && q.y < f.y + f.h - 3) bad.add(f.id);
      }
    }
    if (bad.size) out.push(`${g.dataset.a}->${g.dataset.b} thru ${[...bad].join(',')}`);
  }
  return out;
});
await page.click('#t_edge');
await page.waitForTimeout(300);
const drawnAll = await page.$$eval('.edge', e => e.length);
if (drawnAll < 10) fail(`"all arrows" drew ${drawnAll}`);
const behind = await throughFrames();
if (behind.length) fail(`a run passes behind a frame: ${behind.join(' | ')}`);
else ok(`all ${drawnAll} arrows route in gaps and margins — none behind a frame`);

// "Arrows are not very distinct and apart" — the defect a human reported while
// every assertion above was green. Nothing here measured whether two lines run
// ALONGSIDE each other, only whether they hit a frame, so six near-parallel runs
// bundled 11px apart in one band passed as clean routing.
//
// A genuine crossing is two lines sharing a point or two; a bundle is two lines
// sharing hundreds. So measure the LENGTH of each edge that runs within `NEAR`
// of another edge: a crossing contributes a few px, a parallel run contributes
// its whole span.
const shadowed = (near = 11, budget = 46) => page.evaluate(([near, budget]) => {
  const sample = p => {
    const L = p.getTotalLength(), step = 4, out = [];
    for (let d = 0; d <= L; d += step) { const q = p.getPointAtLength(d); out.push([q.x, q.y]); }
    return { pts: out, step };
  };
  const es = [...document.querySelectorAll('.edge')]
    .map(g => ({ id: `${g.dataset.a}->${g.dataset.b}`, ...sample(g.querySelector('.line')) }));
  const out = [];
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    let n = 0;
    for (const [x1, y1] of es[i].pts) {
      for (const [x2, y2] of es[j].pts) {
        if (Math.abs(x1 - x2) < near && Math.abs(y1 - y2) < near
            && Math.hypot(x1 - x2, y1 - y2) < near) { n++; break; }
      }
    }
    const len = n * es[i].step;
    if (len > budget) out.push(`${es[i].id} runs ${Math.round(len)}px alongside ${es[j].id}`);
  }
  return out;
}, [near, budget]);

const bundled = await shadowed();
if (bundled.length) fail(`lines are not distinct and apart: ${bundled.join(' | ')}`);
else ok('no two arrows run alongside each other — every near-approach is a crossing');

// Labels are part of the line. Two stacked on the same spot is the same defect
// as two lines stacked on the same spot, and looked exactly like it on screen.
const labelClashes = await page.evaluate(() => {
  const r = [...document.querySelectorAll('.elabel-bg')].map(e => ({
    x: +e.getAttribute('x'), y: +e.getAttribute('y'),
    w: +e.getAttribute('width'), h: +e.getAttribute('height'),
    t: e.parentNode.querySelector('.elabel')?.textContent,
  }));
  const out = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    if (r[i].x < r[j].x + r[j].w && r[i].x + r[i].w > r[j].x
        && r[i].y < r[j].y + r[j].h && r[i].y + r[i].h > r[j].y) {
      out.push(`"${r[i].t}" over "${r[j].t}"`);
    }
  }
  return out;
});
if (labelClashes.length) fail(`edge labels overlap: ${labelClashes.join(', ')}`);
else ok('no two edge labels overlap');

// A label CAN sit over another line — a 90px gutter has nowhere else to put a
// 60px label — and that is fine because the label is opaque. What is not fine
// is a later edge drawing over an earlier edge's label, which is what turned
// "fills in" into "fil in". Labels live in their own layer, drawn last.
const zorder = await page.evaluate(() => {
  const kids = [...document.getElementById('edges').children];
  const lastLine = kids.map(k => k.classList.contains('edge')).lastIndexOf(true);
  const firstLabel = kids.findIndex(k => k.classList.contains('elabels'));
  return { lastLine, firstLabel, labels: document.querySelectorAll('.elab').length };
});
if (zorder.labels < 8 || zorder.firstLabel < 0 || zorder.firstLabel < zorder.lastLine) {
  fail(`edge labels are not drawn above every line (${JSON.stringify(zorder)})`);
} else ok(`all ${zorder.labels} edge labels draw above every line`);

// Frames that sit level with each other are linked side-to-side. Routing a
// sibling relationship up into the band above and back down again is longer,
// harder to follow, and burns a lane in the busiest channel on the map.
// Counted on the halo, which is the unbroken route — the visible line carries
// hop-breaks, so its command count says nothing about how many corners it turns.
const siblings = await page.$$eval('.edge', gs => gs
  .filter(g => ['orchestrator->behavioral', 'behavioral->artifact']
    .includes(`${g.dataset.a}->${g.dataset.b}`))
  .map(g => (g.querySelector('.halo').getAttribute('d').match(/Q/g) || []).length));
if (siblings.length !== 2 || siblings.some(n => n > 0)) {
  fail(`a side-by-side link detours instead of going straight across (${siblings})`);
} else ok(`${siblings.length} side-by-side links go straight across`);

// Where lines genuinely cross, the crossed one breaks so it reads as a crossing
// rather than a join (the circuit-diagram convention, ported from relHopPath).
const breaks = await page.$$eval('.edge .line', ps =>
  ps.reduce((n, p) => n + ((p.getAttribute('d') || '').split(' M ').length - 1), 0));
if (breaks < 1) fail('no hop-breaks drawn where lines cross');
else ok(`${breaks} hop-breaks drawn where lines cross`);
// Leave "all arrows" off again — the assertions below toggle it themselves and
// would otherwise be measuring from the opposite state.
await page.click('#t_edge');
await page.waitForTimeout(200);

await page.click('#t_edge');
await page.waitForTimeout(250);
if (await page.$$eval('.edge', e => e.length) < 10) fail('"all arrows" did not draw the full graph');
else ok('"all arrows" draws the full graph on request');

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

/* --------------------------------------------------- edges must not cross */
// The invariant a reader actually sees: an arrow may touch the two frames it
// connects and NOTHING else. This is asserted on the default layout AND after
// frames have been dragged into arbitrary positions, because the first router
// only ever avoided the shipped layout — the moment a reader moved a box, edges
// went straight through it. Every earlier version of this suite tested
// interactions and never once looked at where the lines actually went.
const crossings = () => page.evaluate(() => {
  const fr = [...document.querySelectorAll('.fr')]
    .filter(f => getComputedStyle(f).display !== 'none')
    .map(f => ({ id: f.dataset.id, x: parseFloat(f.style.left), y: parseFloat(f.style.top),
                 w: parseFloat(f.style.width), h: parseFloat(f.style.height) }));
  const out = [];
  for (const g of document.querySelectorAll('.edge')) {
    const path = g.querySelector('.line'), L = path.getTotalLength();
    // an edge legitimately touches the frames it starts and ends on
    const ends = new Set();
    for (const t of [0, L]) {
      const p = path.getPointAtLength(t);
      for (const f of fr) {
        if (p.x >= f.x - 2 && p.x <= f.x + f.w + 2 && p.y >= f.y - 2 && p.y <= f.y + f.h + 2) ends.add(f.id);
      }
    }
    // A frame overlapping one of this edge's endpoints cannot be avoided — the
    // route has to start inside it. Readers can stack frames, so exclude those.
    const overlapsEnd = f => [...ends].some(id => {
      const e = fr.find(x => x.id === id);
      return e && f.x < e.x + e.w && f.x + f.w > e.x && f.y < e.y + e.h && f.y + f.h > e.y;
    });
    const through = new Set();
    for (let i = 0; i <= 300; i++) {
      const p = path.getPointAtLength(L * i / 300);
      for (const f of fr) {
        if (ends.has(f.id) || overlapsEnd(f)) continue;
        if (p.x > f.x + 2 && p.x < f.x + f.w - 2 && p.y > f.y + 2 && p.y < f.y + f.h - 2) through.add(f.id);
      }
    }
    if (through.size) out.push(`${g.dataset.kind} → ${[...through].join(', ')}`);
  }
  return out;
});

if (await page.$$eval('.edge', e => e.length) < 10) {
  await page.click('#t_edge'); await page.waitForTimeout(250);
}
const clean = await crossings();
if (clean.length) fail(`edges cross frames in the default layout: ${clean.join(' | ')}`);
else ok('no edge crosses a frame it does not connect (default layout)');

for (const [id, dx, dy] of [['behavioral', 260, 180], ['mechanical', -150, 120],
                            ['artifact', -320, 240], ['reference', -260, -180]]) {
  await drag(`.fr[data-id="${id}"] .fd`, dx, dy);
}
await page.waitForTimeout(250);
const shuffled = await crossings();
if (shuffled.length) fail(`edges cross frames after the layout is rearranged: ${shuffled.join(' | ')}`);
else ok('no edge crosses a frame after the layout is rearranged');
await page.click('#t_reset');
await page.waitForTimeout(250);
if (await page.$$eval('.edge', e => e.length) !== 0) fail('reset left arrows drawn');

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
// Re-centre first: the pinch above zooms in and can leave this frame off-screen,
// which would make a working middle-drag look broken.
await page.click('#t_fit');
await page.waitForTimeout(250);
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

/* ------------------------------------------- a reader's own arrangement */
// Reported by a human looking at the live page: the link between two boxes
// standing side by side ran the whole way round a third box to reach its
// neighbour. Two frames offset vertically fell under the side-link threshold,
// so the edge went to the band router — and the nearest band was the one ABOVE
// the frame in between. The scripted drags above never produced that shape.
//
// This runs last: it replaces the saved layout and reloads, which would strand
// every assertion before it.
// The frame ids are singular — `standard`, not `standards`. A key that matches
// no frame is silently dropped on load, so a typo here does not fail: it just
// quietly leaves that frame at its default position and tests something else.
const arrange = async layout => {
  await page.evaluate(l => localStorage.setItem('logical-map.layout.v2', JSON.stringify(l)), layout);
  await page.goto(MAP);
  await page.waitForTimeout(400);
  const placed = await page.$$eval('.fr', fs => Object.fromEntries(
    fs.map(f => [f.dataset.id, parseFloat(f.style.top)])));
  for (const [id, g] of Object.entries(layout)) {
    if (placed[id] === undefined) fail(`test layout names a frame that does not exist: ${id}`);
    else if (Math.abs(placed[id] - g.y) > 1) fail(`test layout for ${id} was not applied`);
  }
  await page.click('#t_edge');
  await page.waitForTimeout(400);
  // Assert arrows were actually drawn. Everything downstream of arrange()
  // inspects `.edge` geometry, so if #t_edge regressed — or the router bailed
  // for every pair — those checks iterate an empty list and report success
  // ("0 arrows attach at 0 distinct points"). An empty edge set can never be
  // evidence that routing is correct.
  const drawn = await page.$$eval('.edge', e => e.length);
  if (drawn < 10) fail(`arrange(): only ${drawn} arrows drawn after "all arrows" — the geometry assertions below would pass vacuously`);
};

await arrange({
  standard:     { x: 90,   y: 60,   w: 400,  h: 260 },   // between the two below
  behavioral:   { x: 620,  y: 100,  w: 480,  h: 420 },
  orchestrator: { x: 10,   y: 490,  w: 340,  h: 200 },   // only ~30px of overlap
  artifact:     { x: 1240, y: 100,  w: 360,  h: 200 },
  mechanical:   { x: 90,   y: 780,  w: 900,  h: 220 },
  reference:    { x: 1240, y: 400,  w: 360,  h: 220 },
  external:     { x: 90,   y: 1100, w: 900,  h: 150 },
  self:         { x: 90,   y: 1400, w: 1200, h: 190 },
});

const reader = await page.evaluate(() => {
  const fr = Object.fromEntries([...document.querySelectorAll('.fr')].map(f => [f.dataset.id, {
    x: parseFloat(f.style.left), y: parseFloat(f.style.top),
    w: parseFloat(f.style.width), h: parseFloat(f.style.height) }]));
  const through = [];
  let detour = null;
  for (const g of document.querySelectorAll('.edge')) {
    const p = g.querySelector('.line'), L = p.getTotalLength();
    const hit = new Set();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i <= 300; i++) {
      const q = p.getPointAtLength(L * i / 300);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
      y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
      for (const [id, f] of Object.entries(fr)) {
        if (id === g.dataset.a || id === g.dataset.b) continue;
        if (q.x > f.x + 2 && q.x < f.x + f.w - 2 && q.y > f.y + 2 && q.y < f.y + f.h - 2) hit.add(id);
      }
    }
    if (hit.size) through.push(`${g.dataset.a}->${g.dataset.b} thru ${[...hit].join(',')}`);
    if (g.dataset.a === 'orchestrator' && g.dataset.b === 'behavioral') {
      const A = fr.orchestrator, B = fr.behavioral;
      detour = { x0, x1, y0, y1,
                 bx0: Math.min(A.x, B.x) - 4, bx1: Math.max(A.x + A.w, B.x + B.w) + 4,
                 by0: Math.min(A.y, B.y) - 4, by1: Math.max(A.y + A.h, B.y + B.h) + 4 };
    }
  }
  return { through, detour };
});
if (reader.through.length) {
  fail(`in a reader's own arrangement, edges cross frames: ${reader.through.join(' | ')}`);
} else ok("no edge crosses a frame in a reader's own arrangement");

const d = reader.detour;
if (!d) fail('the side-by-side edge was not drawn in the reader arrangement');
else if (d.x0 < d.bx0 || d.x1 > d.bx1 || d.y0 < d.by0 || d.y1 > d.by1) {
  fail('a link between neighbouring frames leaves their own bounding box — '
     + `it is going round something (${JSON.stringify(d)})`);
} else ok('offset neighbours are linked through the gap between them, not around');

const readerBundled = await shadowed();
if (readerBundled.length) {
  fail(`lines merge in a reader's arrangement: ${readerBundled.join(' | ')}`);
} else ok("no two arrows run alongside each other in a reader's arrangement");

/* --------------------------------------- two links on one frame edge */
// Also reported from the live page: two arrows drawn one on top of the other,
// reading as a single line with an arrowhead at each end. A side-to-side link
// took the middle of its own pair's vertical overlap, which knows nothing about
// the other runs touching that same frame edge. Here `standard` has three:
// out to `behavioral`, out to `mechanical`, and back in from `mechanical`.
await arrange({
  standard:     { x: 40,   y: 300,  w: 420,  h: 300 },
  behavioral:   { x: 700,  y: 200,  w: 480,  h: 420 },
  mechanical:   { x: 700,  y: 700,  w: 480,  h: 260 },
  orchestrator: { x: 40,   y: 700,  w: 340,  h: 200 },
  artifact:     { x: 1300, y: 200,  w: 300,  h: 200 },
  reference:    { x: 1300, y: 500,  w: 300,  h: 220 },
  external:     { x: 700,  y: 1050, w: 480,  h: 150 },
  self:         { x: 40,   y: 1300, w: 1200, h: 190 },
});

const stacked = await shadowed();
if (stacked.length) fail(`arrows on one frame edge merge: ${stacked.join(' | ')}`);
else ok('several links on one frame edge each get their own height');

const ports = await page.evaluate(() => {
  const at = [];
  for (const g of document.querySelectorAll('.edge')) {
    const p = g.querySelector('.line'), L = p.getTotalLength();
    for (const [id, t] of [[g.dataset.a, 0], [g.dataset.b, L]]) {
      if (id !== 'standard') continue;
      const q = p.getPointAtLength(t);
      at.push({ e: `${g.dataset.a}->${g.dataset.b}`, x: Math.round(q.x), y: Math.round(q.y) });
    }
  }
  const clash = [];
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) {
    if (Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y) < 12) {
      clash.push(`${at[i].e} and ${at[j].e} at ${at[i].x},${at[i].y}`);
    }
  }
  return { n: at.length, clash };
});
if (ports.clash.length) fail(`two arrows share one attachment point: ${ports.clash.join(', ')}`);
else ok(`${ports.n} arrows attach to "standard" at ${ports.n} distinct points`);

if (errors.length) fail('console/page errors: ' + errors.join(' | '));
else ok('no console or page errors');

await browser.close();
console.log(process.exitCode ? 'REPO-MAP UI CHECK: FAILED' : 'REPO-MAP UI CHECK: PASS');
