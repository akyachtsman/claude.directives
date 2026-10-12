---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?learn"'
min: 0
max: 0
arm: both
weight: 1
---

/learn must NOT fire on an ordinary question: it appends to a committed file.
