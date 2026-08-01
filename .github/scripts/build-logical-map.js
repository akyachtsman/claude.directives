// Generates docs/site/logical-map.html from EXPORTS.json.
//
// The map used to be hand-maintained HTML that duplicated the manifest, which
// meant it could disagree with the repo silently. Now every file, compartment,
// swap glyph and vendor socket on the page is read from EXPORTS.json at build
// time, and `--check` fails CI when the committed page is stale. What stays here
// is only what the manifest cannot know: where the boxes sit, how the classes
// relate, and the this-repo-only inventory (which is by definition NOT exported,
// so it has no place in the export boundary).
//
// Behaviour lives in docs/site/logical-map.js — hand-written, not generated.
//
//   node .github/scripts/build-logical-map.js          # write the page
//   node .github/scripts/build-logical-map.js --check  # fail if it would change
//
// ESM (matches the other check-*.js).
import { readFileSync, writeFileSync, existsSync } from 'fs';

const OUT = 'docs/site/logical-map.html';
const manifest = JSON.parse(readFileSync('EXPORTS.json', 'utf8'));
const check = process.argv.includes('--check');
let failed = false;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; };

/* ------------------------------------------------------------------ config */
// Default geometry in canvas space. Readers drag and resize from here; their
// layout is stored per-browser, so these are only the starting positions.
const FRAMES = [
  { id: 'standard',     x: 40,   y: 40,  w: 1560, h: 138 },
  { id: 'orchestrator', x: 40,   y: 226, w: 320,  h: 168 },
  { id: 'behavioral',   x: 396,  y: 226, w: 812,  h: 168 },
  { id: 'artifact',     x: 1244, y: 226, w: 356,  h: 168 },
  { id: 'mechanical',   x: 40,   y: 442, w: 1168, h: 212 },
  { id: 'reference',    x: 1244, y: 442, w: 356,  h: 212 },
  // Deliberately NOT full width: the column to its right is the only lane that
  // lets an edge cross from the bottom row to the top one.
  { id: 'external',     x: 40,   y: 702, w: 1168, h: 126 },
  { id: 'self',         x: 40,   y: 876, w: 1560, h: 178 },
];

// Relationship types. Colour carries the KIND, so a reader can follow one kind
// of dependency without untangling it from the others.
const KINDS = {
  con: { label: 'constrains',  hint: 'authority flows down — the target must satisfy the source' },
  seq: { label: 'sequences',   hint: 'defines the order the target runs in' },
  enf: { label: 'enforces',    hint: 'blocks the merge when the standard is violated' },
  pro: { label: 'produces',    hint: 'fills in / emits the target' },
  exp: { label: 'explains',    hint: 'documents, binds nothing', dash: true },
  del: { label: 'delegates',   hint: 'hands the work to a vendor we do not own', dash: true },
  val: { label: 'validates',   hint: 'proves it before it ships downstream', dash: true },
};

const EDGES = [
  { a: 'standard',     b: 'orchestrator', kind: 'con', label: 'constrains' },
  { a: 'standard',     b: 'behavioral',   kind: 'con', label: 'constrains' },
  { a: 'standard',     b: 'mechanical',   kind: 'con', label: 'encoded as gates' },
  { a: 'orchestrator', b: 'behavioral',   kind: 'seq', label: 'sequences' },
  { a: 'mechanical',   b: 'standard',     kind: 'enf', label: 'blocks merge on violation' },
  { a: 'behavioral',   b: 'artifact',     kind: 'pro', label: 'fills in' },
  { a: 'standard',     b: 'reference',    kind: 'exp', label: 'explained by' },
  { a: 'behavioral',   b: 'external',     kind: 'del', label: 'delegates to' },
  { a: 'mechanical',   b: 'external',     kind: 'del', label: 'delegates to' },
  { a: 'self',         b: 'standard',     kind: 'val', label: 'validates before export' },
];

// This repo's own body. Never exported, so it cannot live in EXPORTS.json —
// but every path is existence-checked below, so the list still cannot rot.
const SELF = {
  'self.ops': ['CLAUDE.md', 'EXPORTS.json', 'README.md', '.gitignore',
    '.claude/settings.json', '.claude/directive-sync.json', 'learnings.jsonl'],
  'self.docs': ['docs/README.md', 'docs/internal/design-migration.md',
    'docs/internal/repo-monitors.md'],
  'self.checks': ['.github/scripts/check-exports.js', '.github/scripts/check-links.js',
    '.github/scripts/check-paths.js', '.github/scripts/check-plugin.js',
    '.github/scripts/check-repo-map-ui.js', '.github/scripts/check-secret-scan.js',
    '.github/scripts/check-sections.js', '.github/scripts/build-logical-map.js',
    '.github/scripts/required-sections.json', '.github/scripts/package.json'],
  'self.ci': ['.github/workflows/qa.yml', '.github/workflows/ci-monitor.yml',
    '.github/workflows/ci-notify.yml', '.github/workflows/codex-monitor.yml',
    '.github/workflows/pages-monitor.yml', '.github/workflows/pages-retry.yml'],
  'self.pages': ['index.html', 'docs/site/index.html', 'docs/site/logical-map.html',
    'docs/site/logical-map.js', 'docs/site/commands.html', 'docs/site/react-demo.html',
    'docs/site/vendor/'],
};

const DELIVERY = {
  inh: 'inherited — raw URL, live at the next session start; you do nothing',
  ins: 'installed — plugin, lands when the environment cache rebuilds (~weekly)',
  cop: 'copied — snapshot taken at bootstrap; resync with /refresh-repo',
  ref: 'referenced — read on demand, nothing stored downstream',
  int: 'internal — never leaves this repo',
};

/* --------------------------------------------------------------- prepare */
const esc = s => String(s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const compartmentOf = new Map();
const domainOf = new Map();
for (const [dom, comps] of Object.entries(manifest.domains)) {
  if (dom.startsWith('_')) continue;
  for (const [comp, paths] of Object.entries(comps)) {
    if (comp.startsWith('_')) continue;
    for (const p of paths) { compartmentOf.set(p, `${dom}.${comp}`); domainOf.set(p, dom); }
  }
}

const permanent = new Set(manifest.swap.permanent);
const orchestrators = new Set(manifest.swap.orchestrators);
const socketOf = new Map();
for (const [name, ext] of Object.entries(manifest.externals)) {
  if (name.startsWith('_')) continue;
  for (const s of ext.sockets) socketOf.set(s, [...(socketOf.get(s) ?? []), name]);
}

const delivery = p =>
  p.startsWith('directives/') ? 'inh'
  : p.startsWith('plugins/') || p.startsWith('.claude-plugin/') || p === 'scripts/install-toolkit.sh' ? 'ins'
  : p.startsWith('templates/') ? 'cop'
  : 'ref';

const shortName = p => {
  const q = p.replace(/\/$/, '');
  return (q.split('/').pop() || q) + (p.endsWith('/') ? '/' : '');
};

// Two files can share a basename (index.html, README.md, package.json). Inside a
// frame that reads as a duplicate entry, so collisions keep their parent folder.
function labeller(paths) {
  const seen = new Map();
  for (const p of paths) seen.set(shortName(p), (seen.get(shortName(p)) ?? 0) + 1);
  return p => {
    if (seen.get(shortName(p)) === 1) return shortName(p);
    const parts = p.replace(/\/$/, '').split('/');
    return parts.slice(-2).join('/') + (p.endsWith('/') ? '/' : '');
  };
}

function chip(p, { internal = false, comp = null, name = null } = {}) {
  const del = internal ? 'int' : delivery(p);
  const dom = internal ? 'self' : domainOf.get(p);
  const compartment = comp ?? compartmentOf.get(p);
  const glyphs = (permanent.has(p) ? '🔒' : '') + (orchestrators.has(p) ? '★' : '')
    + (socketOf.has(p) ? '🔌' : '');
  const vendors = socketOf.get(p);
  const title = [p, DELIVERY[del], compartment,
    vendors ? `socket for: ${vendors.join(', ')}` : null].filter(Boolean).join(' · ');
  return `<span class="f" data-dom="${esc(dom)}" data-search="${esc((p + ' ' + compartment).toLowerCase())}" title="${esc(title)}">`
    + `<span class="nm">${esc(name ?? shortName(p))}</span>`
    + `<span class="pill p-${del}">${del}</span>`
    + `<span class="cmp">${esc(compartment)}</span>`
    + (glyphs ? `<span class="g">${glyphs}</span>` : '')
    + `</span>`;
}

function vendorChip(name, ext) {
  const title = `${name} — owned by ${ext.vendor} · serves ${ext.serves} · `
    + `sockets: ${ext.sockets.join(', ')}`;
  return `<span class="f" data-dom="external" data-search="${esc((name + ' ' + ext.vendor + ' ' + ext.serves).toLowerCase())}" title="${esc(title)}">`
    + `<span class="nm">${esc(name)}</span>`
    + `<span class="pill p-ext">${esc(ext.vendor)}</span>`
    + `<span class="cmp">${esc(ext.serves)}</span><span class="g">🔌</span></span>`;
}

// Every path drawn on the page must exist — the map cannot claim a file the
// repo no longer has.
for (const paths of Object.values(SELF)) {
  for (const p of paths) if (!existsSync(p)) fail(`self inventory path missing from tree: ${p}`);
}

/* ------------------------------------------------------------- frame bodies */
const bodies = {};
for (const [cls, def] of Object.entries(manifest.classes)) {
  if (cls.startsWith('_')) continue;
  bodies[cls] = {
    title: def.label, blurb: def.blurb,
    count: def.paths.length,
    chips: (n => def.paths.map(p => chip(p, { name: n(p) })).join(''))(labeller(def.paths)),
  };
}
const vendors = Object.entries(manifest.externals).filter(([k]) => !k.startsWith('_'));
bodies.external = {
  title: 'Vendor sockets',
  blurb: 'Capabilities we depend on but do not own — we hold only the wiring. Swap a vendor by rewiring its sockets, never by forking it.',
  count: vendors.length,
  chips: vendors.map(([n, e]) => vendorChip(n, e)).join(''),
};
const selfPaths = Object.entries(SELF);
bodies.self = {
  title: 'This repo only — never exported',
  blurb: 'The body that builds and proves everything above. Hidden by “exports only”.',
  count: selfPaths.reduce((n, [, ps]) => n + ps.length, 0),
  chips: (n => selfPaths.map(([comp, ps]) =>
    ps.map(p => chip(p, { internal: true, comp, name: n(p) })).join('')).join(''))(
      labeller(selfPaths.flatMap(([, ps]) => ps))),
};

const frameHtml = FRAMES.map(f => {
  const b = bodies[f.id];
  if (!b) { fail(`no content for frame: ${f.id}`); return ''; }
  return `<div class="fr c-${f.id}" data-id="${f.id}" data-x="${f.x}" data-y="${f.y}" `
    + `data-w="${f.w}" data-h="${f.h}">`
    + `<div class="ft"><span class="ttl">${esc(b.title)}</span>`
    + `<span class="cnt">${b.count}</span></div>`
    + `<p class="fd">${esc(b.blurb)}</p>`
    + `<div class="files">${b.chips}</div>`
    + `<span class="rs" aria-hidden="true"></span></div>`;
}).join('\n');

const arrowDefs = Object.keys(KINDS).map(k =>
  `<marker id="arrow-${k}" markerWidth="10" markerHeight="10" refX="8.5" refY="3" orient="auto">`
  + `<path d="M0,0 L8.5,3 L0,6 Z" fill="var(--k-${k})"/></marker>`).join('');

const kindLegend = Object.entries(KINDS).map(([k, v]) =>
  `<li><span class="ln${v.dash ? ' dash' : ''}" style="--c:var(--k-${k})"></span>`
  + `<span><b>${esc(v.label)}</b> — ${esc(v.hint)}</span></li>`).join('');

const deliveryLegend = Object.entries(DELIVERY).map(([k, v]) =>
  `<li><span class="pill p-${k}">${k}</span><span>${esc(v)}</span></li>`).join('');

/* ------------------------------------------------------------------ page */
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>claude.directives — logical map</title>
<style>
  :root{
    --bg:#F5F5F3; --surface:#FFFFFF; --border:#E2E0DB; --border-2:#C8C5BE;
    --ink:#1A1A1A; --ink-2:#6B6860; --accent:#3D6B4F;
    --shadow-sm:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.06);
    --shadow-md:0 4px 6px rgba(0,0,0,.07),0 2px 4px rgba(0,0,0,.05);
    --shadow-lg:0 10px 24px rgba(0,0,0,.10),0 3px 8px rgba(0,0,0,.06);
    --radius:10px;
    --k-con:#C0392B; --k-seq:#1F6FEB; --k-enf:#2E7D4F; --k-pro:#B26B00;
    --k-exp:#8C8880; --k-del:#7A4BAF; --k-val:#0F766E;
    --c-standard:#3D6B4F; --c-orchestrator:#1A1A1A; --c-behavioral:#B26B00;
    --c-mechanical:#37474F; --c-artifact:#6B6860; --c-reference:#8C8880;
    --c-external:#7A4BAF; --c-self:#A03A34;
    --d-global:#1F6FEB; --d-git:#C0392B; --d-design:#7A4BAF; --d-test:#2E7D4F;
    --d-data:#B26B00; --d-meta:#6B6860; --d-self:#A03A34; --d-external:#7A4BAF;
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);
    font-family:Inter,'Segoe UI',system-ui,sans-serif}
  body{display:flex;flex-direction:column}

  header{flex:0 0 auto;display:flex;gap:12px 16px;align-items:center;flex-wrap:wrap;
    padding:11px 18px;background:var(--surface);border-bottom:1px solid var(--border)}
  header h1{font-size:16px;margin:0;font-weight:600;letter-spacing:-.2px}
  header h1 span{font-weight:400;color:var(--ink-2)}
  .hint{font-size:12px;color:var(--ink-2)}
  .btns{display:flex;gap:6px;flex-wrap:wrap}
  button{font:600 12.5px/1 inherit;color:var(--ink);background:var(--surface);
    border:1px solid var(--border);border-radius:8px;padding:7px 11px;cursor:pointer;
    transition:background .12s,border-color .12s,color .12s}
  button:hover{background:var(--bg);border-color:var(--border-2)}
  button.on{background:var(--accent);border-color:var(--accent);color:#fff}
  button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #search{margin-left:auto;padding:7px 11px;border:1px solid var(--border);
    border-radius:8px;font:13px/1 inherit;min-width:210px;background:var(--surface);color:var(--ink)}
  #search:focus-visible{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}

  #wrap{flex:1 1 auto;position:relative;min-height:0;overflow:hidden;cursor:grab;
    touch-action:none;user-select:none;-webkit-user-select:none;
    background-image:radial-gradient(var(--border) 1px,transparent 1px);
    background-size:22px 22px}
  #wrap.grabbing{cursor:grabbing}
  #viewport{position:absolute;top:0;left:0;transform-origin:0 0;width:0;height:0}
  #edges{position:absolute;top:0;left:0;width:4000px;height:2400px;overflow:visible;
    pointer-events:none;z-index:40}
  .edge .halo{fill:none;stroke:var(--bg);stroke-width:7;stroke-linecap:round;
    stroke-linejoin:round;opacity:.95}
  .edge .line{fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .edge[data-kind=exp] .line,.edge[data-kind=del] .line,.edge[data-kind=val] .line{
    stroke-dasharray:7 5}
  .edge.faded{opacity:.15}
  .elabel-bg{fill:var(--surface);stroke-width:1}
  .elabel{font:italic 600 10.5px/1 Inter,system-ui,sans-serif}

  .fr{position:absolute;background:var(--surface);border:1px solid var(--border);
    border-top:3px solid var(--acc,var(--border-2));border-radius:var(--radius);
    box-shadow:var(--shadow-sm);padding:9px 12px 12px;overflow:hidden;z-index:10;
    cursor:grab;transition:box-shadow .15s,opacity .15s}
  .fr.dragging{cursor:grabbing}
  .fr:hover{box-shadow:var(--shadow-md)}
  .fr.dragging{box-shadow:var(--shadow-lg);z-index:30}
  .fr.focused{border-color:var(--acc);box-shadow:var(--shadow-lg)}
  .fr.faded{opacity:.24}
  .fr.gone{display:none}
${FRAMES.map(f => `  .c-${f.id}{--acc:var(--c-${f.id})}`).join('\n')}

  .ft{display:flex;align-items:baseline;gap:8px;margin:0 0 3px}
  .ft .ttl{font:700 11.5px/1.3 inherit;letter-spacing:.07em;text-transform:uppercase;
    color:var(--acc)}
  .ft .cnt{font:600 10.5px/1 inherit;color:var(--ink-2);background:var(--bg);
    border:1px solid var(--border);border-radius:20px;padding:3px 7px}
  .fd{font:400 11px/1.4 inherit;color:var(--ink-2);margin:0 0 8px;max-width:92ch}

  .files{display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start}
  .f{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;
    background:var(--surface);border:1px solid var(--border);border-radius:7px;
    border-left:3px solid var(--d,var(--border-2));padding:3px 7px;
    font:10.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
    transition:opacity .12s,box-shadow .12s,border-color .12s}
  .f:hover{border-color:var(--border-2);box-shadow:var(--shadow-sm)}
${['global', 'git', 'design', 'test', 'data', 'meta', 'self', 'external']
    .map(d => `  .f[data-dom=${d}]{--d:var(--d-${d})}`).join('\n')}
  .f .nm{font-weight:600;color:var(--ink)}
  .f .pill{font:700 8.5px/1 Inter,system-ui,sans-serif;letter-spacing:.05em;
    text-transform:uppercase;color:#fff;border-radius:4px;padding:3px 4.5px}
  .p-inh{background:var(--d-global)} .p-ins{background:var(--d-design)}
  .p-cop{background:var(--d-data)}   .p-ref{background:var(--d-meta)}
  .p-int{background:var(--d-self)}   .p-ext{background:var(--c-external)}
  .f .cmp{color:var(--ink-2);font-size:9.5px}
  .f .g{font-size:10px;letter-spacing:-1px}
  .no-cmp .f .cmp{display:none}
  .no-del .f .pill{display:none}
  .f.miss{opacity:.2}
  .f.hit{border-color:var(--accent);box-shadow:0 0 0 2px rgba(61,107,79,.18)}

  .rs{position:absolute;right:0;bottom:0;width:24px;height:24px;cursor:nwse-resize;
    z-index:20}
  .rs::after{content:"";position:absolute;right:4px;bottom:4px;width:8px;height:8px;
    border-right:2px solid var(--border-2);border-bottom:2px solid var(--border-2);
    border-bottom-right-radius:3px}
  .fr:hover .rs::after{border-color:var(--acc)}

  .legend{position:absolute;right:14px;top:14px;z-index:50;max-width:340px;
    max-height:calc(100% - 28px);overflow-y:auto;
    background:rgba(255,255,255,.97);border:1px solid var(--border);
    border-radius:var(--radius);box-shadow:var(--shadow-md);padding:0;
    font-size:11.5px;color:var(--ink);backdrop-filter:blur(6px)}
  .legend[open]{padding:0 12px 11px}
  .legend summary{cursor:pointer;font:600 12.5px/1 inherit;list-style:none;
    padding:9px 12px;display:flex;align-items:center;gap:7px;user-select:none}
  .legend[open] summary{margin:0 -12px;border-bottom:1px solid var(--border)}
  .legend summary:hover{color:var(--accent)}
  .legend summary::after{content:"▸";font-size:10px;color:var(--ink-2);margin-left:auto;
    transition:transform .15s}
  .legend[open] summary::after{transform:rotate(90deg)}
  .legend summary::-webkit-details-marker{display:none}
  .legend h3{font:700 10px/1 inherit;letter-spacing:.08em;text-transform:uppercase;
    color:var(--ink-2);margin:11px 0 5px}
  .legend ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
  .legend li{display:flex;align-items:flex-start;gap:7px;line-height:1.3}
  .legend .ln{flex:none;width:18px;margin-top:6px;border-top:2.4px solid var(--c);
    color:var(--c)}
  .legend .ln.dash{border-top-style:dashed}
  .legend .sw{flex:none;width:11px;height:11px;border-radius:3px;margin-top:2px}
  .legend .pill{flex:none}
  @media (max-width:900px){ .legend{display:none} }
</style></head><body>
<header>
  <h1>claude.directives — logical map <span>(classes · compartments · delivery · sockets)</span></h1>
  <span class="hint">drag a title = move · drag the corner = resize · drag canvas = pan ·
    scroll = zoom · click a box = isolate</span>
  <span class="btns">
    <button type="button" id="zin" title="Zoom in">+</button>
    <button type="button" id="zout" title="Zoom out">−</button>
    <button type="button" id="t_self" aria-pressed="false" title="Hide the files that only run or maintain this repo">exports only</button>
    <button type="button" id="t_cmp" aria-pressed="false" title="Hide each file's domain.compartment">hide compartments</button>
    <button type="button" id="t_del" aria-pressed="false" title="Hide each file's delivery mode">hide delivery</button>
    <button type="button" id="t_edge" aria-pressed="false" title="Hide the relationship arrows">hide arrows</button>
    <button type="button" id="t_reset" title="Restore the default layout, zoom and layers">reset</button>
  </span>
  <input id="search" type="search" aria-label="Find a file" placeholder="find a file… (e.g. qa-pipeline, ui-kit)">
</header>
<div id="wrap">
  <div id="viewport">
    <svg id="edges" aria-hidden="true"><defs>${arrowDefs}</defs></svg>
${frameHtml}
  </div>
  <details class="legend">
    <summary>Legend</summary>
    <h3>Arrows — what the relationship is</h3>
    <ul>${kindLegend}</ul>
    <h3>Pill — how the file reaches a project</h3>
    <ul>${deliveryLegend}</ul>
    <h3>Glyph — whether it may be replaced</h3>
    <ul>
      <li><span>🔒</span><span><b>permanent</b> — evolves by PR, never wholesale-replaced</span></li>
      <li><span>★</span><span><b>orchestrator</b> — also defines the interfaces its components fit</span></li>
      <li><span>🔌</span><span><b>vendor socket</b> — the wiring for something we do not own</span></li>
      <li><span>—</span><span>no glyph — swappable within its compartment's interface</span></li>
    </ul>
    <h3>Left edge — which domain it belongs to</h3>
    <ul>
${['global', 'git', 'design', 'test', 'data', 'meta', 'self'].map(d =>
  `      <li><span class="sw" style="background:var(--d-${d})"></span><span>${d}</span></li>`).join('\n')}
    </ul>
  </details>
</div>
<script type="application/json" id="mapdata">${JSON.stringify({ edges: EDGES })}</script>
<script src="logical-map.js"></script>
</body></html>
`;

/* ------------------------------------------------------------------ emit */
if (failed) { console.error('build-logical-map: FAIL'); process.exit(1); }

const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
if (check) {
  if (current !== html) {
    console.error(`FAIL: ${OUT} is stale — run: node .github/scripts/build-logical-map.js`);
    process.exit(1);
  }
  console.log(`build-logical-map: OK — ${OUT} matches EXPORTS.json`);
} else {
  writeFileSync(OUT, html);
  const exported = Object.entries(manifest.classes)
    .filter(([k]) => !k.startsWith('_'))
    .reduce((n, [, c]) => n + c.paths.length, 0);
  console.log(`build-logical-map: wrote ${OUT} — ${exported} exported files across `
    + `${FRAMES.length - 2} classes, ${vendors.length} vendor sockets, `
    + `${bodies.self.count} internal files, ${EDGES.length} edges`
    + (current === html ? ' (unchanged)' : ''));
}
