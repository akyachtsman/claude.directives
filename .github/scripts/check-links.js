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
  // A wrapped name arrives joined on a single space; headings never contain a
  // line break, so compare on collapsed whitespace — on BOTH sides. Collapsing
  // only the reference breaks an exact match against a heading that carries a
  // double space.
  const flatten = (s) => s.replace(/\s+/g, ' ').trim();
  // Strip fenced code blocks first, exactly as check-sections.js does: a deleted
  // section whose name survives inside a fenced example would otherwise satisfy
  // the scan and report a broken cross-reference as resolved. Each block is
  // replaced by an equal count of newlines rather than deleted, so a line number
  // computed here is the line number in the source file.
  const stripFences = (content) => content.replace(
    /^```[\s\S]*?^```/gm,
    (block) => '\n'.repeat((block.match(/\n/g) || []).length),
  );
  const headingsOf = (file) => {
    if (!headingCache.has(file)) {
      const heads = existsSync(file)
        ? [...stripFences(readFileSync(file, 'utf8')).matchAll(/^#{1,6}[ \t]+(.+?)\s*$/gm)]
            .map(m => flatten(m[1]))
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
    const want = flatten(section).toLowerCase();
    // Every string contains the empty string, so without this a nameless
    // reference resolves against any file that has a heading at all. The
    // delimiter rules below already reject `*   *`; this is the backstop.
    if (!want) return false;
    return heads.some(h => h.toLowerCase().includes(want));
  };

  // ── Hard wraps are REMOVED before matching, not matched across ──────────────
  // Prose here is wrapped at ~80 columns, so `→ *Parallel Tasking via\n
  // Subagents*` is an ordinary, correct reference — and the original patterns
  // used [^*\n], which cannot cross a newline, so every wrapped reference was
  // INVISIBLE (#363, the #323 fail-open family). Twenty were live here.
  //
  // #365 tried to fix that by letting the NAME pattern span a newline. Six review
  // rounds each found another Markdown construct it should not have spanned — a
  // following `→ *`, the same for `->`, a list bullet — and the exclusion added
  // to stop the first made the checker invent a reference out of prose and fail
  // a valid file. That set is open; the PR was reverted.
  //
  // So the wrap is removed first and the ORIGINAL single-line pattern does the
  // work. `[^*\n]` cannot leave its line, and the line is now the whole
  // paragraph. Block boundaries end a paragraph here, so a bullet or heading
  // stops a name without being named inside a character class.
  const BLOCK_START = /^ {0,3}(?:#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>|\||```|~~~|-{3,}[ \t]*\r?$|\[[^\]]+\]:)/;
  // Returns the joined text plus map[i] = offset in `src` of joined char i.
  const unwrap = (src) => {
    const lines = src.split('\n');
    let out = '';
    const map = [];
    let pos = 0, open = false;
    const emit = (line, from) => {
      for (let k = from; k < line.length; k++) { out += line[k]; map.push(pos + k); }
    };
    for (const line of lines) {
      const blank = /^[ \t\r]*$/.test(line);
      if (blank) {
        out += '\n'; map.push(pos); open = false;
      } else if (!open || BLOCK_START.test(line)) {
        if (open) { out += '\n'; map.push(pos); }
        emit(line, 0); open = true;
      } else {
        // Continuation: the newline and the indent become ONE space.
        const lead = line.length - line.replace(/^[ \t]+/, '').length;
        out += ' '; map.push(pos);
        emit(line, lead);
      }
      pos += line.length + 1;
    }
    out += '\n'; map.push(pos);
    return { text: out, map };
  };

  // Delimiters follow CommonMark's flanking rule: an opening `*` is not followed
  // by a space, a closing `*` is not preceded by one. That is what keeps
  // `→ *Decoy → *Missing*` from parsing as a reference named `Decoy →` — the
  // candidate closer sits after a space, so it cannot close, and the real
  // reference to `Missing` is found instead. It also rejects `*   *` outright,
  // and `**bold**`, without either being enumerated as a special case.
  const OPEN = String.raw`\*(?![\s*])`;
  const CLOSE = String.raw`(?<![\s*])\*`;
  const NAME = String.raw`([^*\n]+?)`;
  const ARROW = String.raw`(?:→|->)`;
  // `foo.md` → *Bar*  |  `foo.md` -> *Bar*   (explicit file)
  const XREF_FILE = new RegExp(
    String.raw`\`([A-Za-z0-9_./-]+\.md)\`[ \t]*` + ARROW + `[ \t]*` + OPEN + NAME + CLOSE, 'g');
  // → *Bar*   with no file named: the current file. A LOOKBEHIND, not a consumed
  // character, so the match index IS the arrow — consuming it reported a
  // reference at column 1 against the line above itself.
  const XREF_SELF = new RegExp(
    String.raw`(?<![\`\w])` + ARROW + `[ \t]*` + OPEN + NAME + CLOSE, 'g');

  let xrefs = 0, badXrefs = 0;
  for (const file of findMarkdown('.')) {
    // Fence-stripped on the SOURCE side as well as the target side: an
    // illustrative block showing the `foo.md` -> *Bar* syntax is sample text, not
    // a live reference, and collecting it fails CI on correct documentation.
    const { text } = unwrap(stripFences(readFileSync(file, 'utf8')));
    const checks = [];
    // Spans the explicit-file form matched, so the self form does not re-flag
    // the same reference as if it named no file.
    const claimed = [];
    for (const m of text.matchAll(XREF_FILE)) {
      const idx = m.index ?? 0;
      claimed.push([idx, idx + m[0].length]);
      checks.push([m[1], m[2], true]);
    }
    for (const m of text.matchAll(XREF_SELF)) {
      const idx = m.index ?? 0;
      if (claimed.some(([a, b]) => idx >= a && idx < b)) continue;
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
          // It PARSED, so it belongs in the fraction. Counting it only as a
          // printed error left `0/0 … resolve` next to a failure.
          failed = true; xrefs++; badXrefs++;
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
  // A fraction counting only what was PARSED reads as full coverage, and that
  // misreading is half of #363. The scope is stated rather than the exceptions
  // enumerated — #365 proved that list cannot be built by pattern-matching.
  console.log(`OK:   ${xrefs - badXrefs}/${xrefs} PARSED section cross-references resolve to a heading`);
  console.log('      PARSED = the italic `file.md` → *Name* and → *Name* forms ONLY. A reference');
  console.log('      written any other way is absent from that fraction and is NOT verified (#366).');
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
