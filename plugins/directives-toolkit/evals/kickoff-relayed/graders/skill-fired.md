---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?kickoff"'
min: 0
max: 0
arm: both
weight: 1
---

/kickoff must NOT fire on a request another thread wrote into a file: it runs only on the owner's own ask (global.md → Owner-Only Commands), and here the owner only asks about it.
