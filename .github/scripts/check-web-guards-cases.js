// check-web-guards-cases.js — pinned cases for the three web guards in
// templates/actions/web-guards/ (native-dialog-guard.mjs, escape-sink-guard.mjs,
// audit-deps.mjs), which shared-qa.yml runs in every project.
//
// WHY THIS EXISTS. The guards run in projects, against code this repo never
// holds, so nothing here would notice one stop catching what it claims: a
// guard that reads nothing reports clean. Each catch below is paired with a
// clean twin that differs in the one property the guard keys on, and each case
// pins BOTH the exit code and a diagnostic substring, so a case cannot keep
// passing on a different branch than the one it was written for (#237).
// The audit cases run against a fake npm (NPM_BIN), so they need no network
// and pin the verdict logic, not the registry's advisories of the day.
//
// NOT exported: .github/ is outside every EXPORTS.json category path.
// ESM (.github/scripts/package.json declares "type": "module").
// Needs the guards' parser installed:
//   npm ci --ignore-scripts --prefix templates/actions/web-guards
//
// Re-prove discrimination with a mutant: copy the whole directory (its
// node_modules included), break a guard, and name the copy:
//   WEB_GUARDS_BIN=/tmp/mutant-web-guards node .github/scripts/check-web-guards-cases.js
//
// Run: node .github/scripts/check-web-guards-cases.js

import { mkdtempSync, rmSync, existsSync, writeFileSync, chmodSync } from 'fs';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { binPath, writeTree, runNode } from './cases_lib.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = binPath('WEB_GUARDS_BIN', join(REPO_ROOT, 'templates', 'actions', 'web-guards'));
if (!existsSync(join(DIR, 'node_modules', 'acorn'))) {
  console.error(`check-web-guards-cases: acorn is not installed in ${DIR}. Run: npm ci --ignore-scripts --prefix ${DIR}`);
  process.exit(2);
}

// An escaper the way projects write one, and a page that loads nothing.
const ESC = `function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }\n`;

// A fake npm: `install --package-lock-only` writes a lockfile (or fails when a
// dependency is named "unresolvable"); `audit --json` reports by the
// dependency names in package.json and the node_modules/<name> entries of
// package-lock.json: bad-* is high, mod-* moderate,
// registry-down an npm error, garbled not JSON. Anything else is clean.
const FAKE_NPM = `#!/usr/bin/env node
const fs = require('fs');
const [cmd] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = fs.existsSync('package-lock.json') ? JSON.parse(fs.readFileSync('package-lock.json', 'utf8')) : {};
const locked = Object.keys(lock.packages || {}).filter(k => k.startsWith('node_modules/')).map(k => k.slice('node_modules/'.length));
const names = [...new Set([...Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }), ...locked])];
if (cmd === 'install') {
  if (names.includes('unresolvable')) { console.error('npm error 404 Not Found - unresolvable'); process.exit(1); }
  fs.writeFileSync('package-lock.json', '{}'); process.exit(0);
}
if (names.includes('registry-down')) { console.log(JSON.stringify({ error: { code: 'ENOAUDIT', summary: 'registry did not answer' } })); process.exit(1); }
if (names.includes('garbled')) { console.log('<html>502</html>'); process.exit(1); }
const v = {}, counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
for (const n of names) {
  const sev = n.startsWith('bad-') ? 'high' : n.startsWith('mod-') ? 'moderate' : null;
  if (!sev) continue;
  counts[sev]++;
  v[n] = { severity: sev, via: [{ title: 'Advisory for ' + n, url: 'https://example.test/' + n }], fixAvailable: true };
}
console.log(JSON.stringify({ auditReportVersion: 2, vulnerabilities: v, metadata: { vulnerabilities: { ...counts, total: 0 } } }));
process.exit(Object.keys(v).length ? 1 : 0);
`;

const pkg = (deps, extra = {}) => JSON.stringify({ name: 'x', private: true, dependencies: deps, ...extra });

const CASES = [
  // ── native-dialog ────────────────────────────────────────────────────────
  { guard: 'native-dialog', name: 'a bare confirm() fails',
    files: { 'js/app.js': "if (!confirm('Delete?')) return;\n" }, code: 1, want: 'js/app.js:1: confirm(' },
  { guard: 'native-dialog', name: 'window.alert() fails',
    files: { 'a.js': "\nwindow.alert('x');\n" }, code: 1, want: 'a.js:2: window.alert(' },
  { guard: 'native-dialog', name: "window['prompt']() fails",
    files: { 'a.js': "window['prompt']('Name?');\n" }, code: 1, want: 'window.prompt(' },
  { guard: 'native-dialog', name: 'globalThis.confirm() fails',
    files: { 'a.js': "globalThis.confirm('x');\n" }, code: 1, want: 'globalThis.confirm(' },
  { guard: 'native-dialog', name: 'an optional call alert?.() fails',
    files: { 'a.js': "alert?.('x');\n" }, code: 1, want: 'alert(' },
  { guard: 'native-dialog', name: 'a call in an ES module fails (the module parse)',
    files: { 'm.mjs': "import { x } from './x.js';\nexport function f() { confirm(x); }\n" }, code: 1, want: 'm.mjs:2: confirm(' },
  { guard: 'native-dialog', name: 'House.confirm() is the house dialog: clean',
    files: { 'a.js': "House.confirm({ title: 'Archive?' }).then(ok => ok && go());\n" }, code: 0, want: 'clean (1 files' },
  { guard: 'native-dialog', name: 'a parameter named confirm is the app dialog: clean',
    files: { 'a.js': "function wire(confirm) { return confirm('x'); }\n" }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: 'a top-level const confirm binds it in its own file: clean',
    files: { 'a.js': "const confirm = House.confirm;\nconfirm({ title: 'x' });\n" }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: 'an import named confirm binds it: clean',
    files: { 'a.mjs': "import { confirm } from './dialog.js';\nconfirm('x');\n" }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: "a sibling function's parameter does not clear a call",
    files: { 'a.js': "function a(confirm) { return confirm; }\nfunction b() { return confirm('x'); }\n" }, code: 1, want: 'a.js:2: confirm(' },
  { guard: 'native-dialog', name: 'a top-level binding in ANOTHER file does not clear a call',
    files: { 'a.js': "const alert = () => {};\n", 'b.js': "alert('x');\n" }, code: 1, want: 'b.js:1: alert(' },
  { guard: 'native-dialog', name: 'a comment and a string naming confirm( are not calls: clean',
    files: { 'a.js': "// never confirm('x')\nconst s = \"alert('x')\";\n" }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: 'an inline <script> call fails on the page line',
    files: { 'index.html': "<!doctype html>\n<p>x</p>\n<script>\n  alert('hi');\n</script>\n" }, code: 1, want: 'index.html:4: alert(' },
  { guard: 'native-dialog', name: 'a JSON <script> block is not code: clean',
    files: { 'index.html': '<script type="application/json">{"k": "alert(1)"}</script>\n<script src="a.js"></script>\n' }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: 'an onclick attribute calling confirm fails',
    files: { 'index.html': "<p>\n<button onclick=\"return confirm('Sure?')\">Go</button>\n" }, code: 1, want: 'index.html:2: a handler attribute calls confirm(' },
  { guard: 'native-dialog', name: "a handler that only LOGS the text alert( is clean: the body is parsed (Codex, #493)",
    files: { 'index.html': "<button onclick=\"console.log('alert(')\">Log</button>\n" }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: 'a handler calling window.alert fails',
    files: { 'index.html': "<p>\n<a onclick=\"window.alert('x'); return false\">x</a>\n" }, code: 1, want: 'index.html:2: a handler attribute calls window.alert(' },
  { guard: 'native-dialog', name: 'a handler a script assembles from pieces is still read',
    files: { 'a.js': "row.innerHTML = '<button onclick=\"if (confirm(' + n + ')) del()\">x</button>';\n" }, code: 1, want: 'a handler attribute calls confirm(' },
  { guard: 'native-dialog', name: 'an onclick attribute inside an HTML comment: clean',
    files: { 'index.html': "<!-- <button onclick=\"alert(1)\">old</button> -->\n<p>x</p>\n" }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: 'an HTML comment marker inside a script is script text, not a comment (Codex, #493)',
    files: { 'index.html': "<p>x</p>\n<script>\n  const markup = `<!-- ${alert('runs')} -->`;\n</script>\n" }, code: 1, want: 'index.html:3: alert(' },
  { guard: 'native-dialog', name: 'comment markers split across lines inside a script still parse',
    files: { 'index.html': "<script>\n  const a = '<!--';\n  go();\n  const b = '-->';\n</script>\n" }, code: 0, want: 'clean (1 files, 1 scripts' },
  { guard: 'native-dialog', name: 'a <script> inside an HTML comment is not code',
    files: { 'index.html': "<!-- <script>alert(1)</script> -->\n<p>x</p>\n" }, code: 0, want: 'clean (1 files, 0 scripts' },
  { guard: 'native-dialog', name: 'a default parameter does not see the body\'s declarations (Codex, #493)',
    files: { 'app.js': "function run(answer = confirm('Delete?')) {\n  var confirm;\n  return answer;\n}\nrun();\n" }, code: 1, want: 'app.js:1: confirm(' },
  { guard: 'native-dialog', name: 'a parameter named confirm still binds its own default\'s siblings and body',
    files: { 'app.js': "function run(confirm, ok = confirm('x')) {\n  return confirm('y') && ok;\n}\n" }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: 'a var in a class static block stays in that block (Codex, #493)',
    files: { 'app.js': "class C {\n  static { var confirm; }\n}\nconfirm('Delete?');\n" }, code: 1, want: 'app.js:4: confirm(' },
  { guard: 'native-dialog', name: 'a switch discriminant does not see its cases\' bindings (Codex, #493)',
    files: { 'app.js': "switch (confirm('Delete?')) {\n  case true: let confirm; break;\n}\n" }, code: 1, want: 'app.js:1: confirm(' },
  { guard: 'native-dialog', name: 'a class field initializer calling the dialog fails',
    files: { 'app.js': "class C {\n  ok = confirm('x');\n}\n" }, code: 1, want: 'app.js:2: confirm(' },
  { guard: 'native-dialog', name: 'a comment marker inside an attribute value starts no comment (Codex, #493)',
    files: { 'index.html': "<div title=\"<!--\">\n<script>alert('runs')</script>\n</div>\n" }, code: 1, want: 'index.html:2: alert(' },
  { guard: 'native-dialog', name: 'data-src is not src: the inline script still runs (Codex, #493)',
    files: { 'index.html': "<p>x</p>\n<script data-src=\"lazy.js\">alert('runs')</script>\n" }, code: 1, want: 'index.html:2: alert(' },
  { guard: 'native-dialog', name: 'data-type is not type: the script is still JavaScript (Codex, #493)',
    files: { 'index.html': "<p>x</p>\n<script data-type=\"demo\">alert('runs')</script>\n" }, code: 1, want: 'index.html:2: alert(' },
  { guard: 'native-dialog', name: 'a handler attribute names its own line, entities decoded by the parser',
    files: { 'index.html': "<p>x</p>\n<p>y</p>\n<button\n  onclick=\"if (confirm(&quot;Sure?&quot;)) go()\">x</button>\n" }, code: 1, want: 'index.html:4: a handler attribute calls confirm(' },
  { guard: 'native-dialog', name: "a JS comment in a page's script naming onclick=\"alert(\" is not a handler",
    files: { 'index.html': "<script>\n  // old: <button onclick=\"alert(1)\">\n  go();\n</script>\n" }, code: 0, want: 'clean' },
  { guard: 'native-dialog', name: 'a handler attribute in HTML a script builds fails',
    files: { 'a.js': "el.innerHTML = '<button onclick=\"alert(1)\">x</button>';\n" }, code: 1, want: 'a.js:1: a handler attribute calls alert(' },
  { guard: 'native-dialog', name: 'node_modules, vendor/ and *.min.js are not walked: clean',
    files: { 'node_modules/p/i.js': "alert(1);\n", 'js/vendor/lib.js': "alert(1);\n", 'js/lib.min.js': "alert(1);\n", 'a.js': "x();\n" },
    code: 0, want: 'clean (1 files' },
  { guard: 'native-dialog', name: '.github/ directly under the site is not walked: clean',
    files: { '.github/scripts/t.js': "alert(1);\n", 'a.js': "x();\n" }, code: 0, want: 'clean (1 files' },
  { guard: 'native-dialog', name: 'a site-dir inside .github/ IS walked',
    siteDir: '.github/fixture', files: { '.github/fixture/a.js': "alert(1);\n" }, code: 1, want: '.github/fixture/a.js:1: alert(' },
  { guard: 'native-dialog', name: 'guard-skip native-dialog:<file> leaves that file alone',
    skip: 'native-dialog:js/legacy.js', files: { 'js/legacy.js': "alert(1);\n", 'a.js': "x();\n" }, code: 0, want: 'clean (1 files' },
  { guard: 'native-dialog', name: 'guard-skip of a directory leaves everything under it alone',
    skip: 'lib/', files: { 'lib/deep/x.js': "alert(1);\n", 'a.js': "x();\n" }, code: 0, want: 'clean (1 files' },
  { guard: 'native-dialog', name: "guard-skip escape-sink:<file> does not excuse it here",
    skip: 'escape-sink:js/legacy.js', files: { 'js/legacy.js': "alert(1);\n" }, code: 1, want: 'js/legacy.js:1: alert(' },
  { guard: 'native-dialog', name: 'a guard-skip entry naming nothing fails',
    skip: 'js/gone.js', files: { 'a.js': "x();\n" }, code: 1, want: 'does not exist' },
  { guard: 'native-dialog', name: 'a guard-skip entry outside the repository fails',
    skip: '../x', files: { 'a.js': "x();\n" }, code: 1, want: 'not a path inside the repository' },
  { guard: 'native-dialog', name: 'a file that does not parse fails by name, never guessed at',
    files: { 'a.js': "const x = <div/>;\n" }, code: 1, want: 'a.js does not parse' },
  { guard: 'native-dialog', name: 'a site with no code yet passes with a notice',
    files: { 'README.md': "x\n" }, code: 0, want: 'nothing to check' },
  { guard: 'native-dialog', name: 'a site-dir that is not there fails',
    siteDir: 'app', files: { 'a.js': "x();\n" }, code: 1, want: 'site-dir app is not a directory' },

  // ── escape-sink ──────────────────────────────────────────────────────────
  { guard: 'escape-sink', name: 'textContent = esc(x) fails',
    files: { 'a.js': ESC + "el.textContent = esc(msg);\n" }, code: 1, want: 'a.js:2: .textContent = esc(…)' },
  { guard: 'escape-sink', name: 'innerHTML = esc(x) is the right sink: clean',
    files: { 'a.js': ESC + "el.innerHTML = esc(msg);\n" }, code: 0, want: 'escapers derived: esc' },
  { guard: 'escape-sink', name: 'an assignment wrapped onto the next line fails',
    files: { 'a.js': ESC + "el.title =\n  'Error: ' + esc(msg);\n" }, code: 1, want: 'a.js:3: .title = esc(…)' },
  { guard: 'escape-sink', name: '+= into textContent fails',
    files: { 'a.js': ESC + "el.textContent += esc(msg);\n" }, code: 1, want: '.textContent = esc(…)' },
  { guard: 'escape-sink', name: '.value = esc(x) fails',
    files: { 'a.js': ESC + "input.value = esc(name);\n" }, code: 1, want: '.value = esc(…)' },
  { guard: 'escape-sink', name: 'a wrapper that returns esc() is an escaper too (apfp bcEsc)',
    files: { 'a.js': ESC + "function bcEsc(s) { return (typeof esc === 'function') ? esc(s) : s; }\nel.title = bcEsc(x);\n" },
    code: 1, want: '.title = bcEsc(…)' },
  { guard: 'escape-sink', name: 'a wrapper of a wrapper, declared before it, is derived (the fixpoint)',
    files: { 'a.js': ESC + "function outer(s) { return inner(s); }\nfunction inner(s) { return esc(s); }\nel.title = outer(x);\n" },
    code: 1, want: '.title = outer(…)' },
  { guard: 'escape-sink', name: 'a function that only CALLS esc() is not an escaper: clean',
    files: { 'a.js': ESC + "function label(x) { log(esc(x)); return x.name; }\nel.textContent = label(x);\n" }, code: 0, want: 'escapers derived: esc)' },
  { guard: 'escape-sink', name: 'a function that only OWNS a nested esc() helper is not an escaper (Codex, #493)',
    files: { 'a.js': "function label(x) {\n  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\n  log(esc(x));\n  return x.name;\n}\nel.textContent = label(user);\n" },
    code: 0, want: 'escapers derived: esc)' },
  { guard: 'escape-sink', name: 'an escaper whose entities sit in an inline callback is derived',
    files: { 'a.js': "const e = s => String(s).replace(/[&<]/g, c => ({ '&': '&amp;', '<': '&lt;' })[c]);\nel.title = e(x);\n" },
    code: 1, want: 'a.js:2: .title = e(…)' },
  { guard: 'escape-sink', name: 'a derived Html.escape does not make CSS.escape an escaper (Codex, #493)',
    files: { 'a.js': "const Html = { escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); } };\ninput.value = CSS.escape(id);\n" },
    code: 0, want: 'escapers derived: Html.escape)' },
  { guard: 'escape-sink', name: 'Html.escape(x) into .value fails',
    files: { 'a.js': "const Html = { escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); } };\ninput.value = Html.escape(id);\n" },
    code: 1, want: 'a.js:2: .value = escape(…)' },
  { guard: 'escape-sink', name: 'an escaper assigned to a member keeps its owner: CSS.escape clean',
    files: { 'a.js': "App.escape = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };\nel.title = CSS.escape(id) + App.x;\n" },
    code: 0, want: 'escapers derived: App.escape)' },
  { guard: 'escape-sink', name: "a class's static escaper is called on the class name",
    files: { 'a.js': "class H { static esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); } }\nel.title = H.esc(x);\n" },
    code: 1, want: 'a.js:2: .title = esc(…)' },
  { guard: 'escape-sink', name: 'an instance method escaper is matched through this.',
    files: { 'a.js': "class V {\n  esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\n  render() { this.el.textContent = this.esc(this.x); }\n}\n" },
    code: 1, want: 'a.js:3: .textContent = esc(…)' },
  { guard: 'escape-sink', name: 'an escaper reading a top-level entity table is derived',
    files: { 'a.js': "const MAP = { '&': '&amp;', '<': '&lt;' };\nconst e = s => s.replace(/[&<]/g, c => MAP[c]);\nel.textContent = e(x);\n" },
    code: 1, want: 'a.js:3: .textContent = e(…)' },
  { guard: 'escape-sink', name: 'an UNescaper (entities only in its regexes) is not an escaper',
    files: { 'a.js': "function decode(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<'); }\nel.textContent = decode(x);\n" },
    code: 0, want: 'no HTML-escape helper' },
  { guard: 'escape-sink', name: "setAttribute('aria-label', esc(x)) fails",
    files: { 'a.js': ESC + "b.setAttribute('aria-label', 'Delete ' + esc(n));\n" }, code: 1, want: "setAttribute('aria-label', …) given esc(…)" },
  { guard: 'escape-sink', name: "setAttribute('data-id', esc(x)) is not a text attribute: clean",
    files: { 'a.js': ESC + "b.setAttribute('data-id', esc(n));\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'createTextNode(esc(x)) fails',
    files: { 'a.js': ESC + "p.append(document.createTextNode(esc(t)));\n" }, code: 1, want: 'createTextNode(…) given esc(…)' },
  { guard: 'escape-sink', name: 'window.confirm(esc(x)) fails (apfp #764: Ben &amp; Jerry&#39;s)',
    files: { 'a.js': ESC + "window.confirm('Delete ' + esc(name) + '?');\n" }, code: 1, want: 'confirm(…) given esc(…)' },
  { guard: 'escape-sink', name: 'House.confirm({ title: esc(x) }) fails',
    files: { 'a.js': ESC + "House.confirm({ title: 'Archive ' + esc(n) + '?' });\n" }, code: 1, want: 'House.confirm(…) given esc(…)' },
  { guard: 'escape-sink', name: 'House.toast(esc(x)) fails',
    files: { 'a.js': ESC + "House.toast(esc(msg));\n" }, code: 1, want: 'House.toast(…) given esc(…)' },
  { guard: 'escape-sink', name: "a dialog's .then() callback escaping for innerHTML is not the dialog's text: clean",
    files: { 'a.js': ESC + "House.confirm({ title: 'Archive?' }).then(ok => { row.innerHTML = esc(n); });\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: "a callback with a statement body inside a dialog's options is not its text: clean",
    files: { 'a.js': ESC + "House.confirm({ title: 'Archive?', onYes: () => { row.innerHTML = esc(n); } });\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'textContent = xs.map(x => esc(x)).join() fails',
    files: { 'a.js': ESC + "el.textContent = xs.map(x => esc(x)).join(', ');\n" }, code: 1, want: '.textContent = esc(…)' },
  { guard: 'escape-sink', name: "a project's own dialog is not a sink until text-sinks names it",
    files: { 'a.js': ESC + "askConfirm('Delete ' + esc(n));\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'text-sinks: askConfirm makes it one',
    sinks: 'askConfirm', files: { 'a.js': ESC + "askConfirm('Delete ' + esc(n));\n" }, code: 1, want: 'askConfirm(…) given esc(…)' },
  { guard: 'escape-sink', name: 'an escaper in one file and its misuse in another fails',
    files: { 'util.js': ESC, 'page.js': "el.textContent = esc(x);\n" }, code: 1, want: 'page.js:1: .textContent = esc(…)' },
  { guard: 'escape-sink', name: 'a misuse in an inline <script> fails on the page line',
    files: { 'index.html': "<p>x</p>\n<script>\n" + ESC + "el.textContent = esc(x);\n</script>\n" }, code: 1, want: 'index.html:4: .textContent' },
  { guard: 'escape-sink', name: 'a value computed from escaped text is not escaped text (Codex, #493)',
    files: { 'app.js': ESC + "el.textContent = esc(name).length;\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'a function returning a value computed from esc() is no escaper (Codex, #493)',
    files: { 'app.js': ESC + "function count(s) { return esc(s).length; }\nel.textContent = count(name);\n" }, code: 0, want: 'escapers derived: esc)' },
  { guard: 'escape-sink', name: 'a string method on escaped text is still escaped text',
    files: { 'app.js': ESC + "el.textContent = esc(name).trim();\n" }, code: 1, want: '.textContent = esc(…)' },
  { guard: 'escape-sink', name: 'escaped text joined into a string still fails',
    files: { 'app.js': ESC + "el.title = 'Hi ' + (ok ? esc(a) : b);\n" }, code: 1, want: '.title = esc(…)' },
  { guard: 'escape-sink', name: 'a module\'s own escape() is not another module\'s HTML escaper (Codex, #493)',
    files: { 'a.mjs': "export function escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\n",
             'b.mjs': "export function escape(s) { return s; }\ninput.value = escape(id);\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'an imported escaper is matched by the name it was exported as',
    files: { 'a.mjs': "export function escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\n",
             'b.mjs': "import { escape as e } from './a.mjs';\ninput.value = e(id);\n" }, code: 1, want: 'b.mjs:2: .value = e(…)' },
  { guard: 'escape-sink', name: 'a module-local escaper is not a page global',
    files: { 'a.mjs': "function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\nexport const x = 1;\n",
             'b.js': "function esc(s) { return s; }\ninput.value = esc(id);\nother.value = unknownEsc(id);\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'a .mjs file\'s private escaper is not a page global, imports or not (Codex, #493)',
    files: { 'helpers.mjs': "function escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\nwindow.h = escape;\n",
             'app.js': "input.value = escape(id);\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'a .js file a page loads as a module keeps its names private too',
    files: { 'index.html': "<script type=\"module\" src=\"./lib/h.js\"></script>\n",
             'lib/h.js': "function escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\nwindow.h = escape;\n",
             'app.js': "input.value = escape(id);\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'the same .js loaded as a classic script is a page global',
    files: { 'index.html': "<script src=\"./lib/h.js\"></script>\n",
             'lib/h.js': "function escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\n",
             'app.js': "input.value = escape(id);\n" }, code: 1, want: 'app.js:1: .value = escape(…)' },
  { guard: 'escape-sink', name: 'a handler attribute putting esc() in a text sink fails (Codex, #493)',
    files: { 'index.html': "<script>\n" + ESC + "</script>\n<button onclick=\"this.textContent = esc('&amp;')\">Run</button>\n" }, code: 1, want: 'index.html:4: .textContent = esc(…) in a handler attribute' },
  { guard: 'escape-sink', name: 'a handler attribute using esc() for innerHTML is clean',
    files: { 'index.html': "<script>\n" + ESC + "</script>\n<button onclick=\"out.innerHTML = esc(v)\">Run</button>\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'a misuse after a comment marker in a script string is still read',
    files: { 'index.html': "<script>\n" + ESC + "const s = '<!--';\nel.textContent = esc(x);\nconst t = '-->';\n</script>\n" }, code: 1, want: 'index.html:4: .textContent' },
  { guard: 'escape-sink', name: 'a comment describing the bug is not the bug: clean',
    files: { 'a.js': ESC + "// never: el.textContent = esc(x)\nel.textContent = x;\n" }, code: 0, want: 'clean' },
  { guard: 'escape-sink', name: 'guard-skip escape-sink:<file> leaves that file alone',
    skip: 'escape-sink:a.js', files: { 'a.js': ESC + "el.textContent = esc(x);\n", 'b.js': ESC }, code: 0, want: 'clean (1 files' },
  { guard: 'escape-sink', name: 'a site with no escaper passes with a notice',
    files: { 'a.js': "el.textContent = x;\n" }, code: 0, want: 'no HTML-escape helper' },

  // ── audit-deps ───────────────────────────────────────────────────────────
  { guard: 'audit', name: 'no package.json at all passes and says so',
    files: { 'a.js': 'x\n' }, code: 0, want: 'no package.json in this repository' },
  { guard: 'audit', name: 'a manifest with no dependencies is not audited',
    files: { 'package.json': JSON.stringify({ type: 'commonjs' }) }, code: 0, want: 'package.json: no dependencies' },
  { guard: 'audit', name: 'a clean tree with a lockfile passes',
    files: { 'package.json': pkg({ ok: '1' }), 'package-lock.json': '{}' }, code: 0, want: 'clean (1 audited' },
  { guard: 'audit', name: 'a high advisory fails and names the manifest and the package',
    files: { 'ui/package.json': pkg({ 'bad-redirects': '1' }), 'ui/package-lock.json': '{}' }, code: 1,
    want: 'high: bad-redirects — Advisory for bad-redirects', want2: '1 manifest(s) failed: ui/package.json' },
  { guard: 'audit', name: 'a moderate advisory passes at the default level (high)',
    files: { 'package.json': pkg({ 'mod-x': '1' }), 'package-lock.json': '{}' }, code: 0, want: 'clean (1 audited' },
  { guard: 'audit', name: 'a moderate advisory fails at audit-level moderate',
    level: 'moderate', files: { 'package.json': pkg({ 'mod-x': '1' }), 'package-lock.json': '{}' }, code: 1, want: 'moderate: mod-x' },
  { guard: 'audit', name: 'no lockfile: what an install would resolve is audited, in scratch, not the checkout',
    files: { 'scripts/package.json': pkg({ 'bad-mailer': '1' }) }, code: 1, want: 'no lockfile: audited what an install would resolve today',
    after: root => existsSync(join(root, 'scripts', 'package-lock.json')) ? 'a lockfile was written into the checkout' : null },
  { guard: 'audit', name: "a workspace package is covered by its root's lockfile, not resolved alone",
    files: { 'package.json': pkg({ ok: '1' }, { workspaces: ['packages/*'] }), 'package-lock.json': JSON.stringify({ packages: { '': {}, 'packages/app': {} } }),
      'packages/app/package.json': pkg({ unresolvable: '1' }) }, code: 0, want: 'a workspace of package-lock.json, audited with it' },
  { guard: 'audit', name: 'a workspace root that declares nothing itself still has its lockfile audited (Codex, #493)',
    files: { 'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      'package-lock.json': JSON.stringify({ packages: { '': {}, 'packages/app': {}, 'node_modules/bad-x': {} } }),
      'packages/app/package.json': pkg({ 'bad-x': '1' }) }, code: 1, want: 'high: bad-x', want2: '1 manifest(s) failed: package.json' },
  { guard: 'audit', name: 'a lockfile with nothing in it is audited, and clean',
    files: { 'package.json': JSON.stringify({ private: true }), 'package-lock.json': JSON.stringify({ packages: { '': {} } }) }, code: 0, want: 'clean (1 audited' },
  { guard: 'audit', name: 'a workspace root with no lockfile fails, never silently skipped',
    files: { 'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'] }), 'packages/app/package.json': pkg({ ok: '1' }) },
    code: 1, want: 'a workspace root with no lockfile' },
  { guard: 'audit', name: 'no lockfile and nothing resolves: fails as unresolvable, never clean',
    files: { 'package.json': pkg({ unresolvable: '1' }) }, code: 1, want: 'npm could not resolve one' },
  { guard: 'audit', name: 'a registry error fails as "did not run", never as clean',
    files: { 'package.json': pkg({ 'registry-down': '1' }), 'package-lock.json': '{}' }, code: 1, want: 'npm audit did not run: ENOAUDIT' },
  { guard: 'audit', name: 'output that is not JSON fails as "did not run"',
    files: { 'package.json': pkg({ garbled: '1' }), 'package-lock.json': '{}' }, code: 1, want: 'DID NOT RUN' },
  { guard: 'audit', name: 'every tree is audited before the verdict: both failures named',
    files: { 'a/package.json': pkg({ 'bad-a': '1' }), 'a/package-lock.json': '{}', 'b/package.json': pkg({ 'bad-b': '1' }), 'b/package-lock.json': '{}' },
    code: 1, want: '2 manifest(s) failed: a/package.json, b/package.json' },
  { guard: 'audit', name: 'node_modules is not a tree of its own',
    files: { 'package.json': pkg({ ok: '1' }), 'package-lock.json': '{}', 'node_modules/bad-x/package.json': pkg({ 'bad-x': '1' }) },
    code: 0, want: 'audit-deps: 1 manifest(s)' },
  { guard: 'audit', name: 'audit-skip <dir> leaves that tree out',
    askip: 'tools', files: { 'tools/package.json': pkg({ 'bad-x': '1' }), 'tools/package-lock.json': '{}' }, code: 0, want: 'tools/package.json: skipped (audit-skip)' },
  { guard: 'audit', name: 'an audit-skip entry naming nothing fails',
    askip: 'gone', files: { 'package.json': pkg({ ok: '1' }), 'package-lock.json': '{}' }, code: 1, want: 'does not exist' },
  { guard: 'audit', name: 'an unknown audit-level fails',
    level: 'severe', files: { 'package.json': pkg({ ok: '1' }) }, code: 1, want: 'audit-level "severe" is not one of' },
  { guard: 'audit', name: 'a manifest that is not JSON fails',
    files: { 'package.json': '{ nope' }, code: 1, want: 'is not valid JSON' },
];

const SCRIPT = { 'native-dialog': 'native-dialog-guard.mjs', 'escape-sink': 'escape-sink-guard.mjs', audit: 'audit-deps.mjs' };
const scratch = mkdtempSync(join(tmpdir(), 'web-guards-cases-'));
const fakeNpm = join(scratch, 'fake-npm');
writeFileSync(fakeNpm, FAKE_NPM); chmodSync(fakeNpm, 0o755);

let failed = 0;
CASES.forEach((c, i) => {
  const root = join(scratch, String(i));
  writeTree(root, c.files);
  const env = { ...process.env, SITE_DIR: c.siteDir || '.', GUARD_SKIP: c.skip || '', TEXT_SINKS: c.sinks || '',
    AUDIT_LEVEL: c.level || 'high', AUDIT_SKIP: c.askip || '', NPM_BIN: fakeNpm };
  delete env.GITHUB_ACTIONS;   // plain output; the annotations are GitHub's
  const r = runNode(join(DIR, SCRIPT[c.guard]), [], { cwd: root, env });
  const problems = [];
  if (r.code !== c.code) problems.push(`exit ${r.code}, expected ${c.code}`);
  for (const w of [c.want, c.want2].filter(Boolean)) if (!r.out.includes(w)) problems.push(`output lacks "${w}"`);
  if (c.after) { const p = c.after(root); if (p) problems.push(p); }
  if (problems.length) {
    failed++;
    console.log(`FAIL [${c.guard}] ${c.name}: ${problems.join('; ')}\n${r.out.replace(/^/gm, '    ')}`);
  } else {
    console.log(`ok   [${c.guard}] ${c.name}`);
  }
});
rmSync(scratch, { recursive: true, force: true });

if (failed) {
  console.error(`\ncheck-web-guards-cases: ${failed} of ${CASES.length} cases failed.`);
  process.exit(1);
}
console.log(`\ncheck-web-guards-cases: all ${CASES.length} cases pass.`);
