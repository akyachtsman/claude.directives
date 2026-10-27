// native-dialog-guard.mjs — the site never calls the browser's own confirm(),
// alert() or prompt() (design.md -> 9. Confirmations). They look different on
// every browser, cannot be styled, and on a phone take the person out of the
// page. Every question goes through the house dialog: House.confirm,
// House.ask or House.notice (templates/styles/components.js).
//
//   SITE_DIR=. GUARD_SKIP='' node native-dialog-guard.mjs
//
// Ported from apfp.claude's .github/scripts/native-dialog-guard.mjs
// (2026-10-27). What carried over unchanged, and why:
//
// ⚠️ A CALL IS FLAGGED ONLY WHERE THE NAME RESOLVES TO THE BROWSER'S FUNCTION,
// and resolving is a PARSE plus a scope analysis (eslint-scope, ESLint's own),
// never a text search: `window.confirm(` (or
// `globalThis.` / `self.`, or `window['confirm'](`), or a bare `confirm(` /
// `prompt(` / `alert(` that no enclosing scope binds. A module that takes the
// app's own dialog as a parameter or const named `confirm` is calling the
// app's dialog, and is clean. A binding in a sibling scope does not clear a
// call; only one in a scope that encloses it. A top-level declaration clears
// calls in its OWN file only: which scripts share a page's globals is not this
// guard's to work out.
// ⚠️ An `on…="…"` handler attribute runs in global scope, where no binding of
// these names exists, so any call in one is the browser's. Attributes are read
// in a page's markup (as parse5 reads them, lib.mjs) AND in HTML a script
// builds as a string.
//
// What changed for the fleet: the walk starts at the caller's site-dir (lib.mjs),
// a site with no browser code yet passes with a notice instead of tripping
// apfp's ten-file floor, and GUARD_SKIP names a file this guard leaves alone.

import { pathToFileURL } from 'node:url';
import { readSite, parseSkip, parseJs, analyzeScopes, kids, lineOf, annotate } from './lib.mjs';

const NAMES = new Set(['confirm', 'prompt', 'alert']);
const GLOBAL_OBJ = new Set(['window', 'globalThis', 'self']);

/* Every dialog call in one parsed program, by report(at, what). Which name a
 * call means is eslint-scope's answer (lib.mjs), not this guard's: a name is
 * the browser's when its reference resolves to no declaration in the file. A
 * hand-written scope walk stood here first, and #493's review found a corner
 * it missed in round after round (a default parameter, a class static block,
 * a switch discriminant). */
export function scan(ast, report) {
  const refs = new Map();
  for (const s of analyzeScopes(ast).scopes) for (const r of s.references) refs.set(r.identifier, r);
  const browsers = id => { const r = refs.get(id); return !r || !r.resolved || r.resolved.defs.length === 0; };
  const visit = n => {
    if (n.type === 'CallExpression') {
      const c = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee;
      if (c.type === 'Identifier' && NAMES.has(c.name) && browsers(c)) report(n.start, c.name + '(');
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && GLOBAL_OBJ.has(c.object.name)
          && browsers(c.object)) {
        const prop = c.computed ? (c.property.type === 'Literal' ? c.property.value : null) : c.property.name;
        if (NAMES.has(prop)) report(n.start, c.object.name + '.' + prop + '(');
      }
    }
    for (const k of kids(n)) visit(k);
  };
  visit(ast);
}

function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/* A script's code with its JavaScript comments blanked space-for-space,
 * newlines kept, so a handler attribute that a comment only mentions is not
 * read, and offsets still hold. */
function blankJsComments(u) {
  const out = u.code.split('');
  for (const c of u.ast.comments || []) {
    for (let i = c.start; i < c.end; i++) if (out[i] !== '\n') out[i] = ' ';
  }
  return out.join('');
}

/* The dialog call a handler attribute's body makes, or null. The body is
 * PARSED, like any script, and scanned in global scope, so `console.log('alert(')`
 * is a string, not a call (Codex, #493). A body that does not parse is one a
 * script assembles from pieces (`'onclick="del(' + id + ')"'`); its text is
 * all there is to read, so the plain search stands in for it, and errs toward
 * flagging. */
function handlerCall(raw, decoded = false) {
  const body = decoded ? raw : decode(raw);
  let ast = null;
  try { ast = parseJs(body, 'a handler attribute'); } catch { ast = null; }
  if (ast) {
    let found = null;
    scan(ast, (at, what) => { found = found || what; });
    return found;
  }
  const c = /(^|[^.\w$])((?:window|globalThis|self)\.)?(confirm|prompt|alert)\s*\(/.exec(body);
  return c ? `${c[2] || ''}${c[3]}(` : null;
}

export async function run({ siteDir, skipText }) {
  const site = await readSite(siteDir, parseSkip(skipText, 'native-dialog'));
  const hits = [];
  let scripts = 0;
  for (const f of site) {
    for (const u of f.units) {
      scripts++;
      scan(u.ast, (at, what) => hits.push(annotate(f.file, lineOf(f.src, u.offset + at),
        `${what} is the browser's own dialog; use House.confirm / House.ask / House.notice (design.md -> 9. Confirmations).`)));
    }
    const flag = (line, what) => hits.push(annotate(f.file, line,
      `a handler attribute calls ${what}, the browser's own dialog; use House.confirm / House.ask / House.notice.`));
    // Handler attributes in a page's markup, as parse5 read them (value decoded).
    for (const h of f.handlers) {
      const what = handlerCall(h.value, true);
      if (what) flag(h.line, what);
    }
    // Handler attributes in HTML a script builds as a string.
    for (const u of f.units) {
      const ah = /\son[a-z]+\s*=\s*(\\?["'])([\s\S]*?)\1/gi;
      const text = blankJsComments(u);
      let m;
      while ((m = ah.exec(text))) {
        const what = handlerCall(m[1].length > 1 ? m[2].replace(/\\(["'])/g, '$1') : m[2]);
        if (what) flag(lineOf(f.src, u.offset + m.index), what);
      }
    }
  }
  return { files: site.length, scripts, hits };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const siteDir = process.env.SITE_DIR || '.';
    const { files, scripts, hits } = await run({ siteDir, skipText: process.env.GUARD_SKIP });
    if (!files) {
      console.log(`native-dialog-guard: no .js or .html file under ${siteDir} yet; nothing to check.`);
    } else if (hits.length) {
      console.error(`native-dialog-guard: the browser's own dialog is called (${hits.length}):`);
      hits.forEach(h => console.error('  ' + h));
      console.error('A file that must keep one (a vendored library): name it in guard-skip as native-dialog:<path>.');
      process.exit(1);
    } else {
      console.log(`native-dialog-guard: clean (${files} files, ${scripts} scripts parsed under ${siteDir}, no native confirm/alert/prompt).`);
    }
  } catch (e) {
    console.error('native-dialog-guard: ' + e.message);
    process.exit(1);
  }
}
