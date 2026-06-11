---
description: "Show all my custom skills as a clean menu"
---
List every personal skill by reading the `.claude/skills/` directory in the
current session. For each `<name>.md` file present, read its frontmatter
`description` field. Output a clean table:

| Type this | What it does |
|-----------|--------------|

Sort alphabetically by skill name. Do not hardcode skill names — always read
the live directory so the menu stays accurate as skills are added or removed.

End with: "Type the name to invoke any of these."
