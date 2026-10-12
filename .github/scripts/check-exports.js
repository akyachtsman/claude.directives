// Enforces the export boundary declared in EXPORTS.json:
//  1. every manifest path exists in the working tree;
//  2. every raw-URL self-reference in the repo (raw.githubusercontent.com/
//     <this repo>/main/<path>) points INSIDE a manifest path — so an exported
//     file can never be moved or deleted without either updating the manifest
//     or breaking here, instead of 404ing silently in every downstream repo.
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

// 1b) Every domain.compartment path exists — the logical (paradigm) view can't rot.
const compartments = new Set();
for (const [dom, comps] of Object.entries(manifest.domains ?? {})) {
  if (dom.startsWith('_')) continue;
  compartments.add(dom);
  for (const [comp, paths] of Object.entries(comps)) {
    if (comp.startsWith('_')) continue;
    compartments.add(`${dom}.${comp}`);
    for (const p of paths) {
      if (existsSync(p)) console.log(`OK:   [${dom}.${comp}] ${p}`);
      else fail(`[${dom}.${comp}] path missing from tree: ${p}`);
    }
  }
}

// 1c) Swap-class paths exist. `swap.permanent_domains` names domains that are
// permanent in their entirety (the whole `meta` domain); their paths are DERIVED
// from `domains` here rather than re-enumerated in `swap.permanent`, so a path
// added to such a domain is permanent without a second edit (audit M-46). The
// expansion is the one definition of the permanent set: every reader goes
// through it. An unknown domain name fails — expanding it to nothing would
// silently make that domain's paths swappable — and so does a `swap.permanent`
// entry the expansion already covers, which is the enumeration this replaced.
// Only an ABSENT key defaults to none; an explicit `null` is a non-list and fails
// below rather than silently making every derived path swappable (Codex, #443).
let permanentDomains = manifest.swap && Object.hasOwn(manifest.swap, 'permanent_domains')
  ? manifest.swap.permanent_domains : [];
if (!Array.isArray(permanentDomains)) {
  fail(`[swap:permanent_domains] must be a list of domain names, got: ${JSON.stringify(permanentDomains)}`);
  permanentDomains = [];
}
const derivedPermanent = new Map();          // path -> domain it was derived from
for (const dom of permanentDomains) {
  const comps = manifest.domains?.[dom];
  if (typeof dom !== 'string' || dom.startsWith('_') || !comps || typeof comps !== 'object') {
    fail(`[swap:permanent_domains] unknown domain: ${dom}`);
    continue;
  }
  for (const [comp, paths] of Object.entries(comps)) {
    if (comp.startsWith('_')) continue;
    for (const p of paths) derivedPermanent.set(p, dom);
  }
}
// An entry in directory form (`dir/`) covers every path under it, so ANY overlap
// between an enumerated entry and a derived one is the same duplication as an
// exact repeat, in either direction: a file re-listed beneath a derived
// directory, or an enumerated directory over a derived file, which would keep
// that file permanent after its domain stopped claiming it (Codex, #443). The
// `/` is the boundary: `dir.md` is not under `dir/`.
const covers = (a, b) => a === b || (a.endsWith('/') && b.startsWith(a));
const coveringDomain = (p) => {
  for (const [d, dom] of derivedPermanent) if (covers(d, p) || covers(p, d)) return dom;
  return null;
};
for (const p of manifest.swap?.permanent ?? []) {
  const dom = coveringDomain(p);
  if (dom) {
    fail(`[swap:permanent] ${p} is already permanent via permanent_domains (${dom}); drop the enumerated entry`);
  }
}
const swapClasses = {
  permanent: [...(manifest.swap?.permanent ?? []), ...derivedPermanent.keys()],
  orchestrators: manifest.swap?.orchestrators ?? [],
};
for (const [cls, paths] of Object.entries(swapClasses)) {
  for (const p of paths) {
    const via = derivedPermanent.has(p) && cls === 'permanent' ? ` (domain ${derivedPermanent.get(p)})` : '';
    if (existsSync(p)) console.log(`OK:   [swap:${cls}] ${p}${via}`);
    else fail(`[swap:${cls}] path missing from tree: ${p}`);
  }
}

// 1c-ii) Durability classes must PARTITION the domain set exactly — every exported
// path classified once, no strays, no duplicates. Without this the logical map's
// rows would be an unverifiable opinion frozen into HTML.
const domainPaths = new Set();
for (const [dom, comps] of Object.entries(manifest.domains ?? {})) {
  if (dom.startsWith('_')) continue;
  for (const [comp, paths] of Object.entries(comps)) {
    if (comp.startsWith('_')) continue;
    for (const p of paths) domainPaths.add(p);
  }
}
const classified = new Map();
for (const [cls, { paths = [] }] of Object.entries(manifest.classes ?? {})
  .filter(([k]) => !k.startsWith('_'))) {
  for (const p of paths) {
    if (classified.has(p)) fail(`[class] path in two classes (${classified.get(p)}, ${cls}): ${p}`);
    else classified.set(p, cls);
    if (!domainPaths.has(p)) fail(`[class:${cls}] path is not in any domain.compartment: ${p}`);
  }
}
for (const p of domainPaths) {
  if (!classified.has(p)) fail(`[class] exported path has no durability class: ${p}`);
}
if (classified.size && ![...classified.keys()].some(p => !domainPaths.has(p))) {
  console.log(`OK:   [classes] ${classified.size} paths partitioned across `
    + `${Object.keys(manifest.classes).filter(k => !k.startsWith('_')).length} classes`);
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
// appearing in no domains compartment and therefore no durability class. The
// partition check cannot see it: it only compares paths the manifest already
// names. Walk tree -> manifest to close it.
const UNCLASSIFIED_OK = [
  // Deliberate exclusions. Add a path here only with the reason it ships
  // without belonging to a domain; an empty list is the healthy state.
];
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(f => !f.includes('node_modules/'));
const domainPathList = [];
for (const [dom, comps] of Object.entries(manifest.domains ?? {})) {
  if (dom.startsWith('_')) continue;
  for (const [comp, paths] of Object.entries(comps)) {
    if (comp.startsWith('_')) continue;
    for (const p of paths ?? []) domainPathList.push(p);
  }
}
const inside = (f, list) => list.some(p => p.endsWith('/') ? f.startsWith(p) : f === p);
let unclassified = 0;
for (const f of trackedFiles) {
  if (!inside(f, exportPaths)) continue;            // not shipped downstream
  if (inside(f, domainPathList)) continue;          // classified
  if (inside(f, UNCLASSIFIED_OK)) continue;         // deliberate
  fail(`shipped file in no domains compartment (so in no durability class): ${f}`);
  unclassified++;
}
if (!unclassified) console.log(`OK:   reverse pass — every shipped file is classified`);

if (failed) { console.error('check-exports: FAIL'); process.exit(1); }
console.log(`check-exports: OK — ${exportPaths.length} exported paths, ${seen.size} raw self-references all inside the boundary`);
