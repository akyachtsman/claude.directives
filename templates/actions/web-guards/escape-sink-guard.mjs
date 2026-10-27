// escape-sink-guard.mjs — NEVER HTML-escape into a text sink.
//
// textContent, innerText, .value, .placeholder, .title, .alt, setAttribute,
// createTextNode, the browser dialogs and the house dialogs all take LITERAL
// text: the string is shown exactly as given. Passing them PRE-ESCAPED output
// double-encodes it, so the person reads the entity codes. apfp.claude found
// seven of these, all on error paths, so the damage showed exactly when
// something had already gone wrong:
//
//     duplicate key value violates unique constraint &quot;roles_key_key&quot;
//
// The rule is "the sink decides" (global.md -> textContent for DOM text):
// escape for innerHTML, never for a text sink. This guard does not look at
// innerHTML at all.
//
//   SITE_DIR=. GUARD_SKIP='' TEXT_SINKS='' node escape-sink-guard.mjs
//
// Ported from apfp.claude's .github/scripts/escape-sink-guard.mjs (2026-10-27).
// What carried over, and why:
//
// 1. ESCAPER NAMES ARE DERIVED, NOT LISTED. apfp's first cut hard-coded four
//    names and missed two real helpers. A function whose source maps & and <
//    to entities is an escaper, whatever it is called, and so is a short
//    function that RETURNS an escaper's result (apfp's `bcEsc`, a wrapper with
//    no entity literal in it). Wrapping is the only transitive step: a function
//    that merely calls esc() somewhere is not an escaper, or every legitimate
//    `textContent = render(x)` would trip.
// 2. THE BROWSER DIALOGS ARE TEXT SINKS TOO. apfp missed one, a name escaped
//    into window.confirm(), so "Ben & Jerry's" read as "Ben &amp; Jerry&#39;s".
//
// What changed for the fleet: it reads the PARSE instead of a regex over
// comment-stripped text, so a sink's arguments are exactly its arguments (a
// House.confirm(...).then(...) callback that escapes for innerHTML is not
// inside the dialog's text), and a function's body is exactly its body, with
// no clipping at the next declaration. A site with no escaper passes with a
// notice: with no escaper there is nothing to double-encode. The house dialogs
// and messages are sinks by default; TEXT_SINKS adds a project's own
// (apfp.claude's askConfirm, say) by name.

import { pathToFileURL } from 'node:url';
import { readSite, parseSkip, kids, isFn, lineOf, annotate } from './lib.mjs';

// `el.<prop> = …` where the property takes plain text.
const TEXT_PROPS = new Set(['textContent', 'innerText', 'value', 'placeholder', 'title', 'alt', 'ariaLabel']);
// `el.setAttribute('<name>', …)` where the attribute is read out as text.
const TEXT_ATTRS = new Set(['title', 'placeholder', 'value', 'aria-label', 'alt']);
// Calls whose every argument is shown as plain text, by callee name.
const SINK_CALLS = new Set(['createTextNode', 'confirm', 'alert', 'prompt']);
// The house script's text-taking calls (templates/styles/components.js), as House.<name>.
const HOUSE_SINKS = new Set(['confirm', 'ask', 'notice', 'toast', 'message']);

const calleeName = c => {
  if (c.type === 'ChainExpression') c = c.expression;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') return c.property.name;
  return null;
};
const isHouse = c => c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'House'
  && !c.computed && HOUSE_SINKS.has(c.property.name);

/* Every call inside node whose callee is named in `names`, not descending into a
 * function with a statement body: a callback that does its own work is not the
 * value being shown. An expression-bodied arrow (`xs.map(x => esc(x))`) is part
 * of the value, so it is read. */
function escaperCalls(node, names, out = []) {
  if (!node) return out;
  if (isFn(node) && node.body.type === 'BlockStatement') return out;
  if (node.type === 'CallExpression' && names.has(calleeName(node.callee))) out.push(node);
  for (const k of kids(node)) escaperCalls(k, names, out);
  return out;
}

// ── 1. derive the escapers ──────────────────────────────────────────────────
/* Every named function in the site: { name, node }. A declaration, a variable or
 * property holding a function, an object or class method, an assignment of a
 * function to a name or a member. */
function namedFunctions(ast, out) {
  const visit = n => {
    if (n.type === 'FunctionDeclaration' && n.id) out.push({ name: n.id.name, node: n });
    else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && isFn(n.init)) out.push({ name: n.id.name, node: n.init });
    else if ((n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition')
             && !n.computed && isFn(n.value)) {
      const k = n.key.type === 'Identifier' ? n.key.name : n.key.type === 'Literal' ? String(n.key.value) : null;
      if (k) out.push({ name: k, node: n.value });
    } else if (n.type === 'AssignmentExpression' && isFn(n.right)) {
      const k = calleeName(n.left);
      if (k) out.push({ name: k, node: n.right });
    }
    for (const k of kids(n)) visit(k);
  };
  visit(ast);
  return out;
}

/* The text a function writes: its string literals and template text, without
 * the keys of an object literal (those are looked up, not written). */
function producedText(node) {
  let out = '';
  const visit = (n, parent) => {
    if (n.type === 'Literal' && typeof n.value === 'string' && !(parent && parent.type === 'Property' && parent.key === n)) out += n.value + '\n';
    if (n.type === 'TemplateElement') out += (n.value.cooked || '') + '\n';
    for (const k of kids(n)) visit(k, n);
  };
  visit(node, null);
  return out;
}

/* A top-level `const MAP = { '&': '&amp;', '<': '&lt;', … }` that an escaper
 * reads from (`s.replace(/[&<]/g, c => MAP[c])`): the entities are written by
 * the table, not by the function, so the table's text counts for any function
 * in the same script that names it. name -> produced text. */
function entityTables(ast) {
  const out = new Map();
  for (const s of ast.body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (!d || d.type !== 'VariableDeclaration') continue;
    for (const x of d.declarations) {
      if (x.id.type === 'Identifier' && x.init && !isFn(x.init)) {
        const text = producedText(x.init);
        if (text.includes('&amp;') || text.includes('&lt;')) out.set(x.id.name, text);
      }
    }
  }
  return out;
}
function usesTable(fn, tables) {
  if (!tables.size) return '';
  let out = '';
  const visit = n => {
    if (n.type === 'Identifier' && tables.has(n.name)) out += tables.get(n.name);
    for (const k of kids(n)) visit(k);
  };
  visit(fn.body);
  return out;
}

export function deriveEscapers(site) {
  const fns = [];
  for (const f of site) for (const u of f.units) {
    const tables = entityTables(u.ast);
    for (const d of namedFunctions(u.ast, [])) {
      fns.push({ ...d, text: u.code.slice(d.node.start, d.node.end), tables: usesTable(d.node, tables) });
    }
  }
  // DIRECT: the function PRODUCES `&amp;` and `&lt;`, in strings it writes. A
  // regex literal or an object key only READS them: an unescaper
  // (`.replace(/&amp;/g, '&')`), or a scanner that looks for them, is not an
  // escaper, and marking it one made `decode` a sink suspect here.
  const escapers = new Set(fns.filter(d => {
    const out = producedText(d.node.body) + d.tables;
    return out.includes('&amp;') && out.includes('&lt;');
  }).map(d => d.name));
  // TRANSITIVE: a short function that returns an escaper's result. A fixpoint;
  // each pass can only add, so it ends.
  for (;;) {
    const before = escapers.size;
    for (const d of fns) {
      if (escapers.has(d.name) || d.text.length > 220) continue;
      const body = d.node.body;
      const returned = body.type === 'BlockStatement'
        ? body.body.filter(s => s.type === 'ReturnStatement').map(s => s.argument)
        : [body];
      if (returned.some(r => escaperCalls(r, escapers).length)) escapers.add(d.name);
    }
    if (escapers.size === before) break;
  }
  return escapers;
}

// ── 2. the sinks ────────────────────────────────────────────────────────────
export function scanSinks(ast, escapers, extraSinks, report) {
  const visit = n => {
    if (n.type === 'AssignmentExpression' && (n.operator === '=' || n.operator === '+=')
        && n.left.type === 'MemberExpression' && !n.left.computed && TEXT_PROPS.has(n.left.property.name)) {
      for (const c of escaperCalls(n.right, escapers)) report(c.start, `.${n.left.property.name} = ${calleeName(c.callee)}(…)`);
    }
    if (n.type === 'CallExpression') {
      const name = calleeName(n.callee);
      const callee = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee;
      let args = null, label = null;
      if (name === 'setAttribute' && n.arguments[0] && n.arguments[0].type === 'Literal'
          && TEXT_ATTRS.has(String(n.arguments[0].value).toLowerCase())) {
        args = n.arguments.slice(1); label = `setAttribute('${n.arguments[0].value}', …)`;
      } else if (isHouse(callee)) {
        args = n.arguments; label = `House.${callee.property.name}(…)`;
      } else if (callee.type !== 'MemberExpression' || name === 'createTextNode'
                 || (callee.object.type === 'Identifier' && /^(window|globalThis|self)$/.test(callee.object.name))) {
        // Bare calls (and window.confirm and the like) by name; a member call only
        // for createTextNode, so obj.confirm() of some unrelated API is not read.
        if (SINK_CALLS.has(name) || extraSinks.has(name)) { args = n.arguments; label = `${name}(…)`; }
      } else if (extraSinks.has(name)) {
        args = n.arguments; label = `${name}(…)`;
      }
      if (args) for (const a of args) for (const c of escaperCalls(a, escapers)) report(c.start, `${label} given ${calleeName(c.callee)}(…)`);
    }
    for (const k of kids(n)) visit(k);
  };
  visit(ast);
}

export async function run({ siteDir, skipText, sinksText }) {
  const site = await readSite(siteDir, parseSkip(skipText, 'escape-sink'));
  const escapers = deriveEscapers(site);
  const extra = new Set(String(sinksText || '').split(/[\s,]+/).filter(Boolean));
  const hits = [];
  if (escapers.size) {
    for (const f of site) for (const u of f.units) {
      scanSinks(u.ast, escapers, extra, (at, what) => hits.push(annotate(f.file, lineOf(f.src, u.offset + at),
        `${what}: an HTML-escaped value in a text sink is shown with its entity codes. Drop the escape here, or use innerHTML if markup is meant.`)));
    }
  }
  return { files: site.length, escapers, hits };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const siteDir = process.env.SITE_DIR || '.';
    const { files, escapers, hits } = await run({ siteDir, skipText: process.env.GUARD_SKIP, sinksText: process.env.TEXT_SINKS });
    if (!files) {
      console.log(`escape-sink-guard: no .js or .html file under ${siteDir} yet; nothing to check.`);
    } else if (!escapers.size) {
      console.log(`escape-sink-guard: no HTML-escape helper in ${files} files under ${siteDir}, so nothing can be double-encoded.`);
    } else if (hits.length) {
      console.error(`escape-sink-guard: an HTML-escaped value goes to a text sink (${hits.length}); the person reads the entity codes:`);
      hits.forEach(h => console.error('  ' + h));
      console.error('Fix the SINK, not the escape. A file that must keep one: name it in guard-skip as escape-sink:<path>.');
      process.exit(1);
    } else {
      console.log(`escape-sink-guard: clean (${files} files under ${siteDir}; escapers derived: ${[...escapers].sort().join(', ')}).`);
    }
  } catch (e) {
    console.error('escape-sink-guard: ' + e.message);
    process.exit(1);
  }
}
