// Extracts all file paths from backtick references in CLAUDE.md and verifies each exists.
// Two more passes below: doc citations in shipped files, and relative links in HTML pages.
// Paths are matched as: `path/to/file.ext` — must contain a / and a . to qualify.
// Dot-paths (.claude/, .github/) ARE validated here: this script runs only in
// claude.directives CI, where those files are committed. (Downstream projects,
// where dot-paths may not exist until bootstrap, do not run this script.)
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, posix } from 'path';
import { execFileSync } from 'child_process';
import { parse as parseHtml } from 'parse5';

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
// tracked regular file -- or a directory holding index.html, which is what Pages
// serves for it. Nothing else here resolves an HTML link to the tree:
// check-links.js reads only Markdown, and html-validate never touches the
// filesystem. This is what survived of check-landing-cards.js when the two
// landing pages merged (2026-10-08): the sync half went, the target half is
// whole-class now -- every page, every URL-bearing attribute, the redirect stubs.
//
// Pages are read by parse5 (pinned in qa.yml), a spec-complete HTML parser:
// tokenization, character references, foreign content and integration points,
// breakouts, templates, scripting-dependent <noscript>, the parser's own
// rewrites (<image> -> <img>) -- all as a browser does them. A hand-written
// tokenizer stood here first; #415's review rounds found a new corner of the
// spec it missed on almost every pass, so the owner chose the parser over the
// 2026-08-22 "no parser dependency" ruling, for this check (2026-10-09).
//
// Each link is resolved by WHATWG URL against the page's DEPLOYED address, as
// a browser resolves it there. A URL inside the site root must name a published
// file. A RELATIVE reference resolving outside it (a root-relative "/x", or too
// many "..") FAILS: on a project site it can only leave the site by mistake. An
// absolute URL outside it is someone else's page, external like any origin.
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const NS = { html: 'http://www.w3.org/1999/xhtml', svg: 'http://www.w3.org/2000/svg', math: 'http://www.w3.org/1998/Math/MathML', xlink: 'http://www.w3.org/1999/xlink' };
// Which HTML attributes carry URLs, by the HTML spec's attribute index -- every
// attribute it types as a URL, a URL list or a srcset, on the elements it names
// -- plus the obsolete URL attributes browsers still fetch. Keyed by element:
// on a custom element, data="..." is component state, not a link.
const URL_ATTRS = {
  href: ['a', 'area', 'link'],
  src: ['audio', 'embed', 'iframe', 'img', 'input', 'script', 'source', 'track', 'video', 'frame'],
  action: ['form'], formaction: ['button', 'input'], cite: ['blockquote', 'del', 'ins', 'q'],
  data: ['object'], poster: ['video'], manifest: ['html'], longdesc: ['img', 'iframe', 'frame'],
  background: ['body', 'table', 'td', 'th'], lowsrc: ['img'], dynsrc: ['img'], profile: ['head'],
};
const SRCSET_ATTRS = { srcset: ['img', 'source'], imagesrcset: ['link'] };
const URL_LIST_ATTRS = { ping: ['a', 'area'] }; // space-separated URLs
const on = (table, name, tag) => Object.hasOwn(table, name) && table[name].includes(tag);
// SVG elements whose href is a URL; xlink:href is a URL on any SVG/MathML
// element, and MathML Core makes href global on MathML elements.
const SVG_HREF = ['a', 'image', 'use', 'feimage', 'textpath', 'mpath', 'pattern', 'lineargradient',
  'radialgradient', 'filter', 'script', 'animate', 'animatemotion', 'animatetransform', 'set', 'cursor'];
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
// The URL values one element carries. A meta refresh is per DOCUMENT, not per
// element: see refreshTarget().
function linksOf(el) {
  const tag = el.tagName.toLowerCase(); const urls = [];
  for (const { name, value: v, namespace } of el.attrs) {
    if (el.namespaceURI === NS.html) {
      if (tag === 'base') continue; // it sets the resolution base; nothing is fetched from it
      if (on(SRCSET_ATTRS, name, tag)) urls.push(...srcsetUrls(v));
      else if (on(URL_LIST_ATTRS, name, tag)) urls.push(...v.split(/[\t\n\f\r ]+/).filter(Boolean));
      else if (!namespace && on(URL_ATTRS, name, tag)) urls.push(v);
    } else if (namespace === NS.xlink && name === 'href') urls.push(v);
    else if (!namespace && name === 'href'
      && (el.namespaceURI === NS.math || (el.namespaceURI === NS.svg && SVG_HREF.includes(tag)))) urls.push(v);
  }
  return urls;
}
// Elements in tree order. Template contents are a separate, inert fragment:
// yielded with inTemplate so the base, refresh and card checks can skip them
// while their links are still read -- once instantiated they are real links.
function* elements(node, inTemplate = false) {
  for (const c of node.childNodes || []) {
    if (!c.tagName) continue;
    yield { el: c, inTemplate };
    yield* elements(c, inTemplate);
    if (c.content) yield* elements(c.content, true);
  }
}
const attr = (el, n) => el.attrs.find((a) => a.name === n && !a.namespace)?.value;
// The spec's shared declarative refresh steps over the document's metas, in
// tree order: the first that SUCCEEDS sets the "will declaratively refresh"
// flag and every later one is ignored. A value with no leading delay fails;
// so does a URL that does not parse, or a javascript: one -- and a failed one
// does not set the flag, so a later one can still run.
const REFRESH = /^[\t\n\f\r ]*(?:\d|(?=\.))[\d.]*(?:$|[\t\n\f\r ;,][\t\n\f\r ]*[;,]?[\t\n\f\r ]*(?:url[\t\n\f\r ]*=[\t\n\f\r ]*)?(["']?)(.*))$/is;
function refreshTarget(live, base) {
  for (const { el } of live) {
    if (el.namespaceURI !== NS.html || el.tagName !== 'meta') continue;
    if ((attr(el, 'http-equiv') || '').trim().toLowerCase() !== 'refresh') continue;
    const m = (attr(el, 'content') || '').match(REFRESH);
    if (!m) continue;
    const raw = m[2] ? (m[1] ? m[2].split(m[1])[0] : m[2]) : '';
    if (!raw) return null; // a reload: succeeds, and navigates nowhere new
    let u; try { u = new URL(raw, base); } catch { continue; }
    if (u.protocol === 'javascript:') continue;
    return raw;
  }
  return null;
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
// permalinks and _config.yml -- so the file is REQUIRED, and its absence is a
// refusal, not a guess.
if (!tracked.has('.nojekyll')) {
  console.error('CANNOT CHECK: no tracked .nojekyll -- Pages would run Jekyll, and what it publishes is not the tracked tree this check resolves links against');
  process.exit(2);
}
const published = (p) => tracked.has(p) && isFile(p);
const htmlPages = execFileSync('git', ['ls-files', '-z', '*.html'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(isFile);  // a deleted or replaced page is not read -- the pages linking to it report it
let htmlLinks = 0;
// One document's links, each paired with the base it resolves against.
// Two parses: scripting on is what most visitors get, and decides the base and
// the refresh; scripting off is what <noscript> visitors get, and its
// <noscript> content is markup whose links are read too. An <iframe srcdoc> is
// a document the browser renders, so it is read the same way, recursively,
// with this document's base as its fallback base (spec; Codex on #415).
function documentLinks(html, fallback) {
  const doc = parseHtml(html, { scriptingEnabled: true, sourceCodeLocationInfo: true });
  const all = [...elements(doc)];
  const live = all.filter((e) => !e.inTemplate);
  const noscriptLinks = [];
  (function walk(node, inNoscript) {
    for (const c of node.childNodes || []) {
      if (!c.tagName) continue;
      const here = inNoscript || (c.namespaceURI === NS.html && c.tagName === 'noscript');
      if (inNoscript) noscriptLinks.push(...linksOf(c));
      walk(c, here);
    }
  })(parseHtml(html, { scriptingEnabled: false }), false);
  // A tag name holding a non-ASCII space, "=", a quote or "<" is an authoring
  // slip (e.g. "<a" + NBSP + "class=..."): the browser makes an unknown element
  // of it, so a card or link there is dead. Refused, never read past.
  const bad = all.find(({ el }) => /[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff="'<]/.test(el.tagName));
  if (bad) throw new Error(`malformed tag name "${bad.el.tagName.slice(0, 40)}" -- a non-ASCII space or attribute text inside a tag name`);
  // The document base URL, as a browser sets it: the first HTML <base> in the
  // tree that HAS an href, resolved against the fallback; the fallback when
  // there is none or it does not parse. The parser has already decided
  // placement -- a <base> inside <select> is dropped, one in SVG is not an HTML
  // base, one in <template> is not in the tree.
  const baseEl = live.find(({ el }) => el.namespaceURI === NS.html && el.tagName === 'base' && attr(el, 'href') !== undefined);
  // A Content-Security-Policy base-uri directive can block that <base>; CSP
  // enforcement is not modelled here, so the combination is refused rather
  // than guessed (Codex on #415). No page here sets a CSP.
  if (baseEl && live.some(({ el }) => el.namespaceURI === NS.html && el.tagName === 'meta'
    && (attr(el, 'http-equiv') || '').trim().toLowerCase() === 'content-security-policy'
    && /(?:^|;)[\t\n\f\r ]*base-uri\b/i.test(attr(el, 'content') || ''))) {
    throw new Error('a <base> together with a Content-Security-Policy base-uri directive -- whether the policy blocks the base is CSP enforcement this check does not model; drop one of them');
  }
  let base = fallback;
  if (baseEl) { try { base = new URL(attr(baseEl.el, 'href'), fallback); } catch { base = fallback; } }
  const refresh = refreshTarget(live, base);
  const links = all.flatMap(({ el }) => linksOf(el)).concat(noscriptLinks, refresh ? [refresh] : [])
    .map((raw) => ({ raw, base }));
  for (const { el } of all) {
    const srcdoc = el.namespaceURI === NS.html && el.tagName === 'iframe' ? attr(el, 'srcdoc') : undefined;
    if (srcdoc !== undefined) links.push(...documentLinks(srcdoc, base).links);
  }
  return { live, links };
}
for (const page of htmlPages) {
  const pageUrl = new URL(page, ROOT);
  let d;
  try { d = documentLinks(readFileSync(page, 'utf8'), pageUrl); } catch (e) {
    console.error(`UNREADABLE: ${page}: ${e.message}`);
    failed = true; continue;
  }
  const { live } = d;
  // The landing-card assertions check-landing-cards.js made that still mean
  // something with one page: each live .demo-card is an HTML <a> with a
  // non-blank href, closed by its own </a> (not implied by the parser); a root
  // card targets docs/site/<filename>.html; and the root page has at least one,
  // or all of this passes vacuously.
  const cardFail = (msg) => { console.error(`MISSING: ${page} ${msg}`); failed = true; };
  let cards = 0;
  for (const { el } of live) {
    if (!(attr(el, 'class') || '').split(/[\t\n\f\r ]+/).includes('demo-card')) continue;
    cards++;
    if (el.namespaceURI !== NS.html || el.tagName !== 'a') { cardFail(`has a .demo-card <${el.tagName}>, not a link -- cards must be anchors`); continue; }
    const href = (attr(el, 'href') || '').trim();
    if (!href) cardFail('has a .demo-card <a> with no href -- the card links nowhere');
    else if (page === 'index.html' && !/^docs\/site\/[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(href)) {
      cardFail(`has a .demo-card href="${href}" -- a root card must be docs/site/<filename>.html`);
    }
    if (!el.sourceCodeLocation?.endTag) cardFail('has a .demo-card <a> not closed by its own </a>');
  }
  if (page === 'index.html' && cards === 0) cardFail('has no .demo-card -- the landing-card checks would pass vacuously');
  for (const { raw, base } of d.links) {
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
