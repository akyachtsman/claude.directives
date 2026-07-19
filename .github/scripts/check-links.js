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
