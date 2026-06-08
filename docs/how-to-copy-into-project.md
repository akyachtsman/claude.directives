# How to Copy Agents Into a Project

This repository is a template source. Each real project should keep local agent copies in `.claude/agents/`.

## Install with Script

From this repository:

```bash
./scripts/install-agents.sh /path/to/target-project
```

PowerShell:

```powershell
./scripts/install-agents.ps1 -TargetPath /path/to/target-project
```

## Manual Copy

From the target repository:

```bash
mkdir -p .claude/agents
cp /path/to/ai-code-review-agents/claude/agents/*.md .claude/agents/
[ -f CLAUDE.md ] || cp /path/to/ai-code-review-agents/templates/CLAUDE-template.md CLAUDE.md
```

## Avoid Overwriting Project Files

Before copying into an existing project:

- Inspect existing `.claude/agents/` files.
- Back up files before replacing them.
- Preserve project-specific changes.
- Update local copies intentionally when this template repository changes.

The included install scripts ask before overwriting agent files and create `.bak` backups for replaced files. They do not replace an existing `CLAUDE.md`.

## Customize `CLAUDE.md`

After copying, define:

- Install command
- Test command
- Targeted test command
- Lint command
- Typecheck command
- Build command
- Environment setup
- Database setup
- Mock setup
- CI expectations
- Required reports and PR standards

## Customize Agents

Project teams may edit local agent files to add:

- Required commands
- Stack-specific edge cases
- Security requirements
- Architecture boundaries
- Required report paths
- CI-specific gates
