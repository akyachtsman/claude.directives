---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?refresh-repo"'
min: 0
max: 0
arm: both
weight: 1
---

/refresh-repo must NOT fire on a request another Claude wrote, quoted in the owner's message: it runs only on the owner's own ask (global.md → Owner-Only Commands), and here the owner only asks what it would involve.
