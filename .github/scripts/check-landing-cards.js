#!/usr/bin/env node
// The two Pages landing pages hand-carry the same demo list. The ONLY legitimate
// difference is the href: the root page links into docs/site/, the gallery links
// to siblings. Everything else must match exactly.
//
// Both hrefs are validated against a strict ALLOWLIST rather than by rejecting
// known-bad shapes. Two rounds of review found bypasses in the reject-list form
// (normalising both inputs made a wrongly-prefixed gallery card match; then
// `docs/site//outside.html` vs `/outside.html` normalised equal while resolving
// to different URLs). An allowlist has no unenumerated remainder.
//
// Invoked by qa.yml AND by the local gate in CLAUDE.md — one implementation, so
// the two cannot drift.

import { readFileSync } from 'node:fs';

const ROOT = 'index.html';
const GALLERY = 'docs/site/index.html';

// A bare sibling filename: no slash, no scheme, no query, no leading dot.
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

/** Card blocks, verbatim, in document order. */
const cards = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n');
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    if (/<a class="demo-card"/.test(line)) cur = [];
    if (cur) cur.push(line);
    if (cur && /<\/a>/.test(line)) { blocks.push(cur.join('\n')); cur = null; }
  }
  if (cur) fail(`${file}: a .demo-card block is never closed by </a>`);
  return blocks;
};

const hrefOf = (block, file, i) => {
  const m = /<a class="demo-card"\s+href="([^"]*)"/.exec(block);
  if (!m) { fail(`${file}: demo-card ${i + 1} has no href`); return null; }
  return m[1];
};

const rootCards = cards(ROOT);
const galleryCards = cards(GALLERY);

if (rootCards.length === 0) {
  fail(`${ROOT}: no .demo-card found — the check would otherwise pass vacuously`);
}
if (rootCards.length !== galleryCards.length) {
  fail(`card count differs: ${ROOT} has ${rootCards.length}, ${GALLERY} has ${galleryCards.length}`);
}

// Each page's href shape, checked on its own terms BEFORE any normalisation.
const rootTargets = rootCards.map((b, i) => {
  const href = hrefOf(b, ROOT, i);
  if (href === null) return null;
  const rest = href.startsWith('docs/site/') ? href.slice('docs/site/'.length) : null;
  if (rest === null || !FILENAME.test(rest)) {
    fail(`${ROOT} card ${i + 1}: href="${href}" is not docs/site/<filename>.html`);
    return null;
  }
  return rest;
});

const galleryTargets = galleryCards.map((b, i) => {
  const href = hrefOf(b, GALLERY, i);
  if (href === null) return null;
  if (!FILENAME.test(href)) {
    fail(`${GALLERY} card ${i + 1}: href="${href}" is not a bare sibling <filename>.html`);
    return null;
  }
  return href;
});

// Same page, same order.
rootTargets.forEach((t, i) => {
  if (t !== null && galleryTargets[i] !== null && t !== galleryTargets[i]) {
    fail(`card ${i + 1} points at different pages: ${ROOT} → ${t}, ${GALLERY} → ${galleryTargets[i]}`);
  }
});

// Everything except the href must be byte-identical.
rootCards.forEach((block, i) => {
  if (i >= galleryCards.length) return;
  const strip = (s) => s.replace(/(<a class="demo-card"\s+href=")[^"]*(")/, '$1$2');
  if (strip(block) !== strip(galleryCards[i])) {
    fail(`card ${i + 1} differs between the two pages beyond its href:\n--- ${ROOT}\n${block}\n--- ${GALLERY}\n${galleryCards[i]}`);
  }
});

if (process.exitCode) process.exit(1);
console.log(`OK:   landing-page demo cards in sync (${rootCards.length} cards, href shape verified per page)`);
