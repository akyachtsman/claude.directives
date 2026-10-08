// Extracts all file paths from backtick references in CLAUDE.md and verifies each exists.
// Two more passes below: doc citations in shipped files, and relative links in HTML pages.
// Paths are matched as: `path/to/file.ext` — must contain a / and a . to qualify.
// Dot-paths (.claude/, .github/) ARE validated here: this script runs only in
// claude.directives CI, where those files are committed. (Downstream projects,
// where dot-paths may not exist until bootstrap, do not run this script.)
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
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
// - each link is resolved by WHATWG URL against the page's own address under a
//   sentinel project root, exactly as a browser resolves it on the deployed
//   site. Another origin is external and skipped; same origin but outside the
//   root (a root-relative "/x", or too many "..") FAILS, since on the project
//   site it leaves the repo's pages altogether.
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'poster', 'action', 'formaction', 'data', 'cite', 'manifest', 'longdesc', 'background']);
const NAMED_REFS = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
const decodeRefs = (v) => v.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt);?/gi, (m, r) => {
  const k = r.toLowerCase();
  if (k[0] !== '#') return NAMED_REFS[k];
  return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
});
function tags(src) {
  const out = []; const lower = src.toLowerCase(); const n = src.length; let i = 0;
  const upTo = (s, from, what) => { const e = src.indexOf(s, from); if (e < 0) throw new Error(`unterminated ${what} at offset ${from}`); return e; };
  while ((i = src.indexOf('<', i)) >= 0) {
    if (src.startsWith('<!--', i)) { i = upTo('-->', i + 4, 'comment') + 3; continue; }
    if ('!?/'.includes(src[i + 1] ?? 'x')) { i = upTo('>', i, 'declaration or end tag') + 1; continue; }
    if (!/[A-Za-z]/.test(src[i + 1] ?? '')) { i++; continue; } // a bare "<" in text
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const tag = lower.slice(i + 1, j); const attrs = new Map();
    for (;;) {
      while (j < n && /[\s/]/.test(src[j])) j++;
      if (j >= n) throw new Error(`unterminated <${tag}> at offset ${i}`);
      if (src[j] === '>') { j++; break; }
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
    out.push({ tag, attrs });
    i = RAW_TEXT.has(tag) ? (() => { const e = lower.indexOf(`</${tag}`, j); if (e < 0) throw new Error(`unterminated <${tag}> at offset ${i}`); return e; })() : j;
  }
  return out;
}
// The URL values one tag carries: URL attributes, each srcset candidate, and a
// meta refresh's target, parsed as the spec's refresh algorithm reads it.
function linksOf({ tag, attrs }) {
  const urls = [];
  for (const [name, v] of attrs) {
    if (!URL_ATTRS.has(name)) continue;
    if (name === 'srcset') urls.push(...v.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean));
    else urls.push(v);
  }
  if (tag === 'meta' && (attrs.get('http-equiv') || '').trim().toLowerCase() === 'refresh') {
    const m = (attrs.get('content') || '').match(/^\s*[\d.]*\s*[;,]?\s*(?:url\s*=\s*)?(["']?)(.*)$/is);
    if (m && m[2]) urls.push(m[1] ? m[2].split(m[1])[0] : m[2]);
  }
  return urls;
}
const ROOT = new URL('https://pages.invalid/__project_root__/');
const htmlPages = execFileSync('git', ['ls-files', '-z', '*.html'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(isFile);  // a deleted or replaced page is not read -- the pages linking to it report it
let htmlLinks = 0;
for (const page of htmlPages) {
  let pageTags;
  try { pageTags = tags(readFileSync(page, 'utf8')); } catch (e) {
    console.error(`UNREADABLE: ${page}: ${e.message} -- its links cannot be checked`);
    failed = true; continue;
  }
  const base = new URL(page, ROOT);
  for (const raw of pageTags.flatMap(linksOf)) {
    let url;
    try { url = new URL(raw, base); } catch { console.error(`MISSING: ${page} links "${raw}", which is not a valid URL`); failed = true; continue; }
    if (url.origin !== ROOT.origin) continue; // another site, any scheme: not this tree's to check
    htmlLinks++;
    if (!url.pathname.startsWith(ROOT.pathname)) {
      console.error(`MISSING: ${page} links "${raw}", which resolves to ${url.pathname} -- outside the Pages project root, so it leaves this repo's site`);
      failed = true; continue;
    }
    const rel = decodeURIComponent(url.pathname.slice(ROOT.pathname.length));
    const target = rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
    if (isFile(target) || isFile(join(target, 'index.html'))) continue;
    console.error(`MISSING: ${page} links "${raw}" -> ${target}, which is not a regular file — the published link would 404`);
    failed = true;
  }
}
console.log(`OK:     ${htmlLinks} same-site link(s) across ${htmlPages.length} HTML page(s) checked`);

if (failed) {
  console.error('\nOne or more referenced paths do not exist in the repo.');
  process.exit(1);
}
