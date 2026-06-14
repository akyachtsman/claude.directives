// Asserts the ten [data-theme] color-scheme blocks stay identical — token by
// token — between the authoritative directive (directives/design.md) and the
// rendered showcase (docs/design-system.html). The two files legitimately both
// carry the palettes (one is the source, one renders it), so this guards that
// duplication the way the repo already guards file-pairs and the secret-scan.
import { readFileSync } from 'fs';

const FILES = ['directives/design.md', 'docs/design-system.html'];

const EXPECTED_TOKENS = [
  '--color-bg', '--color-surface', '--color-border', '--color-border-hover',
  '--color-text-primary', '--color-text-secondary', '--color-accent',
  '--color-accent-hover', '--color-accent-light', '--color-accent-ring', '--color-danger',
];

function parseThemes(text) {
  const themes = {};
  const re = /\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tokens = {};
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':');
      if (i === -1) continue;
      const k = decl.slice(0, i).trim();
      if (!k.startsWith('--')) continue;
      tokens[k] = decl.slice(i + 1).trim().replace(/\s+/g, '');
    }
    themes[m[1]] = tokens;
  }
  return themes;
}

const parsed = {};
for (const f of FILES) parsed[f] = parseThemes(readFileSync(f, 'utf8'));

const [a, b] = FILES;
let failed = false;

const idsA = Object.keys(parsed[a]).sort();
const idsB = Object.keys(parsed[b]).sort();

if (idsA.length !== 10) { console.error(`Expected 10 schemes, found ${idsA.length} in ${a}`); failed = true; }
if (idsA.join(',') !== idsB.join(',')) {
  console.error(`SCHEME SET MISMATCH:\n  ${a}: ${idsA.join(', ')}\n  ${b}: ${idsB.join(', ')}`);
  failed = true;
}

for (const id of idsA) {
  for (const f of FILES) {
    const t = parsed[f][id] || {};
    const missing = EXPECTED_TOKENS.filter(k => !(k in t));
    const extra = Object.keys(t).filter(k => !EXPECTED_TOKENS.includes(k));
    if (missing.length) { console.error(`${f} [${id}] missing token(s): ${missing.join(', ')}`); failed = true; }
    if (extra.length) { console.error(`${f} [${id}] unexpected token(s): ${extra.join(', ')}`); failed = true; }
  }
  for (const k of EXPECTED_TOKENS) {
    if ((parsed[a][id] || {})[k] !== (parsed[b][id] || {})[k]) {
      console.error(`DRIFT [${id}] ${k}: ${a}="${(parsed[a][id]||{})[k]}" vs ${b}="${(parsed[b][id]||{})[k]}"`);
      failed = true;
    }
  }
}

// Stage-3 guard: the bootstrap template must offer exactly the schemes design.md defines.
const tmpl = readFileSync('templates/CLAUDE-template.md', 'utf8');
const choice = tmpl.match(/Design Theme:[^\n]*\[choose one:([^\]]+)\]/);
if (!choice) {
  console.error('templates/CLAUDE-template.md: missing `Design Theme: [choose one: ...]` field');
  failed = true;
} else {
  const offered = choice[1].split('|').map(s => s.trim()).filter(Boolean).sort();
  if (offered.join(',') !== idsA.join(',')) {
    console.error(`Design Theme options mismatch:\n  template offers: ${offered.join(', ')}\n  design.md defines: ${idsA.join(', ')}`);
    failed = true;
  } else {
    console.log(`OK: CLAUDE-template Design Theme offers all ${offered.length} schemes`);
  }
}

if (failed) { console.error('check-theme-parity: FAIL'); process.exit(1); }
console.log(`check-theme-parity: OK — 10 schemes identical across ${a} and ${b}`);
