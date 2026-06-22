# Design tooling — generators & MCP wiring

How a project establishes and builds its look under the per-project design model
(`directives/design.md`). Browser-only; no local install required.

## Generators
- **`frontend-design` (Anthropic skill)** — the primary author. In-session, no
  server or key; installed by the environment setup script
  (`scripts/install-toolkit.sh`). Steer it explicitly: *"plain semantic HTML/CSS,
  no framework, reference `styles/tokens.css`."* It reads attached images, so it
  also covers the image-import path.
- **Google Stitch (optional, visual generator)** — generates UI as HTML/CSS from a
  prompt or image. Wire its **remote** MCP into a Claude Code web session (no
  install): add an MCP server with URL `stitch.googleapis.com/mcp` and an
  `X-Goog-Api-Key` header (key from the Stitch app). A session can then generate a
  screen and pull its HTML. Avoid the third-party `npx` Stitch MCPs — they need a
  local install and break the browser-only constraint.
- **Figma (optional)** — only if you design visually in Figma. For plain-HTML
  output use a *descriptive* Figma MCP (returns structure as JSON; Claude authors
  the markup); the official Figma codegen MCP is React/Tailwind-biased.

## The flow
`/design-intake` (called by `/kickoff`): **import** a look → **distill** to
`styles/tokens.css` + `styles/components.css` + a reference page → **look-gate**
(sign off on the reference page) → `/sdd-loop` **builds the rest** against the
contract. Re-run `/design-intake` any time to re-theme.

## Accessibility guardrail
`templates/scripts/check-contrast.js` (copied into each project's
`.github/scripts/`, run from its `qa.yml`) checks `styles/tokens.css` for any
foreground/background pair below WCAG AA and fails CI if so. It exits with a
notice (no failure) before a project has a `tokens.css`.
