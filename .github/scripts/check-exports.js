// Enforces the export boundary declared in EXPORTS.json:
//  1. every manifest path exists in the working tree;
//  2. every raw-URL self-reference in the repo (raw.githubusercontent.com/
//     <this repo>/main/<path>) points INSIDE a manifest path — so an exported
//     file can never be moved or deleted without either updating the manifest
//     or breaking here, instead of 404ing silently in every downstream repo.
// ESM (matches the other check-*.js).
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const REPO = 'akyachtsman/claude.directives';
const manifest = JSON.parse(readFileSync('EXPORTS.json', 'utf8'));

let failed = false;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; };

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

// 1c) Swap-class paths exist.
for (const cls of ['permanent', 'orchestrators']) {
  for (const p of manifest.swap?.[cls] ?? []) {
    if (existsSync(p)) console.log(`OK:   [swap:${cls}] ${p}`);
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
  if (name.startsWith('_')) continue;
  for (const f of ['vendor', 'verdict', 'rationale']) {
    if (!c[f]) fail(`[considered:${name}] missing required field: ${f}`);
  }
  if (c.verdict && !VERDICTS.has(c.verdict)) {
    fail(`[considered:${name}] verdict must be one of ${[...VERDICTS].join('/')}: ${c.verdict}`);
  }
  // A borrowed/rejected entry names the path that keeps the job; it must exist,
  // so retiring that path forces the verdict to be revisited instead of rotting.
  if (c.stays && !existsSync(c.stays)) {
    fail(`[considered:${name}] stays path missing from tree: ${c.stays}`);
  }
  if (!failed) console.log(`OK:   [considered:${name}] ${c.verdict} (${c.vendor})`);
}

// 2) Every raw-URL self-reference resolves inside a manifest path.
function findTextFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build', 'out', 'vendor'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTextFiles(full));
    else if (/\.(md|yml|yaml|js|json|html|sh|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SELF_RE = new RegExp(
  `raw\\.githubusercontent\\.com/${REPO.replace(/[.]/g, '\\.')}/main/([A-Za-z0-9_./-]+)`, 'g');
const seen = new Set();
for (const file of findTextFiles('.')) {
  const content = readFileSync(file, 'utf8');
  for (const m of content.matchAll(SELF_RE)) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    if (exportPaths.some(p => p.endsWith('/') ? path.startsWith(p) : path === p)) {
      console.log(`OK:   raw self-reference is exported: ${path}`);
    } else {
      fail(`raw self-reference to a NON-exported path (add to EXPORTS.json or fix the link): ${path} (first seen in ${file})`);
    }
  }
}

if (failed) { console.error('check-exports: FAIL'); process.exit(1); }
console.log(`check-exports: OK — ${exportPaths.length} exported paths, ${seen.size} raw self-references all inside the boundary`);
