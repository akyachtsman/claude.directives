---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?learn"'
min: 1
arm: both
weight: 1
---

/learn is model-invocable on purpose (global.md routes a lesson that should outlive the next session to learnings.jsonl through it), so a durable lesson must fire it.
