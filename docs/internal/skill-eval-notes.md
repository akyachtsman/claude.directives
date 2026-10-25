# Auto-skill eval notes

Internal. The rule lives in `CLAUDE.md` → *Toolkit (commands, skills, agents, hooks)*;
this file holds how the eval works and the worked measurements behind it, so the
rule text stays short.

Auto-skills (`update-pages`, `scope-chk`, `doc-comp`) fire on description match.
A description that drifts stops firing **silently** — no error, just absence — so
`claude plugin eval` is the only thing that proves they still work.

## Running it

`claude plugin eval` (Anthropic) is the harness. Cases live in
`plugins/directives-toolkit/evals/`, each a `prompt.md` plus a skill-fired grader
under its own `graders/` dir (`type: tool_used`, `tool: Skill`, `input_match` on
the skill name, `arm: both`). Run it from the plugin directory:

```
(cd plugins/directives-toolkit && claude plugin eval --no-publish .)
```

It defaults to `--ablation with-without`, running every case twice: with the
plugin and without it. **`arm: both` is load-bearing**; why is in *What the score
and Δ mean* below. It costs real tokens and is NOT in CI; run it when a
description changes.

**Availability:** `plugin eval` requires Claude Code v2.1.269 or later. If
`claude plugin eval --help` reports no such command, run `claude update` and
check again.

**The durable lesson, and the reason to keep measuring:** a description triggers
on the WORDS a request actually uses, not on what the skill is for. All three
gaps found so far were fixed by rewriting the description against the
measurement (*The three gaps, and what fixed them* below).

## Baseline

2026-09-29, 3 runs/case, with/without ablation arms: 12 of 12 pass, mean Δ +0.75.
All three negatives correctly never fire in either arm. (Previous: 2026-08-19,
2 runs/case, 9 of 9, mean Δ +0.67.)

The cases' frontmatter says `runs: 3`, the baseline's own count. That baseline
covers the 12 auto-skill cases; `/learn`'s two cases (`learn-lesson`,
`learn-negative`) were measured on their own on 2026-10-12: 3 of 3 fired, 3 of 3
silent. The owner-only commands' three cases (`refresh-repo-cmd`,
`refresh-repo-relayed`, `kickoff-relayed`; `directives/global.md` → *Owner-Only Commands*) were
measured on their own on 2026-10-25, when `disable-model-invocation` came off: the
owner's `cmd refresh repo` fired `/refresh-repo` 3 of 3 with the plugin, and a
request quoted from the coordinator or written into a file by another thread
stayed silent 3 of 3 for each command. Re-measure all 17 together on the next
description change.

## What the score and Δ mean (re-checked 2026-10-08)

The harness now treats a `tool_used: Skill` grader specially in a two-arm run.
Its `--ablation` help reads: "under with-without, graders marked with-only,
incl. `tool_used: Skill`, are a plugin-fired indicator rather than part of the
score". The docs page (code.claude.com/docs/en/plugin-evals, *Compare against a
no-plugin baseline*) names the two ways out: a case whose graders are ALL in
that set is scored normally, and "`arm: both` on a grader [scores] it in both
arms regardless".

Every grader in `plugins/directives-toolkit/evals/` sets `arm: both`, and each
case has only that one grader, so both ways out apply and nothing changed for
this suite: the score is whether the skill fired, in both arms. The 2026-09-29
baseline still means what it says. Do not drop `arm: both`, and do not add an
outcome grader beside it without understanding that the Skill grader would then
leave the score unless `arm: both` stays.

What Δ shows here is narrower than "the skill caused the behaviour". The without
arm has no plugin, so the skill cannot fire there: a should-fire case scores 0
in that arm by construction, and its Δ is just the with-arm firing rate. A
should-not-fire case (`min: 0`, `max: 0`) passes in both arms at Δ 0. So the
+0.75 mean is 9 should-fire cases at +1 and 3 negatives at 0. The pass/fail
score per case is the signal; Δ adds nothing a trigger test needs.

## The three gaps, and what fixed them

**`doc-comp` — 0.00 → +1.00.** It fired on "diff the old X against the new X" and
never on "compare these two versions of our X" — identical prompts, one verb
apart. The old description's only strong hook was the word "diff", and it sat in
the output clause. The fix was naming the VERBS a user actually types
(compare / diff / what changed) and the NOUNS (documents, versions, drafts,
revisions), plus stating that it applies to text pasted inline.

**`scope-chk` — flaky at 1 run in 2, then 5/5.** Its trigger was written from the
assistant's side ("before OFFERING work"), while the case it missed was the user
asking directly. Adding that phrasing took it to 5/5 with the plugin and 0/5
without.

**`scope-chk` — 0/2 → 3/3 on `scope-chk-offer` (2026-09-29).** Found live: asked
"where are we at", a session proposed changing another repo without firing the
skill. The case reproduces it — the user names another repo only to ask what is
next, and nobody asks for work there. With the plugin, both runs searched for
the other repo and proposed a change there; one even wrote "I'd use `scope-chk`
first" and did not. The description covered offering work and the user asking
for it, not a message that merely NAMES another repo. Adding "whenever a message
names another repo at all, even only to ask where things stand or what the next
step is" (and "proposing") took it to 3/3 with the plugin, 0/3 without, with
every negative still silent.

## Standing rule

Re-run the negatives whenever a description is widened — over-triggering is the
failure mode a broader description buys, and it is invisible without them.
