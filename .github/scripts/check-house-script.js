// Playwright check for the house script, templates/styles/components.js (#471):
// every behaviour design.md gives the ONE shared page script, driven in a real
// browser on .github/house-fixture/index.html, which loads the shipped
// tokens.css, components.css and components.js unchanged. Keyboard, focus and
// aria-disabled are asserted by pressing keys, not by reading attributes alone.
//
// Run in CI by qa.yml (the Repo Map UI job, which installs Chromium). Locally:
//   CHROMIUM_PATH=/path/to/chrome node .github/scripts/check-house-script.js
// ESM (matches the other check-*.js).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const PAGE = 'file://' + resolve(dirname(fileURLToPath(import.meta.url)), '../house-fixture/index.html');
const fail = m => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = m => console.log('OK: ' + m);
const check = (cond, m, detail = '') => (cond ? ok(m) : fail(detail ? `${m} (${detail})` : m));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.House && window.archivedHandle);
  return page;
}
const focusedId = page => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.textContent.trim()));
const log = page => page.evaluate(() => window.log.slice());
const clearLog = page => page.evaluate(() => { window.log.length = 0; });
const settle = page => page.waitForTimeout(80);
const inWindow = (page, sel) => page.evaluate(s => {
  const r = document.querySelector(s).getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  return { ok: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh, r: [r.left, r.top, r.right, r.bottom].map(Math.round), vw, vh };
}, sel);

const page = await open({ width: 1280, height: 800 });

/* ------------------------------------------------------------------ icons */
{
  const svg = await page.evaluate(() => {
    const s = document.querySelector('#edit-icon svg');
    return s && { hidden: s.getAttribute('aria-hidden'), name: s.dataset.iconName, kids: s.children.length };
  });
  check(svg && svg.hidden === 'true' && svg.name === 'pencil' && svg.kids > 0, 'data-icon draws the set\'s pencil, aria-hidden', JSON.stringify(svg));
  const unknown = await page.evaluate(() => { try { House.icon('nope'); return 'no throw'; } catch (e) { return e.message; } });
  check(/no icon named "nope"/.test(unknown), 'an icon the set lacks throws instead of drawing nothing', unknown);
  const set = await page.evaluate(() => House.icons);
  const need = ['plus', 'pencil', 'archive', 'trash', 'x', 'more-vertical', 'upload', 'paperclip', 'camera', 'download', 'search', 'lock', 'star', 'grip', 'arrow-left'];
  const missing = need.filter(n => !set.includes(n));
  check(!missing.length, 'the icon set covers every act in design.md §3', missing.join(', '));
}

/* ------------------------------------------------- aria-disabled guard */
{
  await clearLog(page);
  // force: Playwright itself refuses to press an aria-disabled control, and the
  // point here is what happens when a person does.
  await page.click('#locked', { force: true });
  await page.focus('#locked');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  const l = await log(page);
  check(!l.includes('locked'), 'aria-disabled cancels click, Enter and Space', l.join(','));
  check(await focusedId(page) === 'locked', 'an aria-disabled button stays focusable');
  const msg = await page.evaluate(() => {
    const b = document.getElementById('locked');
    const m = document.getElementById(b.getAttribute('aria-describedby') || '');
    return m && { text: m.textContent, cls: m.className, role: m.getAttribute('role') };
  });
  check(msg && msg.text === 'Only a manager can add items.' && /inline-msg/.test(msg.cls),
    'pressing it says why (its title) in an inline message', JSON.stringify(msg));
  const once = await page.evaluate(() => document.querySelectorAll('.inline-msg').length);
  check(once === 1, 'pressing it again reuses the one message', `${once} messages`);
  await page.click('#enabled');
  await page.focus('#enabled');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  const e = (await log(page)).filter(x => x === 'enabled').length;
  check(e === 3, 'an enabled button still takes click, Enter and Space', `${e} presses`);
  await page.evaluate(() => document.getElementById('locked').removeAttribute('aria-disabled'));
  await page.click('#locked');
  check((await log(page)).includes('locked'), 'the same button works once aria-disabled is gone');
}

/* --------------------------------------------------------------- busy */
{
  await page.click('#save-busy');
  const b = await page.evaluate(() => { const x = document.getElementById('save-busy'); return { t: x.textContent, d: x.disabled }; });
  await page.evaluate(() => window.finishSave());
  const a = await page.evaluate(() => { const x = document.getElementById('save-busy'); return { t: x.textContent, d: x.disabled }; });
  check(b.t === 'Saving…' && b.d && a.t === 'Save' && !a.d, 'busy() disables with the busy label, then restores', JSON.stringify([b, a]));
}

/* ------------------------------------------------- confirmation dialog */
{
  await clearLog(page);
  await page.click('#archive-one');
  const d = await page.evaluate(() => {
    const box = document.querySelector('dialog.dialog[open]:not(#native-dialog)');
    const t = document.getElementById(box.getAttribute('aria-labelledby'));
    return { modal: box.matches(':modal'), title: t && t.textContent,
      opener: document.getElementById('archive-one').disabled };
  });
  check(d.modal && d.title === 'Archive Walk-in fridge?', 'confirm opens a labelled native modal dialog', JSON.stringify(d));
  check(d.opener, 'the control that asked is disabled while the question is open');
  check(await focusedId(page) === 'Cancel', 'a red act puts focus on Cancel, so Enter never confirms it', await focusedId(page));
  // From Cancel, Tab goes Archive, ×, then wraps to Cancel and Archive.
  const seen = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); seen.push(await focusedId(page)); }
  check(seen.join('|') === 'Archive||Cancel|Archive',   // × has no id and no text
    'Tab stays inside the dialog', seen.join('|'));
  const trapped = await page.evaluate(() => !!document.activeElement.closest('.dialog'));
  check(trapped, 'focus is still in the dialog after Tab wraps');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  check(await page.evaluate(() => !!document.activeElement.closest('.dialog')), 'Shift+Tab stays inside the dialog too');
  await page.keyboard.press('Escape');
  await settle(page);
  check((await log(page)).includes('archive:false'), 'Esc answers no');
  check(await focusedId(page) === 'archive-one', 'closing returns focus to the opener');
  check(await page.evaluate(() => !document.getElementById('archive-one').disabled), 'the opener is enabled again');
  check(await page.evaluate(() => !document.querySelector('dialog.dialog:not(#native-dialog)')), 'the built dialog is removed once answered');

  await clearLog(page);
  await page.click('#archive-one');
  await page.click('dialog.dialog[open]:not(#native-dialog) .dialog-footer .btn-danger');
  await settle(page);
  check((await log(page)).includes('archive:true'), 'the act\'s button answers yes');

  await clearLog(page);
  await page.click('#archive-one');
  await page.mouse.click(5, 5);   // the dark backdrop
  await settle(page);
  check((await log(page)).includes('archive:false'), 'a press on the backdrop answers no');

  await clearLog(page);
  await page.click('#archive-one');
  await page.click('dialog.dialog[open]:not(#native-dialog) .dialog-header [aria-label="Close"]');
  await settle(page);
  check((await log(page)).includes('archive:false'), '× answers no');

  await clearLog(page);
  await page.click('#send');
  check(await focusedId(page) === 'Send', 'a primary act takes focus when nothing is red', await focusedId(page));
  await page.keyboard.press('Enter');
  await settle(page);
  check((await log(page)).includes('send:true'), 'Enter on the focused primary act answers yes');

  const bad = await page.evaluate(() => { try { House.confirm({ title: 'X?' }); return 'no throw'; } catch (e) { return e.message; } });
  check(/confirm is required/.test(bad), 'confirm() refuses a dialog with no act\'s verb', bad);
}

/* ------------------------------------------------------ ask and notice */
{
  await clearLog(page);
  await page.click('#rename');
  check(await page.evaluate(() => document.activeElement.classList.contains('input')), 'ask() puts focus on its field');
  // An IME's own Enter and Esc (picking or cancelling a candidate) are the field's.
  const ime = await page.evaluate(() => {
    const i = document.activeElement;
    for (const key of ['Enter', 'Escape']) i.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true }));
    return !!document.querySelector('dialog.dialog[open]:not(#native-dialog) .input');
  });
  await settle(page);
  check(ime && !(await log(page)).length, 'an Enter or Esc while an IME is composing neither saves nor closes');
  await page.keyboard.press('Escape');
  await settle(page);
  check((await log(page)).includes('rename:null'), 'Esc on an untouched field answers null');

  await clearLog(page);
  await page.click('#rename');
  await page.keyboard.type(' 2');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await settle(page);
  check(!(await log(page)).length && await page.evaluate(() => !!document.querySelector('dialog.dialog[open]:not(#native-dialog) .input')),
    'with unsaved typing, Esc and the backdrop do nothing');
  await page.keyboard.press('Enter');
  await settle(page);
  check((await log(page)).includes('rename:Walk-in fridge 2'), 'Enter saves the typed text');

  await clearLog(page);
  await page.click('#rename');
  await page.fill('dialog.dialog[open]:not(#native-dialog) .input', '');
  await page.click('dialog.dialog[open]:not(#native-dialog) .dialog-footer .btn-primary');
  const req = await page.evaluate(() => {
    const i = document.querySelector('dialog.dialog[open]:not(#native-dialog) .input');
    const m = document.getElementById((i.getAttribute('aria-describedby') || '').split(' ').pop());
    return { invalid: i.getAttribute('aria-invalid'), text: m && m.textContent, role: m && m.getAttribute('role') };
  });
  check(req.invalid === 'true' && req.text === 'Name is required.' && req.role === 'alert',
    'a required field left empty is named next to the field', JSON.stringify(req));
  await page.click('dialog.dialog[open]:not(#native-dialog) .dialog-footer .btn-secondary');
  await settle(page);
  check((await log(page)).includes('rename:null'), 'Cancel closes even with unsaved typing, answering null');

  await clearLog(page);
  await page.click('#info');
  const n = await page.evaluate(() => [...document.querySelectorAll('dialog.dialog[open]:not(#native-dialog) .dialog-footer button')].map(b => b.textContent));
  check(n.join() === 'Close', 'notice() has one Close button', n.join());
  check(await focusedId(page) === 'Close', 'notice() puts focus on Close', await focusedId(page));
  await page.keyboard.press('Enter');
  await settle(page);
  check((await log(page)).includes('notice'), 'Close resolves the notice');
}

/* --------------------------------------- a page's own dialog, stacked */
{
  await clearLog(page);
  await page.click('#open-form');
  check(await focusedId(page) === 'detail-field', 'a page\'s own dialog: focus goes to its first field');
  await page.click('#nested');
  check(await focusedId(page) === 'Cancel', 'a dialog opened from a dialog takes focus');
  await page.keyboard.press('Escape');
  await settle(page);
  const st = await page.evaluate(() => ({ form: !document.getElementById('form-dialog').hidden, focus: document.activeElement.id }));
  check((await log(page)).includes('nested:false') && st.form && st.focus === 'nested',
    'Esc closes only the top dialog and returns focus inside the one below', JSON.stringify(st));
  await page.fill('#detail-field', 'Shelf 3');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => !document.getElementById('form-dialog').hidden), 'a page\'s dialog holding typing ignores Esc');
  await page.click('#form-save');
  await settle(page);
  check((await log(page)).includes('form:Shelf 3') && await focusedId(page) === 'open-form',
    'House.dialog.close returns its value and focus to the opener');

  await clearLog(page);
  await page.click('#open-form');
  await page.evaluate(() => House.dialog.setBusy(document.getElementById('form-dialog')));
  await page.keyboard.press('Escape');
  await page.click('#form-dialog .dialog-header [aria-label="Close"]');
  check(await page.evaluate(() => !document.getElementById('form-dialog').hidden), 'a busy dialog ignores Esc and ×');
  await page.evaluate(() => House.dialog.setBusy(document.getElementById('form-dialog'), false));
  await page.click('#form-dialog .dialog-header [aria-label="Close"]');
  await settle(page);
  check((await log(page)).includes('form:undefined'), 'once not busy, × closes it');

  await clearLog(page);
  await page.click('#open-native');
  check(await page.evaluate(() => document.getElementById('native-dialog').open) && await focusedId(page) === 'date-field',
    'a native <dialog> opens with showModal and focus on its field');
  await page.keyboard.press('Escape');
  await settle(page);
  await clearLog(page);
  await page.click('#open-native');
  await page.click('#native-nested');
  check(await focusedId(page) === 'Cancel', 'a confirmation asked from inside a native dialog takes focus');
  // A short timeout: beneath the native modal it would be inert, and the click
  // would wait for a target that never becomes hittable.
  await page.click('dialog.dialog[open]:not(#native-dialog) .btn-danger', { timeout: 3000 }).catch(e => fail('the confirmation above a native dialog cannot be pressed: ' + e.message.split('\n')[0]));
  await settle(page);
  check((await log(page)).includes('native-nested:true') && await page.evaluate(() => document.getElementById('native-dialog').open)
    && await focusedId(page) === 'native-nested',
    'it answers, and the native dialog below stays open with focus back inside it');
  await page.keyboard.press('Escape');
  await settle(page);
  check((await log(page)).includes('native:undefined') && await focusedId(page) === 'open-native'
    && await page.evaluate(() => !document.getElementById('native-dialog').open),
    'Esc closes the native dialog and returns focus');
}

/* ------------------------------------------------------------ ⋮ menu */
{
  await clearLog(page);
  await page.click('#menu-btn');
  check(await page.getAttribute('#menu-btn', 'aria-expanded') === 'true', '⋮ sets aria-expanded');
  check(await focusedId(page) === 'mi-edit', 'opening ⋮ moves focus to the first action');
  await page.keyboard.press('Tab');
  check(await focusedId(page) === 'mi-archive', 'Tab moves through the actions');
  const fitDesk = await inWindow(page, '#menu-1');
  check(fitDesk.ok, '⋮ pop-over sits inside the window', JSON.stringify(fitDesk));
  await page.keyboard.press('Escape');
  check(await focusedId(page) === 'menu-btn' && await page.evaluate(() => document.getElementById('menu-1').hidden),
    'Esc closes ⋮ and returns focus to it');
  await page.click('#menu-btn');
  await page.mouse.click(640, 5);
  check(await page.evaluate(() => document.getElementById('menu-1').hidden), 'a press outside closes ⋮');
  await page.click('#menu-btn');
  await page.click('#mi-archive');
  check(await page.evaluate(() => document.getElementById('menu-1').hidden), 'pressing an action closes ⋮');
  await page.keyboard.press('Escape');
  await settle(page);
  const l = await log(page);
  check(l.includes('menu:mi-archive') && l.includes('menu-confirm:false') && await focusedId(page) === 'menu-btn',
    'the action runs, and the dialog it opens returns focus to ⋮', `${l.join(',')} focus=${await focusedId(page)}`);
  await page.click('#open-fridge');
  check(await page.evaluate(() => document.getElementById('menu-1').hidden), 'pressing the card does not open ⋮');
}

/* ------------------------------------------------------ Archived (N) */
async function archivedChecks(p, tag) {
  await p.evaluate(() => document.getElementById('archived-host').scrollIntoView({ block: 'end' }));
  const btn = '#archived-host .archived-btn';
  const label = await p.textContent(btn);
  check(/Archived \(\d+\)/.test(label), `${tag}Archived (N) button shows its count`, label);
  await p.click(btn);
  check(await p.getAttribute(btn, 'aria-expanded') === 'true', `${tag}Archived (N) sets aria-expanded`);
  const f = await inWindow(p, '#archived-host .archived-pop');
  check(f.ok, `${tag}the Archived pop-over stays inside the window`, JSON.stringify(f));
  const up = await p.evaluate(() => {
    const b = document.querySelector('#archived-host .archived-btn').getBoundingClientRect();
    const pop = document.querySelector('#archived-host .archived-pop');
    const r = pop.getBoundingClientRect();
    return { above: r.bottom <= b.top, scrolls: pop.scrollHeight > pop.clientHeight };
  });
  check(up.above, `${tag}near the bottom of the window it opens upward`, JSON.stringify(up));
  check(up.scrolls, `${tag}a long archived list scrolls inside the pop-over`);
  const wrap = await p.evaluate(() => {
    const n = document.querySelector('#archived-host .archived-row div div');
    return { full: n.textContent.startsWith('A very long') && n.textContent.endsWith('cut short'), lines: n.getClientRects().length > 0 && n.offsetHeight > 30 };
  });
  check(wrap.full && wrap.lines, `${tag}a long name wraps in full`, JSON.stringify(wrap));
  await p.keyboard.press('Escape');
  check(await p.evaluate(() => document.activeElement.classList.contains('archived-btn')), `${tag}Esc returns focus to Archived (N)`);
}
{
  await archivedChecks(page, '');
  await clearLog(page);
  const btn = '#archived-host .archived-btn';
  const before = await page.evaluate(() => window.archivedHandle.count);
  await page.click(btn);
  await page.click('#archived-host .archived-row:nth-child(2) .btn');
  const busyLabel = await page.textContent('#archived-host .archived-row:nth-child(2) .btn');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.archivedHandle.count);
  const toast = await page.evaluate(() => { const t = document.querySelector('.toast'); return t && { text: t.textContent, role: t.getAttribute('role') }; });
  check(busyLabel === 'Restoring…', 'Restore shows its busy label while it works', busyLabel);
  check(after === before - 1 && (await log(page)).includes('restored:1'), 'Restore takes the row out, with no confirmation');
  check(toast && toast.text === 'Archived thing 1 restored.' && toast.role === 'status', 'Restore toasts "<name> restored."', JSON.stringify(toast));
  check((await page.textContent(btn)) === `Archived (${after})`, 'the count follows');
  check(await page.evaluate(() => !!document.activeElement.closest('.archived-row')), 'focus moves to the next row, not to nowhere');

  await page.evaluate(() => { window.restoreFails = true; });
  await page.click('#archived-host .archived-row:nth-child(1) .btn');
  await page.waitForTimeout(150);
  const err = await page.evaluate(() => {
    const m = document.querySelector('#archived-host .inline-msg.err');
    return { count: window.archivedHandle.count, text: m && m.textContent, role: m && m.getAttribute('role'),
      label: document.querySelector('#archived-host .archived-row .btn').textContent };
  });
  check(err.count === after && err.label === 'Restore' && err.role === 'alert' && /could not be restored\. Try again\./.test(err.text),
    'a failed Restore keeps the row, gives the button back and says so beside it', JSON.stringify(err));
  await page.keyboard.press('Escape');

  // Two restores at once: the first finishing must not re-arm the second's
  // button, and each removes its own item (Codex, #472).
  await page.evaluate(() => { window.restoreFails = false; });
  await clearLog(page);
  const names = () => page.$$eval('#archived-host .archived-row', rs => rs.map(r => r.firstElementChild.firstElementChild.textContent));
  const before2 = await names();
  const [idA, idB] = await page.evaluate(() => [...document.querySelectorAll('#archived-host .archived-row')].slice(1, 3)
    .map(r => Number(r.firstElementChild.firstElementChild.textContent.replace('Archived thing ', ''))));
  await page.evaluate(([a, b]) => { window.delays[a] = 60; window.delays[b] = 500; }, [idA, idB]);
  await page.click(btn);
  await page.locator('#archived-host .archived-row').nth(1).locator('.btn').click();
  await page.locator('#archived-host .archived-row').nth(2).locator('.btn').click();
  await page.waitForTimeout(250);
  const mid = await page.evaluate(b => {
    const r = [...document.querySelectorAll('#archived-host .archived-row')].find(x => x.firstElementChild.firstElementChild.textContent === 'Archived thing ' + b);
    const x = r && r.querySelector('.btn');
    return x && { label: x.textContent, disabled: x.disabled };
  }, idB);
  check(mid && mid.label === 'Restoring…' && mid.disabled, 'a restore still running stays busy when another one finishes', JSON.stringify(mid));
  await page.waitForTimeout(500);
  const after2 = await names();
  const gone = before2.filter(n => !after2.includes(n));
  check(gone.join('|') === `Archived thing ${idA}|Archived thing ${idB}` && after2.length === before2.length - 2,
    'two restores at once each take out their own row', gone.join('|'));

  // update() while a restore is running, with fresh objects of the same ids:
  // completion removes that id, never the last row.
  await clearLog(page);
  const before3 = await names();
  const idC = Number(before3[1].replace('Archived thing ', ''));
  await page.evaluate(c => { window.delays[c] = 200; }, idC);
  if (await page.evaluate(() => document.querySelector('#archived-host .archived-pop').hidden)) await page.click(btn);
  await page.locator('#archived-host .archived-row').nth(1).locator('.btn').click();
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#archived-host .archived-row')];
    window.archivedHandle.update(rows.map(r => {
      const n = r.firstElementChild.firstElementChild.textContent;
      return { id: n.startsWith('Archived thing ') ? Number(n.slice(15)) : 0, name: n };
    }));
  });
  const busyAfterUpdate = await page.locator('#archived-host .archived-row').nth(1).locator('.btn').textContent();
  await page.waitForTimeout(400);
  const after3 = await names();
  const gone3 = before3.filter(n => !after3.includes(n));
  check(busyAfterUpdate === 'Restoring…', 'update() keeps a running restore busy', busyAfterUpdate);
  check(gone3.join('|') === `Archived thing ${idC}` && after3[after3.length - 1] === before3[before3.length - 1],
    'a restore finishing after update() removes its own id, not the last row', gone3.join('|'));
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.archivedHandle.update([]));
  check(await page.evaluate(() => document.querySelector('#archived-host .archived-btn').hidden), 'Archived (N) is hidden when N is 0');
  await page.evaluate(() => window.archivedHandle.update([{ id: 'x', name: '<b>bold</b>' }]));
  check(await page.evaluate(() => !document.querySelector('#archived-host b') && document.querySelector('#archived-host .archived-row div div').textContent === '<b>bold</b>'),
    'names are written as text, never as markup');
}

/* -------------------------------------------------------------- table */
{
  const col = (i) => page.$$eval(`#tbl tbody tr td:nth-child(${i})`, tds => tds.map(t => t.textContent));
  await page.click('#tbl th:nth-child(1) .th-sort');
  check((await col(1)).join('|') === 'Apple|item 2|Item 10|', 'sort by name: words, case-insensitive, digits in order, blank last', (await col(1)).join('|'));
  check(await page.getAttribute('#tbl th:nth-child(1)', 'aria-sort') === 'ascending'
    && (await page.textContent('#tbl th:nth-child(1) .th-sort')) === 'Name ▲', 'the header carries aria-sort and " ▲"');
  await page.focus('#tbl th:nth-child(1) .th-sort');
  await page.keyboard.press('Enter');
  check((await col(1)).join('|') === 'Item 10|item 2|Apple|' && await page.getAttribute('#tbl th:nth-child(1)', 'aria-sort') === 'descending',
    'Enter on the header reverses it, blank still last', (await col(1)).join('|'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  check((await col(2)).join('|') === '9|40|1,250|' && !(await page.getAttribute('#tbl th:nth-child(1)', 'aria-sort'))
    && (await page.textContent('#tbl th:nth-child(1) .th-sort')) === 'Name',
    'sort by count: numbers as numbers, the other header cleared', (await col(2)).join('|'));
  const cmp = await page.evaluate(() => [
    ['', 'a', 'asc'], ['', 'a', 'desc'], [null, 3, 'desc'], ['2', '10', 'asc'], ['12%', '9%', 'asc'], ['b', 'A', 'asc'],
  ].map(([a, b, d]) => Math.sign(House.compare(a, b, d))));
  check(cmp.join() === '1,1,1,-1,1,1', 'House.compare: blanks last both ways, numbers and words in order', cmp.join());
}

/* --------------------------------------------------- segmented control */
{
  await clearLog(page);
  const state = () => page.evaluate(() => [...document.querySelectorAll('#tabs [role="tab"]')].map(t =>
    `${t.id}:${t.getAttribute('aria-selected')}:${t.tabIndex}:${document.getElementById(t.getAttribute('aria-controls')).hidden ? 'h' : 'v'}`).join(' '));
  check(await state() === 't-live:true:0:v t-arch:false:-1:h t-all:false:-1:h', 'only the selected tab is in the Tab order, only its panel shown', await state());
  await page.focus('#t-live');
  await page.keyboard.press('ArrowRight');
  check(await focusedId(page) === 't-arch' && (await state()).startsWith('t-live:false:-1:h t-arch:true:0:v'), '→ moves to and selects the next tab', await state());
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  check(await focusedId(page) === 't-live', '→ wraps at the end');
  await page.keyboard.press('ArrowLeft');
  check(await focusedId(page) === 't-all', '← wraps at the start');
  await page.keyboard.press('Home');
  check(await focusedId(page) === 't-live', 'Home goes to the first tab');
  await page.keyboard.press('End');
  check(await focusedId(page) === 't-all' && (await state()).endsWith('t-all:true:0:v'), 'End goes to the last tab and selects it');
  await page.click('#t-arch');
  check((await state()).includes('t-arch:true:0:v'), 'a press selects a tab');
  check((await log(page)).includes('tab:t-arch'), 'house:select reports the change');
}

/* ------------------------------------------- inline message, empty state */
{
  const m = await page.evaluate(() => {
    const f = document.getElementById('name-field');
    House.message(f, 'That name is taken. Choose another.');
    House.message(f, 'That name is too long. Shorten it.');
    const msgs = document.querySelectorAll('#name-field ~ .inline-msg, .field:has(#name-field) ~ .inline-msg');
    const one = { n: msgs.length, text: msgs[0] && msgs[0].textContent, role: msgs[0] && msgs[0].getAttribute('role'),
      invalid: f.getAttribute('aria-invalid'), linked: f.getAttribute('aria-describedby') === msgs[0].id };
    House.message(f, '');
    return { one, cleared: !document.querySelector('.field:has(#name-field) ~ .inline-msg') && !f.hasAttribute('aria-invalid') && !f.hasAttribute('aria-describedby') };
  });
  check(m.one.n === 1 && m.one.text === 'That name is too long. Shorten it.' && m.one.role === 'alert' && m.one.invalid === 'true' && m.one.linked,
    'an error message sits after its field, linked, role="alert", replaced not stacked', JSON.stringify(m.one));
  check(m.cleared, 'clearing the message removes it and the field\'s error state');

  const e = await page.evaluate(() => {
    let added = 0;
    const host = document.getElementById('empty-host');
    House.empty(host, { title: 'No <i>items</i> yet.', text: 'Add the first one.', action: { label: '+ Add item', onClick: () => added++ } });
    host.querySelector('.empty-act').click();
    return { cls: host.firstElementChild.className, title: host.querySelector('.empty-title').textContent,
      markup: !!host.querySelector('i'), sub: host.querySelector('.empty-sub').textContent, act: host.querySelector('button').textContent, added };
  });
  check(e.cls === 'empty-state' && e.title === 'No <i>items</i> yet.' && !e.markup && e.sub === 'Add the first one.' && e.act === '+ Add item' && e.added === 1,
    'the empty state carries its sentence and its own Add button, as text', JSON.stringify(e));
}

/* ------------------------------------------------- phone width: the fit */
{
  const phone = await open({ width: 390, height: 700 });
  await phone.click('#menu-btn');
  const f = await inWindow(phone, '#menu-1');
  check(f.ok, 'phone: the ⋮ pop-over stays inside the window', JSON.stringify(f));
  await phone.keyboard.press('Escape');
  await archivedChecks(phone, 'phone: ');
  // The on-screen keyboard shrinks only the visual viewport (iPhone Safari):
  // a pop-over must fit the visible part, not the layout viewport behind it.
  // Chromium has no keyboard here, so the visual viewport is stood in for.
  await phone.evaluate(() => window.scrollTo(0, 0));
  const kb = await phone.evaluate(() => {
    const b = document.getElementById('menu-btn').getBoundingClientRect();
    const fake = { offsetLeft: 0, offsetTop: 0, width: document.documentElement.clientWidth, height: Math.round(b.bottom + 60) };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { ...fake, addEventListener() {} } });
    document.getElementById('menu-1').hidden = false;
    House.fit(document.getElementById('menu-1'), document.getElementById('menu-btn'), { align: 'end' });
    const r = document.getElementById('menu-1').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), visible: fake.height };
  });
  check(kb.top >= 0 && kb.bottom <= kb.visible, 'phone: with the keyboard up, a pop-over fits the visual viewport', JSON.stringify(kb));
  await phone.evaluate(() => { document.getElementById('menu-1').hidden = true; delete window.visualViewport; });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  check(wide, 'phone: the page never scrolls sideways');
  await phone.close();
}

if (errors.length) fail(`console or page errors:\n  ${errors.join('\n  ')}`);
else ok('no console or page errors');
await browser.close();
