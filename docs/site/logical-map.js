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

  // Orthogonal routing over a lane grid.
  //
  // This used to try L-shapes and give up — an L cannot go AROUND an obstacle,
  // so once a reader dragged frames into arbitrary positions, edges fell back to
  // running straight through boxes. Lanes are derived from the frames' own edges
  // (the only x or y worth travelling along is one that clears somebody), and a
  // Dijkstra with a turn penalty finds the shortest tidy path through them.
  const uniq = xs => [...new Set(xs.map(v => Math.round(v)))].sort((a, b) => a - b);

  function laneGrid(boxes, extra) {
    const xs = [], ys = [];
    for (const g of boxes) {
      xs.push(g.x - PAD - 12, g.x + g.w + PAD + 12);
      ys.push(g.y - PAD - 12, g.y + g.h + PAD + 12);
    }
    for (const p of extra) { xs.push(p.x); ys.push(p.y); }
    return { xs: uniq(xs), ys: uniq(ys) };
  }

  const inside = (p, boxes) => boxes.some(g =>
    p.x > g.x - PAD && p.x < g.x + g.w + PAD && p.y > g.y - PAD && p.y < g.y + g.h + PAD);

  // Shortest orthogonal path start→end that never enters a box. Turns cost
  // extra so the result reads as two or three clean runs, not a staircase.
  function solve(start, end, boxes) {
    const { xs, ys } = laneGrid(boxes, [start, end]);
    const xi = new Map(xs.map((v, i) => [v, i]));
    const yi = new Map(ys.map((v, i) => [v, i]));
    const sx = xi.get(Math.round(start.x)), sy = yi.get(Math.round(start.y));
    const ex = xi.get(Math.round(end.x)), ey = yi.get(Math.round(end.y));
    if (sx === undefined || sy === undefined || ex === undefined || ey === undefined) return null;

    const node = (a, b) => ({ x: xs[a], y: ys[b] });
    const blocked = (a, b) => inside(node(a, b), boxes);
    const passable = (a1, b1, a2, b2) => !hits(node(a1, b1), node(a2, b2), boxes);

    const key = (a, b, d) => `${a},${b},${d}`;
    const dist = new Map(), prev = new Map();
    const pq = [{ a: sx, b: sy, d: -1, c: 0 }];
    dist.set(key(sx, sy, -1), 0);
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best = null;

    while (pq.length) {
      pq.sort((p, q) => p.c - q.c);
      const cur = pq.shift();
      if (cur.c > (dist.get(key(cur.a, cur.b, cur.d)) ?? Infinity)) continue;
      if (cur.a === ex && cur.b === ey) { best = cur; break; }
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRS[d];
        const na = cur.a + dx, nb = cur.b + dy;
        if (na < 0 || nb < 0 || na >= xs.length || nb >= ys.length) continue;
        if (blocked(na, nb) && !(na === ex && nb === ey)) continue;
        if (!passable(cur.a, cur.b, na, nb)) continue;
        const step = Math.abs(xs[na] - xs[cur.a]) + Math.abs(ys[nb] - ys[cur.b]);
        const turn = cur.d === -1 || cur.d === d ? 0 : 120;   // prefer few corners
        const nc = cur.c + step + turn;
        const k = key(na, nb, d);
        if (nc < (dist.get(k) ?? Infinity)) {
          dist.set(k, nc);
          prev.set(k, { a: cur.a, b: cur.b, d: cur.d });
          pq.push({ a: na, b: nb, d, c: nc });
        }
      }
    }
    if (!best) return null;

    const pts = [];
    let cur = { a: best.a, b: best.b, d: best.d };
    while (cur) {
      pts.unshift(node(cur.a, cur.b));
      cur = prev.get(key(cur.a, cur.b, cur.d));
    }
    // drop mid-points on a straight run
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      const straight = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (!straight) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Put the label on the longest run that is not behind a frame — a label
  // sitting on a box reads as if it belongs to the box. The whole PILL has to
  // clear, not just its centre point, or a long label overhangs the frame it
  // was carefully routed around.
  function placeLabel(pts, all, halfW) {
    const clearOf = c => !all.some(g =>
      c.x + halfW > g.x - 2 && c.x - halfW < g.x + g.w + 2 &&
      c.y + 10 > g.y - 2 && c.y - 10 < g.y + g.h + 2);
    let best = null, bestLen = -1;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (len <= bestLen) continue;
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (clearOf(c)) { best = c; bestLen = len; break; }
      }
    }
    return best ?? pts[Math.floor(pts.length / 2)];
  }

  // Anchor on the border of `g` facing `other`, offset along that border so
  // parallel edges between the same pair do not overlap.
  function anchors(g, other) {
    const gc = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
    const oc = { x: other.x + other.w / 2, y: other.y + other.h / 2 };
    const out = [];
    if (oc.y > g.y + g.h) out.push({ x: gc.x, y: g.y + g.h });
    if (oc.y < g.y) out.push({ x: gc.x, y: g.y });
    if (oc.x > g.x + g.w) out.push({ x: g.x + g.w, y: gc.y });
    if (oc.x < g.x) out.push({ x: g.x, y: gc.y });
    if (!out.length) {              // overlapping — leave by the nearest side
      out.push({ x: gc.x, y: g.y + g.h }, { x: g.x + g.w, y: gc.y });
    }
    return out;
  }

  function elbow(a, b, ida, idb, labelLen = 0) {
    const boxes = rects([ida, idb]);
    const all = rects([]);
    let pts = null;
    for (const s of anchors(a, b)) {
      for (const e of anchors(b, a)) {
        const cand = solve(s, e, boxes);
        if (cand && (!pts || cand.length < pts.length)) pts = cand;
      }
      if (pts && pts.length <= 3) break;      // already as clean as it gets
    }
    if (!pts) {                               // nothing clear — say so straight
      const s = anchors(a, b)[0], e = anchors(b, a)[0];
      pts = [s, { x: s.x, y: (s.y + e.y) / 2 }, { x: e.x, y: (s.y + e.y) / 2 }, e];
    }
    return { pts, label: placeLabel(pts, all, (labelLen * 5.4 + 12) / 2) };
  }

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
      const { pts, label } = elbow(geom[e.a], geom[e.b], e.a, e.b, (e.label || '').length);
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

  // Frames may sit anywhere, including at negative coordinates, so fit measures
  // the real bounding box rather than assuming it starts at the origin.
  function fit() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id in geom) {
      if (byId[id].classList.contains('gone')) continue;
      const g = geom[id];
      minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
      maxX = Math.max(maxX, g.x + g.w); maxY = Math.max(maxY, g.y + g.h);
    }
    if (!isFinite(minX)) return;
    const w = maxX - minX, h = maxY - minY;
    const r = wrap.getBoundingClientRect();
    scale = clamp(Math.min((r.width - 48) / (w + 40), (r.height - 48) / (h + 40)), 0.15, 1.6);
    px = (r.width - w * scale) / 2 - minX * scale;
    py = 20 - minY * scale;
    paint();
  }

  // Scroll PANS; pinch or ctrl/cmd+scroll zooms.
  //
  // This used to treat every wheel event as zoom, which broke trackpads badly:
  // a two-finger swipe sends deltaX with deltaY of 0, and `deltaY < 0` is false
  // for 0 — so every sideways swipe silently zoomed OUT instead of panning, and
  // the map felt walled in on all four sides. Panning by drag needs empty canvas
  // to grab, and once you zoom in there is barely any, so scroll is the only
  // gesture that always works. A trackpad pinch arrives as a wheel event with
  // ctrlKey set, which is what makes both gestures coexist.
  wrap.addEventListener('wheel', ev => {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) {
      const r = wrap.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const next = clamp(scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), 0.15, 3);
      px = mx - (mx - px) * (next / scale);
      py = my - (my - py) * (next / scale);
      scale = next; paint();
      return;
    }
    // Shift+wheel is the long-standing "scroll sideways" convention for mice,
    // which have no deltaX of their own.
    const sideways = ev.shiftKey && ev.deltaX === 0;
    px -= sideways ? ev.deltaY : ev.deltaX;
    py -= sideways ? 0 : ev.deltaY;
    paint();
  }, { passive: false });

  // Hold space to pan from anywhere, including over a frame. Zoomed in, frames
  // cover almost the whole canvas, so "grab the background" can leave nowhere
  // to grab.
  let spaceHeld = false;
  addEventListener('keydown', ev => {
    if (ev.code === 'Space' && !ev.target.matches('input, textarea, summary')) {
      spaceHeld = true; wrap.classList.add('pannable'); ev.preventDefault();
    }
  });
  addEventListener('keyup', ev => {
    if (ev.code === 'Space') { spaceHeld = false; wrap.classList.remove('pannable'); }
  });

  let panning = null;
  const startPan = ev => {
    panning = { x: ev.clientX - px, y: ev.clientY - py };
    wrap.classList.add('grabbing');
    wrap.setPointerCapture(ev.pointerId);
  };
  wrap.addEventListener('pointerdown', ev => {
    // Middle-drag and space-drag pan regardless of what is underneath.
    if (ev.button === 1 || spaceHeld) { ev.preventDefault(); startPan(ev); return; }
    if (ev.target.closest('.fr')) return;             // frames handle their own drags
    // The legend is a child of #wrap. Without this, pressing it started a pan
    // and captured the pointer, so the click never reached <summary> and the
    // panel simply would not open.
    if (ev.target.closest('.legend')) return;
    startPan(ev);
  });
  wrap.addEventListener('pointermove', ev => {
    if (!panning) return;
    px = ev.clientX - panning.x; py = ev.clientY - panning.y; paint();
  });
  const endPan = () => { panning = null; wrap.classList.remove('grabbing'); };
  wrap.addEventListener('pointerup', endPan);
  wrap.addEventListener('pointercancel', endPan);

  // Two-finger pinch. A trackpad pinch arrives as a ctrlKey wheel event and is
  // handled above, but on a touch screen it is genuinely two pointers, and
  // without this there was no way to zoom on a tablet at all. Capture phase, so
  // a second finger landing on a frame still counts.
  const touches = new Map();
  let pinch = null;
  const spread = () => {
    const [a, b] = [...touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y),
             mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  wrap.addEventListener('pointerdown', ev => {
    if (ev.pointerType !== 'touch') return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 2) {
      drag = null; endPan();                 // a second finger cancels any drag
      frames.forEach(f => f.classList.remove('dragging'));
      const s0 = spread();
      pinch = { d: s0.d, scale, px, py };
    }
  }, true);
  wrap.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'touch' || !touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size !== 2 || !pinch) return;
    ev.preventDefault();
    const now = spread();
    const r = wrap.getBoundingClientRect();
    const next = clamp(pinch.scale * (now.d / (pinch.d || 1)), 0.15, 3);
    const mx = now.mx - r.left, my = now.my - r.top;
    px = mx - (mx - pinch.px) * (next / pinch.scale);
    py = my - (my - pinch.py) * (next / pinch.scale);
    scale = next; paint();
  }, true);
  for (const t of ['pointerup', 'pointercancel']) {
    wrap.addEventListener(t, ev => {
      touches.delete(ev.pointerId);
      if (touches.size < 2) pinch = null;
    }, true);
  }

  // Keyboard access. Nothing here was reachable without a pointer.
  const zoomBy = k => {
    const r = wrap.getBoundingClientRect();
    const mx = r.width / 2, my = r.height / 2;
    const next = clamp(scale * k, 0.15, 3);
    px = mx - (mx - px) * (next / scale);
    py = my - (my - py) * (next / scale);
    scale = next; paint();
  };
  addEventListener('keydown', ev => {
    if (ev.target.matches('input, textarea')) return;
    const step = ev.shiftKey ? 240 : 70;
    switch (ev.key) {
      case 'ArrowLeft':  px += step; break;
      case 'ArrowRight': px -= step; break;
      case 'ArrowUp':    py += step; break;
      case 'ArrowDown':  py -= step; break;
      case '+': case '=': zoomBy(1.2); return void ev.preventDefault();
      case '-': case '_': zoomBy(1 / 1.2); return void ev.preventDefault();
      case '0': fit(); return void ev.preventDefault();
      case 'Escape':
        isolate(null); search.value = '';
        document.querySelectorAll('.f').forEach(c => c.classList.remove('hit', 'miss'));
        return void ev.preventDefault();
      case 'Enter':
        if (ev.target.classList?.contains('fr')) {
          isolate(ev.target.classList.contains('focused') ? null : ev.target.dataset.id);
          ev.preventDefault();
        }
        return;
      default: return;
    }
    ev.preventDefault(); paint();
  });

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
        // No clamp to the canvas origin. Pinning at 0 meant a frame simply
        // stopped when dragged left or up, with empty canvas still visible
        // beside it — the origin is an arbitrary point in an infinite plane,
        // not an edge. fit() handles negative coordinates.
        g.x = Math.round(drag.x + dx);
        g.y = Math.round(drag.y + dy);
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

  // Recentre WITHOUT touching the arranged layout. Previously `reset` was the
  // only way back from an off-screen pan, and it also discarded every frame the
  // reader had moved — so getting un-lost cost you your arrangement.
  document.getElementById('t_fit').addEventListener('click', fit);
  document.getElementById('zin').addEventListener('click', () => zoomBy(1.2));
  document.getElementById('zout').addEventListener('click', () => zoomBy(1 / 1.2));

  /* ---------------- go ---------------- */
  const restored = load();
  applyAll();
  if (!restored) autofit();
  drawEdges(); fit();
  addEventListener('resize', fit);
})();
