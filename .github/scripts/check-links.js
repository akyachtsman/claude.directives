import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

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

const urls = new Set();
for (const file of findMarkdown('.')) {
  const content = readFileSync(file, 'utf8');
  for (let url of content.match(URL_RE) ?? []) {
    url = url.replace(/[.,;:]+$/, ''); // strip trailing prose punctuation
    // Skip template placeholder URLs (e.g. .../<repo>/<ref>/<path>) — they are
    // documentation examples, not real links to resolve. [bracketed] likewise.
    if (url.includes('<') || url.includes('[')) continue;
    urls.add(url);
  }
}

const isInternal = url => url.includes(`raw.githubusercontent.com/${REPO}`);

// Map an internal raw URL to the repo-relative path it names.
// https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path...> → <path...>
const internalPath = url => {
  const m = url.match(new RegExp(`raw\\.githubusercontent\\.com/${REPO}/[^/]+/(.+)$`));
  return m ? m[1] : null;
};

const targets = [...urls].filter(url =>
  mode === '--internal' ? isInternal(url) :
  mode === '--external' ? !isInternal(url) :
  true
);

// Auth only for GitHub-hosted URLs; the token is expanded by the shell from the
// environment, never interpolated into the command string (process-listing safe).
const hasToken = Boolean(process.env.GITHUB_TOKEN);
const authHeaderFor = url =>
  hasToken && /https:\/\/(raw\.githubusercontent\.com|api\.github\.com|github\.com)\//.test(url)
    ? '-H "Authorization: Bearer $GITHUB_TOKEN"'
    : '';

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

// External links: verify over the network with retry.
const externalTargets = targets.filter(url => !isInternal(url));
for (const url of externalTargets) {
  let ok = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execSync(`curl -sfL --max-time 10 ${authHeaderFor(url)} "${url}" -o /dev/null`, { stdio: 'pipe' });
      ok = true;
      break;
    } catch {
      if (attempt < 3) {
        execSync(`sleep ${attempt * 2}`);
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
