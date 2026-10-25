// check-fit-cases.js — proves the UI kit's fit check (templates/ui-tests/tests/
// lib/fit.js) and the house pop-overs and dialog it guards, in a phone-sized
// browser, on both engines: Chromium (Android) and WebKit (every iPhone
// browser). design.md -> iPhone and iPad; test.md -> UI coverage gates,
// *Overlays fit and scroll*.
//
// Two halves, one page per case, each built from the SHIPPED tokens.css and
// components.css:
//   * the house components pass: a long type-ahead list (also one already
//     scrolled to its end), a long ⋮ menu, a dialog taller than the screen,
//     an overlay holding visually-hidden text;
//   * each way an overlay fails on an iPhone is caught, with the problem it
//     must name: a sheet that clips its list (the 2026-10-25 board-post list),
//     a pop-over running off the screen or opened wholly below it, a script
//     scroll lock that cancels touchmove, touch-action: none, and a script
//     that puts scrollTop back.
// A fit.js that stops catching one of them turns its case red; a house rule
// that stops fitting turns a house case red.
//
// Run in CI by qa.yml's Repo Map UI job, which installs both browsers. Locally:
//   node .github/scripts/check-fit-cases.js
//   FIT_BROWSERS=chromium node .github/scripts/check-fit-cases.js   # no WebKit here
// Every browser named in FIT_BROWSERS must launch; one that cannot fails the
// run rather than being skipped, so a green run always covered both engines.
import { chromium, webkit, devices } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { fitProblems, FIT_INCOMPLETE } from '../../templates/ui-tests/tests/lib/fit.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CSS = ['templates/styles/tokens.css', 'templates/styles/components.css']
  .map(f => readFileSync(resolve(ROOT, f), 'utf8')).join('\n');
const fail = m => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = m => console.log('OK: ' + m);

const rows = (n, cls = 'list-option', role = 'option') => Array.from({ length: n },
  (_, i) => `<div class="${cls}" role="${role}" id="o${i}">/type${i}<span class="list-hint">what it does</span></div>`).join('');
const items = n => Array.from({ length: n }, (_, i) => `<button class="menu-item" type="button">Action ${i}</button>`).join('');
const paras = n => Array.from({ length: n }, (_, i) => `<p>Paragraph ${i} of a dialog body long enough to need scrolling on a phone.</p>`).join('');

// Each case: the page body, an optional script, and the problem kinds expected
// (an empty list: no problem at all). `touch` marks a kind only a touch-enabled
// page can see; both pages here are touch-enabled, as the kit's iphone and
// mobile-chrome projects are.
const CASES = [
  { name: 'house type-ahead list, 30 choices, under a field',
    body: `<div class="page"><label class="field"><span class="label">Post</span><textarea class="input" role="combobox" aria-expanded="true" aria-controls="lp"></textarea></label></div>
           <div class="list-pop" role="listbox" id="lp" style="top:140px;left:12px"><div class="list-head">Start with a type</div>${rows(30)}</div>`,
    target: '.list-pop', expect: [] },
  { name: 'house type-ahead list already scrolled to its last choice',
    body: `<div class="list-pop" role="listbox" id="lp" style="top:100px;left:12px">${rows(30)}</div>`,
    script: `const l = document.getElementById('lp'); l.scrollTop = l.scrollHeight;`,
    target: '.list-pop', expect: [] },
  { name: 'house ⋮ menu, 40 actions',
    body: `<div class="menu-pop" id="mp" style="top:80px;right:12px">${items(40)}</div>`,
    target: '.menu-pop', expect: [] },
  { name: 'house dialog taller than the screen',
    body: `<div class="dialog-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dt">
             <div class="dialog-header"><h2 class="dialog-title" id="dt">New board post</h2><button class="btn btn-icon" aria-label="Close" title="Close">×</button></div>
             <div class="dialog-body">${paras(60)}</div>
             <div class="dialog-footer"><button class="btn">Cancel</button><button class="btn btn-primary">Post</button></div></div></div>`,
    target: '.dialog-backdrop', expect: [] },
  { name: 'house native <dialog> taller than the screen',
    body: `<dialog class="dialog" id="nd" aria-labelledby="ndt"><div class="dialog-header"><h2 class="dialog-title" id="ndt">Rename</h2></div>
             <div class="dialog-body">${paras(60)}</div><div class="dialog-footer"><button class="btn">Cancel</button></div></dialog>`,
    script: `document.getElementById('nd').showModal();`,
    target: 'dialog.dialog', expect: [] },
  { name: 'visually-hidden text inside a pinned overlay is not a problem',
    body: `<div class="menu-pop" style="top:80px;left:12px">${items(3)}
             <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">Menu, 3 actions</span>
             <span style="position:absolute;left:-9999px">Off-screen label</span></div>`,
    target: '.menu-pop', expect: [] },
  { name: 'a sheet that clips its list (the board-post composer)',
    body: `<div id="sheet" style="position:fixed;left:0;right:0;bottom:0;height:420px;overflow:hidden;background:#fff">
             <textarea class="input" style="width:100%"></textarea><div id="list">${rows(30)}</div></div>`,
    target: '#sheet', expect: ['CUT OFF'] },
  { name: 'a pop-over that runs off the bottom of the screen',
    body: `<div id="pop" style="position:fixed;left:12px;top:400px;width:300px;background:#fff">${rows(30)}</div>`,
    target: '#pop', expect: ['OFF SCREEN'] },
  { name: 'a menu opened wholly below the screen (under the keyboard)',
    body: `<div class="menu-pop" id="mp" style="top:2000px;left:12px">${items(3)}</div>`,
    target: '.menu-pop', expect: ['OFF SCREEN'] },
  { name: 'a script scroll lock that cancels every touchmove',
    body: `<div class="list-pop" role="listbox" style="top:100px;left:12px">${rows(30)}</div>`,
    script: `document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });`,
    target: '.list-pop', expect: ['NO TOUCH SCROLL'] },
  { name: 'touch-action: none on the list',
    body: `<div class="list-pop" role="listbox" style="top:100px;left:12px;touch-action:none">${rows(30)}</div>`,
    target: '.list-pop', expect: ['NO TOUCH SCROLL'] },
  { name: 'a script that puts the scroll position back',
    body: `<div class="list-pop" role="listbox" id="lp" style="top:100px;left:12px">${rows(30)}</div>`,
    script: `const l = document.getElementById('lp'); l.addEventListener('scroll', () => { l.scrollTop = 0; });`,
    target: '.list-pop', expect: ['DOES NOT SCROLL'] },
];

const CASE_MS = 20000;

const ENGINES = {
  chromium: { type: chromium, context: { ...devices['Pixel 5'] } },
  webkit: { type: webkit, context: { ...devices['iPhone 12'] } },
};
const wanted = (process.env.FIT_BROWSERS || 'chromium,webkit').split(',').map(s => s.trim()).filter(Boolean);

for (const engine of wanted) {
  const spec = ENGINES[engine];
  if (!spec) { fail(`FIT_BROWSERS names "${engine}"; known: ${Object.keys(ENGINES).join(', ')}`); continue; }
  let browser;
  try {
    browser = await spec.type.launch(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  } catch (e) {
    fail(`${engine} did not launch, so nothing was checked on it: ${String(e.message).split('\n')[0]}`);
    continue;
  }
  const context = await browser.newContext(spec.context);
  // Warm the engine before the first case: on 2026-10-25 a cold WebKit in CI
  // took more than the kit's 2s FIT_MS on its first call and failed a house
  // case that passes warm. These cases test what the check FINDS, so each also
  // gets a generous cap; the 2s cap is DISMISS's budget, not a property of fit.
  const warm = await context.newPage();
  await warm.setContent('<!doctype html><p>warm</p>');
  await fitProblems(warm.locator('p'), { timeout: CASE_MS });
  await warm.close();
  for (const c of CASES) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head>
      <body>${c.body}${c.script ? `<script>${c.script}</script>` : ''}</body></html>`);
    const problems = await fitProblems(page.locator(c.target), { timeout: CASE_MS });
    const kinds = [...new Set(problems.map(p => p.split(':')[0]))].sort();
    const want = [...c.expect].sort();
    const tag = `[${engine}] ${c.name}`;
    if (errors.length) fail(`${tag}: page error ${errors[0]}`);
    else if (problems.some(p => p.startsWith(FIT_INCOMPLETE))) fail(`${tag}: the check did not finish in ${CASE_MS}ms: ${problems.join(' | ')}`);
    else if (JSON.stringify(kinds) !== JSON.stringify(want)) {
      fail(`${tag}: expected ${want.length ? want.join(', ') : 'no problem'}, got ${problems.length ? problems.join(' | ') : 'no problem'}`);
    } else ok(`${tag}: ${want.length ? want.join(', ') : 'fits and scrolls'}`);
    await page.close();
  }
  await browser.close();
}
if (process.exitCode) console.error('check-fit-cases: FAILED');
else console.log(`check-fit-cases: OK on ${wanted.join(' + ')}`);
