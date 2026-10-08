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
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
// Which attributes carry URLs, by the HTML spec's attribute index -- every
// attribute it types as a URL, a URL list or a srcset -- plus the obsolete URL
// attributes browsers still fetch, and SVG's xlink:href. Taken from the index
// as a whole, not added one finding at a time (Codex on #415: imagesrcset).
// Left out on purpose: itemid / itemtype (identifiers, never fetched) and
// <base href> (it sets the resolution base below; nothing is fetched from it).
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'cite', 'data', 'poster',
  'manifest', 'longdesc', 'background', 'lowsrc', 'dynsrc', 'profile', 'xlink:href']);
const SRCSET_ATTRS = new Set(['srcset', 'imagesrcset']);
const URL_LIST_ATTRS = new Set(['ping']); // space-separated URLs
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
function tags(src) {
  // ASCII-only folding, as the spec folds tag and attribute names. toLowerCase()
  // can change the string's LENGTH (U+0130 becomes two code units), shifting
  // every later offset so links after it were silently never read (Codex, #415).
  const out = []; const lower = src.replace(/[A-Z]+/g, (m) => m.toLowerCase()); const n = src.length; let i = 0;
  const upTo = (s, from, what) => { const e = src.indexOf(s, from); if (e < 0) throw new Error(`unterminated ${what} at offset ${from}`); return e; };
  while ((i = src.indexOf('<', i)) >= 0) {
    if (src.startsWith('<!--', i)) { i = upTo('-->', i + 4, 'comment') + 3; continue; }
    if (src[i + 1] === '/' && /[A-Za-z]/.test(src[i + 2] ?? '')) { // end tag: kept, so a card's </a> can be checked
      const e = upTo('>', i, 'end tag');
      out.push({ tag: `/${lower.slice(i + 2, e).split(/[\t\n\f\r />]/)[0]}`, attrs: new Map() });
      i = e + 1; continue;
    }
    if ('!?/'.includes(src[i + 1] ?? 'x')) { i = upTo('>', i, 'declaration') + 1; continue; }
    if (!/[A-Za-z]/.test(src[i + 1] ?? '')) { i++; continue; } // a bare "<" in text
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const tag = lower.slice(i + 1, j); const attrs = new Map(); let selfClosing = false;
    for (;;) {
      while (j < n && /[\s/]/.test(src[j])) j++;
      if (j >= n) throw new Error(`unterminated <${tag}> at offset ${i}`);
      if (src[j] === '>') { selfClosing = src[j - 1] === '/'; j++; break; }
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
    out.push({ tag, attrs, selfClosing });
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
function linksOf({ tag, attrs }) {
  const urls = [];
  if (tag === 'base') return urls; // resolved once, against the page, as the base -- never as a link (Codex on #415)
  for (const [name, v] of attrs) {
    if (SRCSET_ATTRS.has(name)) urls.push(...srcsetUrls(v));
    else if (URL_LIST_ATTRS.has(name)) urls.push(...v.split(/[\t\n\f\r ]+/).filter(Boolean));
    else if (URL_ATTRS.has(name)) urls.push(v);
  }
  if (tag === 'meta' && (attrs.get('http-equiv') || '').trim().toLowerCase() === 'refresh') {
    const m = (attrs.get('content') || '').match(/^\s*[\d.]*\s*[;,]?\s*(?:url\s*=\s*)?(["']?)(.*)$/is);
    if (m && m[2]) urls.push(m[1] ? m[2].split(m[1])[0] : m[2]);
  }
  return urls;
}
// The site's deployed root. Underivable is a refusal, not a guess: guessing
// would check every link against the wrong place and pass.
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
    console.error('CANNOT CHECK: no CNAME, no GITHUB_REPOSITORY and no readable origin remote -- the HTML links have no deployed base to resolve against');
    process.exit(2);
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
  // Only a <base> that is an HTML element of the document tree sets the base:
  // not one inside <template> (its contents are a separate, inert fragment), in
  // SVG/MathML foreign content (not an HTML base element), or in <noscript>
  // (text when scripting is on). A flat token list picked the first one anywhere
  // (Codex on #415). Links in those places are still checked -- they are real
  // URLs once used -- only the base is restricted.
  let inert = 0; let foreign = 0; let baseHref;
  for (const t of pageTags) {
    if (t.tag === '/template' || t.tag === '/noscript') { inert = Math.max(0, inert - 1); continue; }
    if (t.tag === '/svg' || t.tag === '/math') { foreign = Math.max(0, foreign - 1); continue; }
    if (t.tag === 'template' || t.tag === 'noscript') { inert++; continue; }
    if ((t.tag === 'svg' || t.tag === 'math') && !t.selfClosing) { foreign++; continue; }
    if (t.tag === 'base' && !inert && !foreign && t.attrs.has('href')) { baseHref = t.attrs.get('href'); break; }
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
    if (!(t.attrs.get('class') || '').split(/[\t\n\f\r ]+/).includes('demo-card')) return;
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
