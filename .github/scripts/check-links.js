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
  // Every read goes through this. Line endings are normalised to LF ONCE, here,
  // rather than each consumer handling CR for itself.
  //
  // ⚠️ THIS REPLACED THREE SEPARATE CR FIXES, and the third is why. Round 6 found
  // the NAME pattern excluding only `\n`, so a bare CR let two lines be spliced
  // into one invented reference. Round 7 found `lineOf` splitting only on `\n`,
  // so every failure in such a file reported line 1. Round 8 found THIS padding
  // counting only `\n`, so a fenced block collapsed to nothing and the line
  // numbers moved again. Three sites, one mechanism, each fix revealing the next.
  //
  // Normalising at the source makes the class unreachable: nothing downstream can
  // be CR-blind because nothing downstream sees a CR. Line COUNT is preserved —
  // `\r\n` and `\r` each become one `\n` — so a reported line number is still
  // the source file's line number, which is the property the padding exists for.
  //
  // Do NOT reintroduce per-consumer CR handling; add readSource() calls instead.
  const readSource = (file) => readFileSync(file, 'utf8').replace(/\r\n|\r/g, '\n');
  const stripFences = (content) => content.replace(
    /^```[\s\S]*?^```/gm,
    (block) => '\n'.repeat((block.match(/\n/g) || []).length),
  );
  const headingsOf = (file) => {
    if (!headingCache.has(file)) {
      const heads = existsSync(file)
        ? [...stripFences(readSource(file)).matchAll(/^#{1,6}[ \t]+(.+?)\s*$/gm)]
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

  // ── A reference lives on ONE line ───────────────────────────────────────────
  // Prose here wraps at ~80 columns, and the original patterns used [^*\n], so a
  // reference whose italicised name straddled a break was INVISIBLE — it looked
  // verified and was not (#363, the #323 fail-open family). Thirty-seven were
  // live here.
  //
  // Two designs tried to read them anyway and both failed the same way. #365 let
  // the name SPAN a newline; six review rounds each found another Markdown
  // construct it should not have spanned. #367 removed the wrap first by joining
  // hard-wrapped lines; three more rounds found blockquote continuations, a
  // self-closing HTML comment and a multiline code span, because a hand-rolled
  // normaliser has to reimplement Markdown's block structure and that structure
  // is large. Both sets are open.
  //
  // So the SOURCE was fixed instead of the parser: all thirty-seven references
  // were put on one line, and this stays strictly single-line. `[ \t]*` between
  // every token — never `\s*`, which silently spans a newline and was quietly
  // matching seventeen references across a break, some against the WRONG file,
  // because a break between the filename and its arrow left the self form to
  // claim it. The contract is now one sentence: a reference is on one line.
  const ARROW = String.raw`(?:→|->)`;
  // The name may not START with whitespace — `* *` is not a reference, and a
  // whitespace-only name would otherwise be reported as a BROKEN one and fail a
  // valid file. This is the old opener's `(?![\s*])` condition, restated as part
  // of the closed rule rather than hidden in the delimiter.
  //
  // Only `\n` is excluded, not `\r`: readSource() normalises every line ending
  // before this runs, so a CR cannot reach here. The round-6 fix added `\r` and
  // the round-8 redesign made it dead — measured, removing it leaves all cases
  // green. It is gone for the same reason lineOf's was: a redundant guard implies
  // the invariant does not hold, and that is how somebody reintroduces
  // per-consumer CR handling.
  const NAME = String.raw`([^*\n\s][^*\n]*?)`;
  // ── The delimiter rule is a CLOSED, STATED rule — deliberately NOT CommonMark.
  //
  // It was CommonMark's flanking rule for three rounds. Rounds 4, 5 and 6 each
  // found a different cause violating one invariant — *the counted set equals
  // the set CommonMark renders as emphasis*:
  //
  //     round 4   implemented only half of right-flanking
  //     round 5   wrong category set (marks, ZWJ and private-use are not
  //               punctuation; writing the spec's PROSE definition scored 176
  //               disagreements against the bug's 95)
  //     round 6   wrong granularity — scanDelims reads neighbours with charAt,
  //               so it sees a lone surrogate; lookarounds under `u` classify
  //               the whole code point
  //
  // Before escalating I probed ten axes the 1056-pair sweep never touched.
  // SEVEN disagreed, three of them mattering: an escaped closer (`*Name\* x*`),
  // a code span holding a star (`*Na\x60*\x60me*`), and a closer that starts a
  // delimiter run (`*Name**bold**`, which CommonMark renders with NO emphasis at
  // all while this claimed 1/1). Backslash escapes, code spans, delimiter-run
  // length — inline STRUCTURE, which is open in exactly the way Markdown BLOCK
  // structure was open in #365. The same mechanism, one level down.
  //
  // Nothing ever required that invariant. #363 asked for the fraction to stop
  // lying, and two things already do that with zero findings in six rounds: the
  // references are on one line (150 -> 187), and the summary discloses what
  // PARSED means. The invariant was adopted at round 4 in response to a finding
  // about one input, and failed three times.
  //
  // So the open set is replaced by a closed one. A reference is:
  //
  //     a single `*`, then text with no `*` and no line ending, then a single `*`
  //
  // Single means not part of a run, which is what keeps `**bold**` out. That is
  // the whole rule; it is decidable by reading it, and no construct can be
  // "missing" from it, because it does not claim to track anything external.
  // A construct that CommonMark renders differently is OUT OF SCOPE and
  // disclosed on every run, not silently mishandled. All 187 references here
  // satisfy it.
  //
  // `\r` joins `\n` in the exclusion: commonmark's reLineEnding is
  // /\r\n|\n|\r/, and a lone CR inside a name let the checker manufacture
  // "draftcontinued prose" out of two lines and FAIL A VALID FILE — byte for
  // byte the same invented string as round 2, from a different cause.
  const OPEN = String.raw`(?<!\*)\*(?!\*)`;
  const CLOSE = String.raw`\*(?!\*)`;
  // `foo.md` → *Bar*  |  `foo.md` -> *Bar*   (explicit file). The backtick is
  // \x60: `u` mode, required by \p{…}, rejects \` as an invalid identity escape.
  const XREF_FILE = new RegExp(
    String.raw`\x60([A-Za-z0-9_./-]+\.md)\x60[ \t]*` + ARROW + `[ \t]*` + OPEN + NAME + CLOSE, 'gu');
  // → *Bar*   with no file named: the current file. A LOOKBEHIND, not a consumed
  // character, so the match index IS the arrow — consuming it reported a
  // reference at column 1 against the line above itself.
  const XREF_SELF = new RegExp(
    String.raw`(?<![\x60\w])` + ARROW + `[ \t]*` + OPEN + NAME + CLOSE, 'gu');

  let xrefs = 0, badXrefs = 0;
  for (const file of findMarkdown('.')) {
    // Fence-stripped on the SOURCE side as well as the target side: an
    // illustrative block showing the `foo.md` -> *Bar* syntax is sample text, not
    // a live reference, and collecting it fails CI on correct documentation.
    const src = stripFences(readSource(file));
    // 1-based line of a SOURCE offset. Fences are padded rather than deleted,
    // so this is the line in the file on disk.
    // `src` came through readSource(), so every line ending is already LF.
    const lineOf = (off) => src.slice(0, off).split('\n').length;
    const checks = [];
    // Spans the explicit-file form matched, so the self form does not re-flag
    // the same reference as if it named no file.
    const claimed = [];
    for (const m of src.matchAll(XREF_FILE)) {
      const idx = m.index ?? 0;
      claimed.push([idx, idx + m[0].length]);
      checks.push([m[1], m[2], true, idx]);
    }
    for (const m of src.matchAll(XREF_SELF)) {
      const idx = m.index ?? 0;
      if (claimed.some(([a, b]) => idx >= a && idx < b)) continue;
      checks.push([file, m[1], false, idx]);
    }
    for (const [target, section, explicit, off] of checks) {
      const at = `${file}:${lineOf(off)}`;
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
          console.error(`FAIL: ${at}: cross-reference names "${target}", which resolves to no file in the repo`);
          // It PARSED, so it belongs in the fraction. Counting it only as a
          // printed error left `0/0 … resolve` next to a failure.
          failed = true; xrefs++; badXrefs++;
        }
        continue;
      }
      xrefs++;
      if (!r) {
        console.error(`FAIL: ${at}: section cross-reference "${section}" has no matching heading in ${path}`);
        failed = true; badXrefs++;
      }
    }
  }
  // A fraction counting only what was PARSED reads as full coverage, and that
  // misreading is half of #363. The scope is stated rather than the exceptions
  // enumerated — #365 proved that list cannot be built by pattern-matching.
  console.log(`OK:   ${xrefs - badXrefs}/${xrefs} PARSED section cross-references resolve to a heading`);
  console.log('      PARSED = the italic `file.md` → *Name* and → *Name* forms, ON ONE LINE.');
  console.log('      A reference written any other way is absent from that fraction.');
  console.log('      The delimiters are a REPO CONVENTION, not CommonMark emphasis:');
  console.log('        a single `*`, text with no `*` and no line ending, a single `*`.');
  console.log('      A construct CommonMark renders differently — an escaped closer,');
  console.log('      a code span holding a star, a closer starting a delimiter run — is');
  console.log('      OUT OF SCOPE and disclosed here, not tracked. Chasing parity with a');
  console.log('      Markdown parser was an OPEN set: three rounds, three causes, and a');
  console.log('      ten-axis probe then found seven more disagreements. See #366.');
  console.log('      A split reference is worse than absent, in two different ways:');
  console.log('        - a name broken across a line is not parsed, so it is NOT counted;');
  console.log('        - a break between a filename and its arrow IS counted — the arrow line');
  console.log('          is read as a SELF reference and checked against THIS file, not the');
  console.log('          one named, so it can report resolved against the wrong target.');
  console.log('      Keep every reference on one line. Widening what is parsed: #366.');
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
