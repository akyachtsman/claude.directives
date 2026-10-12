// Generic exploratory UI test — no project-specific selectors or credentials.
// Credential comes from the TEST_AUTH_CREDENTIAL environment variable, or from a
// login form that ships one in a password field (gateShipsCredential) — never a file.
// Discovers app structure, exercises all interactive elements, captures API calls.
//
// dvh units are supported by every browser this kit's Playwright ships (they need
// Chromium 108 / WebKit 15.4 / Firefox 101; 1.64.0 ships Chromium 156, measured
// 2026-10-08, as 1.63.0's Chromium 153 was on 2026-10-06). An element present
// in the HTML but not visible to Playwright is triaged normally (selector,
// timing, layout), not blamed on dvh. See the ui-tester agent.
//
// The helpers and the fixtures live in tests/lib/ (fixtures.js, auth.js) and
// are imported below. This file holds the scenarios: add a project's S5+ here.

import {
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
} from './lib/fixtures.js';
import {
  AUTH_CREDENTIAL,
  AUTH_EMAIL,
  AUTH_SUCCESS_SELECTOR,
  gotoAuthReady,
  AUTH_INCOMPLETE,
  authIncompleteNote,
  gateShipsCredential,
  detectAndAuth,
  detectAuthGate,
  expectGateCleared,
  gotoAndAuth,
  viewSignature,
} from './lib/auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET SIZING — a scenario that CAN SKIP needs a budget sized for the day it
// stops skipping (directives#306)
// ─────────────────────────────────────────────────────────────────────────────
// Every scenario below sets its own test.setTimeout and derives it at the
// scenario. This is the rule those numbers are derived UNDER, and it inverts the
// intuition:
//
//     A SCENARIO THAT HAS BEEN SKIPPING HAS NO EVIDENCE BEHIND ITS BUDGET.
//     ITS OBSERVED RUNTIME IS ZERO, WHICH PROVES NOTHING.
//
// A skip records ~0ms, every run, which reads exactly like "fast" to anyone
// sizing from history. The moment the precondition is satisfied — a credential
// set, APP_PAGES declared, a fixture seeded — the scenario runs for the first
// time against a number nobody derived.
//
// Measured, claude.insurance 2026-08-25: their S2 carried no budget at all and
// inherited the 30s config default. It had never executed until their owner set
// TEST_AUTH_CREDENTIAL an hour earlier. First run: 11.0 / 12.1 / 11.4 / 11.6s
// across four projects — ~2.5x margin, the THINNEST in their suite, on the one
// scenario that went from never-running to running-every-time that morning.
// Their S3, which had always run, carried an explicit 240_000.
//
// So, three rules:
//   * Size a skippable scenario for its FIRST REAL RUN, not for its history, and
//     say IN ITS BUDGET COMMENT which precondition unlocks it. Every scenario
//     below that can skip names its own.
//   * "It has always been fast" is INADMISSIBLE when the observed runs are
//     skips. That is zero data presented as reassurance — the same shape as a
//     green that verified nothing.
//   * When a precondition is newly satisfied in a repo, re-read that scenario's
//     budget BEFORE the first run, not after it times out. A first real run
//     exercises several never-exercised things at once: the day S2 stops
//     skipping is also the first day expectGateCleared() has a verdict to reach.

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1 — Page Load
// ─────────────────────────────────────────────────────────────────────────────
test('S1: page loads without JS errors', async ({ page, renderWitness }) => {
  renderWitness();
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

// The text of every VISIBLE, non-empty error-like element, in DOM order — S2's
// rejection read. WORD-BOUND, not substring (audit 2026-10-11, I-8): the former
// `[id*="err"], [class*="err"]` matched `referral-banner`, `override`,
// `terrain`, and S2 then failed an ACCEPTED credential with "onscreenError:
// Invite a friend and get a month free". An id or class token is split into
// words on `-`, `_` and camelCase humps, and the element counts only when one
// word is `err`, `error` or `errors` (`login-error`, `errorText`, `form__err`
// do; `referral`, `terrain` do not). `error-boundary` is excluded by name: a
// React error boundary wraps the whole app, so its text is the page.
// Deliberately NOT role=alert / aria-live: a success toast uses them too, and
// expectGateCleared already owns the retained-gate verdict those would add.
async function visibleErrorTexts(page) {
  return page.evaluate(() => {
    const words = (v) => (v || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9]+/).map(w => w.toLowerCase()).filter(Boolean);
    const errorish = (el) => {
      const w = [...words(el.id), ...words(el.getAttribute('class'))];
      return w.some(x => x === 'err' || x === 'error' || x === 'errors') && !w.includes('boundary');
    };
    return [...document.querySelectorAll('[id*="err" i], [class*="err" i]')]
      .filter(errorish)
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map(el => (el.textContent || '').trim())
      .filter(Boolean);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2 — Auth Discovery & Login (with API diagnostics)
// ─────────────────────────────────────────────────────────────────────────────
test('S2: auth gate discovered and credential accepted', async ({ page, renderWitness }) => {
  renderWitness();
  // THE SKIP MOVED BELOW THE PAGE LOAD (#312), and it had to: the second
  // credential source is the form itself, which cannot be read before the app
  // renders. The condition is now "no credential ANYWHERE", not "no env var".
  // COST, stated because #306's rule demands it: a repo with no credential now
  // pays goto + settle (up to ~55s) before skipping, where it used to skip in
  // ~0ms. That is the price of being able to see a prefilled form at all.
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
  //     split-step gate (#310)            ~108s at N=4   ~149s at N=8
  // + LOAD_SETTLE_MS post-auth settle       25s
  // + TEST_AUTH_SUCCESS_SELECTOR (#379)     ~0s when met; <=25s only on its FAIL path
  // + snapshots, error read, assertions      ~few s
  //   ------------------------------------------
  //   ~138s at N=4                          ~179s at N=8   single-step
  //   ~193s at N=4                          ~234s at N=8   split-step
  //
  // 240_000 covered an 8-digit PIN with ~61s spare. SIZING ESTIMATE under a
  // stated assumption, not a proof: N is the project's credential length.
  //
  // 240_000 left ~6s at N=8 on a split-step gate — an implicit zero dressed as
  // slack, the same defect S1's budget names. 300_000 covers it with ~66s
  // spare and keeps S2 inside the SHORT-ceiling class (the ui-suite composite's
  // CALLER BOUND header section):
  // that class's maximum is 300s already (ENTRY's cap), so its "a failure costs
  // <=10min" claim is UNCHANGED — S2 joins the ceiling, it does not raise it.
  //
  // SKIPPABLE — unlocked by TEST_AUTH_CREDENTIAL (plus TEST_AUTH_EMAIL on an
  // email+password or identifier-first gate), OR by a login form that ships a
  // working credential of its own (#312). Until one of those exists this
  // scenario records ~0ms every run, so nothing in its history sized the number
  // above; the arithmetic is what it costs the DAY A CREDENTIAL ARRIVES — and
  // #312 moved that day earlier for every prefilled-login project, which had no
  // way to reach this scenario at all before. This is the scenario #306 was
  // measured on — see BUDGET SIZING at the top of this file.
  test.setTimeout(300_000);
  const getApiCalls = await captureApiCalls(page);
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
  // gotoAuthReady, not goto + awaitAuthReady: a TEST_AUTH_READY_REQUEST wait
  // must be listening BEFORE the navigation, or a response that lands before
  // `load` is never seen (audit 2026-10-11, C-2 — see armAuthReady).
  const s2Evidence = await gotoAuthReady(page);

  // Resolve the gate ONCE — each detectAuthGate() call burns its 5s waitFor
  // when no gate is present, the same reason S3 and gotoAndAuth detect once.
  const s2Gated = await detectAuthGate(page);
  // A login form that SHIPS a working credential is the second source (#312).
  // Consulted only when there is no env credential, and only behind a real
  // gate, so a public app's behaviour is untouched.
  const s2Prefilled = !AUTH_CREDENTIAL && s2Gated && await gateShipsCredential(page);

  // ── 'none' IS NOT A PASS FOR THE SCENARIO THAT CLAIMS DISCOVERY ───────────
  // This test is named "auth gate discovered and credential accepted". Finding
  // no gate means it discovered nothing, so reporting green is a lie of exactly
  // the kind #309's verifier was built to stop — and the verifier could not stop
  // it, because expectGateCleared() returns immediately on 'none' and the S2
  // failure check below is itself guarded by `mechanism !== 'none'`. Every
  // assertion under this line was therefore vacuous whenever the gate was
  // missed, and nothing said so.
  //
  // MEASURED DOWNSTREAM, not theorised (claude.insurance, 2026-08-26). This
  // kit's own default navigation is `./`, which in that app is public marketing
  // with no gate at all, while the login lives on a sub-route. S2 had been
  // vacuous SINCE IT WAS WRITTEN — including a green live run cited as evidence
  // that auth was covered. Grafting #309's verifier on top changed nothing: it
  // was verifying an attempt that was never made. An app with a public surface
  // and an authenticated portal is the normal shape, not an exotic one, so this
  // is a hole in the kit rather than a mistake in one project.
  //
  // The two cases must be told apart, and the discriminator is the CONFIG:
  // supplying TEST_AUTH_CREDENTIAL / TEST_AUTH_EMAIL is the project asserting
  // it has a gate. Config plus no gate here is a contradiction between what the
  // project declared and where this scenario landed — a defect, and loud. No
  // config and no gate is an app without auth — legitimate, but a SKIP so it is
  // visible in the report, never a silent green that reads as coverage.
  //
  // Deliberately NOT applied to S3/S9: sweeping an unauthenticated surface is a
  // real thing to do, and only this scenario's name promises discovery.
  if (!s2Gated) {
    const authConfigured = !!(AUTH_CREDENTIAL || AUTH_EMAIL);
    const where = page.url();
    if (authConfigured) {
      throw new Error(
        `S2 FAIL | no auth gate found at ${where} (evidence: ${s2Evidence}), but this project supplied auth credentials.\n` +
        (s2Evidence === 'windowed'
          ? `  That answer is a WINDOW, not a proof: nothing was visible before the settle expired, which is ` +
            `not the same as nothing existing (directives#302). If this app's gate is slow to render, set ` +
            `TEST_AUTH_READY_SELECTOR or TEST_AUTH_READY_REQUEST and this becomes a decided answer either way.\n`
          : `  That answer is PROVEN: this project's own readiness condition resolved and there was still no ` +
            `gate, so the contradiction is real and not a timing artefact.\n`) +
        `  A credential env var is the project asserting it HAS a gate, so finding none here means ` +
        `this scenario did not reach it — the usual cause is that the gate lives on a sub-route while ` +
        `the suite navigates to the baseURL (set APP_URL, or point this scenario at the login route).\n` +
        `  Failing rather than passing: every auth assertion below this line is vacuous without a gate, ` +
        `and a green "auth gate discovered and credential accepted" on a page with no gate is the exact ` +
        `false coverage this check exists to end (directives#309 follow-up, found by claude.insurance).`
      );
    }
    test.skip(true,
      `No auth gate found at ${where} (evidence: ${s2Evidence}) and no credentials configured — this app appears to have no auth. ` +
      (s2Evidence === 'windowed'
        ? `APPEARS is load-bearing: nothing was visible before the settle expired, which is a WINDOW, not a proof. ` +
          `Set TEST_AUTH_READY_SELECTOR or TEST_AUTH_READY_REQUEST to turn this into a decided answer (directives#302). `
        : `This is a PROVEN absence: the project's own readiness condition resolved and no gate was there. `) +
      `Skipping rather than passing: S2 asserts a gate was discovered and a credential accepted, and ` +
      `neither happened, so a green result here would read as auth coverage that does not exist.`);
  }

  if (!AUTH_CREDENTIAL && !s2Prefilled) {
    test.skip(true, 'No auth credential available — set the TEST_AUTH_CREDENTIAL env var (and TEST_AUTH_EMAIL for email+password or identifier-first gates), or, if this app\'s login ships a working credential of its own, check that it lands in a visible editable input[type=password] (directives#312); skipping auth test');
  }

  const beforeSnap = await domSnapshot(page);
  const gateViewBefore = await viewSignature(page);
  // Error-like text ALREADY on screen before the attempt — excluded from the
  // rejection read below, so a standing banner is never mistaken for one.
  const errorTextsBefore = new Set(await visibleErrorTexts(page));
  // Gate the auth attempt on detectAuthGate() — same as S4 and gotoAndAuth. Unguarded,
  // detectAndAuth's text-input fallback would type the credential into the first visible
  // text input (e.g. a public app's search box) and then falsely report auth failure.
  // Defaults FALL BACK to S2's own captures: when no attempt was made,
  // detectAndAuth never ran and there is no per-step state to grade against.
  const { mechanism, credentialSource, viewBefore = gateViewBefore, snapBefore = beforeSnap } =
    s2Gated
      ? await detectAndAuth(page, AUTH_CREDENTIAL ?? '')
      : { mechanism: 'none', credentialSource: null };

  // LOAD_SETTLE_MS, not IDLE_MS: a successful login often lands with the app
  // shell still loading — verifying while the auth request or the post-auth
  // navigation is in flight reads the not-yet-dismissed gate as retained and
  // fails a login that succeeded. Same wait the other callers get by settling
  // before their gate checks; S2 authenticates mid-test, so it settles here.
  await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
  // afterSnap is captured AFTER the settle, so the acceptance check below and
  // the retained-gate verifier observe the same state. Captured pre-settle, a
  // login that completes during the settle without an intermediate DOM change
  // would clear the gate yet leave domChanged false — and S2 would throw
  // "credential rejected" on a credential that was accepted.
  const afterSnap  = await domSnapshot(page);

  // A wrong credential often renders an inline error, which itself changes the DOM —
  // so domChanged alone is not proof of success. Treat a non-empty on-screen error as a
  // failure even when the DOM changed. Read the first VISIBLE, non-empty error element:
  // apps often keep hidden/empty `.error` placeholders, so `.first().textContent()` could
  // read the wrong node. Synchronous evaluate — no locator waiting, so it can't burn the
  // test timeout either. Read BEFORE the verifier below, so a retained-gate
  // failure still reports the rejection text. Only text that was NOT on screen
  // before the attempt counts (see visibleErrorTexts for the word-bound match).
  const onscreenError = (await visibleErrorTexts(page)).find(t => !errorTextsBefore.has(t)) || '';

  // Attached by BOTH failure paths — the shared verifier's throw and S2's own
  // softer checks below. The retained gate IS the common rejection case, and
  // throwing before this attach lost exactly the API status, response shape,
  // console errors, and rejection text this scenario promises on failure.
  const attachAuthDiagnostics = async () => {
    const apiCalls = await getApiCalls();
    const firstKey = apiCalls[0]?.firstFieldKey ?? null;
    const diag = {
      mechanism,
      // WHICH source, not just whether one existed (#312): "prefilled
      // credential accepted" and "supplied credential accepted" are different
      // facts, and a run that submitted the form's own value must say so.
      credentialSource: credentialSource ?? 'none',
      credentialProvided: AUTH_CREDENTIAL ? 'yes (TEST_AUTH_CREDENTIAL)'
        : (credentialSource === 'prefilled' ? 'yes (shipped by the login form)'
                                            : 'none — set TEST_AUTH_CREDENTIAL'),
      onscreenError,
      consoleErrors: pageErrors.all(),
      apiCalls,
      responseShape: firstKey
        ? `rows returned, first field "${firstKey}"`
        : (apiCalls[0]?.status >= 400 ? `non-2xx (${apiCalls[0]?.status})` : 'no rows returned — check query / RLS / auth'),
    };
    attachJson('auth-diagnostics', diag);
    return diag;
  };

  // The SHARED retained-gate verdict, same as S3/S4/gotoAndAuth — S2 was the
  // one auth path without it. S2's own checks miss a plain [role=alert]
  // rejection: the alert text changes domSnapshot's bodyText prefix (so
  // domChanged reads as progress) while the error read above only matches
  // id/class WORDS err/error — and S2 then CERTIFIED the
  // credential as accepted with the gate still on screen. The verifier the
  // rest of the suite trusts must not be bypassable by the scenario whose
  // whole job is the auth verdict.
  //
  // POST-LOGIN CONDITION (#379) — only when the project declared one. The gate
  // going away is not the signed-in view arriving; this is the project saying
  // what that view looks like. Evaluated ONCE, after the post-auth settle, never
  // per step. Not met is a FAIL, not a fallback to the gate reading (same rule
  // as awaitAuthReady). Met, it is the verdict the incomplete-auth skip below
  // was waiting for. BUDGET: ~0s when it holds (the settle already ran); on
  // failure it adds up to LOAD_SETTLE_MS, ~41s spare left at N=8 split-step.
  // Met, it also REPLACES the generic heuristics below — expectGateCleared's
  // retained-gate reading and the domChanged/onscreenError arm. Both are guesses
  // for projects that declared nothing: a signed-in page with its own password
  // field (change-password form) reads as a retained gate, and afterSnap was
  // taken before this wait, so a slow signed-in view reads as "nothing changed".
  // The project's own condition outranks both (#382).
  let s2SuccessProven = false;
  if (AUTH_SUCCESS_SELECTOR && mechanism !== 'none') {
    try {
      await page.waitForSelector(AUTH_SUCCESS_SELECTOR, { timeout: LOAD_SETTLE_MS, state: 'visible' });
      s2SuccessProven = true;
    } catch {
      await attachAuthDiagnostics().catch(() => {});
      throw new Error(
        `S2 FAIL | TEST_AUTH_SUCCESS_SELECTOR (${AUTH_SUCCESS_SELECTOR}) never became visible within ` +
        `${LOAD_SETTLE_MS}ms after the auth attempt at ${page.url()} (mechanism: ${mechanism}).\n` +
        `  This project declared that selector as what a signed-in page shows, so the credential was not ` +
        `accepted — or the selector names something the signed-in view does not render. See the ` +
        `auth-diagnostics attachment (directives#379).`
      );
    }
  }
  if (!s2SuccessProven) {
    try {
      await expectGateCleared(page, mechanism, viewBefore);
    } catch (gateErr) {
      await attachAuthDiagnostics().catch(() => {});
      throw gateErr;
    }
  }

  if (AUTH_INCOMPLETE.has(mechanism) && !s2SuccessProven) {
    await attachAuthDiagnostics().catch(() => {});
    test.skip(true, `${authIncompleteNote(mechanism)} "Credential accepted" cannot be asserted, so this is a SKIP rather than a failure — false-reddening a healthy app on a discovery-grade signal is the trade this file refuses (directives#302 is the verdict). See the auth-steps and auth-unverified attachments.`);
  }

  // snapBefore, not beforeSnap: with the per-step capture this compares the
  // CREDENTIAL step's pre-attempt state to the post-auth state. Against the
  // email screen it was trivially true, and the rejection arm below silently
  // stopped firing on split-step gates (#310).
  const domChanged = JSON.stringify(snapBefore) !== JSON.stringify(afterSnap);
  if (mechanism !== 'none' && !s2SuccessProven && (!domChanged || onscreenError.length > 0)) {
    const diag = await attachAuthDiagnostics();
    throw new Error(
      `S2 FAIL | mechanism: ${mechanism} | onscreenError: "${onscreenError}" | ` +
      `API status: ${diag.apiCalls[0]?.status ?? 'no call'} | ` +
      `recordCount: ${diag.apiCalls[0]?.recordCount ?? 'n/a'} | ` +
      `responseShape: ${diag.responseShape} | ` +
      `consoleErrors: ${pageErrors.all().join('; ') || 'none'}`
    );
  }

  // Auth passed or no auth required — record mechanism
  attachJson('auth-result', { mechanism, credentialSource: credentialSource ?? 'none', domChanged,
    successProven: s2SuccessProven,
    // 'windowed' = no gate was VISIBLE before the settle expired; 'proven' =
    // this project's own readiness condition resolved first. Recorded because
    // the two were indistinguishable, which is the whole of #302.
    gateEvidence: s2Evidence });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3 — Element Mapping & Interaction Sweep
// ─────────────────────────────────────────────────────────────────────────────
test('S3: interactive elements discovered and exercised without errors', async ({ page, renderWitness }) => {
  renderWitness();
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
  //
  // SKIPPABLE ON A GATED APP — unlocked by TEST_AUTH_CREDENTIAL or by a login
  // form that ships its own credential (#312); a public app never skips here. The skip is the expensive kind of zero: what it declined
  // to sweep was the LOGIN SCREEN, so a repo where S3 has been skipping has
  // measured a handful of controls, and the first credentialed run sweeps the
  // whole authenticated app — the profile the 900_000 above was measured on, and
  // one that repo has never run. See BUDGET SIZING at the top of this file.
  //
  // UNCHANGED by #310, deliberately: this number is sweep-dominated and
  // measurement-derived (468s measured pass, 900s = ~1.9x). A split-step gate
  // adds up to 55s to the preamble, taking the margin over the measured worst
  // case to ~1.7x. The measured apps are single-step, so nothing measured moves.
  test.setTimeout(900_000);
  // Public-first apps (knowledge hub, questionnaire) are swept even with no credential;
  // only auth-gated apps with no credential are skipped (decided after page load below).
  const pageErrors = watchPageErrors(page);
  const apiAnomalies  = [];

  const getApiCalls = await captureApiCalls(page);
  // LOAD_SETTLE_MS: what follows this preamble is discoverElements(). An element
  // that renders late is never swept, so a broken control can leave S3 green by
  // arriving after the settle. Measurement, not overhead. gotoAuthReady IS that
  // settle — with no readiness condition it is the LOAD_SETTLE_MS networkidle
  // wait, with one the project's own condition replaces it. A separate settle
  // in front of it ran the window TWICE with no condition (+25s on a polling
  // app), and with TEST_AUTH_READY_REQUEST let the named request complete
  // before anything listened, failing S3 on a healthy app (audit 2026-10-11, C-2).
  await gotoAuthReady(page);
  // Authenticate if we have a credential AND a real gate is present; if there's
  // a gate but no credential, skip — sweeping the login screen would fire
  // spurious PIN/password attempts and 401/403s don't block, so the job could
  // "pass" without reaching app content. A public app with no gate falls
  // through and is swept normally — which requires the detectAuthGate() guard
  // S4 and gotoAndAuth() already carry: unguarded, detectAndAuth's text-input
  // fallback typed the credential into a public page's search box, and the
  // post-attempt verdict then read that same search box plus a "Log in" header
  // as a retained gate, failing S3 on an app with no login screen at all. The
  // old comment PROMISED the fall-through; the guard is what delivers it.
  const s3Gated = await detectAuthGate(page);
  // "A credential exists" is not "TEST_AUTH_CREDENTIAL is set" (#312): a login
  // form that ships a working credential is the other source, and a project
  // that correctly declined to invent a secret it does not need used to buy
  // zero auth coverage here. Consulted only behind a real gate and only when
  // the env value is absent, so nothing else changes.
  if (s3Gated && (AUTH_CREDENTIAL || await gateShipsCredential(page))) {
    const { mechanism, viewBefore } = await detectAndAuth(page, AUTH_CREDENTIAL);
    await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    await expectGateCleared(page, mechanism, viewBefore);
    // Same position as "gated, no credential": a gate stands and this suite
    // cannot pass it, so sweeping would only exercise the login screen. #310.
    if (AUTH_INCOMPLETE.has(mechanism)) {
      test.skip(true, `${authIncompleteNote(mechanism)} Skipping sweep (it would only exercise the login screen). See the auth-steps and auth-unverified attachments.`);
    }
  } else if (s3Gated) {
    test.skip(true, 'Auth gate present and no credential available from either source — skipping sweep (would only exercise the login screen)');
  }

  const elements = await discoverElements(page);
  attachJson('element-map', elements);

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

  attachJson('interaction-findings', findings);

  const blocking = findings.filter(f => f.apiErrors.some(c => c.status >= 500) || f.consoleErrors.length > 0);
  expect(blocking, `Blocking anomalies found:\n${JSON.stringify(blocking, null, 2)}`).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4 — Responsive Layout
// ─────────────────────────────────────────────────────────────────────────────
test('S4: no horizontal overflow at 390px mobile viewport', async ({ page, renderWitness }) => {
  renderWitness();
  // BUDGET — S4 had NONE and inherited the 30s config default, while running the
  // same load-and-authenticate preamble NAV prices at ~98s. Once this PR set
  // navigationTimeout: 30_000, goto() ALONE could consume the whole test.
  //
  //   goto 30 + settle 25 + detectAuthGate 5 + detectAndAuth ~53 + settle 25
  //   = ~138s at N=4       ~179s at N=8
  //   split-step (#310): detectAndAuth ~108/~149
  //   = ~193s at N=4       ~234s at N=8
  //
  // Both settles are LOAD_SETTLE_MS as of round 12 (they feed the scrollWidth
  // verdict), which cost +40s and pushed ~179s against the previous 180_000.
  // 300_000, same as S2 and CTRL — one number for one shared preamble.
  test.setTimeout(300_000);
  // DECLARE THE OVERRIDE. This test sets its own viewport, so it runs at 390 in
  // EVERY project — it is evidence for the phone band and for no other. Without
  // this annotation, a run that selected only S4 (a stray `.only`, a grep, a
  // quarantine reporter) reports a result in the laptop and tablet projects too,
  // and check-ui-viewports.js would certify widths nothing rendered at. It reads
  // this annotation out of the JSON report and stops counting the result.
  // test.md → UI coverage gates, fifth gate. Any test you add that calls
  // setViewportSize() needs the same line.
  test.info().annotations.push({ type: 'viewport-override', description: '390' });
  await page.setViewportSize({ width: 390, height: 844 });
  // LOAD_SETTLE_MS: scrollWidth is read below as a VERDICT. Content that renders
  // late and introduces horizontal overflow arrives after an IDLE_MS settle and
  // S4 passes green on a layout that is broken. gotoAuthReady IS that settle
  // (or the project's readiness condition in its place) — the same single
  // preamble wait S3 uses, for the same two reasons (audit 2026-10-11, C-2).
  await gotoAuthReady(page);
  // Authenticate only when a real auth gate (PIN/password) is detected, so overflow is
  // measured against the real app rather than the login screen. Gate on detectAuthGate()
  // — NOT just "a credential exists" — so a public-first app with a stray text input
  // (search/filter) isn't mutated by detectAndAuth's text-input fallback before measuring.
  // Same two-source rule as S3 and gotoAndAuth (#312). S4 still does not skip
  // when the gate stands — see the paragraph below the branch.
  if (await detectAuthGate(page) && (AUTH_CREDENTIAL || await gateShipsCredential(page))) {
    const { mechanism, viewBefore } = await detectAndAuth(page, AUTH_CREDENTIAL);
    await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    await expectGateCleared(page, mechanism, viewBefore);
  }
  // S4 does NOT skip when the gate could not be passed — deliberately, and
  // unchanged from before #310. Every other auth-consuming scenario measures
  // something that is only meaningful signed in; S4 measures horizontal
  // overflow, and a login screen is a deployed view that must not overflow
  // either. The measurement stays valid; only its subject changes, and the
  // auth-steps attachment says which one it was.
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO — NAV: in-app back navigation strictly unwinds (no circular loop)
// Drill to the deepest level reachable, then press the in-app back control once
// per level: each back must retrace to the prior level and never return to the
// level it just left (an A↔B ping-pong). Catches the class of bug where "back"
// tracks the last page visited instead of an origin-aware nav stack. Skips when
// the app has no multi-level drill-down or no in-app back control (invariant N/A).
// ─────────────────────────────────────────────────────────────────────────────
test('NAV: back navigation strictly unwinds (no loop)', async ({ page, renderWitness }) => {
  renderWitness();
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
  //     split-step gate (#310)                                 ~193s (N=4)
  //                                                            ~234s (N=8)
  // + 12 candidate attempts x (3s click + 0.8s + 5s idle)      = ~106s
  // + DEPTH_CAP backs       x ~8.8s                            =  ~44s
  //   -------------------------------------------------------------
  //   worst assumed mix, single-step                            ~288s (N=4)
  //                                                             ~329s (N=8)
  //   worst assumed mix, split-step                             ~343s (N=4)
  //                                                             ~384s (N=8)
  //
  // The preamble term went ~98s -> ~138s in round 12 (both gotoAndAuth settles
  // became LOAD_SETTLE_MS), which put ~288s against the previous 300_000, and
  // 360_000 covered that. It has now moved this budget a SECOND time: ~384s at
  // N=8 on a split-step gate EXCEEDED 360_000, so 420_000, with ~36s spare.
  // Cutting ATTEMPT_CAP instead was rejected — unlike DISMISS's nav resets, a
  // candidate attempt IS the coverage, not the waste, so cutting it would trade
  // the invariant for the bound. Same caveat as S9: this is a sum over the
  // CAPPED path under stated assumptions, not a proof — how many candidates a
  // view offers is a property of the app, not of this file, and N is the
  // project's credential length.
  //
  // The two IDLE_MS settles INSIDE the loops below stay at 5s deliberately: they
  // precede viewSignature() reads, where a late view change reads as "no change"
  // and ends the drill — a SKIP, not a green. The back-loop read is the mirror
  // case: a late arrival there turns a PASS into a FAIL, which is loud. Neither
  // can be turned green by arriving late, which is the test that decides this.
  //
  // SKIPPABLE THREE WAYS, and all three have to clear before this number is ever
  // tested: a credential must exist from EITHER source — the env secret or a
  // login form that ships one (#312) — since gotoAndAuth() skips a gated app
  // with neither; the app must offer a multi-level drill-in, and backControlAll() must
  // recognise its back affordance. Until then NAV records the preamble and a
  // skip. ⚠️ THIS PR MOVES THAT LINE: directives#311's drill-dedup fix admits
  // <input role="button"> drill controls that used to self-skip the scenario,
  // and its back-affordance fix revives two locator arms that have matched
  // nothing since #308. A repo taking this change may see NAV run its full
  // ATTEMPT_CAP path for the FIRST TIME — which is exactly the #306 case, so
  // re-read this arithmetic before that run, not after it times out.
  test.setTimeout(420_000);
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
  let clickFailed = 0;
  const clickFailedLabels = [];
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
    // ONE ATTEMPT PER CONTROL, decided AFTER eligibility — never before it.
    // discoverElements() emits one record per (element, selector) and only some
    // of an element's representations are eligible here, so marking an element
    // seen on a record this loop REJECTS discards the representation it could
    // have used: the <input role="button"> case in directives#311, where the
    // input-selector record is rejected on tag and the [role=button] record was
    // then skipped as its duplicate, leaving NAV to report "no drill-down" on an
    // app that has one. The seen-set therefore lives here, and only the eligible
    // path adds to it. Skipping still happens BEFORE counting, so duplicates
    // neither inflate candidatesSeen nor spend ATTEMPT_CAP on repeat clicks.
    // PER LEVEL, not per test: elementKey is assigned in DOM order within ONE
    // discoverElements() call, so the same number means a different control once
    // the view changes — this Set must not outlive the level.
    const seenKeys = new Set();
    for (const el of await discoverElements(page)) {
      if (!['a', 'button'].includes(el.tag) && !el.selector.includes('role=button')) continue;
      if (seenKeys.has(el.elementKey)) continue;
      seenKeys.add(el.elementKey);
      candidatesSeen++;
      // Word-bound (#308): the unanchored version matched Backup, Feedback,
      // Background, Returns and Homepage, silently excluding legitimate
      // drill-down entry points. The arrow glyphs sit OUTSIDE the \b group —
      // they are not word characters, so \b around them matches nothing.
      // Underscores are normalized to spaces FIRST: icon-font ligature text
      // ("arrow_back", "keyboard_return") is what discoverElements records for a
      // <span class="material-icons"> back button, and underscore is a word
      // character, so the \b-bounded return/home branches would miss
      // "keyboard_return" entirely and NAV would click it while drilling, then
      // walk a reversed trail. The back branch no longer needs the
      // normalisation — its left bound is structural, so "arrow_back" matches
      // raw — but the other branches do, so it stays. "Backup" has no underscore
      // and is rejected on its own account.
      // The accessible name is tested alongside label: label prefers
      // textContent, so <button aria-label="Back">chevron_left</button> records
      // "chevron_left" — a glyph name this list can't enumerate — while its
      // aria-label says exactly what the control is.
      // "back" IS backControlAll()'s regex, not a copy of it: BACK_OR_HOME is
      // built from BACK_NAME.source, so the filter and the presser cannot
      // disagree. Both ends are anchored (directives#311), so a forward action
      // that merely starts with the word ("Back up data", "Back office
      // settings") OR merely ends in the form ("Send back to vendor", "Put it
      // back") stays a drill candidate, and the unwind will not press it either.
      // KNOWN LIMIT, deliberate: home/return classification is string-based
      // (recorded label + ariaLabel, which resolves aria-labelledby TEXT but
      // not img alt inside a reference), so an icon-only Home button named
      // through an image's alt can slip this filter and be clicked while
      // drilling. Back — the case that corrupts the unwind — is covered by
      // construction via the backControlAll() membership check below; home/
      // return misclassification costs one wasted navigation, not a false
      // verdict, and chasing the full accname algorithm here is the
      // staircase this file already abandoned for locator-side matching.
      // Home/Return exclude only NAVIGATION PHRASINGS, not the word anywhere:
      // "Return" alone, "Return to <place>", and a name ENDING in home/return
      // ("Go home", the icon ligatures "keyboard return" / "home") navigate;
      // "Return item" and "Home delivery" are forward actions into workflows
      // and stay drill candidates.
      // label and ariaLabel are tested SEPARATELY — the affordance forms are
      // end-anchored, and concatenating the two fields would bury one name's
      // ending in the middle of the joined string.
      if ([el.label, el.ariaLabel].some(s =>
            BACK_OR_HOME.test((s || '').replace(/_/g, ' ').trim()))) { excludedAsBack++; continue; }
      if (attempts >= ATTEMPT_CAP) { capExhausted = true; break; }
      try {
        const loc = el.id ? page.locator(`[id=${JSON.stringify(el.id)}]`) : page.locator(el.selector).nth(el.index);
        if (!await loc.isVisible().catch(() => false)) continue;
        // BY CONSTRUCTION, not by string: a candidate that backControlAll()
        // itself matches is a back control, whatever discoverElements recorded
        // for it. The regex above stays for return/home (which backControl
        // does not press) and as a zero-roundtrip fast path; this membership
        // check is what guarantees NAV never drills through the exact element
        // the unwind below will press — accname resolution included, because
        // getByLabel computes it (aria-labelledby → img alt was the case a
        // string-side reimplementation missed).
        if (await loc.and(backControlAll(page)).count().catch(() => 0) > 0) { excludedAsBack++; continue; }
        attempts++;
        // A failed click (overlay interception, detach, timeout) is its own
        // outcome, never folded into "produced no view change" — an occluded
        // drill control misreported as inert fixture data sends the reader to
        // the wrong diagnosis.
        try {
          await loc.click({ timeout: 3000 });
        } catch {
          clickFailed++;
          if (clickFailedLabels.length < 5) clickFailedLabels.push(el.label || el.ariaLabel || `${el.selector}#${el.index}`);
          continue;
        }
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
    attachJson('nav-budget', {
      attemptCap: ATTEMPT_CAP,
      attempts,
      levelsFound: forward.length - 1,
      note: `Stopped after ${ATTEMPT_CAP} candidate attempts. Traversal was TRUNCATED: levels deeper than those found were never reached, so a passing result here covers only the prefix listed. Raise ATTEMPT_CAP and this scenario's timeout together if the app is control-dense.`,
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
        `${viewChangedNoBack} changed the view without revealing a back control, ${clickFailed} clicks failed` +
        (clickFailed ? ` [${clickFailedLabels.join(', ')}]` : '') +
        `, the rest produced no view change.) ` +
        `If exclusions are nonzero, check those labels before trusting the N/A; if view changes without a back control ` +
        `are nonzero, the app navigates but backControl() did not recognise its back affordance; if clicks failed, ` +
        `an overlay may be occluding drill controls — not inert fixture data; if the signed-in ` +
        `fixture seeds no rows, there may be nothing to drill into — a coverage gap, not an exercised invariant.`);
  }

  // Unwind: one back press per descended level. Each result must equal the expected
  // prior level and must NOT equal the level just left (the ping-pong signature).
  const trail = [];
  for (let i = forward.length - 1; i >= 1; i--) {
    const left = forward[i];          // current level, before pressing back
    const expected = forward[i - 1];  // the level back should return to
    const back = backControl(page);
    // A MISSING BACK CONTROL HERE IS A FAILURE, not the end of the walk (audit
    // 2026-10-11, I-10). Every level from forward[1] on was entered WITH a
    // visible back control (the drill pushes a level only when hasBack), and the
    // first iteration is already covered by the skip above — so a control that
    // vanishes at an intermediate level is the path failing to unwind, which is
    // the property under test. It used to `break` with no assertion and report
    // NAV green from above the start level. toBeVisible() waits expect's own
    // timeout (5s) first, so a back control that renders late still passes.
    await expect(back,
      `No in-app back control at level ${i} — the unwind stopped ${i} level(s) above the start ` +
      `level, so back navigation does not strictly unwind (trail: ${trail.length} step(s) taken).`
    ).toBeVisible();
    await back.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    await page.waitForLoadState('networkidle', { timeout: IDLE_MS }).catch(() => {});
    const now = await viewSignature(page);
    trail.push({ stepFromDeepest: forward.length - i, expected, left, got: now });
    attachJson('back-flow-trail', trail);
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
test('CTRL: no duplicated primary action control', async ({ page, renderWitness }) => {
  renderWitness();
  // BUDGET — CTRL had NONE and inherited the 30s config default, while its first
  // statement is the gotoAndAuth() preamble. NAV and DISMISS budget for that call
  // explicitly; CTRL called the same function and was sized as if it were free.
  // That preamble went ~98s -> ~138s (N=4) / ~179s (N=8) in round 12 when both of
  // its settles became LOAD_SETTLE_MS — CTRL is one of the callers that made them
  // measurements, since a duplicate CTA rendering late is exactly what this scans
  // for — and ~138s -> ~193s (N=4) / ~179s -> ~234s (N=8) again when the
  // identifier-first step landed (#310): a split-step gate costs a second
  // settle+attempt cycle. 300_000, same as S2 and S4.
  //
  // SKIPPABLE — via gotoAndAuth(), on a gated app with no credential from
  // either source (#312). The preamble is nearly the whole budget, so a skipping CTRL has measured the
  // cheap half and none of the scan. See BUDGET SIZING at the top of this file.
  test.setTimeout(300_000);
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
test('ENTRY: every deployed entry point renders without JS errors', async ({ page, renderWitness }) => {
  renderWitness();
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
  // SKIPPABLE — unlocked by APP_PAGES. Note what that means for the number
  // below: in a repo that has never declared an extra entry point this scenario
  // has run ZERO times, so 90_000-per-page is derived and never observed, and
  // the day someone adds a page is the day both the per-page allowance and the
  // cap are tested for the first time. See BUDGET SIZING at the top of this file.
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
test('DISMISS: overlays close via control, Escape, and backdrop', async ({ page, renderWitness }) => {
  renderWitness();
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
  //     initial call, gate re-presenting         ~193s   split-step (#310)
  //                                              ~234s   at N=8
  //   + 2 nav resets    x ~234s                  = ~468s
  //   + 27 overlay-path x ~13.8s                 = ~373s
  //     ------------------------------------------------
  //     worst assumed mix                        ~1075s
  //
  //     initial ~138s + 2 resets x ~60s + 27 x ~13.8s = ~631s  (auth persists)
  //
  // ~925s exceeded the previous 900_000, and 1_200_000 covered it.
  // The identifier-first step (#310) then put the N=8 split-step mix at ~1309s
  // against 1_200_000 with the cap still at 3. NAV_RESET_CAP 3 -> 2 brings it to
  // ~1075s and the ceiling does NOT move — which is the trade this paragraph
  // already recommends, taken a fourth time: 10 -> 5 -> 3 -> 2 as each omitted
  // term surfaced, because the resets buy this scenario nothing (a navigating
  // trigger is not an overlay trigger) and spending fewer of them is the cheap
  // side every time. The cost is real and NOT silent: one less reset means a
  // nav-heavy app reaches fewer triggers, which writes the `dismiss-budget`
  // attachment the paragraph below already tells you to read.
  //
  // ⚠️ IF THIS TIMES OUT ANYWAY, do not revise this sum a sixth time. Read the
  // run's `dismiss-budget` ATTACHMENT (not the findings list — the cap is a
  // coverage outcome, not a defect): its presence tells you the app is nav-heavy
  // and the assumed mix was wrong. That is a measurement, and it beats another
  // derivation.
  //
  // SKIPPABLE — via gotoAndAuth(), on a gated app with no credential from
  // either source (#312); and effectively a no-op on an app with no overlays, since every trigger
  // falls through the two `continue`s below. Either state records a fraction of
  // the sum above. The day a credential lands OR the first modal ships, the
  // per-trigger path runs for the first time — re-read the assumed mix then
  // rather than after a timeout. See BUDGET SIZING at the top of this file.
  test.setTimeout(1_200_000);
  await gotoAndAuth(page);

  const OVERLAY = 'dialog[open], [role="dialog"], [aria-modal="true"], .modal, .drawer, .popover, .overlay';
  const CLOSE = '[aria-label*="close" i], .close, .modal-close, button:has-text("Close"), button:has-text("Cancel"), button:has-text("×"), button:has-text("✕")';
  const TRIGGERS = 'button, [role=button], [aria-haspopup="dialog"]';
  // AN OVERLAY ALREADY ON SCREEN IS NOT THE TRIGGER'S (audit 2026-10-11, I-9).
  // Ownership used to be "any matching overlay is visible after the click", so a
  // decorative `.overlay` (a hero caption) — or an overlay an EARLIER trigger
  // failed to close — was credited to every trigger, and each one then reported
  // "no close control" / "still visible" against an element it never opened.
  // Before each click the overlays visible at that moment are MARKED, and only
  // an unmarked visible overlay counts as the trigger's: a newly mounted node, or
  // a reused one that was hidden before the click. After a navigation the marks
  // are gone with the old document, which is the right answer — nothing on the
  // new page was there before. RESIDUE: an app that re-mounts a standing overlay
  // as a NEW node on every click still reads it as owned.
  const PREOPEN = 'data-uitests-preopen';
  const OWNED = `:is(${OVERLAY}):not([${PREOPEN}])`;
  const markOpenOverlays = async () => {
    // Through locators on both sides, so an overlay inside an open shadow root
    // is marked and unmarked like any other.
    await page.locator(`[${PREOPEN}]`)
      .evaluateAll((els, attr) => { for (const el of els) el.removeAttribute(attr); }, PREOPEN)
      .catch(() => {});
    await page.locator(OVERLAY).locator('visible=true')
      .evaluateAll((els, attr) => { for (const el of els) el.setAttribute(attr, ''); }, PREOPEN)
      .catch(() => {});
  };
  const overlayVisible = async () => {
    for (const el of await page.locator(OWNED).all()) {
      if (await el.isVisible().catch(() => false)) return el;
    }
    return null;
  };

  const findings = [];
  // The trigger cap is reported, not silent: overlays behind trigger 31 or
  // later are never checked, so a page with more triggers says so in a
  // `dismiss-budget` attachment after the loop (test.md: "Dismissers are
  // proven, not assumed"; audit, 2026-10-06). ONE record per run: when the
  // reset cap below stops the loop first, its own record is the true stopping
  // point and this one is not written (Codex, #405).
  const TRIGGER_CAP = 30;
  const triggerTotal = await page.locator(TRIGGERS).count();
  const triggerCount = Math.min(triggerTotal, TRIGGER_CAP);
  let stoppedByResets = false;
  // Cap the WASTED work, not the useful work. A navigating trigger is not an
  // overlay trigger, so it contributes nothing to this scenario's assertions —
  // the reset it forces is pure cost. Capping resets therefore loses no S9
  // coverage, where capping triggerCount would. Not silent: hitting the cap
  // writes a `dismiss-budget` attachment, so a suite that stops early says so
  // WITHOUT failing the scenario for triggers it never reached.
  const NAV_RESET_CAP = 2;
  let navResets = 0;

  for (let i = 0; i < triggerCount; i++) {
    // Re-resolve per round — the DOM may have re-rendered since discovery.
    const trigger = page.locator(TRIGGERS).nth(i);
    if (!await trigger.isVisible().catch(() => false)) continue;
    const name = ((await trigger.textContent().catch(() => '')) || '').trim().slice(0, 40) || `trigger[${i}]`;

    const urlBefore = page.url();
    await markOpenOverlays();
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
        attachJson('dismiss-budget', {
          navResetCap: NAV_RESET_CAP,
          stoppedAtTrigger: name,
          triggersConsidered: i + 1,
          of: triggerTotal,
          note: `Stopped after ${NAV_RESET_CAP} navigation resets. Triggers beyond this point were NOT checked for overlay dismissal — a coverage gap, not a dismisser defect. Raise NAV_RESET_CAP and this scenario's timeout together if the app is navigation-heavy.`,
        });
        stoppedByResets = true;
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

  if (!stoppedByResets && triggerTotal > TRIGGER_CAP) {
    attachJson('dismiss-budget', {
      triggerCap: TRIGGER_CAP,
      triggersConsidered: TRIGGER_CAP,
      of: triggerTotal,
      note: `Only the first ${TRIGGER_CAP} of ${triggerTotal} triggers were considered (a hidden or navigating one among them is skipped, not checked); triggers beyond them were never reached. A coverage gap, not a dismisser defect.`,
    });
  }

  attachJson('dismisser-findings', findings);
  expect(findings, `Overlay dismisser failures:\n${JSON.stringify(findings, null, 2)}`).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5+ — Project-Specific Scenarios
// Source: CLAUDE.md § Project-Specific Test Scenarios
// Generic coverage is S1–S4 plus the NAV/CTRL invariants above; add
// project-specific scenarios starting at S5.
// Add one scenario per row in that table before running the QA pipeline.
// ─────────────────────────────────────────────────────────────────────────────
