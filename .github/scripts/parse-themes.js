// Shared parser for the ten [data-theme="x"] { --token: val; … } color-scheme
// blocks. Returns { x: { '--token': 'val', … } }. Values are whitespace-
// normalized so the theme-parity check can compare them byte-for-byte; the hex
// colors the contrast check reads are unaffected by that normalization.
// Used by check-theme-parity.js and check-contrast.js (was duplicated in both).
export function parseThemes(text) {
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
