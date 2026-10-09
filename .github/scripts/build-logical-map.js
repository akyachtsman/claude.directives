// Generates docs/site/logical-map.html — the repo map as a LIFECYCLE FLOW.
//
// Columns are the stages a project goes through, start to finish: this repo
// publishes → a project is bootstrapped → each session starts → work is built →
// a PR is reviewed and gated → it merges and deploys → it is kept up to date.
// Every exported file sits in exactly one stage, and the arrows between files
// are the connections that DO something: copies, installs, imports, runs,
// triggers, hands off, governs, fills in. Vendors we delegate to are the last
// column.
//
// Nothing on the page is asserted from memory. The build FAILS when:
//   1. an exported file (EXPORTS.json → classes) is not placed in a stage, or a
//      placed id is unknown;
//   2. a declared connection has no EVIDENCE — the source file (or, for an edge
//      marked 'b', the target) must actually name the other file. The line that
//      names it is stored and shown in the page's side panel;
//   3. a MECHANICAL connection is missing — every `uses: ./.github/actions/<x>`
//      and every `workflow_run` watcher in templates/workflows/, every script a
//      plugin hook runs, and every vendor socket in EXPORTS.json → externals is
//      derived here, not declared, so none can be forgotten;
//   4. any file cannot be reached from the first stage — the map is wired start
//      to finish, with no orphan;
//   5. an arrow would pass through a box it does not connect (checked on the
//      computed geometry), or two boxes overlap.
// `--check` additionally fails when the committed page is stale.
//
// Behaviour (pan, zoom, search, trace a file's chain) is hand-written in
// docs/site/logical-map.js. The layout is computed HERE, so the page is correct
// before any script runs and the geometry checks above can see it.
//
//   node .github/scripts/build-logical-map.js          # write the page
//   node .github/scripts/build-logical-map.js --check  # fail if it would change
//
// ESM (matches the other check-*.js).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';

const OUT = 'docs/site/logical-map.html';
const manifest = JSON.parse(readFileSync('EXPORTS.json', 'utf8'));
const check = process.argv.includes('--check');
// --candidates: for every ACTIVE declared connection, print each line in the
// evidence file that names the other end — what you choose a quote from.
const candidates = process.argv.includes('--candidates');
let failed = false;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; };

/* ------------------------------------------------------------------ files */
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') && e.isDirectory() && e.name !== '.claude-plugin') continue;
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out.sort();
}
// A path ending in '/' is a directory node: its text is every file under it.
const filesOf = p => p.endsWith('/') ? walk(p.replace(/\/$/, '')) : [p];

/* ----------------------------------------------------------------- stages */
const STAGES = [
  { id: 'publish',   label: 'Publish',          blurb: 'This repo builds, proves and ships the standard.' },
  { id: 'bootstrap', label: 'Bootstrap',        blurb: 'A new project is set up once from the templates.' },
  { id: 'session',   label: 'Session start',    blurb: 'Every session installs the toolkit and imports the rules.' },
  { id: 'build',     label: 'Build',            blurb: 'Plan, build and test the change.' },
  { id: 'pr',        label: 'PR & review',      blurb: 'Gates, CI and reviewers decide whether it can merge.' },
  { id: 'ship',      label: 'Merge & deploy',   blurb: 'Merge, publish to Pages, and watch what happens next.' },
  { id: 'upkeep',    label: 'Upkeep',           blurb: 'Keep the project in sync, audited and remembered.' },
  { id: 'vendors',   label: 'Delegated',        blurb: 'Capabilities we use but do not own — wired, never forked.' },
];

// This repo's own body is never exported, so it enters the map as two group
// nodes rather than a file each. Both lists are DERIVED from the tree: a hand
// list catches a deletion but never an addition.
const listDir = d => readdirSync(d, { withFileTypes: true })
  .filter(e => e.isFile() && !/^\./.test(e.name) && !/\.(pyc|pyo|log|tmp|bak|swp)$/.test(e.name))
  .map(e => `${d}/${e.name}`).sort();
const GROUPS = {
  'self:ci': {
    label: "This repo's CI & checks",
    blurb: 'qa.yml and its validation scripts — everything below is proven here before it ships.',
    files: [...listDir('.github/workflows'), ...listDir('.github/scripts'), '.github/workflow-ref-required.json'],
  },
  // Everything else this repo TRACKS: derived as the complement of the export
  // set and the CI group, so a new root or docs file joins it without anyone
  // listing it (Codex, #393: a hand list had already dropped .gitignore).
  'self:ops': {
    label: "This repo's ops & docs",
    blurb: 'CLAUDE.md, the manifest, internal docs and the Pages site — every tracked file that is neither exported nor CI.',
    files: null,
  },
};
{
  const exportedPaths = Object.entries(manifest.classes).filter(([k]) => !k.startsWith('_')).flatMap(([, c]) => c.paths);
  const isExported = f => exportedPaths.some(p => p.endsWith('/') ? f.startsWith(p) : f === p);
  const ci = new Set(GROUPS['self:ci'].files);
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  // Order matters only for which line is quoted as evidence: the indexes first.
  const first = ['CLAUDE.md', 'README.md', 'docs/README.md'];
  GROUPS['self:ops'].files = [...first,
    ...tracked.filter(f => !isExported(f) && !ci.has(f) && !first.includes(f)).sort()];
}
// Files whose text proves nothing: the manifest and this map name every file.
const NO_EVIDENCE = new Set(['EXPORTS.json', OUT, 'docs/site/logical-map.js',
  '.github/scripts/build-logical-map.js', '.github/scripts/check-repo-map-ui.js']);

const P = 'plugins/directives-toolkit';
const PLACE = {
  publish: ['self:ci', 'self:ops', '.claude-plugin/marketplace.json',
    `${P}/.claude-plugin/plugin.json`, `${P}/evals/`],
  bootstrap: ['NEW-REPO-USER-INSTRUCTIONS.md', `${P}/commands/kickoff.md`, `${P}/commands/new-repo.md`,
    'templates/CLAUDE-template.md', 'templates/claude-settings.json',
    'templates/claude-hooks/session-start.sh', 'docs/guides/ai-first-principles.md',
    'docs/guides/dev-pipeline.md', 'docs/guides/usage-guide.md'],
  session: ['scripts/install-toolkit.sh', `${P}/hooks/`, 'directives/global.md',
    'directives/git.md', 'directives/design.md', 'directives/test.md', 'directives/data.md',
    'docs/standards/session-mechanics.md', `${P}/commands/env-chk.md`, `${P}/skills/scope-chk/`],
  build: [`${P}/commands/diagnose.md`, `${P}/commands/sdd-loop.md`,
    `${P}/commands/design-intake.md`, 'docs/guides/design-tooling.md', 'templates/styles/',
    `${P}/agents/qa-pipeline.md`, `${P}/agents/test-verifier.md`, `${P}/agents/ui-tester.md`,
    'templates/scripts/browser-ladder.js', `${P}/agents/supabase.md`,
    'templates/project-test-plan-template.md', 'templates/implementation-summary-template.md',
    `${P}/skills/doc-comp/`],
  pr: [`${P}/commands/commit-chk.md`, `${P}/agents/pr-readiness-reviewer.md`,
    'templates/pr-checklist.md', 'templates/workflows/qa.yml', 'templates/workflows/qa-response.yml',
    'templates/workflows/qa-live.yml', 'templates/ui-tests/', 'templates/actions/secret-scan/', 'templates/actions/ui-suite/',
    'templates/scripts/check-contrast.js', 'templates/scripts/check-ui-viewports.js',
    'docs/standards/viewport-classes-history.md',
    'templates/scripts/check-job-bounds.py', 'templates/scripts/workflow-ref-guard.py',
    'templates/scripts/check-py-warnings.py', 'templates/scripts/check-ui-suite-env.py',
    'templates/workflows/codex-monitor.yml',
    'docs/standards/pr-mechanics.md', 'docs/standards/code-review-standard.md',
    'docs/standards/ci-triage.md', 'docs/standards/cicd-setup.md'],
  ship: [`${P}/skills/update-pages/`, 'docs/standards/hosting-mechanics.md',
    'templates/workflows/pages-monitor.yml', 'templates/workflows/pages-retry.yml',
    'templates/workflows/pages-deploy.yml',
    'templates/workflows/ci-monitor.yml', 'templates/workflows/ci-notify.yml',
    'docs/standards/automations.md'],
  // scripts/ sits here, not under pr: besides the guard scripts the hooks run
  // from session start, it carries /refresh-repo's Phase 3 (refresh-stamp.sh),
  // and an arrow may not run backwards from upkeep (Codex, #423).
  upkeep: [`${P}/commands/refresh-repo.md`, `${P}/scripts/`, `${P}/commands/audit-repo.md`,
    `${P}/commands/learn.md`, `${P}/commands/handoff-session.md`, `${P}/commands/do-repo.md`,
    `${P}/commands/my-list.md`, 'MAINTAIN-REPO-USER-INSTRUCTIONS.md', 'docs/standards/kit-defects.md',
    'templates/workflows/keepalive.yml', 'templates/workflows/cron-notify.yml',
    'templates/scripts/notify-email.js', 'templates/scripts/notify-task.js',
    'templates/scripts/package.json', 'docs/guides/cron-email-notifications.md'],
  // vendors: filled from EXPORTS.json → externals below.
};

/* ------------------------------------------------------------------ kinds */
// Colour carries the KIND of connection, so one kind can be followed through
// the whole flow. Dashed kinds bind nothing at runtime.
const KINDS = {
  pub: { label: 'publishes',    hint: 'this repo validates or ships it',                         color: '#8B5E3C' },
  cop: { label: 'copies',       hint: 'a snapshot lands in the project at bootstrap',             color: '#B7791F' },
  ins: { label: 'installs',     hint: 'delivered as the plugin, refreshed every session',         color: '#7A4BAF' },
  imp: { label: 'imports',      hint: 'read live by raw URL at every session start',              color: '#1F6FEB' },
  gov: { label: 'governs',      hint: 'the rule the target must satisfy',                         color: '#C0392B' },
  det: { label: 'details in',   hint: 'the rule keeps its mechanism in the target',               color: '#5B6B7F' },
  seq: { label: 'hands off to', hint: 'the next step in the procedure',                           color: '#0F766E' },
  run: { label: 'runs',         hint: 'executes or invokes the target',                           color: '#2E7D4F' },
  trg: { label: 'triggers',     hint: 'its completion starts the target (workflow_run)',          color: '#DB6B12' },
  pro: { label: 'fills in',     hint: 'produces or completes the target',                         color: '#A0527A' },
  val: { label: 'checks',       hint: 'tests or measures the target',                             color: '#0E7490', dash: true },
  exp: { label: 'explains',     hint: 'a guide to the target; binds nothing',                     color: '#9A968E', dash: true },
  del: { label: 'delegates to', hint: 'hands the work to a vendor we do not own (EXPORTS.json socket)', color: '#6D5BD0', dash: true },
  rem: { label: 'retires',      hint: 'shipped only so it can be recognised and removed',          color: '#7F1D1D', dash: true },
  ret: { label: 're-syncs',     hint: 'loops back: picked up by the next session',                color: '#333333', dash: true },
};

// ACTIVE kinds claim that something HAPPENS (a copy, a run, a hand-off…). A
// mention of the other file cannot prove that by itself, and the first mention
// is often passive or contrastive (three Codex rounds on #393 found them one at
// a time). So every declared active connection must carry a QUOTE: a phrase
// that has to appear on the same line as the other file's name. The quote is
// chosen from the line that performs the connection; deleting that instruction
// then fails the build. Passive kinds (governs, details in, imports, explains)
// are relationships of mention, so a mention is their evidence.
const ACTIVE = new Set(['pub', 'cop', 'ins', 'seq', 'run', 'pro', 'val', 'rem', 'ret']);

/* ----------------------------------------------------------------- tokens */
// How a file is NAMED by another file. Evidence for a connection is one of
// these tokens appearing in the source text. Generic basenames (package.json,
// SKILL.md, hooks.json…) never count on their own.
const ALIASES = {
  '.claude-plugin/marketplace.json': [/@claude-directives(?![\w-])/, /(?<![\w.-])claude-directives(?=["'\s]*:)/],
  [`${P}/.claude-plugin/plugin.json`]: [/(?<![\w.-])\.\/plugins\/directives-toolkit(?![\w/-])/, 'CLAUDE_PLUGIN_ROOT'],
  [`${P}/hooks/`]: ['hooks/hooks.json', `${P}/hooks`],
  [`${P}/scripts/`]: ['push-gate.sh', 'wait-gate.sh', 'build-input-gate.sh', 'refresh-stamp.sh', `${P}/scripts`],
  [`${P}/evals/`]: [`${P}/evals`],
  [`${P}/agents/supabase.md`]: ['directives-toolkit:supabase', /(?<![\w.-])supabase(?:\.md)?`? agent/],
  'templates/styles/': ['templates/styles', 'tokens.css', 'components.css'],
  'templates/ui-tests/': ['templates/ui-tests', '.github/scripts/ui-tests'],
  // A bare `package.json` is ambiguous (the kit ships one too), so only the
  // installed path names this file: cron-notify.yml and /new-repo both write
  // `.github/scripts/package.json` since #398.
  'templates/scripts/package.json': ['nodemailer', '.github/scripts/package.json'],
  // /new-repo copies every composite action by one generic instruction,
  // "`templates/actions/<a>/**` → `.github/actions/<a>/**`", which names each.
  'templates/actions/secret-scan/': ['templates/actions/<a>/'],
  'templates/actions/ui-suite/': ['templates/actions/<a>/'],
};
const GENERIC = new Set(['package.json', 'SKILL.md', 'hooks.json', 'README.md', 'index.html', 'action.yml']);

const wfName = f => (readFileSync(f, 'utf8').match(/^name:\s*['"]?(.+?)['"]?\s*$/m) || [])[1];

function tokensOf(id) {
  if (GROUPS[id]) return GROUPS[id].files.flatMap(f => [f]);
  const t = [id.replace(/\/$/, '')];
  const base = id.replace(/\/$/, '').split('/').pop();
  const stem = base.replace(/\.(md|ya?ml|js|py|json|sh)$/, '');
  if (id.includes('/commands/')) t.push('/' + stem);
  else if (id.includes('/agents/')) t.push('directives-toolkit:' + stem, ...(stem === 'supabase' ? [] : [stem]));
  else if (id.includes('/skills/')) t.push(stem);
  else if (id.startsWith('templates/actions/')) t.push('actions/' + stem);
  else if (!id.endsWith('/') && !GENERIC.has(base)) t.push(base);
  if (id.startsWith('templates/workflows/')) { const n = wfName(id); if (n) t.push(n); }
  return [...t, ...(ALIASES[id] ?? [])];
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function tokenRe(t) {
  if (t instanceof RegExp) return t;
  const before = t.startsWith('/') ? '(?<![\\w/.-])' : '(?<![\\w.-])';
  return new RegExp(before + esc(t) + '(?![\\w-])');
}

const textCache = new Map();
function linesOf(id) {
  if (textCache.has(id)) return textCache.get(id);
  const files = GROUPS[id] ? GROUPS[id].files : filesOf(id);
  const out = [];
  for (const f of files) {
    if (NO_EVIDENCE.has(f)) continue;
    let s; try { s = readFileSync(f, 'utf8'); } catch { continue; }
    s.split('\n').forEach((line, i) => out.push({ file: f, line: i + 1, text: line }));
  }
  textCache.set(id, out);
  return out;
}
// A mention only counts if it is not NEGATED: "Do NOT copy `keepalive.yml`"
// names the file and says the opposite of a copy (Codex, #393). A negation
// before the name, in the same clause, disqualifies that mention; one after it
// ("delete X; do not bypass") does not.
const NEGATION = /\b(?:do not|don't|never|must not|should not|shouldn't|not)\b/i;
function affirms(text, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (const m of text.matchAll(g)) {
    const clause = text.slice(0, m.index).split(/[.;:!?]/).pop();
    if (!NEGATION.test(clause)) return true;
  }
  return false;
}
// The line in `src` that names `dst`, or null. `only` narrows the tokens — a
// derived trigger quotes the `workflows:` entry, not a comment that happens to
// mention the file first.
function evidence(src, dst, only = null, quote = null, all = false) {
  const res = (only ?? tokensOf(dst)).map(tokenRe);
  const lines = linesOf(src);
  // Prefer a line that is not a comment: a comment can describe a connection
  // that the code no longer makes.
  // ...and within a code line, prefer the code to a trailing comment on it.
  const code = l => /\.(ya?ml|sh|py)$/.test(l.file) ? l.text.replace(/\s#.*$/, '')
    : /\.(js|mjs|cjs)$/.test(l.file) ? l.text.replace(/\s\/\/.*$/, '') : l.text;
  // A quote may sit anywhere in the same PARAGRAPH (the run of non-blank
  // lines): instructions wrap, a list of files to copy hangs off one "copy
  // these…" lead, and a rule can name the file before it says "run it when…".
  // It may not sit in another paragraph. A quote must therefore be SPECIFIC to
  // the instruction: a bare "copy" in a paragraph about something else would
  // pass, which is a declaration to fix, not a rule to loosen.
  const para = l => {
    const i = lines.indexOf(l), parts = [l.text];
    for (let j = i - 1; j >= 0 && lines[j].file === l.file && lines[j].text.trim(); j--) parts.unshift(lines[j].text);
    for (let j = i + 1; j < lines.length && lines[j].file === l.file && lines[j].text.trim(); j++) parts.push(lines[j].text);
    return parts.join('\n');
  };
  const quoted = l => !quote || para(l).toLowerCase().includes(quote.toLowerCase());
  const names = t => res.some(r => affirms(t, r));
  if (all) return lines.filter(l => names(l.text));
  // Tightest first: a code line carrying the quote itself, then any line
  // carrying it, then a line whose paragraph carries it.
  const onLine = l => !quote || l.text.toLowerCase().includes(quote.toLowerCase());
  const isCode = l => !/^\s*(#|\/\/)/.test(l.text);
  const hit = lines.find(l => isCode(l) && names(code(l)) && onLine(l))
    ?? lines.find(l => names(l.text) && onLine(l))
    ?? lines.find(l => isCode(l) && names(code(l)) && quoted(l))
    ?? lines.find(l => names(l.text) && quoted(l));
  // No line NUMBER is stored: a number shifts on any edit above it, which would
  // make the committed map stale on nearly every directive PR. The quoted text
  // only changes when that line itself does.
  if (!hit) return null;
  // A long line is cut AROUND what proves the connection — the quote if the
  // line carries it, else the first name it affirms — never to its first 180
  // characters, which can end before either (Codex, #393: a 381-character hook).
  const text = hit.text.trim().replace(/\s+/g, ' ');
  if (text.length <= 180) return { file: hit.file, text };
  const at = quote && text.toLowerCase().includes(quote.toLowerCase())
    ? text.toLowerCase().indexOf(quote.toLowerCase())
    : Math.min(...res.map(r => text.search(new RegExp(r.source, r.flags.replace('g', '')))).filter(i => i >= 0));
  const start = Math.max(0, Math.min(at - 60, text.length - 180));
  return { file: hit.file, text: (start ? '…' : '') + text.slice(start, start + 180) + (start + 180 < text.length ? '…' : '') };
}

/* ------------------------------------------------------------------ nodes */
const exported = [];
for (const [cls, def] of Object.entries(manifest.classes)) {
  if (cls.startsWith('_')) continue;
  for (const p of def.paths) exported.push({ p, cls });
}
const clsOf = new Map(exported.map(e => [e.p, e.cls]));
const compartmentOf = new Map();
for (const [dom, comps] of Object.entries(manifest.domains)) {
  if (dom.startsWith('_')) continue;
  for (const [comp, paths] of Object.entries(comps)) {
    if (comp.startsWith('_')) continue;
    for (const p of paths) compartmentOf.set(p, `${dom}.${comp}`);
  }
}
const vendors = Object.entries(manifest.externals).filter(([k]) => !k.startsWith('_'));
PLACE.vendors = vendors.map(([n]) => `vendor:${n}`);

const delivery = p =>
  p.startsWith('directives/') ? 'inh'
  : p.startsWith('plugins/') || p.startsWith('.claude-plugin/') || p === 'scripts/install-toolkit.sh' ? 'ins'
  : p.startsWith('templates/') ? 'cop'
  : 'ref';
const DELIVERY = {
  inh: 'inherited — raw URL, live at the next session start',
  ins: 'installed — the plugin, refreshed every session by the SessionStart hook',
  cop: 'copied — a snapshot taken at bootstrap; resync with /refresh-repo',
  ref: 'referenced — read on demand, nothing stored downstream',
  int: 'internal — never leaves this repo',
  ven: 'vendor — owned by someone else; we hold only the wiring',
};

const stageOf = new Map();
for (const [st, ids] of Object.entries(PLACE)) {
  for (const id of ids) {
    if (stageOf.has(id)) fail(`${id} is placed in two stages (${stageOf.get(id)}, ${st})`);
    stageOf.set(id, st);
  }
}
for (const { p } of exported) if (!stageOf.has(p)) fail(`exported file not placed in any stage: ${p} — add it to PLACE`);
for (const id of stageOf.keys()) {
  if (id.startsWith('vendor:') || GROUPS[id]) continue;
  if (!clsOf.has(id)) fail(`placed id is not an exported path: ${id}`);
  else if (!existsSync(id.replace(/\/$/, ''))) fail(`placed path missing from tree: ${id}`);
}
for (const g of Object.values(GROUPS)) for (const f of g.files) if (!existsSync(f)) fail(`group file missing: ${f}`);

const labelOf = id => {
  if (GROUPS[id]) return GROUPS[id].label;
  if (id.startsWith('vendor:')) return id.slice(7);
  const custom = { [`${P}/hooks/`]: 'hooks.json', [`${P}/scripts/`]: 'scripts/',
    [`${P}/evals/`]: 'evals/', 'templates/styles/': 'styles/', 'templates/ui-tests/': 'ui-tests/' };
  if (custom[id]) return custom[id];
  const base = id.replace(/\/$/, '').split('/').pop();
  const stem = base.replace(/\.md$/, '');
  if (id.includes('/commands/')) return '/' + stem;
  if (id.includes('/agents/') || id.includes('/skills/') || id.startsWith('templates/actions/')) return stem;
  return base;
};
// Short names are how connections are written below. Each must be unique.
const byLabel = new Map();
for (const id of stageOf.keys()) {
  const l = labelOf(id);
  if (byLabel.has(l)) fail(`two nodes share the label "${l}": ${byLabel.get(l)}, ${id}`);
  byLabel.set(l, id);
}
const N = l => { const id = byLabel.get(l) ?? (stageOf.has(l) ? l : null); if (!id) fail(`unknown node in a connection: "${l}"`); return id; };

/* ------------------------------------------------------------ connections */
// [from, to, kind, words, evidence-side, quote]. Evidence side 'a' (default):
// `from` names `to`. 'b': `to` names `from` — used where the flow runs opposite to the
// reference (a checker names what it checks; an installer names its source).
const FLOW = [
  // publish
  ['self:ci', 'marketplace.json', 'val', 'validates', 'a', 'JSON.parse(readFileSync'],
  ['self:ci', 'plugin.json', 'val', 'validates', 'a', 'JSON.parse(readFileSync'],
  ['self:ops', 'evals/', 'run', 'runs when a skill description changes', 'a', 'run it when a description changes'],
  ['self:ops', 'NEW-REPO-USER-INSTRUCTIONS.md', 'pub', 'publishes the bootstrap guide', 'a', 'Bootstrap guide'],
  ['self:ops', 'ai-first-principles.md', 'pub', 'publishes', 'a', 'AI-first working principles'],
  ['self:ops', 'dev-pipeline.md', 'pub', 'publishes', 'a', 'ordered procedure'],
  ['self:ops', 'usage-guide.md', 'pub', 'publishes', 'a', 'bootstrap into a project'],
  ['marketplace.json', 'plugin.json', 'pub', 'lists the plugin', 'a', '"source"'],
  ['evals/', 'scope-chk', 'val', 'tests when it fires', 'a', 'must fire'],
  ['evals/', 'update-pages', 'val', 'tests when it fires', 'a', 'must fire'],
  ['evals/', 'doc-comp', 'val', 'tests when it fires', 'a', 'must fire'],
  // bootstrap
  ['NEW-REPO-USER-INSTRUCTIONS.md', 'install-toolkit.sh', 'seq', 'Step 0: add to the Setup script', 'a', 'Setup script'],
  ['NEW-REPO-USER-INSTRUCTIONS.md', '/new-repo', 'seq', 'or, for a bare scaffold, run', 'a', 'Run `/new-repo` instead'],
  ['NEW-REPO-USER-INSTRUCTIONS.md', '/kickoff', 'seq', 'then start building with', 'a', 'scaffolds the repo'],
  ['NEW-REPO-USER-INSTRUCTIONS.md', 'MAINTAIN-REPO-USER-INSTRUCTIONS.md', 'seq', 'after bootstrap, maintain with', 'a', 'ongoing runbook'],
  ['NEW-REPO-USER-INSTRUCTIONS.md', 'cron-email-notifications.md', 'det', 'scheduled email: details in'],
  ['/new-repo', 'CLAUDE-template.md', 'cop', 'copies', 'a', 'Create `CLAUDE.md`'],
  ['/new-repo', 'claude-settings.json', 'cop', 'copies', 'a', 'Also copy'],
  ['/new-repo', 'session-start.sh', 'cop', 'copies and makes executable', 'a', 'so copy'],
  ['/new-repo', 'styles/', 'cop', 'copies the design starter', 'a', 'Design starter'],
  ['/new-repo', 'qa.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['/new-repo', 'qa-response.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['/new-repo', 'qa-live.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['/new-repo', 'codex-monitor.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  // The scripts a caller names are DERIVED, never hand-listed (batch 5): /new-repo
  // points at the derivation, and the static job's five ride with qa.yml.
  ['/new-repo', '/refresh-repo', 'det', 'derives the scripts to copy with', 'a', 'Deriving the referenced-script set'],
  ['/new-repo', 'check-ui-viewports.js', 'cop', 'copies', 'a', 'The scripts that serve the kit'],
  ['/new-repo', 'browser-ladder.js', 'cop', 'copies', 'a', 'The scripts that serve the kit'],
  ['cicd-setup.md', 'check-contrast.js', 'cop', 'copies', 'a', 'runs these five scripts by path'],
  ['cicd-setup.md', 'workflow-ref-guard.py', 'cop', 'copies', 'a', 'runs these five scripts by path'],
  ['cicd-setup.md', 'check-job-bounds.py', 'cop', 'copies', 'a', 'runs these five scripts by path'],
  ['cicd-setup.md', 'check-py-warnings.py', 'cop', 'copies', 'a', 'runs these five scripts by path'],
  ['cicd-setup.md', 'check-ui-suite-env.py', 'cop', 'copies', 'a', 'runs these five scripts by path'],
  ['/new-repo', 'secret-scan', 'cop', 'copies the whole directory', 'a', 'Composite actions'],
  ['/new-repo', 'ui-suite', 'cop', 'copies the whole directory', 'a', 'Composite actions'],
  ['/new-repo', 'ui-tests/', 'cop', 'copies the kit', 'a', 'Install the Playwright kit'],
  ['/new-repo', 'notify-email.js', 'cop', 'copies', 'a', 'Scheduled-job scripts'],
  ['/new-repo', 'notify-task.js', 'cop', 'copies', 'a', 'Scheduled-job scripts'],
  ['/new-repo', 'package.json', 'cop', 'copies', 'a', 'Scheduled-job scripts'],
  ['/new-repo', 'pages-monitor.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['/new-repo', 'pages-retry.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['/new-repo', 'pages-deploy.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['/new-repo', 'ci-monitor.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['/new-repo', 'ci-notify.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['/new-repo', 'cron-notify.yml', 'cop', 'copies', 'a', 'copy these workflow files'],
  ['CLAUDE-template.md', 'global.md', 'imp', 'imports'],
  ['CLAUDE-template.md', 'git.md', 'imp', 'imports'],
  ['CLAUDE-template.md', 'design.md', 'imp', 'imports'],
  ['CLAUDE-template.md', 'test.md', 'imp', 'imports'],
  ['CLAUDE-template.md', 'data.md', 'imp', 'imports'],
  ['claude-settings.json', 'session-start.sh', 'run', 'registers the SessionStart hook', 'a', '"command"'],
  ['session-start.sh', 'install-toolkit.sh', 'run', 'runs every session', 'a', 'RAW_URL'],
  ['ai-first-principles.md', 'global.md', 'exp', 'the reasoning behind'],
  ['dev-pipeline.md', '/sdd-loop', 'exp', 'walks through'],
  ['usage-guide.md', '/sdd-loop', 'exp', 'quickstart for'],
  // session start
  ['global.md', '/env-chk', 'gov', 'Session Start: run'],
  ['global.md', 'session-mechanics.md', 'det', 'details in'],
  ['/env-chk', 'scope-chk', 'run', 'runs', 'a', 'run the `scope-chk`'],
  ['global.md', '/diagnose', 'det', 'proposing work: detail in'],
  ['global.md', '/sdd-loop', 'gov', 'builds with'],
  ['global.md', '/commit-chk', 'gov', 'verifies with'],
  ['global.md', 'codex-monitor.yml', 'gov', 'requires'],
  ['global.md', 'hosting-mechanics.md', 'det', 'details in'],
  ['global.md', 'automations.md', 'det', 'details in'],
  ['global.md', 'pages-monitor.yml', 'gov', 'requires'],
  ['global.md', 'pages-retry.yml', 'gov', 'requires (branch-source only)'],
  ['global.md', 'pages-deploy.yml', 'gov', 'requires (Actions-source only)'],
  ['global.md', 'qa.yml', 'gov', 'requires'],
  ['global.md', 'qa-live.yml', 'gov', 'requires'],
  ['global.md', 'qa-response.yml', 'gov', 'requires'],
  ['global.md', 'cron-notify.yml', 'gov', 'requires'],
  ['global.md', 'ci-monitor.yml', 'gov', 'requires'],
  ['global.md', 'ci-notify.yml', 'gov', 'requires'],
  ['global.md', '/learn', 'gov', 'record lessons with'],
  ['global.md', '/handoff-session', 'gov', 'hand off with'],
  ['global.md', '/do-repo', 'det', 'reading other repos: packaged as'],
  ['git.md', 'pr-mechanics.md', 'det', 'details in'],
  ['git.md', 'qa.yml', 'gov', 'merge needs green'],
  ['git.md', 'update-pages', 'gov', 'after merge, run'],
  ['design.md', '/design-intake', 'gov', 'establish the look with'],
  ['design.md', 'design-tooling.md', 'det', 'tool setup in'],
  ['design.md', 'styles/', 'gov', 'tokens contract'],
  ['design.md', 'check-contrast.js', 'gov', 'contrast guardrail'],
  ['test.md', 'qa-pipeline', 'gov', 'QA runs through'],
  ['test.md', 'ui-tests/', 'gov', 'the UI test kit'],
  ['test.md', 'project-test-plan-template.md', 'det', 'test plan structure in'],
  ['test.md', 'implementation-summary-template.md', 'gov', 'requires'],
  ['test.md', 'pr-checklist.md', 'det', 'readiness checklist in'],
  ['test.md', 'pr-readiness-reviewer', 'gov', 'final gate'],
  ['test.md', 'qa-live.yml', 'gov', 'requires'],
  ['test.md', 'check-ui-viewports.js', 'gov', 'viewport gate'],
  ['test.md', 'viewport-classes-history.md', 'det', 'history in'],
  ['test.md', 'code-review-standard.md', 'det', 'details in'],
  ['test.md', 'ci-triage.md', 'det', 'details in'],
  ['test.md', 'cicd-setup.md', 'det', 'details in'],
  ['data.md', 'supabase', 'gov', 'rules for', 'b'],
  ['hooks.json', 'update-pages', 'seq', 'after a Pages edit, prompts to apply', 'a', 'apply the'],
  ['/env-chk', '/refresh-repo', 'seq', 'on drift', 'a', 'run `/refresh-repo`'],
  // build
  ['/kickoff', '/new-repo', 'run', 'runs first when CLAUDE.md is absent', 'a', 'Bootstrap if needed'],
  ['/kickoff', '/design-intake', 'seq', 'hands off to', 'a', 'Establish the look'],
  ['/kickoff', '/sdd-loop', 'seq', 'hands off to', 'a', 'Drive the loop'],
  ['/diagnose', '/sdd-loop', 'seq', 'hands the brief to', 'a', 'Hand off'],
  ['/diagnose', '/learn', 'det', 'reads the lessons /learn records'],
  ['design-tooling.md', '/design-intake', 'exp', 'tools for'],
  ['/design-intake', '/sdd-loop', 'seq', 'hands off to', 'a', 'Next: `/sdd-loop`'],
  ['/design-intake', 'styles/', 'pro', 'writes the project\'s tokens.css', 'a', 'Writes:'],
  ['/sdd-loop', 'qa-pipeline', 'run', 'runs', 'a', 'run the `directives-toolkit:qa-pipeline`'],
  ['/sdd-loop', '/commit-chk', 'seq', 'before pushing', 'a', 'Pre-Push gate'],
  ['qa-pipeline', 'test-verifier', 'run', 'runs', 'a', '1. **test-verifier**'],
  ['qa-pipeline', 'ui-tester', 'run', 'runs', 'a', '2. **ui-tester**'],
  ['qa-pipeline', 'pr-readiness-reviewer', 'run', 'ends with', 'a', '5. **pr-readiness-reviewer**'],
  ['ui-tester', 'ui-tests/', 'run', 'drives', 'a', 'Runnable source of truth'],
  // pr & review
  // The workflows run the kit: the arrow starts at the actor (Codex audit, #393).
  ['qa.yml', 'ui-tests/', 'run', 'runs the kit in CI (tests-dir)', 'a', 'UI_TESTS_DIR'],
  ['qa-live.yml', 'ui-tests/', 'run', 'runs the kit against the live site (tests-dir)', 'a', 'UI_TESTS_DIR'],
  ['qa-response.yml', 'ui-tests/', 'run', 'runs the kit on demand (tests-dir)', 'a', 'UI_TESTS_DIR'],
  // upkeep
  ['/refresh-repo', 'kit-defects.md', 'run', 'checks against', 'a', 'Fetch the list'],
  ['/refresh-repo', 'scripts/', 'run', 'runs Phase 3 (applied-check + stamp)', 'a', 'scripts/refresh-stamp.sh'],
  ['/do-repo', '/audit-repo', 'run', "runs its checklist on another repo", 'a', 'checklist'],
  ['MAINTAIN-REPO-USER-INSTRUCTIONS.md', '/refresh-repo', 'seq', 'resync with', 'a', 'Run `/refresh-repo`'],
  ['MAINTAIN-REPO-USER-INSTRUCTIONS.md', 'keepalive.yml', 'rem', 'delete it from projects', 'a', 'Delete'],
  ['notify-task.js', 'notify-email.js', 'run', 'sends through', 'a', 'require('],
  ['cron-email-notifications.md', 'cron-notify.yml', 'exp', 'sets up'],
  ['cron-email-notifications.md', 'notify-task.js', 'exp', 'sets up'],
  ['cron-email-notifications.md', 'notify-email.js', 'exp', 'sets up'],
  ['cron-email-notifications.md', 'package.json', 'exp', 'sets up'],
  // Phase 0 re-reads EVERY directive CLAUDE.md imports, so all five are drawn
  // (Codex, #393: one was), each named in that instruction.
  ...['global.md', 'git.md', 'design.md', 'test.md', 'data.md'].map(d =>
    ['/refresh-repo', d, 'ret', 'Phase 0 re-reads it', 'a', 're-read every imported directive']),
];

/* ----------------------------------------------------- derived connections */
const derived = [];
// (a) composite actions a workflow uses, and (b) workflow_run watchers.
const wfIds = PLACE.pr.concat(PLACE.ship, PLACE.upkeep).filter(id => id.startsWith('templates/workflows/'));
const allWf = readdirSync('templates/workflows').map(f => `templates/workflows/${f}`);
for (const f of allWf) if (!stageOf.has(f)) fail(`workflow template not on the map: ${f}`);
const idByWfName = new Map(allWf.map(f => [wfName(f), f]));
for (const f of allWf) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/^\s*-?\s*uses:\s*\.\/\.github\/actions\/([\w-]+)/gm)) {
    const target = `templates/actions/${m[1]}/`;
    if (!stageOf.has(target)) { fail(`${f} uses an action that is not on the map: ${m[1]}`); continue; }
    derived.push([f, target, 'run', 'uses']);
  }
  // workflow_run: workflows: ['A', 'B']  or  workflows:\n  - 'A'
  const block = src.match(/^\s*workflow_run:\s*\n((?:\s+.*\n?)*?)(?=^\S|^\s{0,2}\w+:\s*$)/m);
  if (block) {
    const body = block[1].split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
    const inline = body.match(/workflows:\s*\[([^\]]*)\]/);
    const names = inline
      ? inline[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
      : [...(body.match(/workflows:\s*\n((?:\s+-\s*.*\n?)*)/)?.[1] ?? '').matchAll(/-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map(m => m[1]);
    for (const n of names) {
      const subject = idByWfName.get(n);
      if (subject) derived.push([subject, f, 'trg', 'triggers', 'b', [`'${n}'`, `"${n}"`, `- ${n}`]]);
      // A name with no template (GitHub's own pages-build-deployment, a
      // project's deploy workflow) has nothing on the map to connect to.
    }
  }
}
void wfIds;
// (b2) shipped scripts a workflow or composite action RUNS. Declaring these by
// hand missed two of the four qa.yml runs (Codex, #393), so they are read from
// the run steps: an interpreter followed by a path ending in a shipped script.
{
  const scripts = [...stageOf.keys()].filter(id => id.startsWith('templates/scripts/') && /\.(js|py|sh)$/.test(id));
  const runners = [...allWf, ...readdirSync('templates/actions').map(a => `templates/actions/${a}/action.yml`)];
  for (const f of runners) {
    const owner = f.startsWith('templates/actions/') ? f.replace(/action\.yml$/, '') : f;
    const lines = readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*#/.test(l));
    for (const id of scripts) {
      const base = id.split('/').pop();
      const re = new RegExp(`\\b(node|python3|bash|sh)\\s+["']?[^\\s"']*\\b${base.replace(/\./g, '\\.')}\\b`);
      const hit = lines.map(l => l.match(re)).find(Boolean);
      if (hit && !derived.some(([a, b]) => a === owner && b === id)) {
        derived.push([owner, id, 'run', 'runs', 'a', [base], `${hit[1]} `]);
      }
    }
  }
}
const fileToNode = f => {
  if (stageOf.has(f)) return f;
  for (const id of stageOf.keys()) if (id.endsWith('/') && f.startsWith(id)) return id;
  for (const [g, def] of Object.entries(GROUPS)) if (def.files.includes(f)) return g;
  return null;
};
// (b3) dependency manifests a run step installs. Hand-declaring this drew the
// install from the script that require()s the package instead of the workflow
// step that runs `npm install` (Codex, #393). Read per step, in workflows AND
// composite actions: an `npm install` / `npm ci` run whose working-directory
// holds a shipped package.json. An action's `${{ inputs.x }}` directory is
// resolved through every workflow that passes `x` (Codex, #393: ui-suite).
{
  const toTemplate = d => d.replace(/^\.github\/scripts\/ui-tests(?=\/|$)/, 'templates/ui-tests')
    .replace(/^\.github\/scripts(?=\/|$)/, 'templates/scripts');
  const passed = (action, input) => {
    const dirs = new Set();
    for (const w of allWf) {
      const src = readFileSync(w, 'utf8');
      if (!src.includes(`./.github/actions/${action}`)) continue;
      for (const m of src.matchAll(new RegExp(`^\\s*${input}:\\s*['"]?(\\$\\{\\{[^}]*\\}\\}|[^\\s'"]+)`, 'gm'))) {
        const env = m[1].match(/^\$\{\{\s*env\.(\w+)\s*\}\}$/);
        const val = env ? src.match(new RegExp(`^\\s*${env[1]}:\\s*['"]?([^\\s'"]+)`, 'm'))?.[1] : m[1];
        if (val) dirs.add(val);
      }
    }
    return [...dirs];
  };
  const runners = [...allWf, ...readdirSync('templates/actions').map(a => `templates/actions/${a}/action.yml`)];
  for (const f of runners) {
    const owner = f.startsWith('templates/actions/') ? f.replace(/action\.yml$/, '') : f;
    const steps = readFileSync(f, 'utf8').split(/\n(?=\s*- (?:name|uses|run|shell):)/);
    for (const step of steps) {
      const code = step.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
      const npm = code.match(/run:\s*(npm (?:install|ci))\b/);
      const dir = code.match(/working-directory:\s*['"]?(\$\{\{\s*inputs\.([\w-]+)\s*\}\}|[^\s'"]+)/);
      if (!npm || !dir) continue;
      const dirs = dir[2] ? passed(owner.split('/').at(-2), dir[2]) : [dir[1]];
      if (!dirs.length) fail(`${f}: npm install in \${{ inputs.${dir[2]} }}, which no workflow passes`);
      for (const d of dirs) {
        const id = fileToNode(`${toTemplate(d)}/package.json`);
        if (id && !derived.some(([a, b]) => a === owner && b === id)) {
          derived.push([owner, id, 'run', 'installs its dependencies', 'a', [npm[1]], 'run:']);
        }
      }
    }
  }
}
// (c) scripts the plugin's hooks run.
const hooksJson = readFileSync(`${P}/hooks/hooks.json`, 'utf8');
if (/scripts\/[\w-]+\.sh/.test(hooksJson)) derived.push([`${P}/hooks/`, `${P}/scripts/`, 'run', 'runs its guard scripts']);
// (c2) what the plugin installs: everything under its root. Claude Code loads
// commands/, agents/, skills/ and hooks/ by convention, and the hooks run
// scripts/ from it; nothing lists them, so drawing a few by the files that
// happen to name them drew a partial set, and an allow-list of four directories
// left scripts/ out (Codex, #393).
for (const id of stageOf.keys()) {
  if (id.startsWith(`${P}/`) && id !== `${P}/.claude-plugin/plugin.json`) {
    derived.push([`${P}/.claude-plugin/plugin.json`, id, 'ins', 'installs', 'plugin', id]);
  }
}
// (c3) what /refresh-repo re-syncs: every row of its Phase 2 path table whose
// policy is not "Never overwrite", matched against the map's templates. The
// table is the operation, so it is read, not restated (Codex, #393). A file this
// repo ships only to retire is not re-synced.
{
  const src = `${P}/commands/refresh-repo.md`;
  const retired = new Set(FLOW.filter(f => f[2] === 'rem').map(f => N(f[1])));
  for (const line of readFileSync(src, 'utf8').split('\n')) {
    const row = line.match(/^\| `(templates\/[^`]+)` \| `?([^|`]+)`? \| (.*)\|\s*$/);
    if (!row || /^Never overwrite/.test(row[3].trim())) continue;
    const re = new RegExp('^' + row[1].replace(/[.]/g, '\\.').replace(/\/\*\*$/, '/\u0000')
      .replace(/<[^>]+>|\*/g, '[^/]+').replace('\u0000', '.*') + '$');
    const hits = [...stageOf.keys()].filter(id => id.startsWith('templates/') && !retired.has(id)
      && (re.test(id) || (id.endsWith('/') && re.test(id + 'x'))));
    if (!hits.length) fail(`${src}: Phase 2 row ${row[1]} matches nothing on the map`);
    for (const id of hits) derived.push([src, id, 'ret', 're-syncs (Phase 2)', 'a', [row[1]], `| \`${row[1]}\``]);
  }
}
// (d) vendor sockets.
for (const [name, ext] of vendors) {
  // Several sockets can sit in one box (a directory or a group): one connection
  // per box, its evidence listing every socket (Codex, #393).
  const byNode = new Map();
  for (const s of ext.sockets) {
    const node = fileToNode(s);
    if (!node) { fail(`vendor socket ${s} (${name}) is not on the map`); continue; }
    byNode.set(node, [...(byNode.get(node) ?? []), s]);
  }
  // Carry the SOCKET paths, not the node: a group or directory node is not
  // what the manifest lists, and the panel must quote what it does (Codex, #393).
  for (const [node, socks] of byNode) derived.push([node, `vendor:${name}`, 'del', `delegates to`, 'manifest', socks.join(', ')]);
}

/* ---------------------------------------------------------- assemble edges */
const edges = [];
const seen = new Map();
function add(a, b, kind, words, side = 'a', declared = true, only = null, quote = null) {
  if (!a || !b) return;
  if (!KINDS[kind]) { fail(`unknown kind ${kind} on ${a} → ${b}`); return; }
  const key = `${a}→${b}`;
  if (seen.has(key)) {
    fail(`connection drawn twice: ${labelOf(a)} → ${labelOf(b)}${declared ? ' — it is derived; remove it from FLOW' : ''}`);
    return;
  }
  let ev;
  if (side === 'manifest') {
    ev = { file: 'EXPORTS.json', text: `externals → ${b.slice(7)} → sockets lists ${only}` };
  } else if (side === 'plugin') {
    ev = { file: only, text: `under the plugin root, which the plugin install delivers whole` };
  } else {
    const [src, dst] = side === 'b' ? [b, a] : [a, b];
    if (candidates && declared && ACTIVE.has(kind)) {
      console.log(`\n### ${labelOf(a)} --${kind}--> ${labelOf(b)}  (${words})${quote ? `  quote: "${quote}"` : ''}`);
      for (const l of evidence(src, dst, only, null, true)) console.log(`  ${l.file}:${l.line}  ${l.text.trim().slice(0, 150)}`);
    }
    if (declared && ACTIVE.has(kind) && !quote) {
      fail(`${labelOf(a)} → ${labelOf(b)} is an active connection (${KINDS[kind].label}) with no quote — `
        + `give it the phrase from the line that performs it (run with --candidates to list them)`);
      return;
    }
    ev = evidence(src, dst, only, quote);
    if (!ev) {
      fail(`no evidence for ${labelOf(a)} → ${labelOf(b)}: ${labelOf(src)} never names ${labelOf(dst)}`
        + (quote ? ` in a paragraph that says "${quote}" (the instruction the quote pins may have changed)` : ''));
      return;
    }
  }
  const sa = STAGES.findIndex(s => s.id === stageOf.get(a));
  const sb = STAGES.findIndex(s => s.id === stageOf.get(b));
  if (sb < sa && kind !== 'ret') fail(`${labelOf(a)} → ${labelOf(b)} runs backwards (${stageOf.get(a)} → ${stageOf.get(b)}); only a re-sync may loop back`);
  if (kind === 'ret' && sb > sa) fail(`${labelOf(a)} → ${labelOf(b)} is marked re-syncs but does not loop back`);
  seen.set(key, edges.length);
  edges.push({ a, b, kind, words, ev, side });
}
for (const [a, b, k, w, s, only, q] of derived) add(a, b, k, w, s ?? 'a', false, only ?? null, q ?? null);
// `quote`, when given, pins the evidence to the line that ACTS: it must hold
// both the other file's name and this phrase. Use it where the first mention
// in the file is contrastive and the instruction comes later (Codex, #393).
for (const [a, b, k, w, s, q] of FLOW) add(N(a), N(b), k, w, s ?? 'a', true, null, q ?? null);

/* ----------------------------------------------------- start-to-finish wiring */
// Every node must be reachable from the first stage. A file nothing leads to is
// a file the map cannot explain the existence of.
{
  const out = new Map();
  for (const e of edges) out.set(e.a, [...(out.get(e.a) ?? []), e.b]);
  const reach = new Set(PLACE[STAGES[0].id]);
  const q = [...reach];
  while (q.length) for (const n of out.get(q.shift()) ?? []) if (!reach.has(n)) { reach.add(n); q.push(n); }
  for (const id of stageOf.keys()) {
    if (!reach.has(id)) fail(`not wired from the start: ${labelOf(id)} (${stageOf.get(id)}) — no chain of connections reaches it from "${STAGES[0].label}"`);
  }
  for (const s of STAGES.slice(1)) {
    if (!PLACE[s.id].length) fail(`stage ${s.id} is empty`);
  }
  // Every COPIED template must arrive by a copy (or be retired). Reachable is
  // not enough: a later "runs" arrow reached secret-scan and the notify
  // scripts while the map never showed how they enter a project (Codex, #393).
  // The fill-in artifacts are exempt: a project reads them from upstream when
  // it needs one; nothing copies them at bootstrap.
  for (const { p, cls } of exported) {
    if (delivery(p) !== 'cop' || cls === 'artifact') continue;
    if (!edges.some(e => e.b === p && (e.kind === 'cop' || e.kind === 'rem'))) {
      fail(`copied template with no copy into a project: ${labelOf(p)} — declare the copy that installs it, or retire it`);
    }
  }
}

/* ----------------------------------------------------------------- layout */
// Sugiyama-style, with the layers fixed by stage. A connection that skips
// columns reserves a thin SLOT in every column it crosses, so it runs through a
// gap and never through a box. Same-column links and the one loop-back kind
// travel in the gutters, which hold no boxes at all.
const COLW = 214, GUT = 132, TOP = 132, NODEH = 30, GROUPH = 44, GAP = 8, SLOTH = 4, LEFT = 30;
const colX = i => LEFT + i * (COLW + GUT);
const cols = STAGES.map(s => PLACE[s.id].map(id => ({ id, real: true })));
const stageIx = id => STAGES.findIndex(s => s.id === stageOf.get(id));
// Long forward edges → chains of slots.
const chains = new Map(); // edge index → [slot objects]
edges.forEach((e, i) => {
  const sa = stageIx(e.a), sb = stageIx(e.b);
  if (sb - sa > 1) {
    const slots = [];
    for (let c = sa + 1; c < sb; c++) {
      const slot = { id: `slot:${i}:${c}`, real: false, edge: i };
      cols[c].push(slot);
      slots.push(slot);
    }
    chains.set(i, slots);
  }
});
// Adjacency between consecutive columns for ordering.
const nbrs = new Map(); // id → { up: [ids in previous column], down: [ids in next column] }
const link = (u, v) => {
  if (!nbrs.has(u)) nbrs.set(u, { up: [], down: [] });
  if (!nbrs.has(v)) nbrs.set(v, { up: [], down: [] });
  nbrs.get(u).down.push(v);
  nbrs.get(v).up.push(u);
};
edges.forEach((e, i) => {
  const sa = stageIx(e.a), sb = stageIx(e.b);
  if (sb <= sa) return;
  const path = [e.a, ...(chains.get(i) ?? []).map(s => s.id), e.b];
  for (let k = 0; k + 1 < path.length; k++) link(path[k], path[k + 1]);
});
const pos = new Map(); // id → index within its column
const reindex = () => cols.forEach(col => col.forEach((n, i) => pos.set(n.id, i)));
reindex();
const bary = (id, dir) => {
  const ns = nbrs.get(id)?.[dir] ?? [];
  return ns.length ? ns.reduce((s, n) => s + pos.get(n), 0) / ns.length : null;
};
for (let it = 0; it < 24; it++) {
  const down = it % 2 === 0;
  const order = down ? cols.map((_, i) => i).slice(1) : cols.map((_, i) => i).reverse().slice(1);
  for (const c of order) {
    const dir = down ? 'up' : 'down';
    const col = cols[c];
    const keyed = col.map((n, i) => ({ n, k: bary(n.id, dir) ?? i }));
    keyed.sort((x, y) => x.k - y.k);
    cols[c] = keyed.map(x => x.n);
    reindex();
  }
}
// y coordinates
const geom = new Map(); // id → {x,y,w,h}
let maxBottom = 0;
cols.forEach((col, c) => {
  let y = TOP;
  for (const n of col) {
    const h = n.real ? (GROUPS[n.id] ? GROUPH : NODEH) : SLOTH;
    geom.set(n.id, { x: colX(c), y, w: COLW, h });
    y += h + (n.real ? GAP : 2);
  }
  maxBottom = Math.max(maxBottom, y);
});
const W = colX(STAGES.length - 1) + COLW + LEFT + 40;

// Ports: spread the connections on each side of a box so they do not all meet
// at one point, ordered by where the other end is.
const outs = new Map(), ins = new Map();
const nextOf = i => { const e = edges[i]; const ch = chains.get(i); return ch ? ch[0].id : e.b; };
const prevOf = i => { const e = edges[i]; const ch = chains.get(i); return ch ? ch[ch.length - 1].id : e.a; };
const cy = id => { const g = geom.get(id); return g.y + g.h / 2; };
edges.forEach((e, i) => {
  const sa = stageIx(e.a), sb = stageIx(e.b);
  if (sb > sa) {
    outs.set(e.a, [...(outs.get(e.a) ?? []), i]);
    ins.set(e.b, [...(ins.get(e.b) ?? []), i]);
  }
});
const portY = new Map(); // `${i}:a` / `${i}:b` → y
for (const [id, list] of outs) {
  list.sort((p, q) => cy(nextOf(p)) - cy(nextOf(q)));
  const g = geom.get(id);
  list.forEach((i, k) => portY.set(`${i}:a`, g.y + g.h * (k + 1) / (list.length + 1)));
}
for (const [id, list] of ins) {
  list.sort((p, q) => cy(prevOf(p)) - cy(prevOf(q)));
  const g = geom.get(id);
  list.forEach((i, k) => portY.set(`${i}:b`, g.y + g.h * (k + 1) / (list.length + 1)));
}

// Gutter lanes for same-column and loop-back connections.
const laneUse = new Map(); // gutter index (right of column c) → count
const lane = c => { const k = laneUse.get(c) ?? 0; laneUse.set(c, k + 1); return colX(c) + COLW + 14 + (k % 12) * 9; };
let bottomLane = 0;
const r1 = n => Math.round(n * 10) / 10;
const curve = (x0, y0, x1, y1) => {
  const dx = (x1 - x0) / 2;
  return `C${r1(x0 + dx)},${r1(y0)} ${r1(x1 - dx)},${r1(y1)} ${r1(x1)},${r1(y1)}`;
};
const pts = []; // sampled polyline per edge, for the geometry check
edges.forEach((e, i) => {
  const sa = stageIx(e.a), sb = stageIx(e.b);
  const A = geom.get(e.a), B = geom.get(e.b);
  let d, samples = [];
  if (sb > sa) {
    let x = A.x + A.w, y = portY.get(`${i}:a`);
    d = `M${r1(x)},${r1(y)}`;
    samples.push([x, y]);
    for (const s of chains.get(i) ?? []) {
      const g = geom.get(s.id), sy = g.y + g.h / 2;
      d += curve(x, y, g.x, sy) + `L${r1(g.x + g.w)},${r1(sy)}`;
      samples.push(...bez(x, y, g.x, sy), [g.x + g.w, sy]);
      x = g.x + g.w; y = sy;
    }
    const ty = portY.get(`${i}:b`);
    d += curve(x, y, B.x - 2, ty);
    samples.push(...bez(x, y, B.x - 2, ty));
  } else if (sb === sa) {
    // Out of the source's right side, along a lane in the right gutter, into
    // the target's right side.
    const lx = lane(sa), y0 = cy(e.a), y1 = cy(e.b);
    d = `M${r1(A.x + A.w)},${r1(y0)}H${r1(lx)}V${r1(y1)}H${r1(B.x + B.w + 2)}`;
    samples.push([A.x + A.w, y0], [lx, y0], [lx, y1], [B.x + B.w + 2, y1]);
  } else {
    // Loop-back: left gutter of the source, under every column, right gutter of
    // the target.
    const lx0 = colX(sa) - 18 - (bottomLane % 6) * 8;
    const by = maxBottom + 24 + bottomLane * 10;
    const lx1 = lane(sb);
    bottomLane++;
    const y0 = cy(e.a), y1 = cy(e.b);
    d = `M${r1(A.x)},${r1(y0)}H${r1(lx0)}V${r1(by)}H${r1(lx1)}V${r1(y1)}H${r1(B.x + B.w + 2)}`;
    samples.push([A.x, y0], [lx0, y0], [lx0, by], [lx1, by], [lx1, y1], [B.x + B.w + 2, y1]);
  }
  e.d = d;
  pts[i] = samples;
});
function bez(x0, y0, x1, y1) {
  const dx = (x1 - x0) / 2, out = [];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const u = 1 - t;
    out.push([u * u * u * x0 + 3 * u * u * t * (x0 + dx) + 3 * u * t * t * (x1 - dx) + t * t * t * x1,
              u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1]);
  }
  return out;
}
const H = maxBottom + 24 + bottomLane * 10 + 40;

/* --------------------------------------------------------- geometry checks */
{
  const boxes = [...geom.entries()].filter(([id]) => !id.startsWith('slot:'));
  // Boxes never overlap.
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [p, a] = boxes[i], [q, b] = boxes[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) fail(`boxes overlap: ${p}, ${q}`);
  }
  // No connection passes through a box it does not connect. Sample along each
  // segment of the drawn path.
  edges.forEach((e, i) => {
    const s = pts[i];
    for (let k = 0; k + 1 < s.length; k++) {
      const [x0, y0] = s[k], [x1, y1] = s[k + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
      for (let t = 0; t <= n; t++) {
        const x = x0 + (x1 - x0) * t / n, y = y0 + (y1 - y0) * t / n;
        for (const [id, b] of boxes) {
          if (id === e.a || id === e.b) continue;
          if (x > b.x + 1 && x < b.x + b.w - 1 && y > b.y + 1 && y < b.y + b.h - 1) {
            fail(`connection ${labelOf(e.a)} → ${labelOf(e.b)} passes through ${labelOf(id)}`);
            return;
          }
        }
      }
    }
  });
}

/* ------------------------------------------------------------------- html */
const h = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nodeData = {};
for (const id of stageOf.keys()) {
  const vendor = id.startsWith('vendor:') ? Object.fromEntries(vendors)[id.slice(7)] : null;
  const group = GROUPS[id];
  nodeData[id] = {
    label: labelOf(id),
    stage: stageOf.get(id),
    path: group || vendor ? null : id,
    del: group ? 'int' : vendor ? 'ven' : delivery(id),
    cls: clsOf.get(id) ?? null,
    cmp: compartmentOf.get(id) ?? (vendor ? vendor.serves : null),
    blurb: group?.blurb ?? (vendor ? `Owned by ${vendor.vendor}.` : null),
    files: group ? group.files.length : (id.endsWith('/') ? filesOf(id).length : null),
  };
}
const nodeHtml = [...stageOf.keys()].map(id => {
  const g = geom.get(id), d = nodeData[id];
  const kind = GROUPS[id] ? 'group' : id.startsWith('vendor:') ? 'vendor' : 'file';
  // A group box answers for every file inside it, or 64 tracked files could
  // not be found at all (Codex, #393).
  const search = [d.label, d.path ?? '', d.cmp ?? '', d.stage, ...(GROUPS[id]?.files ?? [])].join(' ').toLowerCase();
  const title = [d.path ?? d.label, DELIVERY[d.del].split(' —')[0], d.cmp].filter(Boolean).join(' · ');
  return `<button type="button" class="n n-${kind}" data-id="${h(id)}" data-stage="${d.stage}" `
    + `data-search="${h(search)}" title="${h(title)}" `
    + `style="left:${g.x}px;top:${r1(g.y)}px;width:${g.w}px;height:${g.h}px">`
    + `<span class="pill p-${d.del}">${d.del}</span><span class="nm">${h(d.label)}</span>`
    + (kind === 'group' ? `<span class="sub">${d.files} files</span>` : '')
    + `</button>`;
}).join('\n');
const stageHtml = STAGES.map((s, i) =>
  `<div class="st" data-stage="${s.id}" style="left:${colX(i) - 12}px;width:${COLW + 24}px;height:${H - 20}px">`
  + `<h2><span>${i + 1}</span>${h(s.label)}</h2><p>${h(s.blurb)}</p></div>`).join('\n');
const edgeHtml = edges.map((e, i) =>
  `<g class="e" data-i="${i}" data-a="${h(e.a)}" data-b="${h(e.b)}" data-kind="${e.kind}">`
  + `<title>${h(labelOf(e.a))} — ${h(e.words)} → ${h(labelOf(e.b))}</title>`
  + `<path class="hit" d="${e.d}"/><path class="ln" d="${e.d}" marker-end="url(#m-${e.kind})"/></g>`).join('\n');
const markers = Object.entries(KINDS).map(([k, v]) =>
  `<marker id="m-${k}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse">`
  + `<path d="M0,0 L7,3 L0,6 Z" fill="${v.color}"/></marker>`).join('');
const kindCss = Object.entries(KINDS).map(([k, v]) =>
  `  .e[data-kind=${k}]{--k:${v.color}}${v.dash ? `\n  .e[data-kind=${k}] .ln{stroke-dasharray:6 4}` : ''}`).join('\n');
const kindLegend = Object.entries(KINDS).map(([k, v]) =>
  `<li><button type="button" class="kt" data-kind="${k}" aria-pressed="true" style="--k:${v.color}">`
  + `<span class="ln${v.dash ? ' dash' : ''}"></span><b>${h(v.label)}</b></button><span>${h(v.hint)}</span></li>`).join('');
const delLegend = Object.entries(DELIVERY).map(([k, v]) =>
  `<li><span class="pill p-${k}">${k}</span><span>${h(v)}</span></li>`).join('');

const data = {
  stages: STAGES.map(s => ({ id: s.id, label: s.label })),
  kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { label: v.label, hint: v.hint, color: v.color }])),
  delivery: DELIVERY,
  nodes: nodeData,
  edges: edges.map(e => ({ a: e.a, b: e.b, kind: e.kind, words: e.words, ev: e.ev })),
  size: { w: W, h: H },
};

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>claude.directives — repo map</title>
<style>
  :root{
    --bg:#F5F5F3; --surface:#FFFFFF; --border:#E2E0DB; --border-2:#C8C5BE;
    --ink:#1A1A1A; --ink-2:#6B6860; --accent:#3D6B4F;
    --shadow-sm:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.06);
    --shadow-md:0 4px 6px rgba(0,0,0,.07),0 2px 4px rgba(0,0,0,.05);
    --radius:10px; --sans:Inter,'Segoe UI',system-ui,sans-serif;
    --p-inh:#1F6FEB; --p-ins:#7A4BAF; --p-cop:#B26B00; --p-ref:#6B6860; --p-int:#A03A34; --p-ven:#6D5BD0;
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);
    font-family:Inter,'Segoe UI',system-ui,sans-serif}
  body{display:flex;flex-direction:column}

  header{flex:0 0 auto;display:flex;gap:10px 14px;align-items:center;flex-wrap:wrap;
    padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--border)}
  header h1{font-size:16px;margin:0;font-weight:600;letter-spacing:-.2px}
  header h1 span{font-weight:400;color:var(--ink-2)}
  .hint{font-size:12px;color:var(--ink-2);flex:1 1 320px}
  .btns{display:flex;gap:6px;flex-wrap:wrap}
  header button{font:600 12.5px/1 var(--sans);color:var(--ink);background:var(--surface);
    border:1px solid var(--border);border-radius:8px;padding:7px 11px;cursor:pointer}
  header button:hover{background:var(--bg);border-color:var(--border-2)}
  header button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
  button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #search{padding:7px 11px;border:1px solid var(--border);border-radius:8px;
    font:13px/1 var(--sans);min-width:200px;max-width:100%;background:var(--surface);color:var(--ink)}
  #search:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

  #wrap{flex:1 1 auto;position:relative;min-height:0;overflow:hidden;cursor:grab;
    touch-action:none;user-select:none;-webkit-user-select:none;
    background-image:radial-gradient(var(--border) 1px,transparent 1px);background-size:22px 22px}
  #wrap.grabbing{cursor:grabbing}
  #viewport{position:absolute;top:0;left:0;transform-origin:0 0}

  .st{position:absolute;top:10px;border-radius:12px;background:rgba(255,255,255,.55);
    border:1px solid var(--border)}
  .st h2{margin:12px 12px 3px;font:700 11.5px/1.2 var(--sans);letter-spacing:.06em;white-space:nowrap;text-transform:uppercase;
    color:var(--ink);display:flex;gap:7px;align-items:center}
  .st h2 span{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;
    background:var(--accent);color:#fff;font-size:11px;letter-spacing:0}
  .st p{margin:0 12px;font:400 11px/1.35 var(--sans);color:var(--ink-2)}

  #edges{position:absolute;top:0;left:0;overflow:visible;pointer-events:none}
  .e .ln{fill:none;stroke:var(--k);stroke-width:1.3;opacity:.42;transition:opacity .12s,stroke-width .12s}
  .e .hit{fill:none;stroke:transparent;stroke-width:9;pointer-events:stroke;cursor:pointer}
  .e:hover .ln{opacity:1;stroke-width:2.2}
${kindCss}
  .e[data-kind=del] .ln{opacity:.22}
  .tracing .e .ln{opacity:.06}
  .tracing .e.on .ln{opacity:1;stroke-width:2.2}
  .e.hov .ln{opacity:1;stroke-width:2.2}
  .e.gone,.n.gone,.st.gone{display:none}

  .n{position:absolute;display:flex;align-items:center;gap:6px;padding:0 9px;text-align:left;
    background:var(--surface);border:1px solid var(--border);border-radius:8px;
    box-shadow:var(--shadow-sm);font:600 11.5px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:var(--ink);cursor:pointer;overflow:hidden;white-space:nowrap;z-index:2;
    transition:opacity .12s,box-shadow .12s,border-color .12s}
  .n:hover{border-color:var(--border-2);box-shadow:var(--shadow-md)}
  .n .nm{overflow:hidden;text-overflow:ellipsis}
  .n .sub{margin-left:auto;font:400 10px/1 Inter,system-ui,sans-serif;color:var(--ink-2)}
  .n-group{background:#FBF4F3;border-color:#E5C9C6;font-family:Inter,system-ui,sans-serif}
  .n-vendor{background:#F4F2FC;border-style:dashed;border-color:#C9C1EE}
  .tracing .n{opacity:.25}
  .tracing .n.on{opacity:1}
  .n.sel{border-color:var(--accent);box-shadow:0 0 0 3px rgba(61,107,79,.25)}
  .n.miss{opacity:.2}
  .n.hit{border-color:var(--accent);box-shadow:0 0 0 2px rgba(61,107,79,.3)}

  .pill{flex:none;font:700 8.5px/1 Inter,system-ui,sans-serif;letter-spacing:.05em;
    text-transform:uppercase;color:#fff;border-radius:4px;padding:3px 4.5px}
  .p-inh{background:var(--p-inh)} .p-ins{background:var(--p-ins)} .p-cop{background:var(--p-cop)}
  .p-ref{background:var(--p-ref)} .p-int{background:var(--p-int)} .p-ven{background:var(--p-ven)}

  #panel{position:absolute;right:14px;top:14px;bottom:14px;width:360px;z-index:60;
    background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
    box-shadow:var(--shadow-md);padding:14px 16px;overflow-y:auto;font-size:12.5px;
    cursor:default;user-select:text;-webkit-user-select:text}
  #panel[hidden]{display:none}
  #panel h3{margin:0 26px 4px 0;font:700 15px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word}
  #panel .meta{color:var(--ink-2);margin:0 0 10px;line-height:1.5}
  #panel h4{margin:14px 0 6px;font:700 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)}
  #panel ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
  #panel li{border-left:3px solid var(--k);padding:2px 0 2px 8px}
  #panel li button{all:unset;cursor:pointer;font:600 12px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink)}
  #panel li button:hover{text-decoration:underline}
  #panel li button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #panel .verb{color:var(--k);font-weight:700}
  #panel .ev{display:block;margin-top:3px;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:var(--ink-2);word-break:break-word}
  #panel .x{position:absolute;right:10px;top:10px;font:600 16px/1 var(--sans);border:0;background:none;
    cursor:pointer;color:var(--ink-2);padding:4px 6px;border-radius:6px}
  #panel .x:hover{background:var(--bg)}

  .legend{position:absolute;left:14px;bottom:14px;z-index:50;max-width:380px;
    max-height:calc(100% - 28px);overflow-y:auto;background:rgba(255,255,255,.97);
    border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);
    font-size:11.5px;color:var(--ink);cursor:default}
  .legend[open]{padding:0 12px 11px}
  .legend summary{cursor:pointer;font:600 12.5px/1 var(--sans);list-style:none;padding:9px 12px;
    display:flex;align-items:center;gap:7px}
  .legend[open] summary{margin:0 -12px;border-bottom:1px solid var(--border)}
  .legend summary::-webkit-details-marker{display:none}
  .legend h5{font:700 10px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);margin:11px 0 6px}
  .legend ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
  .legend li{display:flex;align-items:flex-start;gap:7px;line-height:1.3}
  .legend li > span:last-child{color:var(--ink-2)}
  .kt{all:unset;display:inline-flex;align-items:center;gap:6px;cursor:pointer;flex:none;min-width:112px}
  .kt b{color:var(--k)}
  .kt[aria-pressed=false]{opacity:.35}
  .kt:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .legend .ln{display:inline-block;width:20px;border-top:2.4px solid var(--k)}
  .legend .ln.dash{border-top-style:dashed}
  @media (max-width:800px){
    #panel{left:10px;right:10px;top:auto;width:auto;max-height:55%}
    .legend{max-width:calc(100% - 28px)}
  }
</style></head><body>
<header>
  <h1>claude.directives — repo map <span>(start → finish)</span></h1>
  <span class="hint">Each column is a stage; each arrow is a connection read out of the files.
    Click a file to trace everything that leads to it and everything it leads to · scroll = pan ·
    ctrl/⌘+scroll or pinch = zoom · esc = clear</span>
  <span class="btns">
    <button type="button" id="zin" title="Zoom in">+</button>
    <button type="button" id="zout" title="Zoom out">−</button>
    <button type="button" id="t_fit" title="Fit the whole map in view">fit</button>
    <button type="button" id="t_self" aria-pressed="false" title="Hide this repo's own CI and docs">exports only</button>
    <button type="button" id="t_vendor" aria-pressed="false" title="Hide the vendor column and its links">hide vendors</button>
  </span>
  <input id="search" type="search" aria-label="Find a file" placeholder="find a file… (e.g. qa-pipeline)">
</header>
<div id="wrap">
  <div id="viewport" style="width:${W}px;height:${H}px">
${stageHtml}
    <svg id="edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>${markers}</defs>
${edgeHtml}
    </svg>
${nodeHtml}
  </div>
  <aside id="panel" hidden aria-live="polite"></aside>
  <details class="legend">
    <summary>Legend · ${stageOf.size} boxes · ${edges.length} connections</summary>
    <h5>Arrow — what the connection does (click to hide a kind)</h5>
    <ul>${kindLegend}</ul>
    <h5>Pill — how the file reaches a project</h5>
    <ul>${delLegend}</ul>
    <h5>How the connections are known</h5>
    <ul><li><span>Every arrow is backed by a line in the files: open a box to see which line names which.
      Workflow triggers, composite actions, hook scripts and vendor sockets are derived, not drawn by hand.
      CI fails if any arrow stops being true or any file is left unconnected.</span></li></ul>
  </details>
</div>
<script type="application/json" id="mapdata">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script src="logical-map.js"></script>
</body></html>
`;

/* ------------------------------------------------------------------- emit */
if (failed) { console.error('build-logical-map: FAIL'); process.exit(1); }

const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
if (check) {
  if (current !== html) {
    console.error(`FAIL: ${OUT} is stale — run: node .github/scripts/build-logical-map.js`);
    process.exit(1);
  }
  console.log(`build-logical-map: OK — ${OUT} matches the tree`);
} else {
  writeFileSync(OUT, html);
  const nDerived = edges.filter(e => derived.some(([a, b]) => a === e.a && b === e.b)).length;
  console.log(`build-logical-map: wrote ${OUT} — ${stageOf.size} boxes in ${STAGES.length} stages, `
    + `${edges.length} connections (${nDerived} derived, ${edges.length - nDerived} declared, each with evidence)`
    + (current === html ? ' (unchanged)' : ''));
}
void statSync;
