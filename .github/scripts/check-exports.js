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
