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
// no clipping at the next declaration. An escaper is matched with its owner
// (`Html.escape` is not `CSS.escape`). A site with no escaper passes with a
// notice: with no escaper there is nothing to double-encode. The house dialogs
// and messages are sinks by default; TEXT_SINKS adds a project's own
// (apfp.claude's askConfirm, say) by name.

import { pathToFileURL } from 'node:url';
import { readSite, parseSkip, analyzeScopes, kids, isFn, lineOf, annotate } from './lib.mjs';

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
/* The dotted path a callee names (`esc`, `Html.escape`, `App.util.esc`), or
 * null when its receiver is not a plain name (`this.esc`, `a().esc`). */
const dotted = c => {
  if (c.type === 'ChainExpression') c = c.expression;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') {
    const o = dotted(c.object);
    return o ? `${o}.${c.property.name}` : null;
  }
  return null;
};

/* Does this callee call a derived escaper? E is { nodes, names }: the escaper
 * functions themselves, and the keys a call can reach them by from elsewhere.
 *
 * A BARE NAME is resolved first (eslint-scope, per script): a name declared as
 * a function in this file is an escaper only if THAT function is one, so a
 * module's own `escape(s) { return s }` is not another module's HTML escaper
 * (Codex, #493). A name the file does not declare (a page global, an import, a
 * parameter) is matched by name against the escapers other scripts can see:
 * a top-level function of a classic script, or a module's export.
 *
 * A MEMBER keeps its receiver: `esc`, `Html.escape`, or `*.escape` for a
 * method whose owner has no name, so a derived `Html.escape` never makes
 * `CSS.escape(id)` an escaper call (Codex, #493). A receiver that is not a
 * plain name (`this.escape`) can be any owner, so it matches any key ending
 * in that method. */
function isEscaperCall(callee, E, res) {
  if (callee.type === 'ChainExpression') callee = callee.expression;
  if (callee.type === 'Identifier') {
    const fn = res.fnOf(callee);
    if (fn) return E.nodes.has(fn);
    return E.names.has(res.importedName(callee) || callee.name);
  }
  if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') return false;
  const prop = callee.property.name, path = dotted(callee);
  if (path) return E.names.has(path) || E.names.has('*.' + prop);
  return [...E.names].some(k => k === '*.' + prop || k.endsWith('.' + prop));
}

/* What each bare name in one program refers to: the function this file
 * declares under it (fnOf), or the name it was imported as (importedName). */
function resolver(ast) {
  const refs = new Map();
  for (const sc of analyzeScopes(ast).scopes) for (const r of sc.references) refs.set(r.identifier, r);
  const def = id => { const r = refs.get(id); return r && r.resolved && r.resolved.defs[0]; };
  return {
    fnOf: id => {
      const d = def(id);
      if (!d) return null;
      if (d.type === 'FunctionName') return d.node;
      if (d.type === 'Variable' && isFn(d.node.init)) return d.node.init;
      return null;
    },
    importedName: id => {
      const d = def(id);
      return d && d.type === 'ImportBinding' && d.node.imported ? (d.node.imported.name || d.node.imported.value) : null;
    },
  };
}

/* The escaper calls whose RESULT is the value of `node`: the text a sink
 * shows, or a function returns. The walk follows only what carries a string
 * through (a `+` join, a template, either side of `?:`, `||`, `&&`, an array
 * that is joined, an options object's values, a string method called on it, an expression-bodied arrow
 * such as `xs.map(x => esc(x))`, and the arguments of a call it cannot see
 * into), so a value COMPUTED from the escaped text, such as
 * `esc(name).length`, is not escaped text (Codex, #493). A callback with a
 * statement body does its own work, and is not the value being shown. */
function escaperCalls(node, E, res, out = []) {
  if (!node) return out;
  const go = n => escaperCalls(n, E, res, out);
  switch (node.type) {
    case 'CallExpression': {
      if (isEscaperCall(node.callee, E, res)) { out.push(node); return out; }
      const c = node.callee.type === 'ChainExpression' ? node.callee.expression : node.callee;
      if (c.type === 'MemberExpression') go(c.object);
      node.arguments.forEach(go);
      return out;
    }
    case 'ChainExpression': return go(node.expression);
    case 'ConditionalExpression': go(node.consequent); return go(node.alternate);
    case 'LogicalExpression': go(node.left); return go(node.right);
    case 'BinaryExpression': if (node.operator === '+') { go(node.left); go(node.right); } return out;
    case 'TemplateLiteral': node.expressions.forEach(go); return out;
    case 'SequenceExpression': return go(node.expressions.at(-1));
    case 'AssignmentExpression': return go(node.right);
    case 'AwaitExpression': case 'SpreadElement': return go(node.argument);
    case 'ArrayExpression': node.elements.forEach(e => e && go(e)); return out;
    // A dialog's options (`House.confirm({ title: esc(x) })`): each value is shown.
    case 'ObjectExpression': node.properties.forEach(p => go(p.type === 'Property' ? p.value : p)); return out;
    case 'ArrowFunctionExpression': return node.body.type === 'BlockStatement' ? out : go(node.body);
    default: return out;
  }
}

// ── 1. derive the escapers ──────────────────────────────────────────────────
/* Every named function in the site: { name, node }. A declaration, a variable or
 * property holding a function, an object or class method, an assignment of a
 * function to a name or a member. */
function namedFunctions(ast, out) {
  // The name of what holds an object or class: `const Html = {…}`,
  // `App.util = {…}`, `class Html {…}`; null when nothing names it.
  const ownerOf = (node, parent) => {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      if (node.id) return node.id.name;
    }
    if (parent && parent.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'Identifier') return parent.id.name;
    if (parent && parent.type === 'AssignmentExpression' && parent.right === node) return dotted(parent.left);
    return null;
  };
  const visit = (n, owners) => {
    if (n.type === 'FunctionDeclaration' && n.id) out.push({ name: n.id.name, node: n });
    else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && isFn(n.init)) out.push({ name: n.id.name, node: n.init });
    else if ((n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition')
             && !n.computed && isFn(n.value)) {
      const k = n.key.type === 'Identifier' ? n.key.name : n.key.type === 'Literal' ? String(n.key.value) : null;
      // An object's method, or a class's STATIC one, is called on the owner's
      // name; an instance method is called on an instance, which has none.
      const owner = n.type === 'Property' || n.static ? owners.at(-1) : null;
      if (k) out.push({ name: `${owner || '*'}.${k}`, node: n.value });
    } else if (n.type === 'AssignmentExpression' && isFn(n.right)) {
      const k = dotted(n.left) || (n.left.type === 'MemberExpression' && !n.left.computed ? '*.' + n.left.property.name : null);
      if (k) out.push({ name: k, node: n.right });
    }
    for (const c of kids(n)) {
      const holder = c.type === 'ObjectExpression' || c.type === 'ClassExpression' || c.type === 'ClassDeclaration';
      // A function's body starts over: an object built inside it is not its owner's.
      visit(c, holder ? [...owners, ownerOf(c, n)] : isFn(c) ? [] : owners);
    }
  };
  visit(ast, []);
  return out;
}

/* The text a function writes: its string literals and template text, without
 * the keys of an object literal (those are looked up, not written). */
/* A nested function that has a name of its own (a declaration, or a function
 * held by a variable, property, method or assignment) is a helper the outer
 * function OWNS, not text it writes: it is derived on its own, and owning an
 * esc() must not make its owner an escaper (Codex, #493). An anonymous
 * callback (`s.replace(/[&<]/g, c => ({ '&': '&amp;', … })[c])`) is part of the
 * function's own work and is read. */
function isNamedHelper(n) {
  if (n.type === 'FunctionDeclaration') return true;
  if (n.type === 'VariableDeclarator' && isFn(n.init)) return true;
  if ((n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition') && isFn(n.value)) return true;
  if (n.type === 'AssignmentExpression' && isFn(n.right)) return true;
  return false;
}
function producedText(node) {
  let out = '';
  const visit = (n, parent) => {
    if (n !== node && isNamedHelper(n)) return;
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
    if (n !== fn.body && isNamedHelper(n)) return;
    if (n.type === 'Identifier' && tables.has(n.name)) out += tables.get(n.name);
    for (const k of kids(n)) visit(k);
  };
  visit(fn.body);
  return out;
}

/* The names a module exports, as written (`export function esc`,
 * `export { esc }`, `export { esc as escape }` gives escape). local -> exported. */
function exportsOf(ast) {
  const out = new Map();
  for (const s of ast.body) {
    if (s.type === 'ExportNamedDeclaration') {
      const d = s.declaration;
      if (d && d.type === 'FunctionDeclaration' && d.id) out.set(d.id.name, d.id.name);
      if (d && d.type === 'VariableDeclaration') for (const x of d.declarations) if (x.id.type === 'Identifier') out.set(x.id.name, x.id.name);
      for (const sp of s.specifiers || []) if (sp.local.type === 'Identifier') out.set(sp.local.name, sp.exported.name || sp.exported.value);
    }
    if (s.type === 'ExportDefaultDeclaration' && s.declaration.type === 'FunctionDeclaration' && s.declaration.id) out.set(s.declaration.id.name, 'default');
  }
  return out;
}

export function deriveEscapers(site) {
  const fns = [];
  for (const f of site) for (const u of f.units) {
    const tables = entityTables(u.ast);
    const top = new Set(u.ast.body.flatMap(st => {
      const d = st.type === 'ExportNamedDeclaration' || st.type === 'ExportDefaultDeclaration' ? st.declaration : st;
      if (!d) return [];
      if (d.type === 'FunctionDeclaration') return [d];
      return d.type === 'VariableDeclaration' ? d.declarations.filter(x => isFn(x.init)).map(x => x.init) : [];
    }));
    const exported = u.ast.sourceType === 'module' ? exportsOf(u.ast) : null;
    for (const d of namedFunctions(u.ast, [])) {
      // The key another script reaches it by: a member's dotted key always; a
      // bare name only from a classic script's top level, or a module's export.
      let key = null;
      if (d.name.includes('.')) key = d.name;
      else if (top.has(d.node)) key = exported ? (exported.get(d.name) || null) : d.name;
      fns.push({ ...d, key, unit: u, text: u.code.slice(d.node.start, d.node.end), tables: usesTable(d.node, tables) });
    }
  }
  const E = { nodes: new Set(), names: new Set(), shown: new Set() };
  const add = d => { E.nodes.add(d.node); E.shown.add(d.name); if (d.key) E.names.add(d.key); };
  // DIRECT: the function PRODUCES `&amp;` and `&lt;`, in strings it writes. A
  // regex literal or an object key only READS them: an unescaper
  // (`.replace(/&amp;/g, '&')`), or a scanner that looks for them, is not an
  // escaper, and marking it one made `decode` a sink suspect here.
  for (const d of fns) {
    const out = producedText(d.node.body) + d.tables;
    if (out.includes('&amp;') && out.includes('&lt;')) add(d);
  }
  // TRANSITIVE: a short function that returns an escaper's result. A fixpoint;
  // each pass can only add, so it ends.
  for (const u of new Set(fns.map(d => d.unit))) u.res = u.res || resolver(u.ast);
  for (;;) {
    const before = E.nodes.size;
    for (const d of fns) {
      if (E.nodes.has(d.node) || d.text.length > 220) continue;
      const body = d.node.body;
      const returned = body.type === 'BlockStatement'
        ? body.body.filter(s => s.type === 'ReturnStatement').map(s => s.argument)
        : [body];
      if (returned.some(r => escaperCalls(r, E, d.unit.res).length)) add(d);
    }
    if (E.nodes.size === before) break;
  }
  return E;
}

// ── 2. the sinks ────────────────────────────────────────────────────────────
export function scanSinks(ast, E, extraSinks, report, res = resolver(ast)) {
  const visit = n => {
    if (n.type === 'AssignmentExpression' && (n.operator === '=' || n.operator === '+=')
        && n.left.type === 'MemberExpression' && !n.left.computed && TEXT_PROPS.has(n.left.property.name)) {
      for (const c of escaperCalls(n.right, E, res)) report(c.start, `.${n.left.property.name} = ${calleeName(c.callee)}(…)`);
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
      if (args) for (const a of args) for (const c of escaperCalls(a, E, res)) report(c.start, `${label} given ${calleeName(c.callee)}(…)`);
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
  if (escapers.nodes.size) {
    for (const f of site) for (const u of f.units) {
      scanSinks(u.ast, escapers, extra, (at, what) => hits.push(annotate(f.file, lineOf(f.src, u.offset + at),
        `${what}: an HTML-escaped value in a text sink is shown with its entity codes. Drop the escape here, or use innerHTML if markup is meant.`)), u.res || resolver(u.ast));
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
    } else if (!escapers.nodes.size) {
      console.log(`escape-sink-guard: no HTML-escape helper in ${files} files under ${siteDir}, so nothing can be double-encoded.`);
    } else if (hits.length) {
      console.error(`escape-sink-guard: an HTML-escaped value goes to a text sink (${hits.length}); the person reads the entity codes:`);
      hits.forEach(h => console.error('  ' + h));
      console.error('Fix the SINK, not the escape. A file that must keep one: name it in guard-skip as escape-sink:<path>.');
      process.exit(1);
    } else {
      console.log(`escape-sink-guard: clean (${files} files under ${siteDir}; escapers derived: ${[...escapers.shown].map(e => e.replace(/^\*\./, '')).sort().join(', ')}).`);
    }
  } catch (e) {
    console.error('escape-sink-guard: ' + e.message);
    process.exit(1);
  }
}
