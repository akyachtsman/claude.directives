// Enforces the export boundary declared in EXPORTS.json:
//  1. every manifest path exists in the working tree;
//  2. every raw-URL self-reference in the repo (raw.githubusercontent.com/
//     <this repo>/main/<path>) points INSIDE a manifest path — so an exported
//     file can never be moved or deleted without either updating the manifest
//     or breaking here, instead of 404ing silently in every downstream repo;
//  3. every exported path has one well-formed record under `paths` (a known
//     domain, a compartment, a known class, an optional known swap class), and
//     every shipped file falls inside one (the reverse pass).
// ESM (matches the other check-*.js).
import { readFileSync, existsSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';

const REPO = 'akyachtsman/claude.directives';
const manifest = JSON.parse(readFileSync('EXPORTS.json', 'utf8'));

let failed = false;
let failCount = 0;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; failCount++; };

// 1) Every manifest path exists.
const exportPaths = [];
for (const [cat, { paths }] of Object.entries(manifest.categories)) {
  for (const p of paths) {
    exportPaths.push(p);
    if (existsSync(p)) console.log(`OK:   [${cat}] ${p}`);
    else fail(`[${cat}] manifest path missing from tree: ${p}`);
  }
}

// 1b) The per-path records under `paths` (audit B6). Each exported path has ONE
// record naming its domain, its compartment, its durability class and, when it
// has one, its swap class. These were three parallel enumerations of the same
// paths (`domains`, `classes`, `swap`) plus code proving they agreed; one record
// cannot disagree with itself, so what is checked now is that every record is
// well formed and names things that exist. An unknown field fails rather than
// being ignored: a misspelt `swap` would otherwise make a permanent path
// swappable with the check green.
const FIELDS = new Set(['domain', 'compartment', 'class', 'swap']);
const SWAP_CLASSES = new Set(['permanent', 'orchestrator']);
const real = o => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));
const domainNames = manifest.domains?.names;
if (!Array.isArray(domainNames)) {
  fail(`[domains] names must be a list of domain names, got: ${JSON.stringify(domainNames)}`);
}
const DOMAINS = new Set((Array.isArray(domainNames) ? domainNames : [])
  .filter(d => typeof d === 'string' && d && !d.startsWith('_')));
const CLASSES = new Set(real(manifest.classes).map(([k]) => k));
const records = real(manifest.paths);

// 1c) `swap.permanent_domains` names domains that are permanent in their entirety
// (the whole `meta` domain): every record in one is permanent by DERIVATION, so a
// path added to such a domain is permanent without a second edit (audit M-46).
// The expansion is the one definition of the permanent set. An unknown domain
// name fails — expanding it to nothing would silently make that domain's paths
// swappable — and so does a `swap: permanent` record the expansion already
// covers, which is the enumeration this replaced. Only an ABSENT key defaults to
// none; an explicit `null` is a non-list and fails rather than silently making
// every derived path swappable (Codex, #443).
let permanentDomains = manifest.swap && Object.hasOwn(manifest.swap, 'permanent_domains')
  ? manifest.swap.permanent_domains : [];
if (!Array.isArray(permanentDomains)) {
  fail(`[swap:permanent_domains] must be a list of domain names, got: ${JSON.stringify(permanentDomains)}`);
  permanentDomains = [];
}
const permanentSet = new Set();
for (const dom of permanentDomains) {
  if (typeof dom !== 'string' || !DOMAINS.has(dom)) fail(`[swap:permanent_domains] unknown domain: ${dom}`);
  else permanentSet.add(dom);
}
const derivedPermanent = new Map(records          // path -> domain it was derived from
  .filter(([, r]) => permanentSet.has(r?.domain)).map(([p, r]) => [p, r.domain]));
// A key in directory form (`dir/`) covers every path under it, so ANY overlap
// between a `swap: permanent` record and a derived one is the same duplication
// as an exact repeat, in either direction: a file marked beneath a derived
// directory, or a marked directory over a derived file, which would keep that
// file permanent after its domain stopped claiming it (Codex, #443). The `/` is
// the boundary: `dir.md` is not under `dir/`.
const covers = (a, b) => a === b || (a.endsWith('/') && b.startsWith(a));
const coveringDomain = (p) => {
  for (const [d, dom] of derivedPermanent) if (covers(d, p) || covers(p, d)) return dom;
  return null;
};

const compartments = new Set();
const domainsSeen = new Set();
const failsAtRecords = failCount;
for (const [p, r] of records) {
  const failsBefore = failCount;
  if (!r || typeof r !== 'object' || Array.isArray(r)) {
    fail(`[paths] ${p}: a record must be an object, got: ${JSON.stringify(r)}`);
    continue;
  }
  for (const k of Object.keys(r)) if (!FIELDS.has(k)) fail(`[paths] ${p}: unknown field: ${k}`);
  if (!DOMAINS.has(r.domain)) fail(`[paths] ${p}: unknown domain: ${r.domain}`);
  if (typeof r.compartment !== 'string' || !r.compartment || r.compartment.startsWith('_')) {
    fail(`[paths] ${p}: no compartment: ${JSON.stringify(r.compartment)}`);
  }
  if (!CLASSES.has(r.class)) fail(`[paths] ${p}: unknown class: ${r.class}`);
  if (r.swap !== undefined && !SWAP_CLASSES.has(r.swap)) {
    fail(`[paths] ${p}: swap must be one of ${[...SWAP_CLASSES].join('/')}: ${JSON.stringify(r.swap)}`);
  }
  if (r.swap === 'permanent') {
    const dom = coveringDomain(p);
    if (dom) fail(`[swap:permanent] ${p} is already permanent via permanent_domains (${dom}); drop its swap field`);
  }
  if (failCount !== failsBefore) continue;
  domainsSeen.add(r.domain);
  compartments.add(r.domain);
  compartments.add(`${r.domain}.${r.compartment}`);
  const swap = derivedPermanent.has(p) ? 'permanent' : r.swap;
  const tag = `[${r.domain}.${r.compartment} · ${r.class}${swap ? ` · swap:${swap}` : ''}]`;
  const via = derivedPermanent.has(p) ? ` (domain ${derivedPermanent.get(p)})` : '';
  if (existsSync(p)) console.log(`OK:   ${tag} ${p}${via}`);
  else fail(`${tag} path missing from tree: ${p}${via}`);
}
// A listed domain no record names is a stale name, and a permanent one would
// expand to nothing — the silent failure M-46's refusals exist to stop.
for (const d of DOMAINS) if (!records.some(([, r]) => r?.domain === d)) fail(`[domains] ${d} is listed but no record names it`);
if (records.length && failCount === failsAtRecords) {
  console.log(`OK:   [paths] ${records.length} records, each with a known domain (${domainsSeen.size}), `
    + `a compartment, and a known class (${CLASSES.size})`);
}

// 1d) Externals: every socket file exists; `serves` names a real domain.compartment.
for (const [name, ext] of Object.entries(manifest.externals ?? {})) {
  if (name.startsWith('_')) continue;
  if (!compartments.has(ext.serves)) fail(`[external:${name}] serves unknown compartment: ${ext.serves}`);
  else console.log(`OK:   [external:${name}] serves ${ext.serves} (${ext.vendor})`);
  for (const p of ext.sockets ?? []) {
    if (existsSync(p)) console.log(`OK:   [external:${name}] socket ${p}`);
    else fail(`[external:${name}] socket missing from tree: ${p}`);
  }
}

// 1e) Considered: natives evaluated and not adopted. Without a validated home the
// upkeep mandate's "record why" has nowhere to land and every audit re-derives it.
const VERDICTS = new Set(['borrowed', 'rejected', 'deferred']);
for (const [name, c] of Object.entries(manifest.considered ?? {})) {
  // Per-entry: `failed` is run-wide, so gating on it hid every later entry's OK line.
  const failsBefore = failCount;
  if (name.startsWith('_')) continue;
  for (const f of ['vendor', 'verdict', 'rationale']) {
    if (!c[f]) fail(`[considered:${name}] missing required field: ${f}`);
  }
  if (c.verdict && !VERDICTS.has(c.verdict)) {
    fail(`[considered:${name}] verdict must be one of ${[...VERDICTS].join('/')}: ${c.verdict}`);
  }
  // A borrowed/rejected entry names the path that keeps the job, and must NAME one:
  // validating `stays` only when present let the field be omitted, which defeats the
  // check entirely — deleting the retained implementation would not force the verdict
  // to be revisited. `deferred` means nothing was retained, so it carries no `stays`.
  const RETAINS = new Set(['borrowed', 'rejected']);
  if (RETAINS.has(c.verdict) && !c.stays) {
    fail(`[considered:${name}] verdict '${c.verdict}' must name the path that stays`);
  }
  if (c.stays && !existsSync(c.stays)) {
    fail(`[considered:${name}] stays path missing from tree: ${c.stays}`);
  }
  if (failCount === failsBefore) console.log(`OK:   [considered:${name}] ${c.verdict} (${c.vendor})`);
}

// 2) Every raw-URL self-reference resolves inside a manifest path. The files
// scanned are git's TRACKED ones, not a disk walk: a walk read gitignored agent
// worktrees under .claude/worktrees/ and reported their copies (audit
// 2026-10-11, I-3).
const findTextFiles = () => execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(f => f && /\.(md|yml|yaml|js|json|html|sh|css)$/.test(f) && existsSync(f)
    && !/(^|\/)(node_modules|dist|build|out|vendor)\//.test(f));

const SELF_RE = new RegExp(
  `raw\\.githubusercontent\\.com/${REPO.replace(/[.]/g, '\\.')}/main/([A-Za-z0-9_./-]+)`, 'g');
const seen = new Set();
for (const file of findTextFiles()) {
  const content = readFileSync(file, 'utf8');
  for (const m of content.matchAll(SELF_RE)) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    if (exportPaths.some(p => p.endsWith('/') ? path.startsWith(p) : path === p)) {
      // Inside the boundary is necessary but NOT sufficient: a directory entry
      // matches by prefix, so a URL naming a file that was never created (or was
      // deleted under an exported directory) passes the membership test and then
      // 404s in every downstream repo — the exact failure this file exists to stop.
      // Existence is not sufficient either: `existsSync` is true for a DIRECTORY,
      // and the raw endpoint serves only blobs, so a URL ending at a directory
      // (`…/main/templates/workflows`) 404s just the same. Require a regular file.
      const st = statSync(path, { throwIfNoEntry: false });
      if (st?.isFile()) console.log(`OK:   raw self-reference is exported: ${path}`);
      else if (st) fail(`raw self-reference resolves to a directory, which the raw endpoint cannot serve: ${path} (first seen in ${file})`);
      else fail(`raw self-reference is inside the boundary but the file does not exist: ${path} (first seen in ${file})`);
    } else {
      fail(`raw self-reference to a NON-exported path (add to EXPORTS.json or fix the link): ${path} (first seen in ${file})`);
    }
  }
}

// 5) REVERSE PASS: every shipped file is classified.
// Sections 1-4 all walk manifest -> tree, so a file added under an exported
// directory root inherits shipping (the whole dir is installed downstream) while
// having no record under `paths`, so no domain and no durability class. The
// record checks cannot see it: they only read paths the manifest already names.
// Walk tree -> manifest to close it.
const UNCLASSIFIED_OK = [
  // Deliberate exclusions. Add a path here only with the reason it ships
  // without belonging to a domain; an empty list is the healthy state.
];
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(f => !f.includes('node_modules/'));
const domainPathList = records.map(([p]) => p);
const inside = (f, list) => list.some(p => p.endsWith('/') ? f.startsWith(p) : f === p);
let unclassified = 0;
for (const f of trackedFiles) {
  if (!inside(f, exportPaths)) continue;            // not shipped downstream
  if (inside(f, domainPathList)) continue;          // classified
  if (inside(f, UNCLASSIFIED_OK)) continue;         // deliberate
  fail(`shipped file inside no record under paths (so in no domain and no durability class): ${f}`);
  unclassified++;
}
if (!unclassified) console.log(`OK:   reverse pass — every shipped file is classified`);

if (failed) { console.error('check-exports: FAIL'); process.exit(1); }
console.log(`check-exports: OK — ${exportPaths.length} exported paths, ${seen.size} raw self-references all inside the boundary`);
