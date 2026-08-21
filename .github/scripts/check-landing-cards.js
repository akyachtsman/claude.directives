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

/**
 * Every element carrying the `demo-card` class, verbatim, in document order.
 *
 * Detection is attribute-order independent and class-token exact: the CSS rule
 * `.demo-card` styles ANY element with that token, so anything the browser
 * would render as a card must be seen here. An element that carries the class
 * but cannot be extracted as a closed anchor FAILS rather than being skipped —
 * a silent skip would drop the card from every count and comparison below.
 */
const cards = (file) => {
  const html = readFileSync(file, 'utf8');
  const withoutStyle = html.replace(/<style[\s\S]*?<\/style>/gi, (m) => ' '.repeat(m.length));
  const blocks = [];

  for (const tag of withoutStyle.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g)) {
    const [openTag, tagName] = tag;
    const classAttr = /\sclass\s*=\s*"([^"]*)"/i.exec(openTag);
    if (!classAttr) continue;
    if (!classAttr[1].trim().split(/\s+/).includes('demo-card')) continue;

    if (tagName.toLowerCase() !== 'a') {
      fail(`${file}: a .demo-card is a <${tagName}>, not a link — cards must be anchors: ${openTag}`);
      continue;
    }
    const close = withoutStyle.indexOf('</a>', tag.index);
    if (close === -1) {
      fail(`${file}: a .demo-card anchor is never closed by </a>: ${openTag}`);
      continue;
    }
    const block = html.slice(tag.index, close + '</a>'.length);
    // Anchors cannot nest, so a second <a inside means this card was never
    // closed and we ran on into a LATER element's </a>. Fail rather than
    // compare a block that isn't the card.
    if (/<a\b/i.test(block.slice(openTag.length))) {
      fail(`${file}: a .demo-card anchor is not closed before the next <a> — its </a> is missing: ${openTag}`);
      continue;
    }
    blocks.push(block);
  }
  return blocks;
};

const hrefOf = (block, file, i) => {
  const m = /\shref\s*=\s*"([^"]*)"/i.exec(block.slice(0, block.indexOf('>') + 1));
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
  // Blank the href VALUE wherever it sits in the open tag: attribute order and
  // extra class tokens are cosmetic, and must not read as a divergence.
  const strip = (s) => {
    const end = s.indexOf('>') + 1;
    return s.slice(0, end).replace(/(\shref\s*=\s*")[^"]*(")/i, '$1$2') + s.slice(end);
  };
  if (strip(block) !== strip(galleryCards[i])) {
    fail(`card ${i + 1} differs between the two pages beyond its href:\n--- ${ROOT}\n${block}\n--- ${GALLERY}\n${galleryCards[i]}`);
  }
});

if (process.exitCode) process.exit(1);
console.log(`OK:   landing-page demo cards in sync (${rootCards.length} cards, href shape verified per page)`);
