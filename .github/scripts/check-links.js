import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

// Recursively collect all .md files, skipping node_modules and .git.
function findMarkdown(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build', 'out'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findMarkdown(full));
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

// --internal: only check links that point at THIS repo. These are verified against
//   the local working tree (the file the URL names must exist in the repo), not over
//   the network — so a freshly consolidated repo's `main`-pinned self-links validate
//   before they have been merged to `main`.
// --external: only check links to other repos / off-repo URLs, verified over the network.
const mode = process.argv[2] ?? '--all';

const REPO = 'akyachtsman/claude.directives';
// All https links, not just raw.githubusercontent.com — otherwise the external
// job silently skips Pages URLs, API endpoints, and other outbound references.
const URL_RE = /https:\/\/[^\s)>'"`]+/g;

// Hosts that bot-protect or auth-gate plain curl (always non-2xx even when the
// URL is valid). Checking them is pure noise — e.g. the claude.ai/code signature
// link, and auth-gated MCP endpoints like Stitch's (require an API-key header).
const SKIP_HOSTS = ['claude.ai', 'stitch.googleapis.com'];

const urls = new Set();
for (const file of findMarkdown('.')) {
  const content = readFileSync(file, 'utf8');
  for (let url of content.match(URL_RE) ?? []) {
    url = url.replace(/[.,;:]+$/, ''); // strip trailing prose punctuation
    // Skip template placeholder URLs (e.g. .../<repo>/<ref>/<path>) — they are
    // documentation examples, not real links to resolve. [bracketed] likewise,
    // and unexpanded shell variables ($var) inside documented code blocks.
    if (url.includes('<') || url.includes('[') || url.includes('$')) continue;
    if (SKIP_HOSTS.some(h => url.startsWith(`https://${h}/`))) continue;
    urls.add(url);
  }
}

const isInternal = url => url.includes(`raw.githubusercontent.com/${REPO}`);

// Map an internal raw URL to the repo-relative path it names.
// https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path...> → <path...>
// The repo name is regex-escaped (it contains a dot) and the ref is constrained
// to the forms we actually pin (main or a commit SHA) — a slash-carrying branch
// ref would otherwise misparse and swallow part of the path.
const REPO_RE = REPO.replace(/[.]/g, '\\.');
const internalPath = url => {
  const m = url.match(new RegExp(`raw\\.githubusercontent\\.com/${REPO_RE}/(?:main|[0-9a-f]{7,40})/(.+)$`));
  return m ? m[1] : null;
};

const targets = [...urls].filter(url =>
  mode === '--internal' ? isInternal(url) :
  mode === '--external' ? !isInternal(url) :
  true
);

// Auth only for GitHub-hosted URLs; the token reaches curl as a config file on
// stdin (never in argv — process-listing safe; never via a shell — URLs are
// harvested from repo markdown, so a shell string would let `${GITHUB_TOKEN}`
// in a crafted link expand and exfiltrate the token).
const hasToken = Boolean(process.env.GITHUB_TOKEN);
const isGithubHost = url =>
  /^https:\/\/(raw\.githubusercontent\.com|api\.github\.com|github\.com)\//.test(url);

let failed = false;

// Internal links: verify the named path exists in the local working tree.
const internalTargets = targets.filter(isInternal);
for (const url of internalTargets) {
  const path = internalPath(url);
  if (path && existsSync(path)) {
    console.log(`OK:   ${url} → ${path}`);
  } else {
    console.error(`FAIL: ${url} → ${path ?? '(unparseable)'} missing in working tree`);
    failed = true;
  }
}

// Section cross-references: `<file>.md` → *Section Name*, and the bare
// `→ *Section Name*` form that means "in this same file". These are the repo's
// densest form of internal reference and nothing validated them, so deleting a
// heading left seven live pointers aimed at nothing while CI stayed green.
// Only .md files are scanned for headings; a reference naming a non-.md file is
// skipped rather than guessed at.
if (mode !== '--external') {
  const headingCache = new Map();
  // Strip fenced code blocks first, exactly as check-sections.js does: a deleted
  // section whose name survives inside a fenced example would otherwise satisfy
  // the scan and report a broken cross-reference as resolved.
  const stripFences = (content) => content.replace(/^```[\s\S]*?^```/gm, '');
  const headingsOf = (file) => {
    if (!headingCache.has(file)) {
      const heads = existsSync(file)
        ? [...stripFences(readFileSync(file, 'utf8')).matchAll(/^#{1,6}[ \t]+(.+?)\s*$/gm)].map(m => m[1])
        : null;
      headingCache.set(file, heads);
    }
    return headingCache.get(file);
  };
  // A heading matches if the referenced name appears in it — headings carry
  // trailing qualifiers ("## Session start — required actions", "## Pipelined
  // Execution (owner ruling, 2026-07-18)") that references legitimately omit.
  const resolves = (file, section) => {
    const heads = headingsOf(file);
    if (heads === null) return null;               // file not found — reported elsewhere
    const want = section.toLowerCase();
    return heads.some(h => h.toLowerCase().includes(want));
  };
  // `foo.md` → *Bar*  |  `foo.md` -> *Bar*   (explicit file)
  const XREF_FILE = /`([A-Za-z0-9_./-]+\.md)`\s*(?:→|->)\s*\*([^*\n]+?)\*/g;
  // → *Bar*   with no file named: the current file
  const XREF_SELF = /(?:^|[^`\w])(?:→|->)\s*\*([^*\n]+?)\*/g;
  let xrefs = 0, badXrefs = 0;
  for (const file of findMarkdown('.')) {
    const content = readFileSync(file, 'utf8');
    const checks = [];
    for (const m of content.matchAll(XREF_FILE)) checks.push([m[1], m[2], true]);
    // Record where the explicit-file form matched, so the self form below does
    // not re-flag the same reference as if it named no file.
    const claimed = [...content.matchAll(XREF_FILE)]
      .map(m => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
    for (const m of content.matchAll(XREF_SELF)) {
      const idx = m.index ?? 0;
      if (claimed.some(([a, b]) => idx >= a - 2 && idx < b)) continue;
      checks.push([file, m[1], false]);
    }
    for (const [target, section, explicit] of checks) {
      // Resolve a bare filename against the repo's known locations.
      let path = target;
      if (explicit && !existsSync(path)) {
        const base = target.split('/').pop();
        const cand = findMarkdown('.').filter(f => f.endsWith('/' + base) || f === base);
        if (cand.length === 1) path = cand[0];
      }
      const r = resolves(path, section);
      if (r === null) {
        // Only a BARE reference (no file named) may be skipped — its target is the
        // current file, which exists by construction. An explicit `foo.md` → *Bar*
        // naming a file nothing can resolve is broken, and no other check covers
        // bare filenames in arbitrary Markdown: silently skipping it reported
        // "0/0 cross-references resolve" and exited 0.
        if (explicit) {
          console.error(`FAIL: ${file}: cross-reference names "${target}", which resolves to no file in the repo`);
          failed = true;
        }
        continue;
      }
      xrefs++;
      if (!r) {
        console.error(`FAIL: ${file}: section cross-reference "${section}" has no matching heading in ${path}`);
        failed = true; badXrefs++;
      }
    }
  }
  console.log(`OK:   ${xrefs - badXrefs}/${xrefs} section cross-references resolve to a heading`);
}

// External links: verify over the network with retry. Authed requests do not
// follow redirects (`-L` forwards the Authorization header cross-host); without
// `-L` a 3xx is a curl success, which is fine — the link resolved.
const externalTargets = targets.filter(url => !isInternal(url));
for (const url of externalTargets) {
  const authed = hasToken && isGithubHost(url);
  const args = [
    '-sf', '--max-time', '10',
    ...(authed ? ['--config', '-'] : ['-L']),
    url, '-o', '/dev/null',
  ];
  let ok = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync('curl', args, {
        stdio: 'pipe',
        input: authed ? `header = "Authorization: Bearer ${process.env.GITHUB_TOKEN}"\n` : '',
      });
      ok = true;
      break;
    } catch {
      if (attempt < 3) {
        execFileSync('sleep', [String(attempt * 2)]);
      }
    }
  }
  if (ok) {
    console.log(`OK:   ${url}`);
  } else {
    console.error(`FAIL: ${url}`);
    failed = true;
  }
}

if (failed) process.exit(1);
