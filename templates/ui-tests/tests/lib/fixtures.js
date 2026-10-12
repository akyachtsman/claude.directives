// Shared fixtures and page helpers for tests/app.spec.js (batch C, S2).
// The render-witness fixture, the idle cap, the page-error watcher, API capture,
// DOM snapshots, interactive-element discovery and the back affordance. It
// imports nothing from auth.js, so the two never form an import cycle.
// Kit file, replaced whole on refresh: project scenarios go in app.spec.js.

import { test as base, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// RENDER WITNESS — evidence that a test BODY started at its project's width (#348)
// ─────────────────────────────────────────────────────────────────────────────
// check-ui-viewports.js reads the run's JSON report. A result there proves a test
// was SCHEDULED in a project declaring a width; it does not prove a page was ever
// that wide, because a hook that throws before the body still leaves a result.
// This fixture is the stronger evidence. It yields a FUNCTION and records nothing
// at setup; the test body CALLS it as its first statement, and the call records
// `page.viewportSize()` on the result as a `rendered-viewport` annotation (once
// per test, however often it is called). Only code running inside the test
// callback can make that call, so a witness means the callback was ENTERED with
// the page at that width. The gate reports RENDERED for a width class only where
// such a witness carries a width inside that class.
//
// WHY THE CALL AND NOT THE REQUEST (Codex, #384 round 1). The first version
// recorded at fixture SETUP, on the measurement that a fixture requested only by
// the body is created after the beforeAll/beforeEach hooks. That holds, but
// setup is still not body entry: a SIBLING test-scoped fixture set up after the
// witness can throw, and Playwright then never invokes the callback while the
// witness is already recorded — a false RENDERED, reproduced on 1.63.0 and 1.64.0.
//
// Measured on 1.63.0 (2026-09-24), and again on 1.64.0 (2026-10-08), one laptop
// project at 1280x800, for the
// setup-time version — each still holds for the call, which runs later:
//   * a beforeEach that throws; a beforeEach that requests `page`, NAVIGATES and
//     throws; a beforeAll that throws on a test marked to fail — NO witness in
//     any of the three. An honest failing body DOES get one.
//   * the annotation reaches the JSON report on BOTH `results[].annotations`
//     and `tests[].annotations`.
//   * `{ auto: true }` destroyed the setup-time signal (an auto fixture is
//     created before the beforeEach hooks). Keep it NOT auto anyway: the body
//     must request it to call it, and an auto fixture invites a hook to.
//   * a hook or another fixture that requests it and CALLS it records a witness
//     without the body — that is forgery, out of scope per directives#349.
//
// ⚠️ It records the width the body STARTS at. A setViewportSize() later in the
// body is not seen, which is why S4 keeps its `viewport-override` marker. EVERY
// scenario below requests `renderWitness` AND calls `renderWitness();` as its
// first statement; a test you add should do both. Requesting it without calling
// it records nothing, so that test can only ever count as SCHEDULED.
// The gate's cases build their fixture specs from the text between the two
// marker lines below, so keep the block self-contained and the markers intact.
// >>> render-witness
const test = base.extend({
  renderWitness: async ({ page }, use, testInfo) => {
    // Records NOTHING at setup: the body's own call is the witness (#384).
    let recorded = false;
    await use(() => {
      if (recorded) return;
      recorded = true;
      const vp = page.viewportSize();
      testInfo.annotations.push({ type: 'rendered-viewport',
        description: JSON.stringify(vp ? { width: vp.width, height: vp.height } : null) });
    });
  },
});
// <<< render-witness

// Every structured finding this suite records goes through here, so each one is
// pretty-printed JSON under the same content type.
function attachJson(name, data) {
  return test.info().attach(name, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// IDLE CAP — every networkidle wait passes its OWN bound, never the config's
// ─────────────────────────────────────────────────────────────────────────────
// waitForLoadState() with no `timeout` inherits `use.navigationTimeout`, which
// Playwright Test defaults to 0 = NO TIMEOUT. The shipped playwright.config.js
// sets it to 30s, so there an un-timed waitForLoadState('networkidle') on a page
// that polls, holds a websocket open, or streams costs the full 30s every call;
// in a config that drops the setting it is bounded only by the enclosing test
// timeout, and one call can eat a whole scenario's budget. The
// `.catch(() => {})` at each call site does not help: with no timeout the
// promise never rejects, it just never settles.
//
// That made every per-scenario budget in this file a fiction, since each was
// derived by adding up terms that were themselves unbounded. Cap it here, and
// see playwright.config.js for the matching navigationTimeout that bounds goto().
//
// 5s, not 30: these calls are "let it settle, then continue", never assertions.
// Every one already swallows failure, so a timeout means "settled enough".
// networkidle is unreliable on any app with background activity — Playwright
// says so itself — which is exactly why it must never be waited on unbounded.
const IDLE_MS = 5_000;

// ⚠️ AND NOT EVERY networkidle WAIT IS A SETTLE. Capping all of them at IDLE_MS
// was wrong wherever the wait IS the observation window: the sampling right after
// it sees only what has arrived by then, so at 5s a script or API call failing at
// 8s is never seen and the gate PASSES a broken app — strictly worse than the
// unbounded wait it replaced, because it fails silently instead of loudly.
//
// The test is NOT "is something read after this wait". Plenty of reads follow a
// settle harmlessly. It is:
//
//     CAN A LATE ARRIVAL TURN A FAIL INTO A PASS?
//
// ⚠️ APPLY IT TO EVERY SITE, NOT THE ONE BEING DISCUSSED. This question has now
// been answered four separate times, each time for only the call site in front
// of me: S1/ENTRY (round 6), S3's per-element window (round 7), S2's auth probe
// (round 10), and the load-and-authenticate preamble (round 12). The rule was
// written HERE after round 7 and the last two sites still shipped wrong. The
// classification below is therefore exhaustive by construction — every
// networkidle wait in this file appears in exactly one of the two lists.
//
// LOAD_SETTLE_MS — a late arrival turns a FAIL into a PASS (11 sites):
//   S1, ENTRY          a late error is never counted and the gate is green
//   S2 (x2)            pre-auth: detectAuthGate's answer becomes mechanism
//                      'none', so S2 passes without ever trying the credential.
//                      post-auth: verifying mid-flight reads a not-yet-dismissed
//                      gate as retained and fails a login that SUCCEEDED. This
//                      second site was in the file and not in this list —
//                      corrected here, and it is why the count moved by two.
//   detectAndAuth      the identifier step's settle (#310): the loop re-runs
//                      DISCOVERY on what this wait returns, and too short reads
//                      a WORKING split-step login as 'identifier-step-
//                      unresolved' — the same failure S2's post-auth settle is
//                      LOAD_SETTLE_MS to avoid. IDLE_MS here would have fit
//                      inside the OLD 240s ceilings; sizing does not get to
//                      pick the classification.
//   S3 preamble (x2)   feeds discoverElements(); an element that renders late is
//                      never swept, so a broken control leaves S3 green
//   S4 (x2)            scrollWidth is read as a verdict; late content that
//                      overflows arrives after the settle and S4 passes
//   gotoAndAuth (x2)   every caller MEASURES the view it returns — CTRL counts
//                      primary controls, DISMISS computes triggerCount, NAV
//                      fingerprints the view
//
// IDLE_MS — a late arrival cannot produce a green (3 sites):
//   NAV candidate loop  a late view change reads as "no change", ends the drill
//                       and produces a SKIP — reported and investigable
//   NAV back loop       the mirror case: a late arrival turns a PASS into a
//                       FAIL, which is loud
//   S3 per-element      THE ONE EXCEPTION, and it is a real one: a late arrival
//                       here DOES cost correctness, but widening inside an
//                       uncapped sweep costs (elements x projects). Keeps
//                       IDLE_MS and states the residual at the call site rather
//                       than pretending to have closed it.
//
// So IDLE_MS where a late arrival costs precision, LOAD_SETTLE_MS where it costs
// correctness — with S3's loop the single documented place those two pull apart.
const LOAD_SETTLE_MS = 25_000;

// ─────────────────────────────────────────────────────────────────────────────
// PAGE-ERROR WATCHER — the console-error gate (test.md → UI coverage gates)
// ─────────────────────────────────────────────────────────────────────────────
// A JS error is ALWAYS blocking: one throw silently kills every handler bound
// after it (design.md → Script loading), so the screen can look rendered while
// nothing on it works.
//
// A resource-load failure is blocking only when the missing file is one the
// page's own code depends on — a script or stylesheet on the app's own origin.
// Chromium reports every failed request as a console `error` as well, carrying
// no type information, so counting raw console errors fails the suite on a
// missing favicon or a blocked third-party beacon. That is not a defect in the
// app, and a gate that reddens on it only teaches the team to ignore the gate.
//
// `.js` is a real array of JS errors (what the diagnostics in S2/S3 report);
// `.all()` adds the resource failures that genuinely break a page, and is what
// the load gates (S1, ENTRY) assert. `.all()` is in ARRIVAL ORDER, one array
// both kinds append to, because callers slice it by an earlier length (S3 per
// element, ENTRY per page): the former `[...js, ...resources]` put a later JS
// error IN FRONT of an earlier resource failure, so the slice kept the count
// right but reported the old failure's text and hid the new one (audit
// 2026-10-11, M-9).
// `document` is here because the navigation itself is the page: a 404/500 for
// the URL under test is reported as a document response, its console copy is
// discarded as "Failed to load resource", and a provider's styled error page
// satisfies the body-text assertion — so a mistyped or down APP_URL would pass
// the authoritative live gate. Images, fonts and beacons stay non-blocking.
const BLOCKING_RESOURCE_TYPES = new Set(['document', 'script', 'stylesheet', 'xhr', 'fetch']);
// API calls block on 5xx only. Before this suite classified failures at all, a
// raw console listener caught every "Failed to load resource", so an API 500
// during initial load DID fail S1 — dropping it would ship a gate weaker than
// the one it replaces. 4xx is excluded deliberately: 401 on an auth probe and
// 404 for an optional resource are normal app flows, and blocking on them would
// redden healthy builds. Server-side failures are the ones that mean the page
// rendered a shell over broken data.
const API_TYPES = new Set(['xhr', 'fetch']);
const blockingStatus = (type) => (API_TYPES.has(type) ? 500 : 400);

function watchPageErrors(page) {
  const js = [];
  const resources = [];
  const ordered = [];
  // The MAIN DOCUMENT is the page under test, so a 404/500 for it blocks
  // whatever origin it is on — and it must NOT go through the same-origin
  // filter below. At document-response time `page.url()` is still the PREVIOUS
  // document (`about:blank` on the first navigation, whose origin is the string
  // "null"), so filtering by origin silently discarded exactly the failure the
  // `document` type was added to catch.
  const isMainDocument = (req) => {
    try {
      return req.resourceType() === 'document' && req.frame() === page.mainFrame();
    } catch {
      return false;
    }
  };
  // Only script and stylesheet are origin-filtered. That filter exists to stop a
  // third-party beacon or CDN blip reddening the build — a concern that applies
  // to assets, not to the two things that ARE the app:
  //   * the main document, which is the page under test at any origin;
  //   * API calls, which in the canonical stack go to Supabase — a DIFFERENT
  //     origin by design. Origin-filtering those discarded exactly the failure
  //     the xhr/fetch rule was added to catch.
  const ORIGIN_FILTERED = new Set(['script', 'stylesheet']);
  const noteResource = (url, why, type, mainDoc) => {
    if (!BLOCKING_RESOURCE_TYPES.has(type)) return;
    // A child frame's document is not the page under test: an embedded iframe
    // returning 404 is the embed's problem, and failing the load gate on it
    // reddens a page that rendered correctly.
    if (type === 'document' && !mainDoc) return;
    if (ORIGIN_FILTERED.has(type)) {
      try {
        if (new URL(url).origin !== new URL(page.url()).origin) return;
      } catch {
        return;
      }
    }
    const entry = `${type} ${why}: ${url}`;
    resources.push(entry);
    ordered.push(entry);
  };
  const noteJs = (msg) => { js.push(msg); ordered.push(msg); };
  page.on('pageerror', e => noteJs(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // Classification comes from the request handlers below; skipping the console
    // copy keeps a single 404 from also counting as a JS error.
    if (/Failed to load resource/i.test(m.text())) return;
    noteJs(m.text());
  });
  page.on('requestfailed', r =>
    noteResource(r.url(), 'request failed', r.resourceType(), isMainDocument(r)));
  // NOTE: requestfailed covers transport failures for every blocking type,
  // including xhr/fetch — a refused or aborted API call never yields a status.
  page.on('response', (r) => {
    const req = r.request();
    const type = req.resourceType();
    if (r.status() < blockingStatus(type)) return;
    noteResource(r.url(), `HTTP ${r.status()}`, type, isMainDocument(req));
  });
  return { js, resources, all: () => [...ordered] };
}

// ─────────────────────────────────────────────────────────────────────────────
// API CALL CAPTURE — must wrap fetch before page load via addInitScript
// ─────────────────────────────────────────────────────────────────────────────
async function captureApiCalls(page) {
  await page.addInitScript(() => {
    const orig = window.fetch;
    window.__apiCalls = [];
    // Fresh id per document: addInitScript re-runs on every full navigation, so a
    // changed id means window.__apiCalls was reset (used to detect navigation in S3).
    window.__pageLoadId = Math.random();
    window.fetch = async (...args) => {
      const res = await orig(...args);
      // Record the call (with its status) IMMEDIATELY so non-JSON 4xx/5xx responses
      // (e.g. an HTML 500 page) are captured — clone.json() rejects on those, and the
      // old code only pushed inside .then(), silently dropping them as "no call".
      // fetch() takes a string, a Request or ANY stringifiable object — a URL
      // instance is the common one, and it has no `.url`, so the old
      // `args[0]?.url` recorded `undefined` for it (audit 2026-10-11, M-9).
      const target = args[0];
      const entry = {
        url: (typeof Request !== 'undefined' && target instanceof Request) ? target.url : String(target),
        status: res.status,
        recordCount: null,
        firstFieldKey: null,
        error: null,
      };
      window.__apiCalls.push(entry);
      res.clone().json().then(body => {
        // Backend-agnostic: most REST backends return an array of row objects; some
        // backends wrap rows as { records: [{ fields: {...} }] }.
        const rows = Array.isArray(body) ? body : (body?.records ?? null);
        const firstRow = rows?.[0];
        entry.recordCount  = Array.isArray(rows) ? rows.length : null;
        entry.firstFieldKey = firstRow
          ? Object.keys(firstRow.fields ?? firstRow)[0] ?? null
          : null;
        entry.error = body?.error ?? body?.message ?? null;
      }).catch(() => {}); // non-JSON body: status already recorded above
      return res;
    };
  });
  return () => page.evaluate(() => window.__apiCalls);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM STATE SNAPSHOT — used to detect transitions in single-page apps
// ─────────────────────────────────────────────────────────────────────────────
async function domSnapshot(page) {
  return page.evaluate(() => ({
    visibleIds: [...document.querySelectorAll('[id]')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map(el => el.id),
    bodyText: document.body.innerText?.slice(0, 500),
    inputCount: document.querySelectorAll('input:not([type=hidden])').length,
    buttonCount: document.querySelectorAll('button, [role=button]').length,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE ELEMENT DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────
async function discoverElements(page) {
  return page.evaluate(() => {
    const selectors = ['button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea',
                       '[role=button]', '[onclick]'];
    // One ELEMENT can match several selectors (<button onclick> matches
    // 'button' and '[onclick]'; add role=button and it matches three).
    // Every record carries `elementKey` — the element's IDENTITY, assigned on
    // first sight and reused for its later records — so a capped consumer
    // (NAV's ATTEMPT_CAP) can spend one attempt per CONTROL rather than one per
    // record: four inert triple-matching buttons must not cost twelve attempts.
    //
    // ⚠️ THE PRODUCER MUST NOT DO THAT DEDUP ITSELF, and the `duplicate` flag
    // this replaces did — it marked the second+ record in DISCOVERY order,
    // which is the right answer only for a consumer that accepts every
    // representation. Consumers filter first, so the record a producer-side
    // flag drops can be the only one the consumer can USE: an
    // <input role="button"> is recorded under 'input:not([type=hidden])',
    // which NAV rejects on tag, and again under '[role=button]', which NAV
    // accepts — and the second record was skipped as a duplicate of a record
    // NAV never considered, so an app whose only drill entry uses that pattern
    // self-skipped the whole scenario (directives#311). Duplication is still
    // visible here — a repeated elementKey in the element-map attachment — but
    // WHICH representation to keep is the consumer's call, made after its own
    // eligibility filter.
    const elementKeys = new Map();
    const keyOf = (el) => {
      if (!elementKeys.has(el)) elementKeys.set(el, elementKeys.size);
      return elementKeys.get(el);
    };
    return selectors.flatMap(sel =>
      [...document.querySelectorAll(sel)]
        // Index BEFORE filtering: page.locator(sel).nth(i) counts every DOM match,
        // hidden included, so the recorded index must count them too.
        .map((el, index) => ({ el, index }))
        .filter(({ el }) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map(({ el, index }) => ({
          elementKey: keyOf(el),
          selector: sel,
          index,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? null,
          label: (el.textContent?.trim().slice(0, 60) ||
                  el.getAttribute('aria-label') ||
                  el.getAttribute('placeholder') ||
                  el.getAttribute('name') ||
                  el.id || '').slice(0, 60),
          // Carried separately from label: label prefers textContent, so an
          // icon button whose glyph text is not a recognizable word
          // (<button aria-label="Back">chevron_left</button>) records only the
          // glyph — consumers that classify by meaning need the accessible
          // name too, not just the first non-empty string. aria-labelledby
          // wins over aria-label (accname computation order), and it is
          // resolved here because backControl()'s getByLabel() resolves it
          // too — an element only one side recognizes as "Back" is exactly
          // the asymmetry that lets NAV click Back while drilling.
          ariaLabel: ((el.getAttribute('aria-labelledby') || '')
                        .split(/\s+/).filter(Boolean)
                        .map(ref => document.getElementById(ref)?.textContent?.trim() || '')
                        .join(' ').trim()
                      || el.getAttribute('aria-label') || '').slice(0, 60),
          id: el.id || null,
        }))
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST FILL VALUE — infer plausible value from element context
// ─────────────────────────────────────────────────────────────────────────────
function testValueFor(el) {
  const label = (el.label + (el.type ?? '')).toLowerCase();
  if (/email/.test(label))         return 'test@example.com';
  if (/date/.test(label))          return new Date().toISOString().split('T')[0];
  if (/number|qty|amount|count/.test(label)) return '42';
  if (/phone|tel/.test(label))     return '5551234567';
  if (/url|link/.test(label))      return 'https://example.com';
  return 'Test input';
}

// ─────────────────────────────────────────────────────────────────────────────
// BACK AFFORDANCE — one definition, every consumer
// ─────────────────────────────────────────────────────────────────────────────
// ROLE + ACCESSIBLE NAME are the two semantics every earlier form of the accname
// arm approximated — tag lists for kind, label/text matchers for name — and each
// approximation lagged the spec by one case (checkbox labeled "Back", input
// type=button, div role=button with text "Back", input value="Back"). getByRole
// computes both in full: implicit roles and text- or value-derived names
// included, non-control roles excluded by the role filter itself. The CSS arm
// below remains for [data-back] and the arrow glyphs.
//
// AFFORDANCE FORMS, BOTH ENDS ANCHORED. "back" is navigation only when the name
// is SHAPED like a back control:
//   prefix — the name starts at "back", or at motion/icon lead-in tokens (go,
//            navigate, arrow, chevron, keyboard) and nothing else; leading
//            decoration ([\W_]*: "← ", "‹ ", "(", stray whitespace) is allowed
//            wherever a word is not;
//   suffix — "back" ends the name, is trailed by decoration THAT RUNS TO THE END
//            ("Back ›", "Back:"), or is followed by " to <place>".
// Suffix-only anchoring shipped first and was wrong at the other end
// (directives#311): "Send back to vendor" and "Put it back" end in an affordance
// form while being forward actions, and the unwind would have PRESSED one —
// a mutating click plus a false ping-pong failure on a correct app. The lead-in
// vocabulary is closed and small on purpose, and the asymmetry of cost says why:
// a name wrongly EXCLUDED costs a reported skip (NAV's counters name it), a name
// wrongly INCLUDED costs a destructive click. So "Roll back", "Move back" and
// "Step back" no longer match, while "Go back", "Navigate back" and the icon
// ligatures do.
// The prefix also closes the ligature gap the suffix rule left open: the left
// bound is now STRUCTURAL rather than \b, so "arrow_back" and
// "keyboard_arrow_back" — whose underscore is a word character and blocked
// \bback\b — match as themselves, with no normalisation step.
const BACK_NAME = /^[\W_]*(?:(?:go|navigate|arrow|chevron|keyboard)[\W_]+)*back\b(?=[\s:;.!›>»)\]…]*$|\s+to\b)/i;
// The NAV drill filter's superset: the same back form plus the return/home
// phrasings and arrow glyphs that filter also excludes. Built FROM
// BACK_NAME.source rather than retyped — the filter and the presser cannot
// disagree about what "back" is, which four hand-kept copies could not
// guarantee. Only the back branch is anchored; return/home stay as they were.
const BACK_OR_HOME = new RegExp(
  `${BACK_NAME.source}|\\breturn(\\s+to\\b|\\s*$)|\\bhome\\s*$|[←‹◀]`, 'i');

// A single visible in-app back control, or an empty locator. Matches an accessible
// name / aria-label of "back" or a left-arrow glyph, or an explicit [data-back] hook.
// Deliberately narrow so the browser's Back button is NOT mistaken for an in-app one.
function backControl(page) {
  // Form-bound matching throughout (#308, #311): :has-text and [aria-label*=]
  // are SUBSTRING matches, so both selected "Backup" — claude.prop's JSON-export
  // button — as a back control, and the unwind below would have pressed it. A
  // whitespace emulation like (^|\s)back(\s|$) would go too far the other way
  // and reject the legitimate "Go-back" / "Back:" / "Back ›" the drill filter
  // ACCEPTS as back controls, and NAV would then self-skip for want of a control
  // it had just classified. So every arm carries the one BACK_NAME object
  // instead — including the aria-label arm, which CSS cannot regex and which
  // goes through getByLabel unioned in via .or(). A regex handed to a CSS
  // selector string does NOT survive the trip; see backControlAll(). The arrow
  // glyphs stay as plain has-text — they are not word characters, so no bound
  // around them matches anything.
  // `.first()` alone grabs the FIRST IN THE DOM, which in the common SPA pattern
  // (prior views kept mounted under display:none) is the hidden control from the
  // level above — so the back-flow test drove a dead element and self-skipped as
  // "invariant N/A" on an app that fully exercises the invariant.
  return backControlAll(page).locator('visible=true').first();
}

// EVERY element backControl() could recognize, un-narrowed. Factored out so the
// NAV drill filter can exclude candidates by MEMBERSHIP IN THIS LOCATOR rather
// than by re-deriving "looks like back" from recorded strings: getByLabel
// computes the real accessible name (aria-labelledby chains, img alt — the
// whole accname algorithm), and three review rounds showed a string-side
// reimplementation always lags it by one case. One definition, two consumers —
// the filter and the presser cannot disagree about what "back" is.
function backControlAll(page) {
  // ONE regex OBJECT in every text arm — never a regex written into a CSS
  // selector string. `:text-matches("\\bback\\b…")` looks right and is not:
  // Playwright parses that argument with the CSS string tokenizer, which applies
  // CSS escape rules, so `\b` was read as the hex escape \bbac, `\s` collapsed
  // to `s`, and `\]` closed the character class early. Both arms have therefore
  // been matching the literal text "뮬k\v(?=[s:;.!›>»)]…]*$|s+to\v)" — i.e.
  // nothing at all — since the word bounds landed in #308. Verified, not
  // suspected: parseSelector() on the shipped selector returns that mangled
  // pattern. `filter({ hasText })` takes the RegExp itself and round-trips it
  // intact (serialised as /source/flags, and Playwright's regex reader preserves
  // backslashes where its string reader does not); it is the idiom this file
  // already uses for the digit keypad and the submit button; and its match is
  // ancestor-inclusive, which is what is wanted here — the BUTTON, not the
  // innermost span that happens to hold the word.
  return page.locator('[data-back], button:has-text("←"), a:has-text("←")')
   .or(page.locator('button').filter({ hasText: BACK_NAME }))
   // An anchor with no href has no link role and often no aria-label either.
   // <a onclick>Back</a> is a real back affordance that discoverElements admits
   // via [onclick], and this text arm is the only one that can see it.
   .or(page.locator('a').filter({ hasText: BACK_NAME }))
   .or(page.getByRole('button', { name: BACK_NAME }))
   .or(page.getByRole('link', { name: BACK_NAME }))
   // An anchor WITHOUT href has no link role, so the role arms cannot see
   // <a aria-label="Back" onclick=…> — yet discoverElements admits it via
   // [onclick] and it is a real back affordance. Label∩anchor covers it.
   .or(page.getByLabel(BACK_NAME).and(page.locator('a')));
}

// The names the spec and the other lib file import; nothing else is exported.
export {
  test,
  attachJson,
  IDLE_MS,
  LOAD_SETTLE_MS,
  watchPageErrors,
  captureApiCalls,
  domSnapshot,
  discoverElements,
  testValueFor,
  BACK_OR_HOME,
  backControl,
  backControlAll,
  expect,
};
