// Extracts all file paths from backtick references in CLAUDE.md and verifies each exists.
// Two more passes below: doc citations in shipped files, and relative links in HTML pages.
// Paths are matched as: `path/to/file.ext` — must contain a / and a . to qualify.
// Dot-paths (.claude/, .github/) ARE validated here: this script runs only in
// claude.directives CI, where those files are committed. (Downstream projects,
// where dot-paths may not exist until bootstrap, do not run this script.)
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, posix } from 'path';
import { execFileSync } from 'child_process';

const raw = readFileSync('CLAUDE.md', 'utf8');
// Strip fenced code blocks first so their contents aren't matched as inline-code paths.
const content = raw.replace(/```[\s\S]*?```/g, '');
const matches = [...content.matchAll(/`([^`\n]+\/[^`\n]+\.[^`\n]+)`/g)].map(m => m[1]);
const paths = [...new Set(matches)]
  // Skip URLs (e.g. https://, schema://).
  .filter(p => !/^[a-z][a-z0-9+.-]*:\/\//i.test(p));

let failed = false;

for (const p of paths) {
  if (existsSync(p)) {
    console.log(`OK:     ${p}`);
  } else {
    console.error(`MISSING: ${p}`);
    failed = true;
  }
}

// --- Second pass: doc references inside SHIPPED files ------------------------
// A template that tells a maintainer to read a document is an instruction, and
// an instruction pointing at a missing file is worse than no instruction. These
// references live in YAML comments and command prose rather than markdown
// links, so check-links.js never sees them -- a real miss on 2026-08-19, where
// a template cited docs/guides/cicd-setup.md and the guide is under
// docs/standards/. Canonicalisation makes this load-bearing: every rule now
// states its reasoning once and the other sites POINT at it, so a rotted
// pointer silently costs a reader the reasoning entirely.
// DERIVE the surface from EXPORTS.json rather than hand-listing it. A list of
// what to scan rots the moment the exported set changes -- the same failure this
// repo removed from /refresh-repo on 2026-08-19, and one this check had already
// reproduced twice: it silently skipped directives/ and the plugin's agents and
// skills while claiming to cover shipped files. check-exports.js already
// validates every path named here exists, so the two checks cannot disagree.
const EXPORTED = Object.values(
  JSON.parse(readFileSync('EXPORTS.json', 'utf8')).categories,
).flatMap((c) => c.paths || []);

// Plus two surfaces EXPORTS.json deliberately omits: this repo's own paired
// workflow copies (live files, not exports) and the maintainer runbook
// (internal-only by design). Both cite docs and both can rot.
const EXTRA = ['.github/workflows', 'MAINTAIN-REPO-USER-INSTRUCTIONS.md'];

// Never descend into installed or generated trees. templates/ui-tests carries a
// package.json, so a developer who has run the suite locally has a node_modules
// under it -- and vendored docs cite their own paths, which this check would
// then read as repo-owned and fail on. Reported with a reproduction:
// templates/ui-tests/node_modules/safer-buffer/Porting-Buffer.md cites a
// docs/rules/*.md that does not exist here. A check that breaks after a normal
// local install is a check people learn to skip.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage',
  'playwright-report', 'test-results', '.next', '.venv']);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ya?ml|md|sh|py|[cm]?js)$/.test(e.name)) out.push(full);
  }
  return out;
}

const refFiles = [...new Set([...EXPORTED, ...EXTRA].flatMap((entry) => {
  const p = entry.replace(/\/$/, '');
  if (!existsSync(p)) return [];
  return statSync(p).isDirectory() ? walk(p) : [p];
}))];
const refs = new Map(); // path -> Set(files citing it)

for (const f of refFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/docs\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md/g)) {
    if (!refs.has(m[0])) refs.set(m[0], new Set());
    refs.get(m[0]).add(f);
  }
}

for (const [ref, citedBy] of [...refs].sort()) {
  if (existsSync(ref)) {
    console.log(`OK:     ${ref}  (${citedBy.size} citation${citedBy.size === 1 ? '' : 's'})`);
  } else {
    console.error(`MISSING: ${ref}  cited by: ${[...citedBy].join(', ')}`);
    failed = true;
  }
}

// --- Third pass: links inside the published HTML pages -------------------------
// Every link in a tracked .html page that stays on this Pages site must name a
// regular file -- or a directory holding index.html, which is what Pages serves
// for it. isFile(), not existsSync(): a DIRECTORY named example.html exists
// happily and still 404s. Nothing else here resolves an HTML link to the tree:
// check-links.js reads only Markdown, and html-validate never touches the
// filesystem. This is what survived of check-landing-cards.js when the two
// landing pages merged (2026-10-08): the sync half went, the target half is
// whole-class now -- every page, every URL-bearing attribute, the redirect stubs.
//
// Two mechanisms rather than patterns, so a markup variant cannot slip past
// (Codex on #415: a single-quoted href, then a root-relative one):
// - tags() tokenizes attributes the way the HTML spec does -- double-quoted,
//   single-quoted, unquoted or bare; comments and raw-text elements skipped;
//   the first of a duplicate attribute wins -- and THROWS on markup it cannot
//   read, which fails the run rather than skipping the page.
// - each link is resolved by WHATWG URL against the page's own DEPLOYED address,
//   exactly as a browser resolves it there. pagesRoot() derives that address
//   the way GitHub Pages assigns it -- a tracked CNAME's domain, else
//   <owner>.github.io/<repo>/ (or / for a <owner>.github.io repo) -- so an
//   absolute link spelling this site's own URL is checked like a relative one
//   (Codex on #415: a canonical or card URL to a missing page). A URL inside
//   that root must name a file. A RELATIVE reference that resolves outside it
//   (a root-relative "/x", or too many "..") FAILS, since on the project site it
//   leaves the repo's pages altogether; an absolute URL outside it is someone
//   else's page, external like any other origin.
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const HEAD_OK = new Set(['html', 'head', 'base', 'link', 'meta', 'title', 'style', 'script', 'noscript', 'template']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
// Which attributes carry URLs, by the HTML spec's attribute index -- every
// attribute it types as a URL, a URL list or a srcset -- plus the obsolete URL
// attributes browsers still fetch, and SVG's xlink:href. Taken from the index
// as a whole, not added one finding at a time (Codex on #415: imagesrcset).
// Left out on purpose: itemid / itemtype (identifiers, never fetched) and
// <base href> (it sets the resolution base below; nothing is fetched from it).
const URL_ATTRS = {
  href: ['a', 'area', 'link'],
  src: ['audio', 'embed', 'iframe', 'img', 'input', 'script', 'source', 'track', 'video', 'frame'],
  action: ['form'], formaction: ['button', 'input'], cite: ['blockquote', 'del', 'ins', 'q'],
  data: ['object'], poster: ['video'], manifest: ['html'], longdesc: ['img', 'iframe', 'frame'],
  background: ['body', 'table', 'td', 'th'], lowsrc: ['img'], dynsrc: ['img'], profile: ['head'],
};
const SRCSET_ATTRS = { srcset: ['img', 'source'], imagesrcset: ['link'] };
const URL_LIST_ATTRS = { ping: ['a', 'area'] }; // space-separated URLs
// The spec index ties each attribute to its elements: a name alone made custom
// element state such as <x-chart data="monthly totals"> a "broken link"
// (Codex on #415). xlink:href is namespaced, so it is a URL on any element.
const on = (table, name, tag) => Object.hasOwn(table, name) && table[name].includes(tag);
// Inside SVG/MathML only: these elements' href, and xlink:href on any element.
// The parser adjusts xlink:* into the XLink namespace only in foreign content,
// so on an HTML (custom) element both are plain component state (Codex, #415).
const SVG_HREF = ['a', 'image', 'use', 'feimage', 'textpath', 'mpath', 'pattern', 'lineargradient',
  'radialgradient', 'filter', 'script', 'animate', 'animatemotion', 'animatetransform', 'set', 'cursor'];
// Character references, decoded as the HTML tokenizer decodes them inside an
// attribute value. The named table is the WHATWG one in full (2231 names), read
// from Python's standard library (html.entities.html5) rather than copied here
// -- a five-name subset resolved "docs&sol;site&sol;x.html" to a different path
// than the browser did (Codex on #415). Unavailable is a refusal, not a guess.
let NAMED_REFS;
try {
  NAMED_REFS = JSON.parse(execFileSync('python3', ['-c',
    'import json, html.entities; print(json.dumps(html.entities.html5))'], { encoding: 'utf8' }));
} catch (e) {
  console.error(`CANNOT CHECK: python3's html.entities table is unavailable (${e.message.split('\n')[0]}) -- attribute values cannot be decoded as a browser decodes them`);
  process.exit(2);
}
// Numeric references the spec remaps: C1 controls by windows-1252.
const C1 = { 0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D,
  0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178 };
function decodeRefs(v) {
  let out = ''; let i = 0;
  while (i < v.length) {
    if (v[i] !== '&') { out += v[i++]; continue; }
    const num = /^&#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?/.exec(v.slice(i));
    if (num) {
      let cp = num[1] !== undefined ? parseInt(num[1], 16) : parseInt(num[2], 10);
      if (cp === 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) cp = 0xFFFD;
      else if (C1[cp]) cp = C1[cp];
      out += String.fromCodePoint(cp); i += num[0].length; continue;
    }
    // The longest table name matching here (names run to 32 characters).
    let match = '';
    for (let len = Math.min(32, v.length - i - 1); len > 0; len--) {
      const cand = v.substr(i + 1, len);
      if (Object.hasOwn(NAMED_REFS, cand)) { match = cand; break; }
    }
    const next = v[i + 1 + match.length];
    // In an attribute, a match without ";" followed by "=" or an alphanumeric is
    // left as written (the spec's "historical reasons" rule): "?a=1&copy=2" stays.
    if (!match || (!match.endsWith(';') && next !== undefined && /[=A-Za-z0-9]/.test(next))) { out += v[i++]; continue; }
    out += NAMED_REFS[match]; i += 1 + match.length;
  }
  return out;
}
// SVG/MathML HTML integration points: their children parse as HTML again.
const BREAKOUT = new Set(['b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em',
  'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu', 'meta', 'nobr',
  'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var']);
const POINTS = { svg: ['foreignobject', 'desc', 'title'], math: ['mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml'] };
function tags(src) {
  // The namespace stack lives in the tokenizer because raw text depends on it:
  // <title>, <style>, <script> are raw text only as HTML elements, and inside
  // SVG/MathML a self-closing tag is honoured (Codex on #415: <svg><title/>).
  // Each tag records t.foreign (it is in SVG/MathML) and t.underForeign (some
  // <svg>/<math> is open); <svg>/<math> push foreign content, an integration
  // point pushes HTML, a nested <svg> re-enters foreign, end tags pop.
  const stack = [];
  const top = () => stack[stack.length - 1];
  // ASCII-only folding, as the spec folds tag and attribute names. toLowerCase()
  // can change the string's LENGTH (U+0130 becomes two code units), shifting
  // every later offset so links after it were silently never read (Codex, #415).
  const out = []; const lower = src.replace(/[A-Z]+/g, (m) => m.toLowerCase()); const n = src.length; let i = 0;
  const upTo = (s, from, what) => { const e = src.indexOf(s, from); if (e < 0) throw new Error(`unterminated ${what} at offset ${from}`); return e; };
  while ((i = src.indexOf('<', i)) >= 0) {
    if (src.startsWith('<!--', i)) { i = upTo('-->', i + 4, 'comment') + 3; continue; }
    if (src[i + 1] === '/' && /[A-Za-z]/.test(src[i + 2] ?? '')) { // end tag: kept, so a card's </a> can be checked
      const e = upTo('>', i, 'end tag');
      const name = lower.slice(i + 2, e).split(/[\t\n\f\r />]/)[0];
      out.push({ tag: `/${name}`, attrs: new Map(), foreign: top() !== undefined && top().ns !== 'html', underForeign: stack.length > 0 });
      const k = stack.map((x) => x.tag).lastIndexOf(name);
      if (k >= 0) stack.length = k;
      i = e + 1; continue;
    }
    // CDATA is character data through "]]>" in SVG/MathML but a bogus comment
    // ending at the first ">" in HTML -- which one applies is tree construction,
    // so it is refused rather than guessed (Codex on #415). Nothing here uses it.
    if (src.startsWith('<![CDATA[', i)) throw new Error(`a <![CDATA[ section at offset ${i} -- its extent depends on foreign-content parsing this check does not do; use text or a character reference instead`);
    if ('!?/'.includes(src[i + 1] ?? 'x')) { i = upTo('>', i, 'declaration') + 1; continue; }
    if (!/[A-Za-z]/.test(src[i + 1] ?? '')) { i++; continue; } // a bare "<" in text
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const tag = lower.slice(i + 1, j); const attrs = new Map(); let selfClosing = false;
    for (;;) {
      // Self-closing only when the TOKENIZER consumes "/" between attributes and
      // ">" follows it at once; in <svg data-x=foo/> the "/" is part of the
      // unquoted value, so the element stays open (Codex on #415).
      let slash = false;
      while (j < n && /[\s/]/.test(src[j])) { slash = src[j] === '/'; j++; }
      if (j >= n) throw new Error(`unterminated <${tag}> at offset ${i}`);
      if (src[j] === '>') { selfClosing = slash; j++; break; }
      let k = j;
      while (k < n && !/[\s/>=]/.test(src[k])) k++;
      const name = lower.slice(j, k); j = k;
      while (j < n && /\s/.test(src[j])) j++;
      let value = '';
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        if (src[j] === '"' || src[j] === "'") {
          const e = upTo(src[j], j + 1, `${src[j]}-quoted ${name} in <${tag}>`);
          value = src.slice(j + 1, e); j = e + 1;
        } else {
          k = j;
          while (k < n && !/[\s>]/.test(src[k])) k++;
          value = src.slice(j, k); j = k;
        }
      }
      if (!attrs.has(name)) attrs.set(name, decodeRefs(value));
    }
    // An HTML breakout tag inside SVG/MathML pops the foreign content and is
    // processed as HTML (spec "in foreign content"; Codex on #415): <svg><p>
    // closes the svg, so a <script> after it is HTML raw text again.
    if (top() !== undefined && top().ns !== 'html'
      && (BREAKOUT.has(tag) || (tag === 'font' && ['color', 'face', 'size'].some((a) => attrs.has(a))))) {
      while (top() !== undefined && top().ns !== 'html') stack.pop();
    }
    const foreign = top() !== undefined && top().ns !== 'html';
    out.push({ tag, attrs, selfClosing, foreign, underForeign: stack.length > 0 });
    if (!selfClosing) {
      if (tag === 'svg' || tag === 'math') stack.push({ tag, ns: tag });
      else if (foreign && POINTS[top().ns].includes(tag)) stack.push({ tag, ns: 'html' });
    }
    if (foreign) { i = j; continue; } // no raw text and no plaintext in SVG/MathML
    if (tag === 'plaintext') break; // no end tag exists: the rest of the document is text (spec)
    if (RAW_TEXT.has(tag)) {
      // Raw text ends only at an APPROPRIATE end tag: "</name" followed by
      // whitespace, "/" or ">". A bare prefix match ended <script> at
      // "</scripture>" and read the rest of the script as markup (Codex, #415).
      let e = j;
      for (;;) {
        e = lower.indexOf(`</${tag}`, e);
        if (e < 0) throw new Error(`unterminated <${tag}> at offset ${i}`);
        if (/^[\t\n\f\r />]$/.test(src[e + 2 + tag.length] ?? '')) break;
        e += 2;
      }
      // "<!--" then "<script" inside a script puts the tokenizer in its
      // double-escaped state, where a literal </script> does not close the
      // element. Refused rather than modelled (Codex on #415); no page here
      // has a comment inside a script.
      if (tag === 'script' && /<!--[\s\S]*<script[\t\n\f\r />]/.test(lower.slice(j, e))) {
        throw new Error(`a <script> at offset ${i} opens "<!--" and then "<script" -- the double-escaped state this check does not model; remove the HTML comment from the script`);
      }
      i = e;
    } else i = j;
  }
  return out;
}
// The candidate URLs of a srcset, by the HTML spec's "parse a srcset attribute":
// a URL runs to the next whitespace (so a data: URL keeps its commas); trailing
// commas on it end the candidate; otherwise its descriptors run to a comma that
// is NOT inside parentheses. A raw split on "," cut data: URLs apart (Codex, #415).
function srcsetUrls(v) {
  const urls = []; const ws = /[\t\n\f\r ]/; let i = 0;
  while (i < v.length) {
    while (i < v.length && (ws.test(v[i]) || v[i] === ',')) i++;
    if (i >= v.length) break;
    let j = i;
    while (j < v.length && !ws.test(v[j])) j++;
    let url = v.slice(i, j); i = j;
    if (url.endsWith(',')) { urls.push(url.replace(/,+$/, '')); continue; }
    urls.push(url);
    let inParens = false;
    for (; i < v.length; i++) {
      if (inParens) { if (v[i] === ')') inParens = false; }
      else if (v[i] === '(') inParens = true;
      else if (v[i] === ',') { i++; break; }
    }
  }
  return urls.filter(Boolean);
}
// The URL values one tag carries: URL attributes, each srcset / imagesrcset
// candidate, each ping URL, and a
// meta refresh's target, parsed as the spec's refresh algorithm reads it.
function linksOf({ tag: name0, attrs, foreign }) {
  // In HTML content the parser rewrites a legacy <image> start tag to <img>
  // (Codex on #415); inside SVG, <image> is SVG's own element.
  const tag = name0 === 'image' && !foreign ? 'img' : name0;
  const urls = [];
  if (tag === 'base') return urls; // resolved once, against the page, as the base -- never as a link (Codex on #415)
  for (const [name, v] of attrs) {
    if (on(SRCSET_ATTRS, name, tag)) urls.push(...srcsetUrls(v));
    else if (on(URL_LIST_ATTRS, name, tag)) urls.push(...v.split(/[\t\n\f\r ]+/).filter(Boolean));
    else if (on(URL_ATTRS, name, tag)) urls.push(v);
    else if (foreign && (name === 'xlink:href' || (name === 'href' && SVG_HREF.includes(tag)))) urls.push(v);
  }
  if (tag === 'meta' && (attrs.get('http-equiv') || '').trim().toLowerCase() === 'refresh') {
    // The spec's refresh steps: a delay (digits, or "." then digits/dots) must
    // come first, then end of input, whitespace, ";" or ","; with no delay the
    // directive is ignored and nothing navigates (Codex on #415).
    const m = (attrs.get('content') || '').match(/^[\t\n\f\r ]*(?:\d|(?=\.))[\d.]*(?:$|[\t\n\f\r ;,][\t\n\f\r ]*[;,]?[\t\n\f\r ]*(?:url[\t\n\f\r ]*=[\t\n\f\r ]*)?(["']?)(.*))$/is);
    if (m && m[2]) urls.push(m[1] ? m[2].split(m[1])[0] : m[2]);
  }
  return urls;
}
// The site's deployed root. In CI it is always derivable (GITHUB_REPOSITORY).
// Underivable -- a source archive or a checkout with no origin -- falls back to
// a placeholder PROJECT-site root, never a guess at the real one: relative and
// root-relative links are checked exactly as strictly, and only absolute links
// to the deployed site go unchecked, which the run says (Codex on #415: the
// documented local gate must not need a remote).
function pagesRoot() {
  if (isFile('CNAME')) {
    const domain = readFileSync('CNAME', 'utf8').trim().split(/\s+/)[0];
    if (domain) return new URL(`https://${domain}/`);
  }
  let slug = process.env.GITHUB_REPOSITORY || '';
  if (!slug) {
    try {
      const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
      slug = remote.replace(/\.git$/, '').split(/[/:]/).slice(-2).join('/');
    } catch { slug = ''; }
  }
  const [owner, repo] = slug.split('/');
  if (!owner || !repo) {
    console.warn('WARN:   no CNAME, GITHUB_REPOSITORY or origin remote -- absolute links to the deployed site are NOT checked in this run (CI derives the real root)');
    return new URL('https://pages.invalid/__project_root__/');
  }
  const host = `${owner.toLowerCase()}.github.io`;
  return new URL(repo.toLowerCase() === host ? `https://${host}/` : `https://${host}/${repo}/`);
}
const ROOT = pagesRoot();
// What Pages publishes is the tracked tree, so a link target must be a TRACKED
// regular file -- not merely something on this disk. Containment is checked on
// the decoded path too: WHATWG URL resolves "%2F" as data, not a separator, so
// "docs%2F..%2F..%2Fetc%2Fpasswd" passed the root check and then reached
// /etc/passwd once decoded (Codex on #415).
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
// Tracked IS published, because the site publishes the tree verbatim: a
// tracked .nojekyll turns Jekyll off (owner call, 2026-10-08). Without it,
// Jekyll drops "."/"_"/"#"/"~" paths, processes front matter, honours
// permalinks and _config.yml -- a model this check would have to reimplement
// to stay sound, which #415's review rounds showed has no end. So the file is
// REQUIRED: its absence is a refusal, not a guess.
if (!tracked.has('.nojekyll')) {
  console.error('CANNOT CHECK: no tracked .nojekyll -- Pages would run Jekyll, and what it publishes is not the tracked tree this check resolves links against');
  process.exit(2);
}
const published = (p) => tracked.has(p) && isFile(p);
const htmlPages = execFileSync('git', ['ls-files', '-z', '*.html'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(isFile);  // a deleted or replaced page is not read -- the pages linking to it report it
let htmlLinks = 0;
for (const page of htmlPages) {
  let pageTags;
  try { pageTags = tags(readFileSync(page, 'utf8')); } catch (e) {
    console.error(`UNREADABLE: ${page}: ${e.message} -- its links cannot be checked`);
    failed = true; continue;
  }
  // The document base URL, as a browser sets it: the first <base> element that
  // HAS an href, resolved against the page's own address; the page's address
  // when there is none or it does not parse. A raw page address ignored a
  // <base href="docs/"> that re-roots every relative link (Codex, #415).
  const pageUrl = new URL(page, ROOT);
  // The document base is the first <base href> that is an HTML element of the
  // document tree. Whether a <base> inside <template>, <noscript>, SVG or MathML
  // is one depends on tree construction -- integration points like
  // <foreignObject> parse their children as HTML again (Codex on #415, twice) --
  // which this tokenizer deliberately does not reimplement. So such a <base> is
  // REFUSED, never guessed at: a guess either way can hide a missing link or
  // invent one. The remedy is one move: put <base> in <head>.
  // Namespace context (t.foreign / t.underForeign) comes from the tokenizer.
  // This pass adds t.inert: inside <template> or <noscript>.
  let inert = 0; let baseHref;
  for (const t of pageTags) {
    t.inert = inert > 0;
    if (t.tag === '/template' || t.tag === '/noscript') inert = Math.max(0, inert - 1);
    else if (t.tag === 'template' || t.tag === 'noscript') inert++;
  }
  let inHead = true;
  for (const t of pageTags) {
    // Head content ends at the first start tag that cannot live in <head> (or
    // at </head>). Only a <base> before that point is honoured as written; past
    // it -- inside <select>, a table, after body content -- whether the parser
    // inserts it depends on insertion mode, which this check does not model, so
    // it is refused (Codex on #415, a <base> in <select>).
    if (!t.inert && (t.tag === '/head' || (!t.tag.startsWith('/') && !HEAD_OK.has(t.tag)))) inHead = false;
    if (t.tag !== 'base') continue;
    if (t.inert || t.underForeign || !inHead) {
      console.error(`UNREADABLE: ${page}: a <base> outside <head>, or inside <template>, <noscript>, SVG or MathML -- whether it sets the document base depends on tree construction this check does not do; move it into <head>`);
      failed = true; continue;
    }
    if (baseHref === undefined && t.attrs.has('href')) baseHref = t.attrs.get('href');
  }
  let base = pageUrl;
  if (baseHref !== undefined) { try { base = new URL(baseHref, pageUrl); } catch { base = pageUrl; } }
  // The landing-card assertions check-landing-cards.js made that still mean
  // something with one page (its sync half went with the second page). A card
  // is a link by definition, so each .demo-card must be an <a> with a non-blank
  // href, closed by </a> before the next <a> opens; and the root page must HAVE
  // a card, or every one of these passes vacuously. Validating only the targets
  // present saw a dead card as one link fewer (Codex on #415, twice).
  const cardFail = (msg) => { console.error(`MISSING: ${page} ${msg}`); failed = true; };
  let cards = 0;
  pageTags.forEach((t, k) => {
    // A card inside <template> or <noscript> is not on the page (Codex on #415).
    if (t.inert || !(t.attrs.get('class') || '').split(/[\t\n\f\r ]+/).includes('demo-card')) return;
    cards++;
    if (t.tag !== 'a') return cardFail(`has a .demo-card <${t.tag}>, not a link -- cards must be anchors`);
    const href = (t.attrs.get('href') || '').trim();
    if (!href) cardFail('has a .demo-card <a> with no href -- the card links nowhere');
    // A root card is a demo, and demos live in docs/site/ -- the shape the root
    // markup documents and check-landing-cards.js enforced. A README or an
    // external URL is navigable but is not a demo (Codex on #415).
    else if (page === 'index.html' && !/^docs\/site\/[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(href)) {
      cardFail(`has a .demo-card href="${href}" -- a root card must be docs/site/<filename>.html`);
    }
    const close = pageTags.slice(k + 1).find((u) => u.tag === 'a' || u.tag === '/a');
    if (!close || close.tag !== '/a') cardFail('has a .demo-card <a> not closed by </a> before the next <a>');
  });
  if (page === 'index.html' && cards === 0) cardFail('has no .demo-card -- the landing-card checks would pass vacuously');
  for (const raw of pageTags.flatMap(linksOf)) {
    let url;
    try { url = new URL(raw, base); } catch { console.error(`MISSING: ${page} links "${raw}", which is not a valid URL`); failed = true; continue; }
    // http and https are one site: Pages redirects the first to the second.
    const inside = /^https?:$/.test(url.protocol) && url.host === ROOT.host && url.pathname.startsWith(ROOT.pathname);
    if (!inside) {
      // Written with a scheme or as "//host", it names its own destination; under
      // a <base> on ANOTHER origin, a relative one deliberately resolves there
      // (Codex on #415: a CDN base). Both are external. A relative reference that
      // escapes the root from a base on THIS host still fails: there it can only
      // be a mistake that leaves the project site.
      if (/^\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
      if (!(/^https?:$/.test(base.protocol) && base.host === ROOT.host)) continue;
      htmlLinks++;
      console.error(`MISSING: ${page} links "${raw}", which resolves to ${url.href} -- outside ${ROOT.href}, so it leaves this repo's site`);
      failed = true; continue;
    }
    htmlLinks++;
    let rel;
    try { rel = decodeURIComponent(url.pathname.slice(ROOT.pathname.length)); } catch {
      console.error(`MISSING: ${page} links "${raw}", whose path is not valid percent-encoding`); failed = true; continue;
    }
    const target = posix.normalize(rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel);
    if (target === '..' || target.startsWith('../') || posix.isAbsolute(target) || target.includes('\0')) {
      console.error(`MISSING: ${page} links "${raw}", which decodes to ${target} -- outside the repository`); failed = true; continue;
    }
    if (published(target) || published(posix.join(target, 'index.html'))) continue;
    console.error(`MISSING: ${page} links "${raw}" -> ${target}, which is not a tracked regular file — the published link would 404`);
    failed = true;
  }
}
console.log(`OK:     ${htmlLinks} same-site link(s) across ${htmlPages.length} HTML page(s) checked`);

if (failed) {
  console.error('\nOne or more referenced paths do not exist in the repo.');
  process.exit(1);
}
