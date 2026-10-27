// lib.mjs — what the two code guards share: which files are the site's
// browser code, the per-file skip list, and the one JavaScript parse.
//
// Ported from apfp.claude's native-dialog-guard.mjs, escape-sink-guard.mjs and
// lib/strip-js-comments.mjs (2026-10-27), made generic: the walk starts at the
// caller's site-dir instead of a hard-coded app directory, and a project names
// the files a guard leaves alone instead of editing the guard.
//
// ⛔ A REAL PARSER, AND IT REFUSES RATHER THAN GUESSES. apfp.claude tried a
// hand-written tokenizer first and review found a wrong guess at JavaScript's
// regex-versus-division `/` in three successive rounds, each one eating live
// code. A file that does not parse fails the guard with its name; the fix is to
// correct the file or skip it, never a fallback to text matching.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const HERE = new URL('.', import.meta.url);

let acorn = null;
export async function loadAcorn() {
  if (acorn) return acorn;
  try {
    acorn = await import(new URL('node_modules/acorn/dist/acorn.mjs', HERE).href);
  } catch (e) {
    throw new Error('web-guards needs acorn, which is not installed. Run:\n' +
      '  npm ci --ignore-scripts --prefix ' + relative(process.cwd(), new URL('.', HERE).pathname) + '\n' +
      'Underlying error: ' + (e && e.message || e));
  }
  return acorn;
}

/* One parse: as a classic script first, then as a module (import / export is
 * the one legitimate reason a body fails as a script). Anything else throws. */
export function parseJs(code, where) {
  // The program's comments ride on the result as `.comments`, for a scan that
  // reads source text and must not read the prose about it.
  const parse = extra => {
    const comments = [];
    const ast = acorn.parse(code, { ecmaVersion: 'latest', allowHashBang: true, onComment: comments, ...extra });
    ast.comments = comments;
    return ast;
  };
  try {
    return parse({ sourceType: 'script', allowReturnOutsideFunction: true });
  } catch (scriptErr) {
    try {
      return parse({ sourceType: 'module' });
    } catch (moduleErr) {
      throw new Error(where + ' does not parse as a script or a module, and the guard refuses to guess:\n' +
        '  script: ' + scriptErr.message + '\n  module: ' + moduleErr.message + '\n' +
        '  Fix the file, or name it in guard-skip if it is not plain JavaScript.');
    }
  }
}

// Directory names never walked into, wherever they sit: installed packages,
// git's own store, the shared checkout, and the conventional homes of code a
// project did not write. A minified file (*.min.js) is vendored by the same
// convention.
const NEVER = new Set(['node_modules', '.git', '.claude-directives', 'vendor', 'third-party', 'third_party']);
const EXT = /\.(m?js|html?)$/i;

/* The skip list: one entry per line (or space / comma separated), each a path
 * relative to the repository root, a file or a directory. `native-dialog:path`
 * or `escape-sink:path` applies to that guard only; a bare path to both.
 * ⚠️ An entry naming nothing on disk FAILS: an allowlist that outlives the file
 * it excused is the rot that later excuses a different file of the same name. */
export function parseSkip(text, guard) {
  const out = [];
  for (const raw of String(text || '').split(/[\s,]+/)) {
    if (!raw) continue;
    const m = /^(native-dialog|escape-sink):(.+)$/.exec(raw);
    if (m && m[1] !== guard) continue;
    const p = (m ? m[2] : raw).replace(/^\.\//, '').replace(/\/+$/, '');
    if (!p || p.startsWith('/') || p.split('/').includes('..')) {
      throw new Error(`guard-skip entry "${raw}" is not a path inside the repository.`);
    }
    if (!existsSync(p)) throw new Error(`guard-skip entry "${raw}" names ${p}, which does not exist. Remove the entry.`);
    out.push(p);
  }
  return out;
}

const skipped = (rel, skip) => skip.some(s => rel === s || rel.startsWith(s + '/'));

/* Every browser-code file under root (the caller's site-dir), as paths relative
 * to the repository root, sorted. `.github/` directly under root is left out
 * (CI code, not the site) — but a root that is itself inside .github/ is walked. */
export function siteFiles(root, skip) {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`site-dir ${root} is not a directory in this repository.`);
  }
  const out = [];
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = relative('.', abs).split(sep).join('/');
      if (skipped(rel, skip)) continue;
      if (e.isDirectory()) {
        if (NEVER.has(e.name) || (dir === root && e.name === '.github')) continue;
        walk(abs);
      } else if (e.isFile() && EXT.test(e.name) && !/\.min\.m?js$/i.test(e.name)) {
        out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}

/* The JavaScript in one file: the file itself, or each inline <script> body of
 * a page (an external `src=` script has none; a non-JavaScript type — JSON, an
 * import map, a template — is not code). `offset` maps a body position back
 * into the page, so a hit names the page's own line. */
export function scriptUnits(file, src) {
  if (!/\.html?$/i.test(file)) return [{ offset: 0, code: src }];
  const units = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(blankHtmlComments(src)))) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1]);
    if (type && !/^(text\/javascript|application\/javascript|module)$/i.test(type[1])) continue;
    if (!m[2].trim()) continue;
    units.push({ offset: m.index + m[0].indexOf(m[2], m[1].length), code: m[2] });
  }
  return units;
}

/* `<!-- … -->` blanked space-for-space (newlines kept), so commented-out markup
 * is neither scanned nor shifts a line number. */
export function blankHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, c => c.replace(/[^\n]/g, ' '));
}

export const lineOf = (src, pos) => src.slice(0, pos).split('\n').length;

/* The child nodes of an acorn node, in source order. */
export function kids(n) {
  const out = [];
  for (const k in n) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push(x); }
    else if (v && typeof v.type === 'string') out.push(v);
  }
  return out;
}

export const isFn = n => !!n && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);

/* Read every file once: { file, src, units: [{ offset, code, ast }] }. */
export async function readSite(root, skip) {
  await loadAcorn();
  return siteFiles(root, skip).map(file => {
    const src = readFileSync(file, 'utf8');
    return { file, src, units: scriptUnits(file, src).map(u => ({ ...u, ast: parseJs(u.code, file) })) };
  });
}

/* A GitHub annotation on a file and line, plus the same line in plain text. */
export function annotate(file, line, msg) {
  if (process.env.GITHUB_ACTIONS) console.log(`::error file=${file},line=${line}::${msg.replace(/\n/g, ' ')}`);
  return `${file}:${line}: ${msg}`;
}
