#!/usr/bin/env node
// The two Pages landing pages hand-carry the same demo list. The ONLY legitimate
// difference is the href: the root page links into docs/site/, the gallery links
// to siblings. Everything else must match exactly.
//
// Invoked by qa.yml AND by the local gate in CLAUDE.md — one implementation, so
// the two cannot drift.
//
// WHY A TOKENIZER, NOT PATTERNS (issue #259, from four review rounds on #258):
// every earlier version matched shapes — an exact `<a class="demo-card"` prefix,
// then a double-quoted class attribute — and each one silently SKIPPED whatever
// it failed to match, which is the worst failure available: a card the browser
// renders, invisible to the check, so the gate passes. Consuming the tag grammar
// in order removes that whole class of miss for ordinary markup.
//
// WHAT THIS DOES AND DOES NOT GUARANTEE (owner ruling, 2026-08-22). It is NOT a
// spec-compliant HTML tokenizer, and must not be described as one. It reliably
// catches the failure this gate exists for: someone edits one landing page and
// not the other. It does NOT withstand deliberately adversarial markup — review
// (#262) enumerated six such gaps: character references in attribute values
// (`class="&#100;emo-card"`), `</a>` appearing as text inside a comment or
// raw-text element, raw-text modes beyond script/style/textarea/title (e.g.
// iframe), end tags carrying attributes, abrupt comment endings (`<!-->`), and
// `.demo-card` elements nested inside a card.
//
// THE OWNER ACCEPTED THAT LIMIT rather than adopt a real HTML parser (#263,
// closed 2026-08-22). Every one of the six needs deliberately hostile markup
// written by someone who already has commit access — and who could simply delete
// this check instead. So the limit is the decision, not a deferral: do NOT
// reopen it by adding a parser dependency, and do NOT patch the six one at a
// time. Six review rounds across #258 and #262 established that patching them
// individually is slowly reimplementing an HTML parser by hand.
//
// Dependency-free is the point: every other validator here runs on bare node,
// and the local gate in CLAUDE.md has no install step, so a parser dependency
// would make the documented local gate require `npm i` for every contributor.
// Revisit only if these pages stop being a hand-maintained pair.

import { readFileSync, statSync } from 'node:fs';

const ROOT = 'index.html';
const GALLERY = 'docs/site/index.html';
const GALLERY_DIR = 'docs/site';

// A bare sibling filename: no slash, no scheme, no query, no leading dot.
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';


/**
 * Parse ONE tag-open starting at `i` (which must point at '<'). Returns the tag
 * with its attributes, or null when this '<' does not begin one (plain text).
 * Throws on a tag-open that begins but cannot be completed — the caller turns
 * that into a failure rather than skipping it.
 */
const parseTag = (s, i) => {
  if (s[i] !== '<' || !/[a-zA-Z]/.test(s[i + 1] ?? '')) return null;

  let j = i + 1;
  while (j < s.length && /[a-zA-Z0-9-]/.test(s[j])) j++;
  const name = s.slice(i + 1, j).toLowerCase();
  const attrs = new Map();

  for (;;) {
    while (j < s.length && isSpace(s[j])) j++;
    if (j >= s.length) throw new Error(`unterminated <${name}> tag`);

    if (s[j] === '>') return { name, attrs, start: i, end: j + 1 };
    if (s[j] === '/' && s[j + 1] === '>') return { name, attrs, start: i, end: j + 2 };

    // Attribute name: anything up to whitespace, '=', '/' or '>'.
    const nameStart = j;
    while (j < s.length && !isSpace(s[j]) && s[j] !== '=' && s[j] !== '>' && !(s[j] === '/' && s[j + 1] === '>')) j++;
    if (j === nameStart) throw new Error(`malformed attribute in <${name}> at offset ${j}`);
    const attrName = s.slice(nameStart, j).toLowerCase();

    while (j < s.length && isSpace(s[j])) j++;
    let value = '';
    if (s[j] === '=') {
      j++;
      while (j < s.length && isSpace(s[j])) j++;
      const q = s[j];
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, j + 1);
        if (close === -1) throw new Error(`unterminated ${q === '"' ? 'double' : 'single'}-quoted value for "${attrName}"`);
        value = s.slice(j + 1, close);
        j = close + 1;
      } else {
        // Unquoted: ends at whitespace or '>'. The spec forbids " ' = < ` here,
        // so their presence means the markup is malformed, not that we guessed.
        const valStart = j;
        while (j < s.length && !isSpace(s[j]) && s[j] !== '>') j++;
        value = s.slice(valStart, j);
        if (value === '' || /["'=<`]/.test(value)) {
          throw new Error(`malformed unquoted value for "${attrName}": ${JSON.stringify(value)}`);
        }
      }
    }
    // First occurrence wins, as browsers do.
    if (!attrs.has(attrName)) attrs.set(attrName, value);
  }
};

// Elements whose CONTENT is text, not markup. A `.demo-card` inside one of
// these is not a card — the browser never parses it as an element.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/** Index just past `</name ... >`, or -1. */
const findClose = (s, from, name) => {
  const re = new RegExp(`</${name}\\s*>`, 'i');
  const m = re.exec(s.slice(from));
  return m ? from + m.index + m[0].length : -1;
};

/**
 * Every element carrying the `demo-card` class token, in document order.
 *
 * ONE tokenizing pass handles comments, raw-text elements and tags together —
 * for the ordinary markup these two pages contain; see the header for what this
 * does not cover. An earlier version masked comments and raw text with regexes
 * BEFORE scanning, and review found three separate bugs in exactly that seam — `<script\b`
 * matching the custom element `<script-editor>`, `existsSync` accepting a
 * directory, and comment-masking running before script-masking so a `<!--` in
 * one script string paired with a `-->` in another and blanked the live markup
 * between them. Every one came from deciding structure with patterns instead of
 * consuming it in order, which is the same mistake this rewrite existed to fix.
 * Walking once removes the seam: at any point we are either inside a comment,
 * inside raw text, or looking at markup — never guessing which.
 */
const cards = (file) => {
  const html = readFileSync(file, 'utf8');
  const found = [];

  for (let i = 0; i < html.length; ) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end === -1) {
        fail(`${file}: unterminated comment — cannot tell markup from text past it`);
        return null;
      }
      i = end + 3;
      continue;
    }

    let tag;
    try {
      tag = parseTag(html, lt);
    } catch (e) {
      fail(`${file}: ${e.message} — refusing to guess`);
      return null;
    }
    if (!tag) { i = lt + 1; continue; }

    // Exact tag-name match, from the parser — never a prefix pattern, which is
    // what made <script-editor> read as <script>.
    if (RAW_TEXT.has(tag.name)) {
      const close = findClose(html, tag.end, tag.name);
      if (close === -1) {
        fail(`${file}: unterminated <${tag.name}> — cannot tell markup from text past it`);
        return null;
      }
      i = close;
      continue;
    }

    const cls = tag.attrs.get('class');
    if (cls === undefined || !cls.trim().split(/\s+/).includes('demo-card')) {
      i = tag.end;
      continue;
    }

    if (tag.name !== 'a') {
      fail(`${file}: a .demo-card is a <${tag.name}>, not a link — cards must be anchors`);
      return null;
    }
    // Anchors cannot nest, so the card ends at the first </a>; a nested <a>
    // before it means this card was never closed.
    const close = findClose(html, tag.end, 'a');
    if (close === -1) {
      fail(`${file}: a .demo-card anchor is never closed by </a>`);
      return null;
    }
    const inner = html.slice(tag.end, close).replace(/<\/a\s*>$/i, '');
    if (/<a\b/i.test(inner)) {
      fail(`${file}: a .demo-card anchor is not closed before the next <a> — its </a> is missing`);
      return null;
    }
    found.push({ attrs: tag.attrs, inner, raw: html.slice(tag.start, close) });
    i = close;
  }
  return found;
};

const rootCards = cards(ROOT);
const galleryCards = cards(GALLERY);
if (rootCards === null || galleryCards === null) process.exit(1);

if (rootCards.length === 0) {
  fail(`${ROOT}: no .demo-card found — the check would otherwise pass vacuously`);
}
if (rootCards.length !== galleryCards.length) {
  fail(`card count differs: ${ROOT} has ${rootCards.length}, ${GALLERY} has ${galleryCards.length}`);
}

/** The target page each card points at, validated against its own page's shape. */
const targetOf = (card, file, i, prefix) => {
  const href = card.attrs.get('href');
  if (href === undefined) { fail(`${file}: demo-card ${i + 1} has no href`); return null; }
  const rest = prefix === '' ? href
    : href.startsWith(prefix) ? href.slice(prefix.length)
    : null;
  if (rest === null || !FILENAME.test(rest)) {
    fail(`${file} card ${i + 1}: href="${href}" is not ${prefix}<filename>.html`);
    return null;
  }
  return rest;
};

const rootTargets = rootCards.map((c, i) => targetOf(c, ROOT, i, 'docs/site/'));
const galleryTargets = galleryCards.map((c, i) => targetOf(c, GALLERY, i, ''));

// Same page, same order — and a page that actually exists. Both hrefs resolve to
// docs/site/<target>; nothing else covers this, since check-links.js reads only
// Markdown and html-validate never resolves an href to the filesystem.
rootTargets.forEach((t, i) => {
  if (t === null) return;
  if (galleryTargets[i] != null && t !== galleryTargets[i]) {
    fail(`card ${i + 1} points at different pages: ${ROOT} → ${t}, ${GALLERY} → ${galleryTargets[i]}`);
  }
  // isFile(), not existsSync(): a DIRECTORY named example.html exists happily
  // while the published link still 404s, so presence alone proves nothing.
  let isFile = false;
  try { isFile = statSync(`${GALLERY_DIR}/${t}`).isFile(); } catch { isFile = false; }
  if (!isFile) {
    fail(`card ${i + 1} targets ${GALLERY_DIR}/${t}, which is not a regular file — both published links would 404`);
  }
});

// Everything except the href must match: same attributes, same inner content.
// Compared from the PARSED tag, so attribute order and quoting style — cosmetic
// by definition — never read as a divergence.
const shape = (card) =>
  JSON.stringify([...card.attrs].filter(([k]) => k !== 'href').sort());

rootCards.forEach((card, i) => {
  if (i >= galleryCards.length) return;
  const other = galleryCards[i];
  if (shape(card) !== shape(other)) {
    fail(`card ${i + 1} has different attributes beyond its href:\n--- ${ROOT}\n${shape(card)}\n--- ${GALLERY}\n${shape(other)}`);
  }
  if (card.inner !== other.inner) {
    fail(`card ${i + 1} differs in content:\n--- ${ROOT}\n${card.inner}\n--- ${GALLERY}\n${other.inner}`);
  }
});

if (process.exitCode) process.exit(1);
console.log(`OK:   landing-page demo cards in sync (${rootCards.length} cards, parsed; href shape and target existence verified per page)`);
