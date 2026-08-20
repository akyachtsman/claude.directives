# Auto-skill eval notes

Internal. The rule lives in `CLAUDE.md` → *Toolkit*; this file holds the worked
measurements behind it, so the rule text stays short.

Auto-skills (`update-pages`, `scope-chk`, `doc-comp`) fire on description match.
A description that drifts stops firing **silently** — no error, just absence — so
`claude plugin eval` is the only thing that proves they still work.

## Baseline

2026-08-19, 2 runs/case, with/without ablation arms: 9 of 9 pass, mean Δ +0.67.
All three negatives correctly never fire in either arm.

## The two gaps, and what fixed them

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

## Standing rule

Re-run the negatives whenever a description is widened — over-triggering is the
failure mode a broader description buys, and it is invisible without them.
