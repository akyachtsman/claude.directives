// lib.mjs — what the two code guards share: which files are the site's
// browser code, the per-file skip list, and the one JavaScript parse.
//
// Ported from apfp.claude's native-dialog-guard.mjs, escape-sink-guard.mjs and
// lib/strip-js-comments.mjs (2026-10-27), made generic: the walk starts at the
// caller's site-dir instead of a hard-coded app directory, and a project names
// the files a guard leaves alone instead of editing the guard.
//
// ⛔ REAL PARSERS, AND THEY REFUSE RATHER THAN GUESS. apfp.claude tried a
// hand-written tokenizer first and review found a wrong guess at JavaScript's
// regex-versus-division `/` in three successive rounds, each one eating live
// code. A file that does not parse fails the guard with its name; the fix is to
// correct the file or skip it, never a fallback to text matching.
// ⛔ PAGES ARE READ BY parse5, a spec-complete HTML parser, for the same reason
// and on the same pin as check-paths.js (owner ruling 2026-10-09, #415). A
// hand-written page reader stood here first, and #493's review found a new
// corner in three successive rounds: a comment marker inside a script, a
// `<!--` inside an attribute, `data-src` read as `src`. Which <script> runs,
// where its body starts and what a handler attribute says are the parser's
// answers, as a browser gives them.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const HERE = new URL('.', import.meta.url);

let acorn = null, parse5 = null;
export async function loadParsers() {
  if (acorn && parse5) return;
  try {
    acorn = await import(new URL('node_modules/acorn/dist/acorn.mjs', HERE).href);
    parse5 = await import(new URL('node_modules/parse5/dist/index.js', HERE).href);
  } catch (e) {
    throw new Error('web-guards needs acorn and parse5, which are not installed. Run:\n' +
      '  npm ci --ignore-scripts --prefix ' + relative(process.cwd(), new URL('.', HERE).pathname) + '\n' +
      'Underlying error: ' + (e && e.message || e));
  }
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

// A <script> whose type is one of these (or absent, or empty) is JavaScript;
// anything else (JSON, an import map, a template) is data, not code. The
// spec's JavaScript MIME types, plus `module`.
const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript',
  'application/ecmascript', 'application/x-javascript', 'application/x-ecmascript', 'text/x-javascript',
  'text/x-ecmascript', 'text/jscript', 'text/livescript', 'text/javascript1.0', 'text/javascript1.1',
  'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5']);

/* A page as parse5 reads it: every inline <script> that runs, as
 * { offset, code } (offset: where its body starts in the page, so a hit names
 * the page's own line), and every `on…` handler attribute on any element, as
 * { name, value, line }, its value already decoded by the parser. Template
 * contents are walked too: a template's markup runs once it is cloned in. */
export function htmlParts(src) {
  const doc = parse5.parse(src, { sourceCodeLocationInfo: true });
  const scripts = [], handlers = [];
  const walk = node => {
    if (node.attrs) {
      const attrs = new Map(node.attrs.map(a => [a.name.toLowerCase(), a.value]));
      for (const a of node.attrs) {
        if (/^on./i.test(a.name)) {
          const at = node.sourceCodeLocation && node.sourceCodeLocation.attrs && node.sourceCodeLocation.attrs[a.name];
          handlers.push({ name: a.name, value: a.value, line: at ? at.startLine : node.sourceCodeLocation.startLine });
        }
      }
      if (node.tagName === 'script' && !attrs.has('src')
          && JS_TYPES.has(String(attrs.get('type') || '').trim().toLowerCase())) {
        const loc = node.sourceCodeLocation;
        const text = (node.childNodes || []).map(c => c.value || '').join('');
        if (text.trim() && loc && loc.startTag) {
          const offset = loc.startTag.endOffset;
          // The raw source between the tags, so offsets are the page's own.
          const code = loc.endTag ? src.slice(offset, loc.endTag.startOffset) : src.slice(offset);
          scripts.push({ offset, code });
        }
      }
    }
    for (const c of node.childNodes || []) walk(c);
    if (node.content) walk(node.content);
  };
  walk(doc);
  return { scripts, handlers };
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

/* Read every file once: { file, src, units: [{ offset, code, ast }], handlers }.
 * A .js / .mjs file is one unit; a page has one per inline script that runs. */
export async function readSite(root, skip) {
  await loadParsers();
  return siteFiles(root, skip).map(file => {
    const src = readFileSync(file, 'utf8');
    const parts = /\.html?$/i.test(file) ? htmlParts(src) : { scripts: [{ offset: 0, code: src }], handlers: [] };
    return { file, src, handlers: parts.handlers, units: parts.scripts.map(u => ({ ...u, ast: parseJs(u.code, file) })) };
  });
}

/* A GitHub annotation on a file and line, plus the same line in plain text. */
export function annotate(file, line, msg) {
  if (process.env.GITHUB_ACTIONS) console.log(`::error file=${file},line=${line}::${msg.replace(/\n/g, ' ')}`);
  return `${file}:${line}: ${msg}`;
}
