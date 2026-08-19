#!/usr/bin/env node
// workflow-ref-guard.mjs — every `workflow_run.workflows:` entry must name a real workflow.
//
// WHY: a `workflow_run` trigger is a hardcoded cross-reference to another workflow's
// display `name:`, and GitHub raises NO error when that name matches nothing. The
// workflow simply never fires. There is no red check, no warning, no run to inspect —
// the gate is just absent, and an absent signal reads as "nothing failed".
//
// Three real instances of that class inside two days in one downstream project
// (apfp.claude, 2026-08-18/19), which is why this exists:
//   • qa-live.yml watched 'pages-build-deployment' after Settings -> Pages -> Source
//     moved to GitHub Actions. The legacy build stopped firing and the authoritative
//     live gate went silent across four merged commits before anyone noticed.
//   • pages-monitor.yml triggered on `page_build`, which is managed-build-only, so it
//     went inert at the same cutover — the second deploy alarm, quiet for the same
//     reason, and unnoticed for a further day.
//   • a ci-monitor template watched QA workflow names that did not exist in the host
//     repo at all. Adopting that drop-in would have left CI Monitor watching nothing.
//
// The third case is the one no reviewer catches: a name resolving to nothing is
// invisible when reading either file alone. Both are internally consistent; only the
// cross-reference is broken.
//
// TWO RULES, and neither implies the other:
//   1. every name that IS listed must resolve                  (ALLOWED_EXTERNAL below)
//   2. every name that MUST be watched must be listed          (REQUIRED below)
// Rule 1 alone is blind to a watcher deleted outright — it dangles nothing and sails
// through. Adopting an upstream template verbatim is exactly how that happens.
//
// ⚠️ SCOPE — READ BEFORE TRUSTING A GREEN RUN. This checks that a referenced name
// EXISTS. It does NOT check that the referenced workflow still FIRES. It would NOT have
// caught the first case above: 'pages-build-deployment' is a real, still-"active"
// GitHub-managed workflow that had merely stopped being triggered. Liveness needs run
// history, not the tree. Green here means "no dangling reference and no missing required
// watcher" — never "all my triggers fire".
//
// PORTABILITY: no dependencies (no YAML parser required), no network, nothing
// repo-specific. Drop into .github/scripts/ and add to a static-checks job:
//     - name: Workflow cross-reference guard
//       run: node .github/scripts/workflow-ref-guard.mjs
//
// ⚠️ Do NOT add an "optional workflow" exception category to rule 1. A name allowed not
// to resolve is indistinguishable from one that has silently stopped resolving — the very
// failure this catches — and an allow-list of names permitted to dangle is the same
// self-defeating shape as a curated preserve-list. If a workflow is optional, do not
// pre-list it in any watcher; make installing it carry the obligation to add itself.
// ALLOWED_EXTERNAL is a different claim: externally HOSTED, not optional. REQUIRED is the
// INVERSE of an allow-list — it gets louder when something breaks, not quieter.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const workflowDir = join(repoRoot, '.github', 'workflows');

// Workflows that exist on GitHub but are NOT files in .github/workflows/. Add here only
// with a justification — an entry that is merely misspelled belongs in the failure list,
// not in this allow-list.
const ALLOWED_EXTERNAL = new Map([
  [
    'pages-build-deployment',
    'GitHub-managed Pages build (path dynamic/pages/pages-build-deployment). Not a file in ' +
      '.github/workflows/. Still fires when repo visibility is flipped, so a project that has ' +
      'moved to an Actions-sourced Pages workflow should watch BOTH names.',
  ],
]);

// Watchers this repo cannot LOSE.
//
// The rule above checks that every LISTED name resolves. It says nothing about a name
// that is simply GONE. Delete 'Pages' from qa-live's list and what remains
// ('pages-build-deployment') still resolves — so the guard passes and the live gate is
// dead again, exactly as in #849. A refresh that adopts an upstream template verbatim
// is the realistic way that happens, and it is invisible in review because the file it
// produces is internally consistent.
//
// ⚠️ This is the INVERSE of an allow-list, not another one. A permit-list ("these names
// MAY dangle") stays silent when something breaks, which is why that shape self-defeats
// and why the upstream templates refuse to carry one. A require-list ("these names MUST
// be present") gets LOUDER when something breaks. Remove an entry here only when this
// repo genuinely stops needing that watcher — never to make a red build go green.
// Per-project intent — a template cannot know these names, only the RULE. Populate with
// the deploy workflow's own name for each file that must keep watching it.
const REQUIRED = new Map([
  // ['qa-live.yml',      ['<your deploy workflow name>']],
  // ['pages-retry.yml',  ['<your deploy workflow name>']],
  // ['pages-monitor.yml',['<your deploy workflow name>']],
]);

/** Read a YAML scalar that may be single-quoted, double-quoted, or bare with a trailing comment. */
function parseScalar(raw) {
  const s = raw.trim();
  if (!s) return null;
  const q = s[0];
  if (q === "'" || q === '"') {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (q === '"' && c === '\\' && i + 1 < s.length) {
        // YAML decodes these; a raw pass-through turns \u2014 into "u2014" and the
        // name then matches nothing, failing a build over a legal display name.
        const e = s[++i];
        if (e === 'n') out += '\n';
        else if (e === 't') out += '\t';
        else if (e === 'r') out += '\r';
        else if (e === '0') out += '\0';
        else if (e === 'x' || e === 'u' || e === 'U') {
          const width = e === 'x' ? 2 : e === 'u' ? 4 : 8;
          const hex = s.slice(i + 1, i + 1 + width);
          if (new RegExp(`^[0-9a-fA-F]{${width}}$`).test(hex)) {
            out += String.fromCodePoint(parseInt(hex, 16));
            i += width;
          } else out += e;
        } else out += e; // \\ \" \/ and anything else: the character itself
        continue;
      }
      if (c === q) {
        if (q === "'" && s[i + 1] === "'") {
          out += "'";
          i++;
          continue;
        }
        return out;
      }
      out += c;
    }
    return out; // unterminated quote — hand back what we have; YAML lint owns that error
  }
  const comment = s.indexOf(' #');
  return (comment >= 0 ? s.slice(0, comment) : s).trim();
}

/**
 * Drop an unquoted `# …` comment from the end of a line.
 * Needed because a multi-line flow sequence is re-joined into one buffer before it is
 * split, so a comment left in place swallows every item after it on the joined line.
 */
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (q === '"' && c === '\\') i++;
      else if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** Split a YAML flow-sequence body on top-level commas, respecting quotes. */
function splitFlow(inner) {
  const items = [];
  let cur = '';
  let q = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) {
      if (q === '"' && c === '\\' && i + 1 < inner.length) {
        cur += c + inner[++i];
        continue;
      }
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      cur += c;
      continue;
    }
    if (c === ',') {
      items.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) items.push(cur);
  return items;
}

const indentOf = (line) => line.length - line.trimStart().length;
const isSkippable = (line) => !line.trim() || line.trimStart().startsWith('#');

/**
 * Collect every workflow name referenced by a `workflow_run.workflows:` key.
 * Scoped to the region under each `workflow_run:` mapping so an unrelated `workflows:`
 * key elsewhere in the file is never picked up.
 */
/**
 * Indentation of the document's root mapping. Usually 0, but a consistently indented
 * root mapping is legal YAML and GitHub still reads `name:` and `on:` from it.
 */
function rootIndentOf(lines) {
  for (const l of lines) {
    if (isSkippable(l) || /^\s*-/.test(l)) continue;
    if (/^\s*[^\s#][^:]*:/.test(l)) return indentOf(l);
  }
  return 0;
}

/**
 * Lines that are the BODY of a block scalar (`run: |`, `description: >`, …).
 * They are text, not structure: a `run: |` step containing an illustrative
 * `workflow_run:` snippet is not a trigger, and treating it as one fails the build
 * over a comment. Masking them is what keeps this a structural check.
 */
function blockScalarBody(lines) {
  const masked = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*[^\s#][^:]*:\s*[|>][-+]?\d*\s*(#.*)?$/.test(lines[i])) continue;
    const keyIndent = indentOf(lines[i]);
    for (let k = i + 1; k < lines.length; k++) {
      if (lines[k].trim() === '') { masked[k] = true; continue; }
      if (indentOf(lines[k]) <= keyIndent) break;
      masked[k] = true;
    }
  }
  return masked;
}

function referencedWorkflows(lines) {
  const refs = [];
  const masked = blockScalarBody(lines);
  const root = rootIndentOf(lines);

  // Only a `workflow_run:` under the ROOT `on:` mapping is a trigger.
  const inOn = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (masked[i] || isSkippable(lines[i])) continue;
    if (indentOf(lines[i]) !== root || !/^\s*(on|"on"|'on'|True|true):\s*(#.*)?$/.test(lines[i])) continue;
    for (let k = i + 1; k < lines.length; k++) {
      if (isSkippable(lines[k])) { inOn[k] = true; continue; }
      if (indentOf(lines[k]) <= root) break;
      inOn[k] = true;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (masked[i] || !inOn[i]) continue;
    if (!/^\s*workflow_run:\s*(#.*)?$/.test(lines[i])) continue;
    const blockIndent = indentOf(lines[i]);

    for (let j = i + 1; j < lines.length; j++) {
      if (masked[j]) continue;
      if (isSkippable(lines[j])) continue;
      if (indentOf(lines[j]) <= blockIndent) break; // left the workflow_run mapping

      const m = /^\s*workflows:\s*(.*)$/.exec(lines[j]);
      if (!m) continue;
      const rest = stripComment(m[1]).trim();
      const keyIndent = indentOf(lines[j]);

      // Locate the value. A flow sequence may start on this line OR on the next one —
      // `workflows:` followed by `[Pages]` underneath is valid YAML and means the same
      // thing. Treating that as a block sequence finds no `- ` items, yields an EMPTY
      // set, and makes the REQUIRED rule below report a watcher as removed when it is
      // right there (Codex, #852 — reproduced before fixing).
      let flowAt = -1;
      let flowBuf = null;
      if (rest.startsWith('[')) {
        flowAt = j;
        flowBuf = rest;
      } else if (!rest) {
        for (let k = j + 1; k < lines.length; k++) {
          if (isSkippable(lines[k])) continue;
          if (indentOf(lines[k]) <= keyIndent) break;
          const t = stripComment(lines[k]).trim();
          if (t.startsWith('[')) {
            flowAt = k;
            flowBuf = t;
          }
          break; // the first meaningful line decides the form
        }
      }

      if (flowAt >= 0) {
        // Flow sequence, possibly spanning lines until brackets balance.
        let buf = flowBuf;
        let k = flowAt;
        let depth = 0;
        const balanced = (s) => {
          depth = 0;
          let q = null;
          for (let x = 0; x < s.length; x++) {
            const c = s[x];
            if (q) {
              // splitFlow already honours escapes; this scanner must too, or a name
              // containing \" followed by ] ends the sequence early and truncates.
              if (q === '"' && c === '\\') { x++; continue; }
              if (c === q) q = null;
              continue;
            }
            if (c === "'" || c === '"') q = c;
            else if (c === '[') depth++;
            else if (c === ']') depth--;
          }
          return depth <= 0;
        };
        while (!balanced(buf) && k + 1 < lines.length) {
          buf += ' ' + stripComment(lines[++k]).trim();
        }
        const inner = buf.slice(buf.indexOf('[') + 1, buf.lastIndexOf(']'));
        for (const item of splitFlow(inner)) {
          const name = parseScalar(item);
          if (name) refs.push({ name, line: flowAt + 1 });
        }
      } else if (!rest) {
        // Block sequence on the following lines.
        for (let k = j + 1; k < lines.length; k++) {
          if (isSkippable(lines[k])) continue;
          const item = /^\s*-\s+(.*)$/.exec(lines[k]);
          // YAML allows an INDENTLESS sequence: `- item` at the same column as the
          // key it belongs to. Breaking on `<= keyIndent` skipped those entirely —
          // rule 1 then missed dangling names, and a populated REQUIRED entry
          // reported a correctly-listed watcher as removed. Accept an item at the
          // key's own indent; anything shallower, or not an item, has left the value.
          if (!item) break;
          if (indentOf(lines[k]) < keyIndent) break;
          const name = parseScalar(item[1]);
          if (name) refs.push({ name, line: k + 1 });
        }
      }
    }
  }
  return refs;
}

const files = readdirSync(workflowDir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort();

if (!files.length) {
  console.error('❌ workflow-ref-guard: no workflow files found — wrong path?');
  process.exit(1);
}

// Every workflow's declared display name, which is what workflow_run matches on.
const declared = new Map(); // name -> file
for (const f of files) {
  const text = readFileSync(join(workflowDir, f), 'utf8');
  const wfLines = text.split(/\r?\n/);
  const wfRoot = rootIndentOf(wfLines);
  const wfMasked = blockScalarBody(wfLines);
  let m = null;
  for (let i = 0; i < wfLines.length; i++) {
    if (wfMasked[i] || isSkippable(wfLines[i])) continue;
    if (indentOf(wfLines[i]) !== wfRoot) continue;
    const nm = /^\s*name:\s*(.+)$/.exec(wfLines[i]);
    if (nm) { m = nm; break; }
  }
  if (!m) {
    console.error(
      `❌ workflow-ref-guard: ${relative(repoRoot, join(workflowDir, f))} has no top-level ` +
        `\`name:\`. GitHub falls back to the file path, which no workflow_run list can ` +
        `reliably reference — give it an explicit name.`
    );
    process.exit(1);
  }
  declared.set(parseScalar(m[1]), f);
}

const errors = [];
let checked = 0;

const seenPerFile = new Map();

for (const f of files) {
  const lines = readFileSync(join(workflowDir, f), 'utf8').split('\n');
  const refs = referencedWorkflows(lines);
  seenPerFile.set(f, new Set(refs.map((r) => r.name)));
  for (const { name, line } of refs) {
    checked++;
    if (declared.has(name) || ALLOWED_EXTERNAL.has(name)) continue;
    errors.push(
      `.github/workflows/${f}:${line} — workflow_run watches "${name}", which is not the ` +
        `\`name:\` of any workflow in this repo.\n` +
        `      A workflow_run naming something that does not exist NEVER FIRES, and GitHub ` +
        `reports no error.\n` +
        `      Valid names here: ${[...declared.keys()].map((n) => `"${n}"`).join(', ')}\n` +
        `      If it is a GitHub-managed workflow, add it to ALLOWED_EXTERNAL with a justification.`
    );
  }
}

// Rule 2 — a required watcher may never go missing (see REQUIRED above).
for (const [file, names] of REQUIRED) {
  const seen = seenPerFile.get(file);
  if (!seen) {
    errors.push(
      `.github/workflows/${file} — REQUIRED to watch ${names.map((n) => `"${n}"`).join(', ')}, ` +
        `but the file is missing. If it was deliberately removed, drop its REQUIRED entry too.`
    );
    continue;
  }
  for (const n of names) {
    if (seen.has(n)) continue;
    errors.push(
      `.github/workflows/${file} — no longer watches "${n}", which this repo REQUIRES.\n` +
        `      Dropping it does NOT dangle anything, so the resolve rule above stays green ` +
        `while the trigger goes dead — that is #849 exactly.\n` +
        `      Most likely cause: an upstream template was adopted verbatim. Re-add "${n}" ` +
        `rather than deleting the REQUIRED entry.`
    );
  }
}

if (errors.length) {
  console.error('❌ workflow-ref-guard: FAILED\n');
  for (const e of errors) console.error('  • ' + e + '\n');
  process.exit(1);
}

console.log(
  `✅ workflow-ref-guard: ${checked} workflow_run reference(s) across ${files.length} ` +
    `workflow(s) — all resolve, and ${REQUIRED.size} required watcher(s) intact. ` +
    `(Existence only; does not prove they still fire.)`
);
