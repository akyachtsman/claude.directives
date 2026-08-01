/* Interactive engine for the logical map (docs/site/logical-map.html).
   The HTML around it — frames, chips, legend — is GENERATED from EXPORTS.json by
   .github/scripts/build-logical-map.js, which also inlines the layout and edge
   config as #mapdata. This file is hand-written and is the only place behaviour
   lives: pan, zoom, search, isolate, layer toggles, and drag-to-move /
   drag-to-resize with per-browser persistence.

   Coordinate model: every frame is absolutely positioned in *canvas* space inside
   #viewport, which carries a single `translate(px,py) scale(s)` transform. Edges
   are drawn in that same space, so nothing needs re-projecting on zoom. */
(() => {
  const D = JSON.parse(document.getElementById('mapdata').textContent);
  const wrap = document.getElementById('wrap');
  const vp = document.getElementById('viewport');
  const svg = document.getElementById('edges');
  const frames = [...document.querySelectorAll('.fr')];
  const byId = Object.fromEntries(frames.map(f => [f.dataset.id, f]));
  const STORE = 'logical-map.layout.v2';

  /* ---------------- layout persistence ---------------- */
  const geom = {};                       // id -> {x,y,w,h} in canvas space
  for (const f of frames) {
    geom[f.dataset.id] = {
      x: +f.dataset.x, y: +f.dataset.y, w: +f.dataset.w, h: +f.dataset.h,
    };
  }
  const declared = structuredClone(geom);   // the generator's starting geometry

  const load = () => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { saved = null; }
    if (!saved) return false;
    let used = false;
    for (const [id, g] of Object.entries(saved)) {
      if (!geom[id]) continue;                       // frame retired since save
      for (const k of ['x', 'y', 'w', 'h']) {
        if (typeof g[k] === 'number' && isFinite(g[k])) { geom[id][k] = g[k]; used = true; }
      }
    }
    return used;
  };
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(geom)); } catch { /* private mode */ }
  };
  const apply = id => {
    const g = geom[id], el = byId[id];
    el.style.left = g.x + 'px'; el.style.top = g.y + 'px';
    el.style.width = g.w + 'px'; el.style.height = g.h + 'px';
  };
  const applyAll = () => { for (const id in geom) apply(id); };

  // Grow every frame to fit its own content, then push the rows below it down.
  // The generator cannot measure text, and hard-coded heights would silently
  // clip files the day EXPORTS.json grows — so the browser settles it instead.
  // Only runs when the reader has no saved layout of their own.
  function autofit() {
    const rows = new Map();
    for (const f of frames) {
      const y = declared[f.dataset.id].y;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(f.dataset.id);
    }
    let shift = 0;
    for (const y of [...rows.keys()].sort((a, b) => a - b)) {
      const row = rows.get(y);
      let need = 0;
      for (const id of row) {
        geom[id].y = y + shift;
        byId[id].style.height = 'auto';
        // offsetHeight, not scrollHeight: these are border-box frames, and
        // scrollHeight omits the borders — which is exactly a 4px clip.
        need = Math.max(need, byId[id].offsetHeight, declared[id].h);
      }
      // Each frame keeps its OWN height — equalising a row leaves dead space
      // under whichever frame has the least content. Only the row's tallest
      // frame decides how far the rows below it move.
      for (const id of row) {
        geom[id].h = Math.max(byId[id].offsetHeight, declared[id].h);
        apply(id);
      }
      shift += need - Math.max(...row.map(id => declared[id].h));
    }
  }

  /* ---------------- edges ---------------- */
  // Orthogonal elbow between two rectangles: leave the source on the border
  // facing the target, turn once in the gutter, arrive on the facing border.
  // Straight diagonals across a dense map are unreadable; elbows follow the
  // gutters the layout already leaves between rows.
  const R = 9;
  const PAD = 6;    // keep routes this far off a frame's edge

  const rects = skip => frames
    .filter(f => !skip.includes(f.dataset.id) && !f.classList.contains('gone'))
    .map(f => geom[f.dataset.id]);

  const hits = (p, q, boxes) => boxes.some(g =>
    Math.max(p.x, q.x) >= g.x - PAD && Math.min(p.x, q.x) <= g.x + g.w + PAD &&
    Math.max(p.y, q.y) >= g.y - PAD && Math.min(p.y, q.y) <= g.y + g.h + PAD);

  // A route is only readable if none of its segments disappears behind an
  // opaque frame. Testing each segment (not the whole L's bounding box) keeps
  // edges in the nearest free gutter instead of banishing them to the margin.
  const clear = (pts, boxes) => {
    for (let i = 0; i < pts.length - 1; i++) if (hits(pts[i], pts[i + 1], boxes)) return false;
    return true;
  };

  // Candidate lanes come from the frames themselves, not a fixed grid: the only
  // x worth trying is one that clears somebody's edge. A 24px grid misses the
  // 36px gutter between behavioral and artifact — the one lane that lets
  // standard reach reference at all.
  function lanes(axis) {
    const out = new Set();
    for (const f of frames) {
      if (f.classList.contains('gone')) continue;
      const g = geom[f.dataset.id];
      const lo = axis === 'x' ? g.x : g.y;
      const hi = axis === 'x' ? g.x + g.w : g.y + g.h;
      out.add(lo - PAD - 10); out.add(hi + PAD + 10);
    }
    return [...out];
  }

  // Try every (anchor, anchor, turn) combination, least deviation from the
  // natural straight-through route first, and stop at the first clear one.
  function route(build, boxes, natural) {
    const xs = [natural.u, ...lanes(natural.axis)];
    const js = [natural.j, ...lanes(natural.axis === 'x' ? 'y' : 'x')];
    const plan = [];
    for (const u of xs) for (const v of xs) for (const j of js) {
      plan.push({ u, v, j, cost: Math.abs(u - natural.u) + Math.abs(v - natural.v)
        + Math.abs(j - natural.j) * 1.4 });
    }
    plan.sort((a, b) => a.cost - b.cost);
    for (const { u, v, j } of plan) {
      const pts = build(u, v, j);
      if (clear(pts, boxes)) return pts;
    }
    return null;                       // caller decides what to do instead
  }

  // An anchor must still land on the frame it leaves from.
  const clampTo = (x, g) => Math.min(g.x + g.w - 18, Math.max(g.x + 18, x));

  // Put the label on the first stretch of the long segment that is not behind
  // a frame — a label sitting on a box reads as if it belongs to the box.
  function placeLabel(pts, all) {
    const a = pts[1], b = pts[2];
    const steps = 12;
    const cands = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      cands.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    cands.sort((p, q) => Math.abs(0.5 - cands.indexOf(p) / steps)
      - Math.abs(0.5 - cands.indexOf(q) / steps));
    for (const c of cands) if (!hits(c, c, all)) return c;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function elbow(a, b, ida, idb) {
    const boxes = rects([ida, idb]);
    const all = rects([]);
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = bc.x - ac.x, dy = bc.y - ac.y;
    let pts;

    // Pick the axis by which pair of borders actually face each other. Two
    // frames whose x-ranges overlap must be joined top-to-bottom however far
    // apart their centres are — a sideways route would start inside one of them.
    const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 40;
    const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 40;
    const vertical = xOverlap || (!yOverlap && Math.abs(dy) >= Math.abs(dx));

    // The turn has to happen in the gap BETWEEN the two frames. Left free it
    // slides back inside whichever frame it started from — legal by the
    // obstacle test (endpoints are exempt) but nonsense to look at.
    const between = (mid, lo, hi) => Math.min(Math.max(mid, Math.min(lo, hi) + PAD),
      Math.max(lo, hi) - PAD);

    const horizontalPlan = () => {
      const sx = dx > 0 ? a.x + a.w : a.x;
      const tx = dx > 0 ? b.x : b.x + b.w;
      const build = (u, v, j) => {
        const p1 = { x: sx, y: clampTo2(u, a) };
        const p2 = { x: tx, y: clampTo2(v, b) };
        const mid = between(j, sx, tx);
        return [p1, { x: mid, y: p1.y }, { x: mid, y: p2.y }, p2];
      };
      return { build, natural: { axis: 'y', u: ac.y, v: bc.y, j: (sx + tx) / 2 } };
    };
    const verticalPlan = () => {
      const sy = dy > 0 ? a.y + a.h : a.y;
      const ty = dy > 0 ? b.y : b.y + b.h;
      const build = (u, v, j) => {
        const p1 = { x: clampTo(u, a), y: sy };
        const p2 = { x: clampTo(v, b), y: ty };
        const mid = between(j, sy, ty);
        return [p1, { x: p1.x, y: mid }, { x: p2.x, y: mid }, p2];
      };
      return { build, natural: { axis: 'x', u: ac.x, v: bc.x, j: (sy + ty) / 2 } };
    };

    // Preferred axis first, then the other — a frame stack can leave the
    // natural approach with no lane at all (standard reaches reference only
    // from the side, because artifact sits directly on top of it).
    const first = vertical ? verticalPlan() : horizontalPlan();
    const second = vertical ? horizontalPlan() : verticalPlan();
    pts = route(first.build, boxes, first.natural)
      ?? route(second.build, boxes, second.natural)
      ?? first.build(first.natural.u, first.natural.v, first.natural.j);
    return { pts, label: placeLabel(pts, all) };
  }
  const clampTo2 = (y, g) => Math.min(g.y + g.h - 16, Math.max(g.y + 16, y));
  // Round the two interior corners so the route reads as a path, not a staircase.
  function roundPath(pts) {
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
      const inV = { x: p.x - prev.x, y: p.y - prev.y };
      const outV = { x: next.x - p.x, y: next.y - p.y };
      const inL = Math.hypot(inV.x, inV.y) || 1, outL = Math.hypot(outV.x, outV.y) || 1;
      const r = Math.min(R, inL / 2, outL / 2);
      d += ` L${p.x - inV.x / inL * r},${p.y - inV.y / inL * r}`;
      d += ` Q${p.x},${p.y} ${p.x + outV.x / outL * r},${p.y + outV.y / outL * r}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L${last.x},${last.y}`;
  }

  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, attrs) => {
    const e = document.createElementNS(NS, n);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  let edgesHidden = false;
  function drawEdges() {
    svg.replaceChildren(svg.querySelector('defs'));
    if (edgesHidden) return;
    for (const e of D.edges) {
      const A = byId[e.a], B = byId[e.b];
      if (!A || !B) continue;
      if (A.classList.contains('gone') || B.classList.contains('gone')) continue;
      const { pts, label } = elbow(geom[e.a], geom[e.b], e.a, e.b);
      const d = roundPath(pts);
      const dim = A.classList.contains('faded') || B.classList.contains('faded');
      const g = el('g', { class: 'edge' + (dim ? ' faded' : ''), 'data-kind': e.kind });
      // halo first so the line stays legible where it crosses a frame
      g.appendChild(el('path', { d, class: 'halo' }));
      g.appendChild(el('path', {
        d, class: 'line', stroke: `var(--k-${e.kind})`,
        'marker-end': `url(#arrow-${e.kind})`,
      }));
      if (e.label) {
        const w = e.label.length * 5.4 + 12;
        g.appendChild(el('rect', {
          x: label.x - w / 2, y: label.y - 9, width: w, height: 18, rx: 9,
          class: 'elabel-bg', stroke: `var(--k-${e.kind})`,
        }));
        const t = el('text', {
          x: label.x, y: label.y + 4, 'text-anchor': 'middle',
          class: 'elabel', fill: `var(--k-${e.kind})`,
        });
        t.textContent = e.label;
        g.appendChild(t);
      }
      svg.appendChild(g);
    }
  }

  /* ---------------- pan + zoom ---------------- */
  let px = 0, py = 0, scale = 1;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const paint = () => { vp.style.transform = `translate(${px}px,${py}px) scale(${scale})`; };

  function fit() {
    let maxX = 0, maxY = 0;
    for (const id in geom) {
      if (byId[id].classList.contains('gone')) continue;
      maxX = Math.max(maxX, geom[id].x + geom[id].w);
      maxY = Math.max(maxY, geom[id].y + geom[id].h);
    }
    const r = wrap.getBoundingClientRect();
    scale = clamp(Math.min((r.width - 48) / (maxX + 40), (r.height - 48) / (maxY + 40)), 0.15, 1.6);
    px = (r.width - (maxX + 40) * scale) / 2;
    py = 20;
    paint();
  }

  wrap.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = wrap.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const next = clamp(scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), 0.15, 3);
    px = mx - (mx - px) * (next / scale);
    py = my - (my - py) * (next / scale);
    scale = next; paint();
  }, { passive: false });

  let panning = null;
  wrap.addEventListener('pointerdown', ev => {
    if (ev.target.closest('.fr')) return;             // frames handle their own drags
    // The legend is a child of #wrap. Without this, pressing it started a pan
    // and captured the pointer, so the click never reached <summary> and the
    // panel simply would not open.
    if (ev.target.closest('.legend')) return;
    panning = { x: ev.clientX - px, y: ev.clientY - py };
    wrap.classList.add('grabbing');
    wrap.setPointerCapture(ev.pointerId);
  });
  wrap.addEventListener('pointermove', ev => {
    if (!panning) return;
    px = ev.clientX - panning.x; py = ev.clientY - panning.y; paint();
  });
  const endPan = () => { panning = null; wrap.classList.remove('grabbing'); };
  wrap.addEventListener('pointerup', endPan);
  wrap.addEventListener('pointercancel', endPan);

  /* ---------------- move + resize ---------------- */
  const MIN_W = 190, MIN_H = 92;
  let drag = null;
  for (const f of frames) {
    const id = f.dataset.id;
    const start = (ev, mode) => {
      ev.preventDefault(); ev.stopPropagation();
      drag = { id, mode, sx: ev.clientX, sy: ev.clientY, ...geom[id] };
      f.classList.add('dragging');
      f.setPointerCapture(ev.pointerId);
    };
    // Grab ANYWHERE on the frame to move it. This started as a title-bar-only
    // handle, which is a ~15px strip — about 10px on screen at the default
    // zoom, and far too small to hit.
    let travelled = false;
    f.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      travelled = false;
      start(ev, ev.target.closest('.rs') ? 'resize' : 'move');
    });
    f.addEventListener('pointermove', ev => {
      if (!drag || drag.id !== id) return;
      const dx = (ev.clientX - drag.sx) / scale, dy = (ev.clientY - drag.sy) / scale;
      if (Math.abs(dx) > 3 / scale || Math.abs(dy) > 3 / scale) travelled = true;
      const g = geom[id];
      if (drag.mode === 'move') {
        g.x = Math.round(Math.max(0, drag.x + dx));
        g.y = Math.round(Math.max(0, drag.y + dy));
      } else {
        g.w = Math.round(Math.max(MIN_W, drag.w + dx));
        g.h = Math.round(Math.max(MIN_H, drag.h + dy));
      }
      apply(id); drawEdges();
    });
    const done = () => {
      if (!drag || drag.id !== id) return;
      drag = null; f.classList.remove('dragging'); save();
    };
    f.addEventListener('pointerup', done);
    f.addEventListener('pointercancel', done);

    // A press that went nowhere is a click: isolate this frame and whatever it
    // connects to. A press that moved was a drag, and must not also isolate.
    f.addEventListener('click', ev => {
      if (ev.target.closest('.rs') || travelled) return;
      isolate(f.classList.contains('focused') ? null : id);
    });
  }

  /* ---------------- isolate + search ---------------- */
  function isolate(id) {
    frames.forEach(f => f.classList.remove('focused', 'faded'));
    if (!id) { drawEdges(); return; }
    const keep = new Set([id]);
    for (const e of D.edges) {
      if (e.a === id) keep.add(e.b);
      if (e.b === id) keep.add(e.a);
    }
    frames.forEach(f => {
      if (f.dataset.id === id) f.classList.add('focused');
      else if (!keep.has(f.dataset.id)) f.classList.add('faded');
    });
    drawEdges();
  }

  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const chip of document.querySelectorAll('.f')) {
      chip.classList.toggle('hit', !!q && chip.dataset.search.includes(q));
      chip.classList.toggle('miss', !!q && !chip.dataset.search.includes(q));
    }
  });

  /* ---------------- layer toggles ---------------- */
  const toggle = (btn, fn, labels) => {
    let on = false;
    btn.addEventListener('click', () => {
      on = !on; fn(on);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      if (labels) btn.textContent = on ? labels[1] : labels[0];
    });
    return () => {
      if (!on) return;
      on = false; fn(false);
      btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false');
      if (labels) btn.textContent = labels[0];
    };
  };

  const resets = [
    toggle(document.getElementById('t_self'), on => {
      byId.self.classList.toggle('gone', on);
      drawEdges(); fit();
    }, ['exports only', 'show all']),
    toggle(document.getElementById('t_cmp'), on => vp.classList.toggle('no-cmp', on),
      ['hide compartments', 'show compartments']),
    toggle(document.getElementById('t_del'), on => vp.classList.toggle('no-del', on),
      ['hide delivery', 'show delivery']),
    toggle(document.getElementById('t_edge'), on => { edgesHidden = on; drawEdges(); },
      ['hide arrows', 'show arrows']),
  ];

  document.getElementById('t_reset').addEventListener('click', () => {
    resets.forEach(r => r());
    Object.assign(geom, structuredClone(declared));
    try { localStorage.removeItem(STORE); } catch { /* private mode */ }
    isolate(null); search.value = '';
    document.querySelectorAll('.f').forEach(c => c.classList.remove('hit', 'miss'));
    applyAll(); autofit(); drawEdges(); fit();
  });

  document.getElementById('zin').addEventListener('click', () => {
    scale = clamp(scale * 1.2, 0.15, 3); paint();
  });
  document.getElementById('zout').addEventListener('click', () => {
    scale = clamp(scale / 1.2, 0.15, 3); paint();
  });

  /* ---------------- go ---------------- */
  const restored = load();
  applyAll();
  if (!restored) autofit();
  drawEdges(); fit();
  addEventListener('resize', fit);
})();
