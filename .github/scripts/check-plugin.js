// Validates the marketplace + plugin structure (the plugin is the canonical
// toolkit source — Phase 2 retired the .claude/ copies).
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';

let failed = false;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; };
const ok = m => console.log(`OK:   ${m}`);

// ── Manifests ────────────────────────────────────────────────────────────────
const mp = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'));
if (!mp.name || !mp.owner?.name || !Array.isArray(mp.plugins)) fail('marketplace.json missing name/owner.name/plugins');
else ok(`marketplace.json (${mp.name}, ${mp.plugins.length} plugin)`);
for (const p of mp.plugins ?? []) {
  if (!p.name || !p.source) fail(`marketplace plugin entry missing name/source`);
  else if (!existsSync(p.source)) fail(`marketplace source missing: ${p.source}`);
  else ok(`plugin source exists: ${p.source}`);
}

const ROOT = 'plugins/directives-toolkit';
const pj = JSON.parse(readFileSync(`${ROOT}/.claude-plugin/plugin.json`, 'utf8'));
if (!pj.name) fail('plugin.json missing name');
else ok(`plugin.json (${pj.name})`);
if (pj.version) fail('plugin.json carries a version field — omit it: updates intentionally track main via git SHA');

// ── Frontmatter helpers ──────────────────────────────────────────────────────
const fm = path => {
  const m = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  return Object.fromEntries([...m[1].matchAll(/^([A-Za-z-]+):\s*(.*)$/gm)].map(x => [x[1], x[2]]));
};

// ── Commands + skills: description, pipeline phase, chain integrity ───────────
// Every command/skill declares a dev-pipeline `phase`; `benefits-from` (optional)
// names the upstream command/skill whose artifact it consumes — the edge must
// resolve to a real item so the chain can never reference a deleted/renamed node.
const PHASES = new Set(['think', 'plan', 'build', 'review', 'test', 'ship', 'reflect', 'cross-cutting']);
const parseList = v => (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);

const cmds = readdirSync(`${ROOT}/commands`).filter(f => f.endsWith('.md'));
const skills = readdirSync(`${ROOT}/skills`).filter(d => statSync(`${ROOT}/skills/${d}`).isDirectory());
const pipelineNames = new Set([...cmds.map(c => c.replace(/\.md$/, '')), ...skills]);

const items = [
  ...cmds.map(c => ({ kind: 'command', name: c.replace(/\.md$/, ''), f: fm(`${ROOT}/commands/${c}`) })),
  ...skills.map(s => ({ kind: 'skill', name: s, f: fm(`${ROOT}/skills/${s}/SKILL.md`) })),
];
for (const { kind, name, f } of items) {
  if (!f?.description) fail(`${kind} ${name}: missing description frontmatter`);
  if (!f?.phase) fail(`${kind} ${name}: missing phase frontmatter`);
  else if (!PHASES.has(f.phase)) fail(`${kind} ${name}: invalid phase "${f.phase}" (expected ${[...PHASES].join('|')})`);
  for (const dep of parseList(f?.['benefits-from'])) {
    if (!pipelineNames.has(dep)) fail(`${kind} ${name}: benefits-from target "${dep}" is not a known command/skill`);
  }
}
ok(`${cmds.length} commands + ${skills.length} skills: description + valid phase, chain resolves`);

// ── Agents (flat, unique names) ──────────────────────────────────────────────
const agents = readdirSync(`${ROOT}/agents`).filter(f => f.endsWith('.md'));
const names = agents.map(a => fm(`${ROOT}/agents/${a}`)?.name).filter(Boolean);
if (names.length !== agents.length) fail('agent missing name frontmatter');
if (new Set(names).size !== names.length) fail('duplicate agent names');
ok(`${agents.length} agents, names unique`);

// ── Hooks ────────────────────────────────────────────────────────────────────
const hooks = JSON.parse(readFileSync(`${ROOT}/hooks/hooks.json`, 'utf8'));
if (!hooks.hooks?.PostToolUse || !hooks.hooks?.PreToolUse) fail('hooks.json missing PostToolUse/PreToolUse');
else ok('hooks.json structure');
if (!(statSync(`${ROOT}/scripts/push-gate.sh`).mode & 0o111)) fail('push-gate.sh not executable');
else ok('push-gate.sh executable');


if (failed) process.exit(1);
console.log('PLUGIN CHECKS PASS');
