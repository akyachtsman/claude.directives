// Generic exploratory UI test — no project-specific selectors or credentials.
// Credential comes from the TEST_AUTH_CREDENTIAL environment variable only.
// Discovers app structure, exercises all interactive elements, captures API calls.
//
// ⚠️ Known CI compatibility issue — 100dvh not supported in older CI browsers:
// The CSS unit 100dvh (dynamic viewport height) is not supported in older CI browser
// versions (Chromium/WebKit in GitHub Actions). Elements using min-height: 100dvh may
// have zero computed height, causing Playwright toBeVisible() checks to fail even though
// the element is in the DOM. When diagnosing S1/S2 failures where login screen elements
// are present in HTML but not visible to Playwright, check for dvh units in CSS and
// replace with vh.

import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL — environment only
// ─────────────────────────────────────────────────────────────────────────────
// The credential comes from the TEST_AUTH_CREDENTIAL secret and nowhere else.
// This used to fall back to scraping CLAUDE.md, which was both a standing
// instruction to commit a credential (global.md -> Security) and a live hazard:
// the regex matched the TABLE LABEL, so prose in the row returned a bogus
// "credential" that S3 then typed into the first text input it found. An unset
// secret must mean "no credential" — auth tests self-skip, and nothing is typed.
const AUTH_CREDENTIAL = process.env.TEST_AUTH_CREDENTIAL || null;
// Optional second field for email+password gates (directives#304): without it,
// heuristic 2 below fills only the password, an email+password form submits a
// BLANK identifier, the backend rejects it, and the failure reads as a bad
// credential rather than a suite that never filled the username. Same secret
// plumbing as TEST_AUTH_CREDENTIAL (workflow secret -> ui-suite input -> env).
const AUTH_EMAIL = process.env.TEST_AUTH_EMAIL || null;

// ─────────────────────────────────────────────────────────────────────────────
// IDLE CAP — every networkidle wait is bounded, because NOTHING ELSE BOUNDS IT
// ─────────────────────────────────────────────────────────────────────────────
// Playwright Test defaults `use.navigationTimeout` to 0 = NO TIMEOUT, and
// waitForLoadState() inherits that default. So an un-timed
// waitForLoadState('networkidle', { timeout: IDLE_MS }) on a page that polls, holds a websocket open,
// or streams is bounded ONLY by the enclosing test timeout — one call can eat a
// whole scenario's budget. The `.catch(() => {})` at each call site does not
// help: with no timeout the promise never rejects, it just never settles.
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
// LOAD_SETTLE_MS — a late arrival turns a FAIL into a PASS (9 sites):
//   S1, ENTRY          a late error is never counted and the gate is green
//   S2                 detectAuthGate's answer becomes mechanism 'none', so S2
//                      passes without ever trying the credential
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
// the load gates (S1, ENTRY) assert.
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
    resources.push(`${type} ${why}: ${url}`);
  };
  page.on('pageerror', e => js.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // Classification comes from the request handlers below; skipping the console
    // copy keeps a single 404 from also counting as a JS error.
    if (/Failed to load resource/i.test(m.text())) return;
    js.push(m.text());
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
  return { js, resources, all: () => [...js, ...resources] };
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
      const entry = {
        url: typeof args[0] === 'string' ? args[0] : args[0]?.url,
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
// AUTH DISCOVERY & ATTEMPT
//
// ⚠️ COST, because five scenarios pay it and four of them once sized as if it
// were free. Bounded worst case for ONE detectAndAuth() call:
//
//     waitFor visible (explicit, below)                        10s
//   + PIN path: N digits x (actionTimeout 10s + 80ms) + 3s
//       N=4                                                    43.3s
//       N=8                                                    83.6s
//     (password/text paths are CHEAPER: fill 10 + submit 10 + 3 = 23s, or 33s
//      with the optional TEST_AUTH_EMAIL fill — either way the PIN keypad
//      remains the sizing case)
//     ----------------------------------------------------------
//     ~53s at N=4        ~94s at N=8
//
// N is the CREDENTIAL LENGTH — supplied per project, so like S3's element count
// it is not bounded by any constant in this file. Every budget below that
// includes this term states which N it assumed. If a scenario times out with a
// long credential, THAT is the term to look at first.
//
// And the whole preamble — goto + settle + detectAuthGate + detectAndAuth +
// settle — is the ~98s figure NAV's budget already used. It was derived there in
// round 5 and then not applied to S2, S4 or CTRL, which is how three scenarios
// came to be sized for two of their five terms.
// ─────────────────────────────────────────────────────────────────────────────
async function detectAndAuth(page, credential) {
  // Wait for auth UI to be fully active before interacting — prevents CI timing failures
  // on mobile/WebKit where JS activates slower than desktop Chromium.
  await page.locator('[class*="keypad"], [class*="pin"], input[type="password"], input[type="text"]')
    .first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

  // Heuristic 1: numeric keypad (buttons 0-9 + dot indicators)
  const hasNumericButtons = await page.locator('button').filter({ hasText: /^[0-9]$/ }).count();
  const hasDotIndicator   = await page.locator('[class*="dot"], [class*="pin"]').count();

  if (hasNumericButtons >= 9 && hasDotIndicator > 0) {
    // PIN keypad — click each digit as a string (preserve leading zeros)
    for (const digit of String(credential).split('')) {
      await page.locator('button').filter({ hasText: new RegExp(`^${digit}$`) }).first().click();
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(3000);
    return 'pin-keypad';
  }

  // Heuristic 2: password input
  const passwordInput = page.locator('input[type=password]').first();
  if (await passwordInput.isVisible().catch(() => false)) {
    // Email+password gate: fill the identifier BEFORE the password when one was
    // supplied. ANCHORED TO THE PASSWORD'S OWN FORM — a page-scoped
    // input[type=email] with .first() would hand the identifier to whatever
    // email field happens to come first in the DOM (a newsletter box, a hidden
    // responsive copy), the login then submits a blank identifier, and the
    // gate-cleared check below fails every authenticated scenario. A gate with
    // no <form> element falls back to page scope with type=email ONLY: off-form,
    // a bare text input is more likely a search box than a login field.
    // Without TEST_AUTH_EMAIL the old password-only behaviour is unchanged.
    if (AUTH_EMAIL) {
      const authForm = passwordInput.locator('xpath=ancestor::form[1]');
      const emailInput = (await authForm.count().catch(() => 0))
        ? authForm.locator('input[type=email], input[type=text], input:not([type])').first()
        : page.locator('input[type=email]').first();
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill(String(AUTH_EMAIL));
      }
    }
    await passwordInput.fill(String(credential));
    const submitBtn = page.locator('button[type=submit], input[type=submit], button').filter({ hasText: /sign.?in|log.?in|submit|enter/i }).first();
    if (await submitBtn.isVisible().catch(() => false)) await submitBtn.click();
    else await passwordInput.press('Enter');
    await page.waitForTimeout(3000);
    return 'password-form';
  }

  // Heuristic 3: text input accepting short credential
  const textInput = page.locator('input[type=text], input:not([type])').first();
  if (await textInput.isVisible().catch(() => false)) {
    await textInput.fill(String(credential));
    await textInput.press('Enter');
    await page.waitForTimeout(3000);
    return 'text-input';
  }

  return 'none'; // no auth gate detected
}

// Detection-only: is there a real auth gate (PIN keypad or password field)? Does NOT
// interact, and deliberately ignores plain text inputs (a search/filter box is not an
// auth gate). Used to decide whether to skip/auth without firing spurious login attempts.
async function detectAuthGate(page) {
  await page.locator('[class*="keypad"], [class*="pin"], input[type="password"]')
    .first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const hasNumericButtons = await page.locator('button').filter({ hasText: /^[0-9]$/ }).count();
  const hasDotIndicator   = await page.locator('[class*="dot"], [class*="pin"]').count();
  if (hasNumericButtons >= 9 && hasDotIndicator > 0) return true;
  if (await page.locator('input[type=password]').first().isVisible().catch(() => false)) return true;
  // Text/access-code gate (detectAndAuth's text-input path): a SINGLE visible text input
  // on a sparse, login-like page — gated on auth-ish context so an arbitrary search/filter
  // box on a content-rich page is NOT treated as auth.
  return await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (inputs.length !== 1) return false;
    const el = inputs[0];
    const ctx = [el.placeholder, el.getAttribute('aria-label'), el.name, el.id,
                 document.body.innerText?.slice(0, 300)].join(' ').toLowerCase();
    const looksAuth = /\b(pin|passcode|access\s*code|access|log\s*in|login|sign\s*in|unlock|enter\s*code|password)\b/.test(ctx);
    const controls = document.querySelectorAll('button, [role=button], a[href], select, textarea').length;
    return looksAuth && controls <= 4;
  });
}

// After an auth ATTEMPT, a still-present gate is PROOF the attempt failed —
// unlike gate ABSENCE, which is only a window (#302: an app whose gate renders
// late still reads as clear). So presence FAILS LOUDLY here, and absence lets
// the scenario proceed while remaining the window it always was. Before this
// check existed, S3/S4/CTRL/NAV/DISMISS discarded detectAndAuth's result: a
// wrong credential, a rotated secret, or the blank-email defect (#304) left
// every one of them measuring the LOGIN SCREEN and passing green.
// COST: detectAuthGate burns its full 5s waitFor precisely when the gate is
// GONE, so this adds ~5s to every SUCCESSFUL auth preamble. Absorbed by the
// existing budgets (worst headroom after +5s: S4/CTRL ~184s of 240, NAV ~293s
// of 360, DISMISS ~950s of 1200) — re-derived, not assumed.
async function expectGateCleared(page, mechanism, gateViewBefore) {
  if (mechanism === 'none') return; // nothing was attempted — nothing to verify
  if (!(await detectAuthGate(page))) return; // cleared — a WINDOW (#302), as stated above
  // A password field on the LANDED page is not the login gate: an app whose
  // successful landing view carries one (account settings, a change-password
  // form) would read as a rejected login and fail every authenticated scenario.
  // Discriminate on the VIEW: same signature as before the attempt -> the gate
  // did not clear -> fail loudly. Different view but still gate-like ->
  // ambiguous -> attach a diagnostic and continue, because a false red here
  // blocks the whole suite while a wrongly-passed ambiguity is caught by the
  // scenarios themselves measuring a page that is not the app.
  const viewNow = await viewSignature(page);
  if (viewNow === gateViewBefore) {
    throw new Error(
      `Auth gate still present after a '${mechanism}' attempt (view unchanged) — refusing to run ` +
      `this scenario against the login screen. Check TEST_AUTH_CREDENTIAL` +
      (mechanism === 'password-form' ? ' and TEST_AUTH_EMAIL (email+password gates need both, directives#304)' : '') +
      `; a rejected credential and a never-filled field look identical from here.`
    );
  }
  test.info().attach('auth-ambiguous', {
    body: JSON.stringify({
      mechanism,
      note: 'The view changed after the auth attempt but the landed page still matches the gate heuristics (a visible password field or PIN-like controls). Proceeding — but if this scenario then measures a page that is not the app, start here.',
    }, null, 2),
    contentType: 'application/json',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE ELEMENT DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────
async function discoverElements(page) {
  return page.evaluate(() => {
    const selectors = ['button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea',
                       '[role=button]', '[onclick]'];
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
          selector: sel,
          index,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? null,
          label: (el.textContent?.trim().slice(0, 60) ||
                  el.getAttribute('aria-label') ||
                  el.getAttribute('placeholder') ||
                  el.getAttribute('name') ||
                  el.id || '').slice(0, 60),
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
// SCENARIO 1 — Page Load
// ─────────────────────────────────────────────────────────────────────────────
test('S1: page loads without JS errors', async ({ page }) => {
  // Sized for what this scenario can actually spend, which the 30s config
  // default is not: goto() may take navigationTimeout (30s) and the load-gate
  // wait below may take LOAD_SETTLE_MS (25s) before either assertion runs. On a
  // page that polls or streams — where networkidle is EXPECTED to time out
  // harmlessly — S1 was killed as a test timeout before it read the watcher at
  // all, turning a deliberate observation window into a failure to observe.
  // ENTRY got this when its gate widened; S1 did not, in the same edit.
  //
  //   goto (navigationTimeout)   30s
  // + LOAD_SETTLE_MS             25s
  // + evaluate + assertions      the THIRD term — 60_000 left it exactly 5s,
  //                              which is an implicit zero dressed as slack
  //   -------------------------------
  //   90_000, so a busy main thread cannot eat the observation itself
  test.setTimeout(90_000);
  const errors = watchPageErrors(page);
  await page.goto('./');
  // LOAD_SETTLE_MS, not IDLE_MS: the assertion below reads the error watcher the
  // instant this returns, so this wait is the observation window, not overhead.
  await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
  const bodyText = await page.evaluate(() => document.body.innerText?.trim());
  expect(bodyText?.length, 'Page body is empty').toBeGreaterThan(0);
  expect(errors.all(), `Errors on load: ${errors.all().join('; ')}`).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2 — Auth Discovery & Login (with API diagnostics)
// ─────────────────────────────────────────────────────────────────────────────
test('S2: auth gate discovered and credential accepted', async ({ page }) => {
  if (!AUTH_CREDENTIAL) test.skip(true, 'No auth credential provided — set the TEST_AUTH_CREDENTIAL env var (and TEST_AUTH_EMAIL for email+password gates); skipping auth test');
  const pageErrors = watchPageErrors(page);

  // BUDGET — the 60_000 here was sized from the first TWO terms and stopped:
  // goto 30 + settle 25 = 55, leaving 5s, which is exactly detectAuthGate()'s
  // own timeout and nothing at all for the authentication it exists to perform.
  // A healthy public app with persistent network activity would time out while
  // CONCLUDING no gate exists, and a late gate would time out mid-login.
  //
  //   goto (navigationTimeout)              30s
  // + LOAD_SETTLE_MS settle                 25s
  // + detectAuthGate() waitFor               5s
  // + detectAndAuth() (see its header)     ~53s at N=4    ~94s at N=8
  // + snapshots, error read, assertions      ~few s
  //   ------------------------------------------
  //   ~113s at N=4                          ~154s at N=8
  //
  // 180_000 covers an 8-digit PIN with ~26s spare. SIZING ESTIMATE under a
  // stated assumption, not a proof: N is the project's credential length.
  test.setTimeout(180_000);
  const getApiCalls = await captureApiCalls(page);
  await page.goto('./');
  // LOAD_SETTLE_MS, not IDLE_MS: what follows this wait is detectAuthGate(), and
  // its answer is read as a CONCLUSION — "no gate" becomes mechanism 'none' and
  // S2 passes without ever trying the credential. A gate that renders after the
  // settle is therefore a silent pass on an app whose auth was never exercised.
  // The wait is the measurement here, not overhead.
  // ⚠️ RESIDUAL: this WIDENS the observation window (25s here + the 5s waitFor
  // inside detectAuthGate) — it does not make "no gate" a proof. An app whose
  // gate-determining request is still pending at 30s still reads as mechanism
  // 'none'. Closing that needs an explicit auth-readiness condition (a named
  // request settling, or a gate/app-shell selector), not a larger number.
  await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});

  const beforeSnap = await domSnapshot(page);
  // Gate the auth attempt on detectAuthGate() — same as S4 and gotoAndAuth. Unguarded,
  // detectAndAuth's text-input fallback would type the credential into the first visible
  // text input (e.g. a public app's search box) and then falsely report auth failure.
  const mechanism  = (await detectAuthGate(page))
    ? await detectAndAuth(page, AUTH_CREDENTIAL ?? '')
    : 'none';
  const afterSnap  = await domSnapshot(page);

  const domChanged = JSON.stringify(beforeSnap) !== JSON.stringify(afterSnap);
  // A wrong credential often renders an inline error, which itself changes the DOM —
  // so domChanged alone is not proof of success. Treat a non-empty on-screen error as a
  // failure even when the DOM changed. Read the first VISIBLE, non-empty error element:
  // apps often keep hidden/empty `.error` placeholders, so `.first().textContent()` could
  // read the wrong node. Synchronous evaluate — no locator waiting, so it can't burn the
  // test timeout either.
  const onscreenError = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[id*="err"], [class*="err"], [class*="error"]')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    for (const el of els) { const t = (el.textContent || '').trim(); if (t) return t; }
    return '';
  });

  if (mechanism !== 'none' && (!domChanged || onscreenError.length > 0)) {
    const apiCalls = await getApiCalls();
    const errText  = onscreenError;
    const firstKey = apiCalls[0]?.firstFieldKey ?? null;
    const diag = {
      mechanism,
      credentialProvided: AUTH_CREDENTIAL ? 'yes' : 'none — set TEST_AUTH_CREDENTIAL',
      onscreenError: errText,
      consoleErrors: pageErrors.all(),
      apiCalls,
      responseShape: firstKey
        ? `rows returned, first field "${firstKey}"`
        : (apiCalls[0]?.status >= 400 ? `non-2xx (${apiCalls[0]?.status})` : 'no rows returned — check query / RLS / auth'),
    };
    test.info().attach('auth-diagnostics', {
      body: JSON.stringify(diag, null, 2),
      contentType: 'application/json',
    });
    throw new Error(
      `S2 FAIL | mechanism: ${mechanism} | onscreenError: "${errText}" | ` +
      `API status: ${apiCalls[0]?.status ?? 'no call'} | ` +
      `recordCount: ${apiCalls[0]?.recordCount ?? 'n/a'} | ` +
      `responseShape: ${diag.responseShape} | ` +
      `consoleErrors: ${pageErrors.all().join('; ') || 'none'}`
    );
  }

  // Auth passed or no auth required — record mechanism
  test.info().attach('auth-result', {
    body: JSON.stringify({ mechanism, domChanged }),
    contentType: 'application/json',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3 — Element Mapping & Interaction Sweep
// ─────────────────────────────────────────────────────────────────────────────
test('S3: interactive elements discovered and exercised without errors', async ({ page }) => {
  // BUDGET — sized from the MATRIX, not from one profile. This sweep is
  // UNCAPPED: it visits every element discoverElements() returns, at ~1.5s
  // settle plus a networkidle wait (now bounded by IDLE_MS, 5s — it was bounded
  // by nothing at all, see the note at the top of this file), so its cost is
  // (element count x project count). playwright.config.js ships FOUR projects;
  // the 240_000 this replaces was written when the matrix was phones only, and
  // desktop and tablet arrived later without anyone re-reading the number.
  //
  // This budget is sized from MEASUREMENT, not from a worst case — with the
  // element count unbounded, no fixed number can be a true ceiling. ~14.5s per
  // element in the worst case means ~62 elements fills 900s, while the real
  // apps measured below sweep far more than that far faster. If your app is
  // control-dense enough to approach it, re-measure rather than assume.
  //
  // ⚠️ WIDER IS SLOWER, which is the counter-intuitive part. Clipped controls
  // inside overflow:hidden boxes are skipped, and a wide viewport clips FEWER
  // of them — so more get swept. Measured in claude.trading (run 32655955615,
  // head 607ab63): mobile-chrome and iphone 468s PASS, tablet >480s TIMEOUT.
  // Every profile was at the wall; the phones "passed" with a twelve-second
  // margin, and the wider one crossed first.
  //
  // 900_000 is ~1.9x that measured worst case, deliberately NOT ~1.03x. A bound
  // tuned to just-above-observed reports as flakiness rather than as signal,
  // which is how 240 survived: a test TIMEOUT reads as infra noise, so nobody
  // investigates it. Raise this BEFORE adding projects, never after — and see
  // the calling job's timeout-minutes, which this number pushes against.
  test.setTimeout(900_000);
  // Public-first apps (knowledge hub, questionnaire) are swept even with no credential;
  // only auth-gated apps with no credential are skipped (decided after page load below).
  const pageErrors = watchPageErrors(page);
  const apiAnomalies  = [];

  const getApiCalls = await captureApiCalls(page);
  await page.goto('./');
  // LOAD_SETTLE_MS: what follows this preamble is discoverElements(). An element
  // that renders late is never swept, so a broken control can leave S3 green by
  // arriving after the settle. Measurement, not overhead.
  await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
  // Authenticate if we have a credential; if there's a real auth gate but no credential,
  // skip — sweeping the login screen would fire spurious PIN/password attempts and 401/403s
  // don't block, so the job could "pass" without reaching app content. A public app with
  // no gate falls through and is swept normally.
  if (AUTH_CREDENTIAL) {
    const gateViewBefore = await viewSignature(page);
    const mechanism = await detectAndAuth(page, AUTH_CREDENTIAL);
    await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    await expectGateCleared(page, mechanism, gateViewBefore);
  } else if (await detectAuthGate(page)) {
    test.skip(true, 'Auth gate present but no credential — skipping sweep (would only exercise the login screen)');
  }

  const elements = await discoverElements(page);
  test.info().attach('element-map', {
    body: JSON.stringify(elements, null, 2),
    contentType: 'application/json',
  });

  const findings = [];

  for (const el of elements) {
    // .all(), not .js: a click that triggers a failed dynamic import, route
    // chunk or lazily-loaded stylesheet breaks the interaction without adding a
    // JS error, and the raw-console listener this replaced did catch those.
    const errorsBefore = pageErrors.all().length;
    // Only calls made by THIS interaction count as findings. callsBefore is the baseline
    // length; loadIdBefore detects whether the interaction navigated (which resets the
    // array) so we don't mis-slice the new page's calls — see recentBadCalls below.
    const callsBefore  = ((await getApiCalls()) ?? []).length;
    const loadIdBefore = await page.evaluate(() => window.__pageLoadId).catch(() => null);
    const snapBefore   = await domSnapshot(page);

    try {
      // CSS.escape is browser-only — in this Node context it throws, and the
      // catch below would silently skip every id-bearing element. JSON.stringify
      // yields a CSS-string-compatible escape for the [id="…"] selector.
      const locator = el.id
        ? page.locator(`[id=${JSON.stringify(el.id)}]`)
        : page.locator(el.selector).nth(el.index);

      if (!await locator.isVisible().catch(() => false)) continue;

      if (['button', 'a'].includes(el.tag) || el.type === 'submit' || el.selector.includes('role=button')) {
        await locator.click({ timeout: 3000 });
        await page.waitForTimeout(1500);
        await page.waitForLoadState('networkidle', { timeout: IDLE_MS }).catch(() => {});
      } else if (el.tag === 'textarea' ||
                 (el.tag === 'input' &&
                  [null, 'text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(el.type))) {
        // fill() only works on text-like inputs — on checkbox/radio/file/range/color it
        // throws "Cannot fill…", which the expected-error regex in the catch below does
        // NOT match, producing spurious interactionError findings.
        await locator.fill(testValueFor(el), { timeout: 3000 });
      } else if (el.tag === 'input' && ['checkbox', 'radio'].includes(el.type)) {
        await locator.click({ timeout: 3000 });
      } else if (el.tag === 'select') {
        const options = await locator.locator('option').allTextContents();
        if (options.length > 1) await locator.selectOption({ index: 1 });
      }

      const snapAfter      = await domSnapshot(page);
      const domTransition  = JSON.stringify(snapBefore) !== JSON.stringify(snapAfter);
      const newErrors      = pageErrors.all().slice(errorsBefore);
      const apiCalls       = (await getApiCalls()) ?? [];
      // If the interaction navigated, window.__apiCalls was reset to the new page's calls
      // (which are unrelated to callsBefore and may be the same length or longer). Detect
      // that via the page-load id and treat ALL current calls as recent; otherwise slice
      // off the pre-interaction baseline. (Length alone is unreliable — a reset page with
      // one failing call can match callsBefore and hide the failure.)
      const loadIdAfter    = await page.evaluate(() => window.__pageLoadId).catch(() => null);
      const navigated      = loadIdAfter !== loadIdBefore;
      const recentBadCalls = (navigated ? apiCalls : apiCalls.slice(callsBefore))
        .filter(c => c.status >= 400);

      if (newErrors.length > 0 || recentBadCalls.length > 0) {
        findings.push({
          element: el.label || el.id || `${el.tag}[${el.index}]`,
          action: el.tag === 'input' ? 'fill' : 'click',
          consoleErrors: newErrors,
          apiErrors: recentBadCalls,
          domTransition,
        });
      }
    } catch (e) {
      // Stale / detached / not-found / timeout are expected during an exploratory
      // sweep of an SPA. Anything else is an unexpected interaction error worth
      // surfacing — recorded as a non-blocking finding (no consoleErrors/apiErrors, so
      // it doesn't fail this advisory job) rather than silently swallowed.
      const msg = String(e?.message ?? e);
      if (!/detached|not attached|stale|no longer|not visible|element is not|Timeout.*exceeded/i.test(msg)) {
        findings.push({
          element: el.label || el.id || `${el.tag}[${el.index}]`,
          action: el.tag === 'input' ? 'fill' : 'click',
          consoleErrors: [],
          apiErrors: [],
          interactionError: msg,
          domTransition: false,
        });
      }
    }
  }

  // ⚠️ KNOWN LIMIT, stated rather than half-closed. Each element's diagnostics
  // are sampled right after its IDLE_MS settle, so a failure arriving LATER than
  // that is attributed to the NEXT element — and for the LAST element there is no
  // next iteration, so it is not seen at all. A control whose request 500s after
  // five seconds can therefore pass here.
  //
  // A post-sweep "late arrival" window was tried and REMOVED (#301, rounds 7-9).
  // It did not work: waitForLoadState('networkidle') RESOLVES IMMEDIATELY when the
  // page is already idle — the timeout is a maximum, not a delay — so the window
  // was a no-op in exactly the common case, while looking like coverage. Two
  // further rounds of fixes on top of it found a blind interval between the last
  // per-element sample and the window's baseline, and a stale API baseline across
  // a late navigation. Reverted rather than repaired.
  //
  // Closing this properly needs an explicit COMPLETION CONDITION, not a delay:
  // track the requests captureApiCalls() sees start during an interaction and
  // wait for those specific ones to settle, bounded. That is a design change and
  // belongs in its own diff, with the design settled before the code.
  //
  // Until then: widening IDLE_MS localises late failures at (elements x projects)
  // cost. THERE IS NO BACKSTOP — an earlier version of this comment claimed
  // qa-live was one, and that was wrong: Playwright isolates each test's page and
  // context, so this scenario's watchPageErrors listener is torn down when S3
  // ends and no later scenario can receive its delayed failure. The gap is the
  // gap, in both workflows. Said plainly because the false reassurance was
  // written INTO the commit that admitted the limit.

  test.info().attach('interaction-findings', {
    body: JSON.stringify(findings, null, 2),
    contentType: 'application/json',
  });

  const blocking = findings.filter(f => f.apiErrors.some(c => c.status >= 500) || f.consoleErrors.length > 0);
  expect(blocking, `Blocking anomalies found:\n${JSON.stringify(blocking, null, 2)}`).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4 — Responsive Layout
// ─────────────────────────────────────────────────────────────────────────────
test('S4: no horizontal overflow at 390px mobile viewport', async ({ page }) => {
  // BUDGET — S4 had NONE and inherited the 30s config default, while running the
  // same load-and-authenticate preamble NAV prices at ~98s. Once this PR set
  // navigationTimeout: 30_000, goto() ALONE could consume the whole test.
  //
  //   goto 30 + settle 25 + detectAuthGate 5 + detectAndAuth ~53 + settle 25
  //   = ~138s at N=4       ~179s at N=8
  //
  // Both settles are LOAD_SETTLE_MS as of round 12 (they feed the scrollWidth
  // verdict), which cost +40s and pushed ~179s against the previous 180_000.
  // 240_000, same as CTRL — one number for one shared preamble.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  // LOAD_SETTLE_MS: scrollWidth is read below as a VERDICT. Content that renders
  // late and introduces horizontal overflow arrives after an IDLE_MS settle and
  // S4 passes green on a layout that is broken.
  await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
  // Authenticate only when a real auth gate (PIN/password) is detected, so overflow is
  // measured against the real app rather than the login screen. Gate on detectAuthGate()
  // — NOT just "a credential exists" — so a public-first app with a stray text input
  // (search/filter) isn't mutated by detectAndAuth's text-input fallback before measuring.
  if (AUTH_CREDENTIAL && await detectAuthGate(page)) {
    const gateViewBefore = await viewSignature(page);
    const mechanism = await detectAndAuth(page, AUTH_CREDENTIAL);
    await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    await expectGateCleared(page, mechanism, gateViewBefore);
  }
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — load the app and authenticate if a real auth gate is present
// (mirrors the S3/S4 preamble: skips the test when gated with no credential, so
// the navigation/control invariants below never just exercise the login screen)
// ─────────────────────────────────────────────────────────────────────────────
async function gotoAndAuth(page) {
  await page.goto('./');
  // LOAD_SETTLE_MS at BOTH settles here, because every caller measures the view
  // this function returns: CTRL counts primary controls (a late duplicate = a
  // green on a duplicated CTA), DISMISS computes triggerCount (a late trigger is
  // never swept), NAV fingerprints the view. Overhead for none of them.
  await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
  // Detect once and branch — each detectAuthGate() call burns a 5s waitFor timeout when
  // no gate is present, so calling it in both branches wasted ~10s of the test timeout.
  const gated = await detectAuthGate(page);
  if (AUTH_CREDENTIAL && gated) {
    const gateViewBefore = await viewSignature(page);
    const mechanism = await detectAndAuth(page, AUTH_CREDENTIAL);
    await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    await expectGateCleared(page, mechanism, gateViewBefore);
  } else if (gated) {
    test.skip(true, 'Auth gate present but no credential — skipping navigation/control invariants');
  }
}

// A low-noise fingerprint of the current view — heading + control counts + a body
// text prefix. Used to tell drill-down levels apart and to detect a back control
// returning to a level it just left (a circular/ping-pong back loop). Deliberately
// avoids volatile generated ids; if a correct app re-renders unstable text and this
// false-fails, narrow it to a stable view title (e.g. the h1/h2 only).
async function viewSignature(page) {
  return page.evaluate(() => {
    // First VISIBLE heading, not first in the DOM: a display:none SPA keeps the
    // previous view mounted, so querySelector returns the heading of the screen
    // the user just left and every level shares one signature.
    const heads = [...document.querySelectorAll('h1, h2, [role=heading]')];
    const visible = heads.find((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      // A non-empty box is not visibility: an SPA that hides the previous view
      // with `visibility: hidden` (or opacity 0) keeps its heading's box, so the
      // stale heading was still picked and sibling levels shared one signature —
      // NAV then stopped drilling or declared the invariant inapplicable.
      // checkVisibility walks the rendered ancestor chain, which a computed-style
      // read on the element alone cannot: opacity is not inherited, so a panel at
      // opacity:0 leaves its heading reporting opacity 1 and a non-empty box.
      if (typeof el.checkVisibility === 'function') {
        return el.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
          contentVisibilityAuto: true,
        });
      }
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    });
    const h = (visible?.textContent || '').trim().slice(0, 80);
    const buttons = document.querySelectorAll('button, [role=button]').length;
    const inputs = document.querySelectorAll('input:not([type=hidden]), select, textarea').length;
    const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return `${h}#${buttons}#${inputs}#${text}`;
  });
}

// A single visible in-app back control, or an empty locator. Matches an accessible
// name / aria-label of "back" or a left-arrow glyph, or an explicit [data-back] hook.
// Deliberately narrow so the browser's Back button is NOT mistaken for an in-app one.
function backControl(page) {
  // Word-bound matching throughout (#308): :has-text and [aria-label*=] are
  // SUBSTRING matches, so both selected "Backup" — claude.prop's JSON-export
  // button — as a back control, and the unwind below would have pressed it.
  // :text-matches takes a real JS regex, so \b is available directly — a
  // whitespace emulation like (^|\s)back(\s|$) would reject the legitimate
  // "Go-back" / "Back:" / "Back ›" that the drill filter's \b ACCEPTS as back
  // controls, and NAV would then self-skip for want of a control it had just
  // classified. CSS cannot regex an attribute, so aria-label word-bounding goes
  // through getByLabel with the same regex, unioned in via .or(). The arrow
  // glyphs stay as plain has-text — they are not word characters, so \b around
  // them matches nothing.
  return page.locator(
    '[data-back], ' +
    'button:text-matches("\\bback\\b", "i"), a:text-matches("\\bback\\b", "i"), ' +
    'button:has-text("←"), a:has-text("←")'
  ).or(page.getByLabel(/\bback\b/i))
  // `.first()` alone grabs the FIRST IN THE DOM, which in the common SPA pattern
  // (prior views kept mounted under display:none) is the hidden control from the
  // level above — so the back-flow test drove a dead element and self-skipped as
  // "invariant N/A" on an app that fully exercises the invariant.
  .locator('visible=true').first();
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO — NAV: in-app back navigation strictly unwinds (no circular loop)
// Drill to the deepest level reachable, then press the in-app back control once
// per level: each back must retrace to the prior level and never return to the
// level it just left (an A↔B ping-pong). Catches the class of bug where "back"
// tracks the last page visited instead of an origin-aware nav stack. Skips when
// the app has no multi-level drill-down or no in-app back control (invariant N/A).
// ─────────────────────────────────────────────────────────────────────────────
test('NAV: back navigation strictly unwinds (no loop)', async ({ page }) => {
  // BUDGET — SIZING ESTIMATE, and the previous version of this comment was
  // simply wrong. It said "bounded by DEPTH_CAP, not by element count". DEPTH_CAP
  // bounds SUCCESSFUL drill levels only; the candidate loop below tries every
  // visible button/link until one changes the view, and each failed attempt costs
  // a 3s click + 800ms + IDLE_MS. On a control-dense page that is element-
  // dependent work with no relation to depth, and 120_000 could not cover it.
  //
  // Bounded now by ATTEMPT_CAP across ALL levels, so the element-dependent term
  // has a ceiling:
  //
  //   initial gotoAndAuth(), gate re-presenting                ~138s
  // + 12 candidate attempts x (3s click + 0.8s + 5s idle)      = ~106s
  // + DEPTH_CAP backs       x ~8.8s                            =  ~44s
  //   -------------------------------------------------------------
  //   worst assumed mix                                         ~288s
  //
  // The preamble term went ~98s -> ~138s in round 12 (both gotoAndAuth settles
  // became LOAD_SETTLE_MS), which put ~288s against the previous 300_000.
  // 360_000 covers it. Same caveat as S9: this is a sum over the CAPPED path
  // under stated assumptions, not a proof — how many candidates a view offers is
  // a property of the app, not of this file.
  //
  // The two IDLE_MS settles INSIDE the loops below stay at 5s deliberately: they
  // precede viewSignature() reads, where a late view change reads as "no change"
  // and ends the drill — a SKIP, not a green. The back-loop read is the mirror
  // case: a late arrival there turns a PASS into a FAIL, which is loud. Neither
  // can be turned green by arriving late, which is the test that decides this.
  test.setTimeout(360_000);
  await gotoAndAuth(page);

  const DEPTH_CAP = 5;
  // Bounds the element-dependent work DEPTH_CAP does not: a view whose visible
  // controls never change the signature would otherwise be walked in full, at
  // every level. Total across all levels, not per level. Not silent — running
  // out is reported distinctly from "this app has no drill-down" below, because
  // those need opposite responses.
  const ATTEMPT_CAP = 12;
  let attempts = 0;
  // Counted so the skip below can say WHICH of its causes fired (#308): a
  // control wrongly excluded by the back-filter reads identically to "this app
  // has no drill-down" unless the exclusions are reported.
  let candidatesSeen = 0;
  let excludedAsBack = 0;
  // A click that DID change the view but revealed no back control ends the
  // level with advanced=false and can reach the skip below — where a message
  // claiming every attempt produced "no view change" would point the reader at
  // fixture data or excluded labels instead of the navigation that happened.
  let viewChangedNoBack = 0;
  // Tracked separately from the skip branch below, which only runs when the
  // traversal found NOTHING. If an earlier level drilled in successfully and a
  // later one exhausts the cap, that branch is bypassed entirely — the test
  // unwinds the prefix it did find and passes, silently having stopped early.
  // A budget outcome that only reports when it is also a coverage outcome is
  // not reported at all in the case that matters most.
  let capExhausted = false;
  const forward = [await viewSignature(page)]; // forward[0] = starting level

  // Drill down: at each level click the first "drill-in" candidate that BOTH changes
  // the view AND reveals an in-app back control. Stop at the cap, on no change, or
  // when no further drill-in exists.
  for (let d = 0; d < DEPTH_CAP; d++) {
    const before = forward[forward.length - 1];
    let advanced = false;
    for (const el of await discoverElements(page)) {
      if (!['a', 'button'].includes(el.tag) && !el.selector.includes('role=button')) continue;
      candidatesSeen++;
      // Word-bound (#308): the unanchored version matched Backup, Feedback,
      // Background, Returns and Homepage, silently excluding legitimate
      // drill-down entry points. The arrow glyphs sit OUTSIDE the \b group —
      // they are not word characters, so \b around them matches nothing.
      if (/\b(back|return|home)\b|[←‹◀]/i.test(el.label)) { excludedAsBack++; continue; }
      if (attempts >= ATTEMPT_CAP) { capExhausted = true; break; }
      try {
        const loc = el.id ? page.locator(`[id=${JSON.stringify(el.id)}]`) : page.locator(el.selector).nth(el.index);
        if (!await loc.isVisible().catch(() => false)) continue;
        attempts++;
        await loc.click({ timeout: 3000 });
        await page.waitForTimeout(800);
        await page.waitForLoadState('networkidle', { timeout: IDLE_MS }).catch(() => {});
      } catch { continue; }
      const after = await viewSignature(page);
      const hasBack = await backControl(page).isVisible().catch(() => false);
      // Any view change ends this level's search: a drill-in (has a back control →
      // descend and keep going) or an unexpected move (no back control → stop, rather
      // than keep clicking a now-stale element list from the page we just left).
      if (after !== before) { if (hasBack) { forward.push(after); advanced = true; } else { viewChangedNoBack++; } break; }
    }
    if (!advanced) break;
  }

  // Report the budget outcome UNCONDITIONALLY — before the skip check, and
  // whether or not the traversal found enough to assert on.
  if (capExhausted) {
    test.info().attach('nav-budget', {
      body: JSON.stringify({
        attemptCap: ATTEMPT_CAP,
        attempts,
        levelsFound: forward.length - 1,
        note: `Stopped after ${ATTEMPT_CAP} candidate attempts. Traversal was TRUNCATED: levels deeper than those found were never reached, so a passing result here covers only the prefix listed. Raise ATTEMPT_CAP and this scenario's timeout together if the app is control-dense.`,
      }, null, 2),
      contentType: 'application/json',
    });
  }

  // Need at least two levels AND a back control on screen to assert anything.
  if (forward.length < 2 || !(await backControl(page).isVisible().catch(() => false))) {
    // Three causes collapse into this one skip and only the first is a
    // legitimate N/A (#308): the app genuinely has no drill-down; an entry
    // point was excluded by the back-filter; or the signed-in fixture seeds no
    // data, so there is nothing to drill into. The counts make the reader able
    // to tell which — the suite cannot know a project's data, so it reports
    // what it saw instead of guessing.
    test.skip(true, capExhausted
      ? `Stopped after ${ATTEMPT_CAP} candidate attempts without finding a drill-in — the back-flow invariant was NOT evaluated. This is a budget outcome, not evidence the app lacks drill-down: raise ATTEMPT_CAP and this scenario's timeout together if the app is control-dense.`
      : `No multi-level drill-down with an in-app back control found — back-flow invariant N/A. ` +
        `(${candidatesSeen} candidates seen, ${excludedAsBack} excluded as back/home controls, ${attempts} tried: ` +
        `${viewChangedNoBack} changed the view without revealing a back control, the rest produced no view change.) ` +
        `If exclusions are nonzero, check those labels before trusting the N/A; if view changes without a back control ` +
        `are nonzero, the app navigates but backControl() did not recognise its back affordance; if the signed-in ` +
        `fixture seeds no rows, there may be nothing to drill into — a coverage gap, not an exercised invariant.`);
  }

  // Unwind: one back press per descended level. Each result must equal the expected
  // prior level and must NOT equal the level just left (the ping-pong signature).
  const trail = [];
  for (let i = forward.length - 1; i >= 1; i--) {
    const left = forward[i];          // current level, before pressing back
    const expected = forward[i - 1];  // the level back should return to
    const back = backControl(page);
    if (!await back.isVisible().catch(() => false)) break;
    await back.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    await page.waitForLoadState('networkidle', { timeout: IDLE_MS }).catch(() => {});
    const now = await viewSignature(page);
    trail.push({ stepFromDeepest: forward.length - i, expected, left, got: now });
    test.info().attach('back-flow-trail', { body: JSON.stringify(trail, null, 2), contentType: 'application/json' });
    expect(now,
      `Back from level ${i} returned to the level it just left — circular/ping-pong back navigation.`
    ).not.toBe(left);
    expect(now,
      `Back from level ${i} did not return to the prior level (origin-aware back broken).`
    ).toBe(expected);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO — CTRL: each primary action appears exactly once per view
// A duplicated primary CTA (e.g. two "Add asset" buttons) is a finding. Scans
// visible add/new/create controls, groups by accessible name, flags any with >1.
// ─────────────────────────────────────────────────────────────────────────────
test('CTRL: no duplicated primary action control', async ({ page }) => {
  // BUDGET — CTRL had NONE and inherited the 30s config default, while its first
  // statement is the gotoAndAuth() preamble. NAV and DISMISS budget for that call
  // explicitly; CTRL called the same function and was sized as if it were free.
  // That preamble went ~98s -> ~138s (N=4) / ~179s (N=8) in round 12 when both of
  // its settles became LOAD_SETTLE_MS — CTRL is one of the callers that made them
  // measurements, since a duplicate CTA rendering late is exactly what this scans
  // for. 240_000, same as S4.
  test.setTimeout(240_000);
  await gotoAndAuth(page);
  const dupes = await page.evaluate(() => {
    const norm = s => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const isPrimary = name => /^(add|new|create)\b/.test(name);
    const counts = {};
    for (const el of document.querySelectorAll('button, [role=button], a[href]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue; // visible only — a hidden mobile/desktop variant is fine
      const name = norm(el.textContent || el.getAttribute('aria-label'));
      if (!isPrimary(name)) continue;
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts).filter(([, n]) => n > 1).map(([name, n]) => ({ name, count: n }));
  });
  expect(dupes,
    `Duplicated primary action control(s) on the current view:\n${JSON.stringify(dupes, null, 2)}`
  ).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO — ENTRY: every deployed HTML entry point renders without JS errors
// A page with zero tests is a release blocker (test.md → UI coverage gates).
// Declare entry points beyond the baseURL in APP_PAGES (env var / repository
// variable): comma-separated paths relative to APP_URL, e.g.
// APP_PAGES="admin.html,vendor/console.html". Each gets the S1 load gate here;
// pages with richer flows deserve their own suite (Scenario 5+ below).
// ─────────────────────────────────────────────────────────────────────────────
test('ENTRY: every deployed entry point renders without JS errors', async ({ page }) => {
  const pages = (process.env.APP_PAGES || '').split(',').map(s => s.trim()).filter(Boolean);
  test.skip(pages.length === 0, 'No extra entry points declared (APP_PAGES) — the baseURL is covered by S1');
  // This loop had NO budget of its own and inherited the 30s config default,
  // which one page could exhaust on its own once the load-gate wait became a
  // real observation window. Scale with what the project actually declared:
  // goto (<=30s, navigationTimeout) + LOAD_SETTLE_MS + assertions per page —
  // and 60_000 counted the first two (55s) with 5s left for the third, the same
  // implicit zero S1 carried. 90_000 per page names the assertions instead.
  //
  // CAPPED, because `90_000 * pages.length` is unbounded in a value the PROJECT
  // supplies and this scenario runs once per Playwright project. 20 declared
  // pages at the full per-page allowance is ~18min x 4 serial projects = ~73min,
  // which on top of the ~59.6min slow-end cold baseline in qa.yml EXCEEDS the
  // 120-minute caller bound — so healthy ENTRY work could get the whole job
  // CANCELLED. That is the exact failure the job-bound comment exists to
  // prevent, reached from inside a per-test budget.
  //
  // The cap is on the BUDGET, not on the page list. Capping the list would drop
  // entry points from coverage, and "a page with zero tests is a release
  // blocker" is the rule this scenario enforces — same objection that rejected
  // capping S3's sweep. Capping the budget instead means a project that declares
  // more slow pages than 5 minutes covers gets a REPORTED ENTRY timeout naming
  // the scenario, rather than a silent job cancellation that reads inconclusive.
  //
  // If you hit it: split the entry points into their own suite (the note above
  // already recommends this for pages with richer flows), or raise this cap and
  // the caller's timeout-minutes TOGETHER — never this one alone.
  const ENTRY_CAP_MS = 300_000;
  test.setTimeout(Math.min(90_000 * pages.length, ENTRY_CAP_MS));
  const watcher = watchPageErrors(page);
  for (const path of pages) {
    // One watcher for the whole loop; each page is judged on the errors that
    // arrived after the previous one, so a failure names the page that caused it.
    const before = watcher.all().length;
    await page.goto('./' + path.replace(/^\//, ''));
    // LOAD_SETTLE_MS: same reasoning as S1 — this wait is the gate, not overhead.
    await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    const bodyText = await page.evaluate(() => document.body.innerText?.trim());
    expect(bodyText?.length, `${path}: page body is empty`).toBeGreaterThan(0);
    const fresh = watcher.all().slice(before);
    expect(fresh, `${path}: errors on load: ${fresh.join('; ')}`).toHaveLength(0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO — DISMISS: overlays close via their control, Escape, and backdrop
// "It has a close button" is not coverage; "clicking it closes" is (test.md →
// UI coverage gates). For each trigger that opens a modal/drawer/popover, the
// container must actually hide after (a) its close/X/Cancel control and
// (b) Escape — re-opened between checks — and (c) a backdrop click, asserted
// only when a backdrop element exists (some designs omit it deliberately).
// ─────────────────────────────────────────────────────────────────────────────
test('DISMISS: overlays close via control, Escape, and backdrop', async ({ page }) => {
  // BUDGET — bounded by TWO caps below, and the 180_000 it replaces sat under
  // its own. Per trigger the explicit waits total ~3.8s and there are five
  // click({ timeout: 2000 }) paths: ~13.8s worst case, x30 = ~414s against 180s.
  //
  // The nav-reset path is the expensive one and an earlier version of this
  // comment left it out. A trigger that NAVIGATES costs a full gotoAndAuth().
  //
  // ⚠️ SIZING ESTIMATE, NOT A PROVEN CEILING — and the wording matters, because
  // FIVE successive versions of this arithmetic were published and wrong. Each
  // omitted a different term: the nav-reset path, then a "30s default" that does
  // not exist (Playwright Test ships every timeout knob at 0), then the actions
  // inside detectAndAuth(), then the unconditional gotoAndAuth() below and its
  // post-auth idle wait. Every correction made the sum LOOK more rigorous while
  // leaving it just as unenforced.
  //
  // So this is what it actually is: a sum over the CAPPED path under the
  // assumptions listed, sized to fit with margin. It is not a proof. The mix of
  // trigger outcomes — navigate vs open-an-overlay vs neither — is a property of
  // the app under test, not of this file, and no constant here bounds it.
  //
  // Terms, each traceable: goto -> navigationTimeout (playwright.config.js),
  // networkidle -> IDLE_MS, gate probe -> the explicit 5s in detectAuthGate(),
  // digit clicks -> actionTimeout, per-trigger overlay path -> the five
  // click({ timeout: 2000 }) calls plus ~3.8s of explicit waits below.
  //
  //   gotoAndAuth(), gate re-presenting:
  //     goto 30 + settle 25 + probe 5 + detectAndAuth ~53 + post-auth settle 25
  //       = ~138s   (both settles became LOAD_SETTLE_MS in round 12: this
  //                  scenario's triggerCount is read straight off that view, so
  //                  a trigger rendering late is never swept at all)
  //     (detectAndAuth is a 10s visible-wait + ~10s per credential digit +
  //      3s settle — ~53s for a 4-digit PIN, scaling with credential length)
  //   gotoAndAuth(), auth persisting:                                      ~60s
  //
  //     initial call, gate re-presenting         ~138s
  //   + 3 nav resets    x ~138s                  = ~414s
  //   + 27 overlay-path x ~13.8s                 = ~373s
  //     ------------------------------------------------
  //     worst assumed mix                         ~925s
  //
  //     initial ~138s + 3 resets x ~60s + 27 x ~13.8s = ~691s  (auth persists)
  //
  // ~925s exceeded the previous 900_000. 1_200_000 covers both. NAV_RESET_CAP went 10 -> 5 -> 3 as the omitted terms
  // surfaced; the resets buy this scenario nothing (a navigating trigger is not
  // an overlay trigger), so spending fewer of them is the cheap side of the
  // trade every time.
  //
  // ⚠️ IF THIS TIMES OUT ANYWAY, do not revise this sum a sixth time. Read the
  // run's `dismiss-budget` ATTACHMENT (not the findings list — the cap is a
  // coverage outcome, not a defect): its presence tells you the app is nav-heavy
  // and the assumed mix was wrong. That is a measurement, and it beats another
  // derivation.
  test.setTimeout(1_200_000);
  await gotoAndAuth(page);

  const OVERLAY = 'dialog[open], [role="dialog"], [aria-modal="true"], .modal, .drawer, .popover, .overlay';
  const CLOSE = '[aria-label*="close" i], .close, .modal-close, button:has-text("Close"), button:has-text("Cancel"), button:has-text("×"), button:has-text("✕")';
  const TRIGGERS = 'button, [role=button], [aria-haspopup="dialog"]';
  const overlayVisible = async () => {
    for (const el of await page.locator(OVERLAY).all()) {
      if (await el.isVisible().catch(() => false)) return el;
    }
    return null;
  };

  const findings = [];
  const triggerCount = Math.min(await page.locator(TRIGGERS).count(), 30);
  // Cap the WASTED work, not the useful work. A navigating trigger is not an
  // overlay trigger, so it contributes nothing to this scenario's assertions —
  // the reset it forces is pure cost. Capping resets therefore loses no S9
  // coverage, where capping triggerCount would. Not silent: hitting the cap
  // writes a `dismiss-budget` attachment, so a suite that stops early says so
  // WITHOUT failing the scenario for triggers it never reached.
  const NAV_RESET_CAP = 3;
  let navResets = 0;

  for (let i = 0; i < triggerCount; i++) {
    // Re-resolve per round — the DOM may have re-rendered since discovery.
    const trigger = page.locator(TRIGGERS).nth(i);
    if (!await trigger.isVisible().catch(() => false)) continue;
    const name = ((await trigger.textContent().catch(() => '')) || '').trim().slice(0, 40) || `trigger[${i}]`;

    const urlBefore = page.url();
    await trigger.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(600);
    if (page.url() !== urlBefore && !(await overlayVisible())) {
      // Trigger navigated — not an overlay, so it is S3's territory.
      if (++navResets > NAV_RESET_CAP) {
        // ATTACHED, not pushed to findings[] — that array is asserted on at the
        // end, so recording a BUDGET outcome there failed the scenario for a
        // navigation-heavy app whose overlays are fine and were simply never
        // reached. "Not silent" must not mean "counted as a defect": S6 already
        // makes this distinction and S9 did not.
        test.info().attach('dismiss-budget', {
          body: JSON.stringify({
            navResetCap: NAV_RESET_CAP,
            stoppedAtTrigger: name,
            triggersConsidered: i + 1,
            of: triggerCount,
            note: `Stopped after ${NAV_RESET_CAP} navigation resets. Triggers beyond this point were NOT checked for overlay dismissal — a coverage gap, not a dismisser defect. Raise NAV_RESET_CAP and this scenario's timeout together if the app is navigation-heavy.`,
          }, null, 2),
          contentType: 'application/json',
        });
        break;
      }
      await gotoAndAuth(page);
      continue;
    }
    if (!(await overlayVisible())) continue;  // opens no overlay — S3's territory

    // The trigger owns an overlay: each dismisser must actually hide it.
    const reopen = async () => {
      if (await overlayVisible()) return true;
      await trigger.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(600);
      return Boolean(await overlayVisible());
    };

    // (a) the overlay's own close/X/Cancel control
    const ov = await overlayVisible();
    const close = ov.locator(CLOSE).first();
    if (!(await close.isVisible().catch(() => false))) {
      findings.push({ trigger: name, dismisser: 'close control', problem: 'no visible close/X/Cancel control in overlay' });
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    } else {
      await close.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(600);
      if (await overlayVisible()) findings.push({ trigger: name, dismisser: 'close control', problem: 'overlay still visible after clicking it' });
    }

    // (b) Escape
    if (await reopen()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      if (await overlayVisible()) findings.push({ trigger: name, dismisser: 'Escape', problem: 'overlay still visible' });
    } else {
      findings.push({ trigger: name, dismisser: 'Escape', problem: 'could not re-open overlay to test' });
    }

    // (c) backdrop — only asserted when a backdrop element exists
    const backdrop = page.locator('.backdrop, .modal-backdrop, .overlay-backdrop, [data-backdrop]').first();
    if (await reopen()) {
      if (await backdrop.isVisible().catch(() => false)) {
        await backdrop.click({ position: { x: 4, y: 4 }, timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(600);
        if (await overlayVisible()) findings.push({ trigger: name, dismisser: 'backdrop', problem: 'overlay still visible' });
      }
    }

    await page.keyboard.press('Escape').catch(() => {});   // leave closed for the next round
    await page.waitForTimeout(200);
  }

  test.info().attach('dismisser-findings', {
    body: JSON.stringify(findings, null, 2),
    contentType: 'application/json',
  });
  expect(findings, `Overlay dismisser failures:\n${JSON.stringify(findings, null, 2)}`).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5+ — Project-Specific Scenarios
// Source: CLAUDE.md § Project-Specific Test Scenarios
// Generic coverage is S1–S4 plus the NAV/CTRL invariants above; add
// project-specific scenarios starting at S5.
// Add one scenario per row in that table before running the QA pipeline.
// ─────────────────────────────────────────────────────────────────────────────
