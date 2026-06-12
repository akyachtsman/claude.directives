# AI-First Principles — working guidance

A short, opinionated checklist for working *with* an AI agent on this repo and
downstream projects. Treat it as orientation, not enforced policy — the binding
rules still live in `../directives/` (`global.md`, `design.md`, `test.md`,
`data.md`). Where this guidance and a directive disagree, the directive wins.

> **Attribution.** These nine principles are adapted (paraphrased) from the
> **TechWolf AI-First Toolkit** (`ai-firstify` skill), MIT-licensed.
> Source: <https://github.com/techwolf-ai/ai-first-toolkit> ·
> [principles reference](https://github.com/techwolf-ai/ai-first-toolkit/blob/main/plugins/ai-firstify/skills/ai-firstify/references/principles.md).
> Reworded for our context; original credit to TechWolf.

## The nine principles

1. **You own the output.** The agent is a co-pilot, not the pilot. Your name is
   on everything it ships — review it as if you wrote it, because you did.
2. **Keep the scope narrow.** One clear task per pass. Bundling unrelated goals
   into a single prompt makes results worse, not faster.
3. **Build for yourself first.** Make the tool you'd actually use day to day
   before generalizing it for others — that's how you find what really matters.
4. **Plan before you build.** Iterate on the design in plan mode first; planning
   is far cheaper than rebuilding.
5. **Don't build your own agent.** Lean on Claude Code's built-in capabilities
   instead of embedding bespoke LLM agents inside the app.
6. **Stay on the point.** Keep context relevant — organize files logically and
   keep `CLAUDE.md` clean and focused so the agent isn't reading noise.
7. **Don't skimp on the input.** Detailed prompts, real documentation, and
   concrete examples beat vague instructions every time.
8. **Start from a clean slate.** Clear context between unrelated tasks, and write
   what you learned back into `CLAUDE.md` before switching.
9. **Speak the right language.** For visual work, give screenshots and images —
   the agent reads text and images more reliably than it infers intent from code.

## How this maps to our directives

- Principles 1, 4, 6, 8 are already encoded concretely in `global.md`
  (ownership, plan-first, focused `CLAUDE.md`, session hygiene).
- Principle 5 matches our toolkit posture: we prefer built-in plugins/skills over
  custom embedded agents, and defer generic review to Anthropic-official plugins.
- The rest are good defaults that don't (yet) have a binding rule — use judgment.
