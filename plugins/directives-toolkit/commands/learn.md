---
description: "Use when a session surfaces a durable lesson — pattern, pitfall, preference, architecture decision, or tool fact. Appends a confidence-scored entry to learnings.jsonl."
phase: reflect
---
Run the **Reflect** phase: capture a durable lesson as compounding project
memory. This is the queryable upgrade to `/handoff-session`'s one-shot snapshot
(see `docs/guides/dev-pipeline.md`). Browser-only — a repo file plus read/append, no
CLI or daemon.

**Store:** `learnings.jsonl` at the repo root — **committed** (so it survives
ephemeral web containers), one JSON object per line:

```json
{"ts":"2026-06-21T07:00:00Z","type":"pitfall","key":"apt-blocked-pip-ok","text":"Web env blocks apt mirrors but PyPI is reachable — install CLI tools via pip wheels, not apt.","confidence":8,"files":[],"slug":null}
```

Fields: `ts` (ISO-8601) · `type` (`pattern` | `pitfall` | `preference` |
`architecture` | `tool`) · `key` (short stable id) · `text` (the lesson) ·
`confidence` (1–10) · `files` (paths it concerns) · `slug` (optional feature).

**Recording (this command):**
1. Decide the `type` and a short stable `key`. Grep `learnings.jsonl` for that
   key first.
2. **Append** a new line (never rewrite history). If the key exists, append the
   updated entry anyway — consumers take **latest-key-wins**, so the newest line
   supersedes. Set `confidence` honestly (raise it when a lesson re-confirms).
3. Create `learnings.jsonl` if absent; keep it valid JSONL (one object per line).
4. **Cap `text` at ~60 words.** This file is read at session start, so every entry
   is a permanent per-session cost, the same as a directive line — and unlike a
   directive nothing else bounds it. State the lesson and the trigger that should
   recall it; the incident, the diagnosis and the alternatives weighed belong in
   the commit or PR that produced them (`global.md` → *Plain Language First*). If
   an entry cannot be said in 60 words it is usually two entries, or it belongs in
   CLAUDE.md as a rule rather than here as a memory.

**Budget and compaction:** the per-entry cap slows growth but does not bound the
file — distinct keys are unlimited and every update appends another line. Keep the
file under **40 live entries / ~3,000 tokens**. On exceeding it, run a
**compaction**: drop lines superseded by a later same-key entry (they are already
inert under latest-key-wins), merge entries that state one lesson, and delete any
whose rule now lives in CLAUDE.md or a directive.

Compaction is the **one** exception to append-only, and it carries conditions: it
is its own commit touching nothing else, every rewritten entry is re-stamped with
the compaction date so no `ts` outlives the text it labels, and the superseded
lines stay recoverable in git history — which is the archive, and is not read at
session start. A rewrite that skips any of those is history loss, not compaction.

**Consulting (the other half — done by other phases):** at session start and
before recommending, grep `learnings.jsonl` for entries relevant to the files or
topic at hand and weigh them by `confidence`. `/diagnose` does this first;
high-confidence `pitfall`/`preference` entries should steer the work.

`/handoff-session` still writes the one-shot session snapshot; `/learn` is the
durable, accumulating layer. Don't delete `/handoff-session` — they're
complementary.
