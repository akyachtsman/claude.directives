---
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
plugins: ["../.."]
---
That took us an hour: the CDN serves the old app.js for ten minutes after every deploy, so a fetch without a cache-busting query says nothing about whether the deploy went live. That's going to bite us again — make sure future sessions know it.
