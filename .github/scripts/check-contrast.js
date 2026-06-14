// WCAG AA contrast audit for every color scheme. Computes the real contrast ratio
// for the meaningful foreground/background pairs each scheme produces, parsed from
// directives/design.md (the authoritative source) plus the neutral fallback.
// Normal text (incl. 15px/500 buttons, 13px labels) needs >= 4.5:1; large/icon
// accent-on-surface uses the 3.0 large-text bar.
import { readFileSync } from 'fs';

function parseThemes(text) {
  const themes = {};
  const re = /\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':'); if (i < 0) continue;
      const k = d.slice(0, i).trim(); if (!k.startsWith('--')) continue;
      t[k] = d.slice(i + 1).trim();
    }
    themes[m[1]] = t;
  }
  return themes;
}

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function lum(hex) {
  const h = hex.replace('#', '');
  return 0.2126 * lin(parseInt(h.slice(0, 2), 16)) + 0.7152 * lin(parseInt(h.slice(2, 4), 16)) + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
}
const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

const md = readFileSync('directives/design.md', 'utf8');
const schemes = parseThemes(md);
// Neutral "unselected" fallback — parsed from its own code block in design.md
// (not hardcoded here, so it can't drift from the source).
const fbBlock = ((md.split('Neutral fallback')[1] || '').match(/```([\s\S]*?)```/) || [, ''])[1];
const fb = {};
for (const mm of fbBlock.matchAll(/(--color-[a-z-]+)\s*:\s*([^;]+);/g)) fb[mm[1]] = mm[2].trim();
schemes['(fallback)'] = fb;

const AA = 4.5, AA_LARGE = 3.0;
let failed = false;
const out = [];

for (const [id, t] of Object.entries(schemes)) {
  const pairs = {
    'white / accent (button)':        [ratio('#FFFFFF', t['--color-accent']), AA],
    'text-primary / bg':              [ratio(t['--color-text-primary'], t['--color-bg']), AA],
    'text-primary / surface':         [ratio(t['--color-text-primary'], t['--color-surface']), AA],
    'text-secondary / bg':            [ratio(t['--color-text-secondary'], t['--color-bg']), AA],
    'text-secondary / surface':       [ratio(t['--color-text-secondary'], t['--color-surface']), AA],
    'accent / accent-light (2ndary)': [ratio(t['--color-accent'], t['--color-accent-light']), AA],
    'accent / surface (large)':       [ratio(t['--color-accent'], t['--color-surface']), AA_LARGE],
  };
  for (const [name, [r, thr]] of Object.entries(pairs)) {
    const pass = r >= thr;
    if (!pass) failed = true;
    out.push(`${pass ? '  ok' : 'FAIL'}  ${id.padEnd(12)} ${name.padEnd(33)} ${r.toFixed(2)} (need ${thr.toFixed(1)})`);
  }
}

console.log(out.join('\n'));
console.log(failed ? '\ncheck-contrast: FAIL — some pairs below WCAG AA' : '\ncheck-contrast: OK — all pairs meet WCAG AA');
if (failed) process.exit(1);
