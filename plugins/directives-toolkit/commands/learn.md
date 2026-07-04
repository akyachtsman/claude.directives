---
description: "Use when a session surfaces a durable lesson — a pattern, pitfall, preference, architecture decision, or tool fact worth keeping. Appends a typed, confidence-scored entry to learnings.jsonl so future sessions consult it before recommending."
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

**Consulting (the other half — done by other phases):** at session start and
before recommending, grep `learnings.jsonl` for entries relevant to the files or
topic at hand and weigh them by `confidence`. `/diagnose` does this first;
high-confidence `pitfall`/`preference` entries should steer the work.

`/handoff-session` still writes the one-shot session snapshot; `/learn` is the
durable, accumulating layer. Don't delete `/handoff-session` — they're
complementary.
