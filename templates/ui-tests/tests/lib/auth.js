// Auth for tests/app.spec.js (batch C, S2): the credential, auth readiness,
// auth-gate discovery and the attempt, and gotoAndAuth(), which loads the app
// and authenticates when a real gate is present.
// Kit file, replaced whole on refresh: project scenarios go in app.spec.js.

import {
  test,
  attachJson,
  LOAD_SETTLE_MS,
  domSnapshot,
} from './fixtures.js';

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL — environment, or a credential the form itself ships
// ─────────────────────────────────────────────────────────────────────────────
// The credential comes from the TEST_AUTH_CREDENTIAL secret, or — only when that
// is unset — from a visible, editable password field the login form prefills
// (gateShipsCredential, directives#312). Never from a file in the repo.
// This used to fall back to scraping CLAUDE.md, which was both a standing
// instruction to commit a credential (global.md -> Security) and a live hazard:
// the regex matched the TABLE LABEL, so prose in the row returned a bogus
// "credential" that S3 then typed into the first text input it found. An unset
// secret must mean "no supplied credential" — unless the form ships its own in a
// password field (below), auth tests self-skip, and nothing is typed.
const AUTH_CREDENTIAL = process.env.TEST_AUTH_CREDENTIAL || null;
// Optional second field for email+password gates (directives#304): without it,
// heuristic 2 below fills only the password, an email+password form submits a
// BLANK identifier, the backend rejects it, and the failure reads as a bad
// credential rather than a suite that never filled the username. Same secret
// plumbing as TEST_AUTH_CREDENTIAL (workflow secret -> ui-suite input -> env).
// ⚠️ NOT ACTUALLY A SECRET: this value is typed into a VISIBLE input, so
// failure screenshots and first-retry traces record it in the rendered DOM,
// where GitHub's log masking cannot reach. Use a throwaway test-account
// address that identifies nobody — never a real person's email. (The password
// renders as dots; the identifier renders as itself. That asymmetry is why
// this warning exists here and not on TEST_AUTH_CREDENTIAL.)
// AND IT GATES THE IDENTIFIER-FIRST PATH ENTIRELY (#310). A split-step login
// shows an email step BEFORE any password field, so detectAuthGate() must be
// able to call it a gate — but a lone visible email input is ALSO a newsletter
// box, and treating one as a gate would skip S3/NAV/CTRL/DISMISS on a healthy
// public app. Requiring TEST_AUTH_EMAIL is what keeps that blast radius at
// zero for every project that has not opted in: unset, nothing below changes.
// Without it there is also nothing to type — filling the PASSWORD into an
// identifier field is worse than not trying.
// The screenshot hazard above WIDENS here: a split-step gate puts the
// identifier on a screen of its own, so a failure at the credential step
// still carries a shot of the identifier step behind it.
const AUTH_EMAIL = process.env.TEST_AUTH_EMAIL || null;

// ─────────────────────────────────────────────────────────────────────────────
// AUTH READINESS — a windowed answer and a proven one must not look alike (#302)
//
// THE DEFECT THIS CLOSES IS EPISTEMIC, NOT NUMERIC. detectAuthGate() returning
// false is read as a CONCLUSION: mechanism becomes 'none' and the supplied
// credential is never tried. But absence of a gate at time T is not evidence of
// absence at T+1, so an app whose gate-determining request is still in flight
// when the settle ends produces a green on auth that was never exercised. #301
// widened the window 10s -> 30s, which changes how OFTEN that happens and can
// never change WHETHER it can. No timeout value can.
//
// A generic file cannot know the condition, which is why this is a per-project
// surface rather than a bigger number. Set EITHER:
//   TEST_AUTH_READY_SELECTOR — a selector matching whichever outcome occurs:
//                              the gate itself, OR the authenticated app shell.
//   TEST_AUTH_READY_REQUEST  — a substring of the URL of the request whose
//                              settling decides the gate (/api/session, /auth/me).
// Set neither and behaviour is exactly as before — but the report now SAYS the
// answer was a window. That half matters more than the condition itself: the
// failure today is not a short window, it is that a windowed answer and a proven
// one are indistinguishable in the output.
//
// A CONFIGURED CONDITION THAT NEVER RESOLVES IS LOUD, not a silent fallback.
// The project asserted this condition decides its gate; if it does not hold, the
// app never resolved, and quietly degrading to a settle would rebuild the exact
// ambiguity this surface exists to remove.
const AUTH_READY_SELECTOR = process.env.TEST_AUTH_READY_SELECTOR || null;
const AUTH_READY_REQUEST  = process.env.TEST_AUTH_READY_REQUEST  || null;

// AUTH SUCCESS — what a signed-in page looks like, stated by the project (#379).
// READY above is BEFORE the attempt (is the gate decided?); this is AFTER it
// (did the credential land on the signed-in view?). Unset, S2 reads the gate
// clearing as success, exactly as before. Set, S2 requires this selector to be
// VISIBLE after the post-auth settle and fails loudly when it is not — the same
// no-silent-fallback rule as the readiness condition. Name something only the
// signed-in view renders (the app shell, a sign-out control), never something
// the login screen shares.
const AUTH_SUCCESS_SELECTOR = process.env.TEST_AUTH_SUCCESS_SELECTOR || null;

// ⚠️ THE REQUEST CONDITION MUST BE LISTENING BEFORE THE NAVIGATION, which is
// why it is armed in two halves (audit 2026-10-11, C-2). A waitForResponse()
// registered AFTER goto() only sees responses that arrive later still — and the
// request this condition names is, by definition, one the page makes WHILE it
// loads. On a healthy app it had usually finished by the time the wait began, so
// the wait ran its full LOAD_SETTLE_MS and threw "never resolved": S3 and S4
// (which settled on networkidle FIRST) failed every run, and S2 / gotoAndAuth
// passed only when the response happened to land after the `load` event.
// armAuthReady() starts recording before goto(); awaitAuthReady() then reads
// the recording first and waits only for a response that has not arrived yet.
// The LOAD_SETTLE_MS window still starts after goto(), as it always did, so no
// budget term moves. gotoAuthReady() does all three in the one order that works
// — callers use it rather than pairing the halves by hand.
// It resolves on `requestfinished`, not `response`: `response` fires once the
// status and headers arrive, before the body has downloaded, so an app that
// streams or parses a slow session payload was marked ready before the code
// awaiting that body could render the gate (Codex, #438).
function armAuthReady(page) {
  if (AUTH_READY_SELECTOR || !AUTH_READY_REQUEST) return { response: null, dispose: () => {} };
  let resolve;
  const response = new Promise((r) => { resolve = r; });
  const onFinished = (request) => {
    if (!request.url().includes(AUTH_READY_REQUEST)) return;
    page.off('requestfinished', onFinished);
    resolve(request);
  };
  page.on('requestfinished', onFinished);
  return { response, dispose: () => page.off('requestfinished', onFinished) };
}

async function awaitAuthReady(page, armed) {
  if (!AUTH_READY_SELECTOR && !AUTH_READY_REQUEST) {
    await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    return 'windowed';
  }
  // Not armed is a CALLER bug, and loud: falling back to a late waitForResponse
  // would rebuild the race above, which fails a healthy app.
  if (!AUTH_READY_SELECTOR && !armed?.response) {
    throw new Error(
      'awaitAuthReady: TEST_AUTH_READY_REQUEST is set but no response recorder was armed before ' +
      'navigation. Call gotoAuthReady(page) instead of page.goto() + awaitAuthReady(page) — the ' +
      'request this condition names completes during the load, so a wait registered after goto() ' +
      'misses it.'
    );
  }
  try {
    if (AUTH_READY_SELECTOR) {
      await page.waitForSelector(AUTH_READY_SELECTOR, { timeout: LOAD_SETTLE_MS, state: 'attached' });
    } else {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), LOAD_SETTLE_MS);
      });
      try { await Promise.race([armed.response, timeout]); } finally { clearTimeout(timer); }
    }
    return 'proven';
  } catch {
    const which = AUTH_READY_SELECTOR
      ? `TEST_AUTH_READY_SELECTOR (${AUTH_READY_SELECTOR})`
      : `TEST_AUTH_READY_REQUEST (${AUTH_READY_REQUEST})`;
    throw new Error(
      `Auth-readiness condition never resolved within ${LOAD_SETTLE_MS}ms: ${which}.\n` +
      `  This project declared that condition as the point at which its gate decision is made, ` +
      `so nothing below it can be trusted — a gate that has not been decided cannot be reported ` +
      `present or absent.\n` +
      `  A SELECTOR must match WHICHEVER outcome occurs — the gate itself OR the authenticated ` +
      `app shell — not only one of them; a selector that names just the gate times out on every ` +
      `signed-in run. A REQUEST is matched as a substring of the response URL, recorded from ` +
      `before navigation. Failing rather than falling back to the settle, because a silent fallback ` +
      `rebuilds the windowed-vs-proven ambiguity this condition exists to remove (directives#302).`
    );
  }
}

// goto + readiness, in the order that cannot race. Returns the evidence grade
// ('windowed' | 'proven'). With no condition configured, the readiness wait IS
// the LOAD_SETTLE_MS networkidle settle. A condition proves only that the auth
// decision is available, not that the rest of the page has rendered, so a
// caller that next INSPECTS the page (S3's sweep, S4's scrollWidth) passes
// { settle: true } and gets the settle AFTER the condition as well: a late
// control or late overflow would otherwise land after the verdict and leave it
// green (Codex, #438). The settle comes after, never in front: in front it let a
// named request complete before anything listened (audit 2026-10-11, C-2).
async function gotoAuthReady(page, url = './', { settle = false } = {}) {
  const armed = armAuthReady(page);
  try {
    await page.goto(url);
    const grade = await awaitAuthReady(page, armed);
    if (settle && grade === 'proven') {
      await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    }
    return grade;
  } finally {
    armed.dispose();
  }
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
//
// SPLIT-STEP (#310) — a SECOND pass through the same loop, and the only path
// that costs more than the sum above. It requires TEST_AUTH_EMAIL to be set AND
// an identifier-first step to be discovered, so every project on a PIN, a
// password form, an email+password form or no gate at all pays exactly zero:
//
//     identifier step:  waitFor 10 + fill 10 + submit 10 + LOAD_SETTLE_MS 25
//                                                              = 55s
//   + credential step:  the single-step sum above
//                                                       ~53s / ~94s
//     ----------------------------------------------------------
//     ~108s at N=4       ~149s at N=8      (delta: +55s, flat in N)
//
// The credential step's ladder may fill an identifier AGAIN (a step-2 form that
// re-shows the email). That is already inside the 33s password figure, and the
// editable-only rule means a READONLY prefilled email is left alone rather than
// burning a fill timeout. PIN remains the sizing case at both N.
//
// So the shared preamble (goto 30 + settle 25 + detectAuthGate 5 + this + settle
// 25) goes ~138s -> ~193s at N=4 and ~179s -> ~234s at N=8 on a split-step gate,
// and is UNCHANGED everywhere else. Every budget below states which it assumed.
// ─────────────────────────────────────────────────────────────────────────────
const T = ':is(input[type=text], input:not([type]))';
const SEMANTIC = ['name', 'id', 'placeholder', 'aria-label']
  .flatMap(a => ['email', 'user', 'login'].map(v => `${T}[${a}*="${v}" i]`))
  .join(', ');
// Rungs 1-3 only — the UNRESTRICTED 4th rung stays form-only and is appended at
// the ladder's call site. Hoisted because the identifier-STEP detector (#310)
// must count candidates from exactly this set: a detector with its own selector
// list is two definitions that drift, which is what generating SEMANTIC already
// had to be done to prevent.
const IDENTIFIER_RUNGS = [
  'input[type=email]',
  'input[autocomplete~="username" i], input[autocomplete~="email" i]',
  SEMANTIC,
];
const IDENTIFIER_UNION = IDENTIFIER_RUNGS.join(', ');
// The identifier step's advance control, and the two shapes it must NOT be.
// Word-bound: `.filter({ hasText })` is a SUBSTRING match, the same trap #308
// found in the back-control locator.
const ADVANCE_NAME = /\b(next|continue|sign\s?in|log\s?in|submit|enter)\b/i;
// "Continue with Google" sits on real split-step login screens and starts an
// OAuth redirect. It matches ADVANCE_NAME; it must lose anyway.
const SOCIAL_NAME  = /\bwith\s+(google|apple|microsoft|github|facebook|okta|sso)\b/i;
// The auth-context vocabulary, as SOURCE so both evaluates below build the same
// RegExp — a page.evaluate body cannot close over module scope, and two copies
// of this list is exactly the drift textGateSignals was factored to prevent.
const AUTH_CONTEXT_SRC =
  '\\b(pin|passcode|access\\s*code|access|log\\s*in|login|sign\\s*in|unlock|enter\\s*code|password)\\b';
// Identifier step + credential step. NOT a knob: raising it re-derives every
// budget in this file (each step costs a full settle) and there is no third
// step this suite knows how to answer.
const AUTH_STEP_CAP = 2;
// The keypad half of the two ready-waits' selector. `[class*="pin"]` alone
// matched `spinner`, so a visible loading spinner resolved a wait meant for the
// auth UI before that UI rendered (audit 2026-10-11, I-8). A wait is a speed-up
// only, so CSS's lack of a word boundary is approximated by excluding "spin";
// the verdict-bearing count in pinGateVisible() is word-bound exactly.
const PIN_CLASS_HINT = '[class*="pin"]:not([class*="spin"])';

// Mechanisms that mean THIS SUITE DID NOT COMPLETE AN AUTHENTICATION ATTEMPT.
// Neither is a verdict about the app — both are facts about what the suite did,
// which is why expectGateCleared stays silent on them and every scenario that
// needs an authenticated view SKIPS rather than measuring the login screen. A
// set, not two `||`s, because the last three mechanisms added to this file each
// had to be carried to four call sites by hand and one of them was missed.
const AUTH_INCOMPLETE = new Set(['identifier-step-unresolved', 'no-credential']);
const authIncompleteNote = (mechanism) => mechanism === 'no-credential'
  ? 'An auth gate is on screen, TEST_AUTH_CREDENTIAL is unset, and the form ships no credential of its own — there was nothing to submit.'
  : 'Identifier step submitted but no credential step appeared — no credential was entered.';

// A form that SHIPS a working credential is a legitimate credential source.
// claude.insurance's login prefills username+password and a human signs in by
// clicking Log in; before this, supplying TEST_AUTH_CREDENTIAL overwrote a
// working value (turning a green login into a loud, correctly-reported but
// wrongly-caused "gate retained"), and NOT supplying it skipped every auth
// scenario — so the HONEST configuration, declining to invent a secret the app
// does not need, bought zero auth coverage. Neither reports the truth about
// that app. directives#312.
//
// The env value WINS when present: it is an explicit instruction, and reading
// the field first would only spend a DOM round-trip to reach the same answer.
// A prefilled value is used by NOT overwriting it — `value` is null on that
// branch precisely so a caller cannot accidentally re-type what is already
// there. Whitespace is not a credential, hence the trim.
//
// DEPENDS ON HYDRATION HAVING FINISHED, and that is not assumed: every caller
// settles on networkidle before detectAndAuth runs, so an app that populates
// its form from JS has done so by the time this reads.
async function credentialFor(input, envValue) {
  if (envValue) return { value: envValue, source: 'env' };
  const existing = ((await input.inputValue().catch(() => '')) || '').trim();
  if (existing) return { value: null, source: 'prefilled' };
  return { value: null, source: null };
}

// Does the gate on screen carry a credential of its own? PASSWORD FIELDS ONLY,
// and that narrowing is the same proof-grading rule the rest of this file runs
// on: input[type=password] is the one field kind whose non-empty value is
// necessarily a credential. A non-empty TEXT input is indistinguishable from a
// search box with a default query, so a prefilled TEXT/PIN gate still skips —
// a stated residue, not an oversight.
// ⚠️ RESIDUE, browser autofill: a profile-backed browser could populate this
// field, and the suite would then submit a real person's saved credential. CI
// browsers are fresh contexts with no profile, which is why this is safe HERE;
// it is not safe in a headed local run against your own profile.
async function gateShipsCredential(page) {
  return page.evaluate(() => [...document.querySelectorAll('input[type=password]')].some(el => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || getComputedStyle(el).visibility === 'hidden') return false;
    return !el.readOnly && !el.disabled && (el.value || '').trim() !== '';
  }));
}

// THE IDENTIFIER LADDER, with its anchor as a parameter. Two callers with
// opposite anchor semantics (#310): the email+password path anchors on the
// PASSWORD and picks the field beside it; the identifier-first path anchors on
// the identifier ITSELF, because there is no password on that screen. Extracted
// rather than reimplemented so the detector's candidate COUNT and the fill's
// candidate CHOICE come from one evaluate — a detector with its own selector
// list is two definitions that drift.
//   mark: true  → the pick is marked with a run-unique attribute and `marker`
//                 comes back; falsy → probe only, nothing is written.
// Always returns an object, so a caller reads `.pick` rather than a union type.
async function identifierPick(page, { anchorHandle, scopeHandle, hasForm, anchorIsCandidate, mark }) {
  // PREFERENCE LADDER, most-semantic first — never one union, because a
  // selector union preserves DOM order and a tenant/org field ahead of the
  // identifier would receive the email. Rungs: (1) the typed email input;
  // (2) autocomplete=username/email — the spec-defined identifier marker,
  // matched with ~= because the attribute is a space-separated token list
  // ("section-login username") and exact equality misses every multi-token
  // value; (3) a text input whose name/id/placeholder/aria-label SAYS it
  // is an email/user/login field; (4) form-scoped last resort, any visible
  // text input — kept because identifier fields on login forms are often
  // plain unlabeled type=text, and a login form rarely holds a competing
  // one (the tenant-field case is exactly what rungs 2-3 exist to win
  // first). Formless gates use rungs 1-3: the semantic rung names its
  // field explicitly, so it is safe anywhere (a div-based login with
  // <input name="username"> matches nothing without it); only the
  // UNRESTRICTED last resort stays form-only, because off-form a bare
  // text input is more likely a search box than a login field.
  // GENERATED, not hand-listed (see IDENTIFIER_RUNGS above): the hand-written
  // version required an explicit type=text on every clause, so a form of
  // type-less inputs (<input name="tenant">, <input name="username">) matched
  // NO semantic rung and fell to the DOM-order last resort — tenant filled,
  // username blank. It had also drifted internally (login missing from two of
  // the four attributes). The cross-product cannot omit a cell.
  const rungs = [...IDENTIFIER_RUNGS, ...(hasForm ? ['input[type=text], input:not([type])'] : [])];
  // Selection is ANCHORED TO THE ANCHOR ELEMENT — never `.first()`, which
  // hands the fill to whatever matches earliest in the DOM. Two regimes:
  //   - WITH a form, rungs run in rank order scoped to that form, and the
  //     pick within a rung is the candidate nearest the anchor
  //     (preferring those that precede it) — the form declares the
  //     association, rank disambiguates inside it.
  //   - FORMLESS, proximity comes BEFORE rank: the rungs are unioned and
  //     the nearest-preceding candidate wins outright. Rung rank across a
  //     whole document inverts the intent — a newsletter input[type=email]
  //     elsewhere on the page outranked the semantic username sitting
  //     beside the password. With no form to declare the association,
  //     adjacency to the anchor IS the association; the rungs still
  //     bound WHAT may be picked (semantically-named fields only).
  // Visibility uses the file's evaluate-side definition (geometry +
  // computed visibility, same as textGateSignals), so a hidden responsive
  // copy is passed over in favour of the visible candidate rather than
  // silently skipping the fill. The pick is marked, filled through
  // Playwright (real input events), and unmarked.
  const marker = mark ? `uit-${Math.random().toString(36).slice(2)}` : null;
  const marked = await page.evaluate(([pw, root, sels, mrk, anchorIsCandidate]) => {
    if (!pw) return null;
    const vis = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    // EDITABLE candidates only: a two-step login shows the already-chosen
    // email in a readonly input beside the password — fill() on it burns
    // its timeout and fails, while leaving it alone submits fine. A
    // readonly prefilled identifier is accepted by NOT overwriting it.
    const editable = el => !el.readOnly && !el.disabled;
    // Formless scope is the ANCHOR'S OWN ROOT, not document: a login
    // component in an open shadow root keeps its inputs behind a boundary
    // querySelectorAll cannot cross from document, while Playwright found
    // the anchor inside it. getRootNode() is the shadow root there and
    // document everywhere else — the non-shadow case is unchanged.
    const scope = root || pw.getRootNode();
    // Form-scoped collection reads the form's `elements` collection, not a
    // descendant query: a control outside the form tag but associated via
    // the `form` attribute (<input form="login">) is submitted with the
    // form yet never matched by a descendant querySelectorAll.
    const candsOf = sel => (root
      ? [...root.elements].filter(el => el.matches(sel))
      : [...scope.querySelectorAll(sel)]
    ).filter(el => vis(el) && editable(el));
    const nearest = cands => {
      if (!cands.length) return null;
      // anchorIsCandidate: the identifier-step call anchors on the
      // identifier itself (there is no password to sit after), so
      // preferring PRECEDING candidates would hand the fill to a
      // newsletter box earlier in the DOM — the exact inversion the
      // formless-proximity note above warns about. When the anchor is in
      // the pool it wins outright. Safe because that call additionally
      // requires poolSize === 1.
      if (anchorIsCandidate) { if (cands.includes(pw)) return pw; }
      // ...and when it is NOT a candidate it must not become one: a
      // malformed <input type=password autocomplete="username"> matches
      // rung 2, which has no type restriction.
      else cands = cands.filter(el => el !== pw);
      const preceding = cands.filter(el => el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
      return preceding.length ? preceding[preceding.length - 1] : cands[0];
    };
    // ACCESSIBLE-NAME matcher, both branches: <label for> / wrapping
    // labels (el.labels) and aria-labelledby text against the same
    // email/user/login vocabulary as the SEMANTIC rung — a gate labeling
    // its identifier with generated attributes carries the word "Email"
    // only in its accessible name, where no attribute selector can see
    // it. KNOWN LIMIT, deliberate: this reads TEXT, not the full
    // accessibility-name algorithm — a label whose only content is
    // <img alt="Email"> is not seen. Reimplementing accname inside an
    // evaluate is the staircase the back-control locator climbed and
    // abandoned for getByRole; no role locator can express "text input
    // whose NAME says email", so the residue is documented instead — an
    // app that exotic needs directives#302's per-project condition.
    const nameMatches = el => {
      const rootNode = el.getRootNode();
      const byId = id => (rootNode.getElementById ? rootNode : document).getElementById(id)?.textContent || '';
      const labelledby = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(byId).join(' ');
      const labels = el.labels ? [...el.labels].map(l => l.textContent || '').join(' ') : '';
      return /email|user|login/i.test(`${labelledby} ${labels}`);
    };
    const TEXTish = ':is(input[type=text], input:not([type]))';
    let pick = null;
    if (root) {
      // The accessible-name rung sits BETWEEN the semantic attribute rung
      // and the unrestricted last resort: an input labeled "Email" with
      // generated attributes must win before the final rung's proximity
      // hands the fill to a nearer tenant field.
      const rungPools = [
        ...sels.slice(0, -1).map(sel => () => candsOf(sel)),
        () => candsOf(TEXTish).filter(nameMatches),
        () => candsOf(sels[sels.length - 1]),
      ];
      for (const pool of rungPools) { pick = nearest(pool()); if (pick) break; }
    } else {
      // querySelectorAll on the joined union returns document order, so
      // nearest() sees one proximity-sorted candidate pool; accessible-
      // name candidates are unioned in and the pool re-sorted.
      const named = candsOf(TEXTish).filter(nameMatches);
      const pool = [...new Set([...candsOf(sels.join(', ')), ...named])];
      pool.sort((a, b) => a === b ? 0
        : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
      pick = nearest(pool);
    }
    // The de-duplicated union across every rung plus the accessible-name
    // pool — the SINGLE-candidate precondition the identifier-step
    // detector applies, computed from the same filtering that chose the
    // pick so the detector and the fill cannot disagree. The form branch
    // stops at the first non-empty rung, so this union is built for the
    // count regardless of which branch produced `pick`.
    const poolSize = new Set([
      ...candsOf([...sels].join(', ')),
      ...candsOf(TEXTish).filter(nameMatches),
    ]).size;
    if (!pick) return { pick: false, poolSize };
    if (!mrk) return { pick: true, poolSize };
    // The candidate's ORIGINAL attribute value (null when absent) rides
    // back so cleanup restores rather than deletes — if the app itself
    // owns this attribute on the picked input, its styling/submit logic
    // must see the markup it shipped.
    const prev = pick.getAttribute('data-uitests-identifier');
    pick.setAttribute('data-uitests-identifier', mrk);
    return { pick: true, poolSize, prev };
  }, [anchorHandle, scopeHandle, rungs, marker, anchorIsCandidate]);
  return { pick: false, poolSize: 0, prev: null, marker, ...(marked || {}) };
}

// Fill the marked pick and put the markup back, in the ONE order that survives a
// controlled component. Shared by both ladder callers so the #311 fix cannot
// exist on one path and not the other. Returns the resolved handle — the
// identifier step presses Enter through it, because the marker-based locator
// stops matching the moment the restore runs.
async function identifierFill(page, marked, value) {
  // Located by the run-unique VALUE, not attribute presence — an app
  // element that happens to carry the bare attribute cannot shadow the
  // candidate the evaluate actually picked.
  const cand = page.locator(`[data-uitests-identifier="${marked.marker}"]`).first();
  // RESOLVE THE NODE BEFORE FILLING, and clean up through that handle. A
  // locator is a QUERY, not a reference: a controlled or masking component
  // that REPLACES this input in response to the fill's input events leaves
  // the replacement without the marker, so re-resolving the attribute
  // afterwards matches nothing, waits out actionTimeout and THROWS — after
  // a fill that succeeded. That throw aborted detectAndAuth() before the
  // password was ever typed, so a cosmetic cleanup step failed the whole
  // authentication and reported it as an attribute-selector timeout
  // (directives#311). Bounded like every other resolution here by
  // playwright.config.js's actionTimeout, and caught: losing the cleanup
  // must never cost the fill.
  const candHandle = await cand.elementHandle().catch(() => null);
  // ALREADY CORRECT — leave it alone (#312). Beyond saving a fill, this removes
  // the #311 hazard outright for the commonest prefilled case: no fill means no
  // input events, so no controlled component can swap the node out from under
  // the cleanup below.
  const current = ((await cand.inputValue().catch(() => '')) || '').trim();
  if (current !== String(value)) await cand.fill(String(value));
  // elementHandle.evaluate() does NOT re-query — it runs against the node
  // the pick returned, attached or not. If the app replaced that node the
  // write lands on the orphan and live markup is untouched, which is the
  // right outcome: the marker left the document with the node it was on.
  // The catch covers the one thing a handle cannot outlive — its execution
  // context going away under a navigation.
  if (candHandle) {
    await candHandle.evaluate((el, prev) => {
      if (prev === null) el.removeAttribute('data-uitests-identifier');
      else el.setAttribute('data-uitests-identifier', prev);
    }, marked.prev).catch(() => {});
  }
  return candHandle;
}

async function detectAndAuth(page, credential) {
  // Each step's pre-attempt state, and the trail of steps already taken.
  const steps = [];
  let viewBefore = null, snapBefore = null;
  // WHERE THE CREDENTIAL CAME FROM, reported rather than inferred (#312).
  // "prefilled credential accepted" and "supplied credential accepted" are
  // different facts and were indistinguishable — the same complaint #302 makes
  // about a windowed result dressed as a proven one.
  let credentialSource = null;
  const done = (mechanism) => {
    if (steps.length) attachJson('auth-steps', { mechanism, steps });
    return { mechanism, credentialSource, viewBefore, snapBefore, steps };
  };
  for (let step = 0; step < AUTH_STEP_CAP; step++) {
    // Wait for auth UI to be fully active before interacting — prevents CI timing failures
    // on mobile/WebKit where JS activates slower than desktop Chromium.
    // input[type=email] ADDED (#310): on a pure email-first screen neither of
    // this file's two ready-waits could ever resolve, so both burned their full
    // timeout (10s here, 5s in detectAuthGate) before concluding. Widening is a
    // speed-up only — no branch reads whether the wait resolved.
    await page.locator(`[class*="keypad"], ${PIN_CLASS_HINT}, input[type="password"], input[type="email"], input[type="text"]`)
      .first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    // PER-STEP pre-attempt state. Captured INSIDE the loop because a split flow
    // has two pre-attempt states and the verdict grades the LAST one: compared
    // against the email screen, expectGateCleared's message always reads 'view
    // changed' and S2's domChanged arm is trivially true.
    viewBefore = await viewSignature(page);
    snapBefore = await domSnapshot(page);

    // Heuristic 1: numeric keypad (buttons 0-9 + dot indicators). THE SAME
    // SIGNAL DETECTION READS — pinGateVisible(), visible elements only, the rule
    // heuristic 2 states below ("attempt and detection must select from the same
    // set"). The attempt used to count HIDDEN digit buttons and every
    // `[class*="pin"]` (a `.spinner` included), so a password form carrying a
    // hidden 1-9 date picker took this branch and then waited out actionTimeout
    // clicking a digit nobody could see (audit 2026-10-11, I-8).
    if (await pinGateVisible(page)) {
      // A keypad ships no value to read, so gateShipsCredential() can never
      // unlock this branch and only an env credential reaches it. Guarded
      // anyway: without this, String(null) types the digits of "null".
      if (!credential) return done('no-credential');
      credentialSource = 'env';
      // PIN keypad — click each digit as a string (preserve leading zeros)
      for (const digit of String(credential).split('')) {
        await page.locator('button').filter({ hasText: new RegExp(`^${digit}$`) }).locator('visible=true').first().click();
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(3000);
      return done('pin-keypad');
    }

    // Heuristic 2: password input — `visible=true` BEFORE `.first()`, the same
    // idiom as detection (passwordGateVisible) and for the same reason: a hidden
    // responsive copy first in the DOM would otherwise make the attempt skip
    // this branch and return mechanism 'none' — which no verifier checks — while
    // detection correctly reports a gate. Attempt and detection must select from
    // the same set.
    const passwordInput = page.locator('input[type=password]').locator('visible=true').first();
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
      //
      // RESOLVED BEFORE THE IDENTIFIER IS TOUCHED, because the answer decides
      // whether the identifier may be touched at all (#312). A prefilled form is
      // a MATCHED PAIR: overwriting its identifier with TEST_AUTH_EMAIL while
      // leaving its shipped password in place submits a mismatched pair and
      // fails a login that works. So the ladder runs only on the 'env' branch —
      // which is every configuration that reaches here today, since before #312
      // the callers refused to call this function without TEST_AUTH_CREDENTIAL.
      // Existing behaviour is therefore unchanged; only the new path is bounded.
      const cred = await credentialFor(passwordInput, credential || null);
      credentialSource = cred.source;
      if (AUTH_EMAIL && cred.source === 'env') {
        // The password's ASSOCIATED form via the DOM's own .form property — it
        // resolves both an ancestor <form> and external association
        // (<input form="login"> outside the form tag), where an ancestor-only
        // xpath lookup reports no form and wrongly restricts the search to the
        // formless rungs.
        const pwHandle = await passwordInput.elementHandle();
        const scopeHandle = (await passwordInput.evaluateHandle(el => el.form)).asElement();
        // anchorIsCandidate: false — the identifier is the field BESIDE the
        // password, never the password itself, so selection here is bit-for-bit
        // what it was before #310. Only the ladder's home moved.
        const marked = await identifierPick(page, {
          anchorHandle: pwHandle, scopeHandle, hasForm: !!scopeHandle,
          anchorIsCandidate: false, mark: true,
        });
        if (marked.pick) await identifierFill(page, marked, AUTH_EMAIL);
      }
      // FILL ONLY WHAT WE BROUGHT. On the 'prefilled' branch the field already
      // holds a working value and the form is submitted as it stands — the
      // whole point of #312, since the alternative was to replace a credential
      // that works with one that may not and then report the resulting "gate
      // retained" as if the app were at fault.
      if (cred.source === 'env') await passwordInput.fill(String(cred.value));
      // Nothing to submit is not an auth attempt. It must NOT report 'none',
      // which every caller reads as "no gate, carry on" and which would send
      // them to measure the login screen — the exact silent failure #309 exists
      // to prevent. AUTH_INCOMPLETE is what the callers skip on instead.
      if (!cred.source) return done('no-credential');
      // SUBMIT, resolved the way heuristic 2.5 resolves its advance control
      // (audit 2026-10-11, I-8). The old locator was a page-wide CSS union with
      // an unbounded substring filter, taken `.first()` in DOM ORDER: "Sign in
      // with Google" above the form won (an OAuth redirect instead of a login),
      // "Help Center" and "Blog index" matched, and its input[type=submit] arm
      // could never match a text filter at all. Now, in order:
      //   1. the PASSWORD'S OWN FORM's explicit type=submit control, visible and
      //      not social — read through `form.elements`, so a control associated
      //      by the `form` attribute counts;
      //   2. a word-bound ADVANCE_NAME control anywhere, social excluded;
      //   3. Enter in the password field, which submits its form natively.
      const formSubmit = await passwordInput.evaluateHandle((pw, socialSrc) => {
        const social = new RegExp(socialSrc, 'i');
        if (!pw.form) return null;
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        return [...pw.form.elements].find((el) =>
          /^(button|input)$/i.test(el.tagName)
          && (el.getAttribute('type') || '').toLowerCase() === 'submit'
          && !el.disabled && vis(el)
          && !social.test(`${el.textContent || ''} ${el.value || ''} ${el.getAttribute('aria-label') || ''}`)) || null;
      }, SOCIAL_NAME.source).then((h) => h.asElement()).catch(() => null);
      const namedSubmit = page.locator('button, [role=button], input[type=submit]')
        .locator('visible=true')
        .filter({ hasText: ADVANCE_NAME })
        .filter({ hasNotText: SOCIAL_NAME })
        .first();
      if (formSubmit) await formSubmit.click();
      else if (await namedSubmit.isVisible().catch(() => false)) await namedSubmit.click();
      else await passwordInput.press('Enter');
      await page.waitForTimeout(3000);
      return done('password-form');
    }

    // Heuristic 2.5 — IDENTIFIER-FIRST STEP. Sits between the password and text
    // heuristics deliberately: after password (an email+password form on one
    // screen is heuristic 2's, and identifierGateVisible refuses when a password
    // is visible), before text (a lone email input must not fall through to the
    // text path, which would type the PASSWORD into it).
    // `step + 1 < AUTH_STEP_CAP` is what bounds this: the arm cannot fire on the
    // last permitted iteration, so at most one extra pass exists. There is no
    // recursion and no re-entry — read the loop, not this comment, to confirm it.
    if (step + 1 < AUTH_STEP_CAP && await identifierGateVisible(page)) {
      const anchor = await identifierCandidate(page).elementHandle().catch(() => null);
      const scope  = anchor ? (await anchor.evaluateHandle(el => el.form)).asElement() : null;
      const marked = anchor && await identifierPick(page, {
        anchorHandle: anchor, scopeHandle: scope, hasForm: !!scope,
        anchorIsCandidate: true, mark: true,
      });
      if (marked?.pick) {
        // SUBMIT, form-scoped first, and RESOLVED WHILE THE MARKER IS STILL ON
        // THE PAGE — a locator is a query, so one built after the restore would
        // match nothing. isVisible() does not wait, so an app with no form-scoped
        // submit costs a lookup rather than an actionTimeout.
        // A page-scoped `button[type=submit], input[type=submit], button` +
        // `.first()` is NOT used here: a CSS union returns DOM order, not
        // selector order, so on a split-step screen carrying "Continue with
        // Google" above "Continue" it would start an OAuth redirect. Heuristic 2
        // carried exactly that union until audit 2026-10-11 (I-8) moved it onto
        // this resolution order — and scoping to the identifier's OWN form
        // rather than any form on the page is what keeps that union from
        // reintroducing the same DOM-order trap.
        const inForm = scope
          ? page.locator(`form:has([data-uitests-identifier="${marked.marker}"]) :is(button[type=submit], input[type=submit])`)
              .locator('visible=true').first()
          : null;
        const inFormHandle = inForm && await inForm.isVisible().catch(() => false)
          ? await inForm.elementHandle().catch(() => null)
          : null;
        const candHandle = await identifierFill(page, marked, AUTH_EMAIL);
        // Named advance control, second. Word-bound and social-excluded at the
        // definitions above; `visible=true` before the filters, the same idiom
        // every other locator in this file uses.
        const named = page.locator('button, [role=button], input[type=submit]')
          .locator('visible=true')
          .filter({ hasText: ADVANCE_NAME })
          .filter({ hasNotText: SOCIAL_NAME })
          .first();
        if (inFormHandle) await inFormHandle.click().catch(() => {});
        else if (await named.isVisible().catch(() => false)) await named.click().catch(() => {});
        else if (candHandle) await candHandle.press('Enter').catch(() => {});
        // LOAD_SETTLE_MS — classified in the header list at the top of this
        // file. The loop re-runs DISCOVERY on what this returns; too short and
        // a working split-step login reads as unresolved.
        await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
        steps.push({ step, mechanism: 'identifier-step', viewBefore, viewAfter: await viewSignature(page) });
        continue;   // ← the only one
      }
    }

    // Heuristic 3: text input accepting short credential — same visible-first
    // idiom as heuristic 2, carried proactively: a hidden text input first in
    // the DOM would silently return 'none' here too.
    const textInput = page.locator('input[type=text], input:not([type])').locator('visible=true').first();
    if (await textInput.isVisible().catch(() => false)) {
      // Same rule as the password branch (#312), carried here deliberately
      // rather than left for the next reader to notice. NOTE the asymmetry with
      // gateShipsCredential(), which refuses to READ a prefilled text input as a
      // credential: a non-empty text field cannot be told from a search box with
      // a default query, so this branch is only ever reached with an env value
      // today. The arm is written for the day #302's per-project condition can
      // tell the two apart.
      const cred = await credentialFor(textInput, credential || null);
      credentialSource = cred.source;
      if (cred.source === 'env') await textInput.fill(String(cred.value));
      if (!cred.source) return done('no-credential');
      await textInput.press('Enter');
      await page.waitForTimeout(3000);
      return done('text-input');
    }
    break;
  }
  // Fell out. Either nothing matched at all, or the identifier step fired and
  // the credential step never appeared — a rejected identifier, a passwordless
  // magic-link flow, a step that rendered after the settle, or a submit that
  // did nothing. NOT distinguishable from here, which is why this is a
  // mechanism the callers SKIP on rather than a verdict anything throws.
  return done(steps.length ? 'identifier-step-unresolved' : 'none');
}

// Detection-only: is there a real auth gate (PIN keypad, password field, or — only
// when TEST_AUTH_EMAIL is set — an identifier-first step, i.e. an email screen shown
// BEFORE any password (#310))? Does NOT interact, and still deliberately ignores plain
// text inputs (a search/filter box is not an auth gate). Used to decide whether to
// skip/auth without firing spurious login attempts.
async function detectAuthGate(page) {
  await page.locator(`[class*="keypad"], ${PIN_CLASS_HINT}, input[type="password"], input[type="email"]`)
    .first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await pinGateVisible(page)) return true;
  if (await passwordGateVisible(page)) return true;
  // Identifier-first step (#310). AFTER the password check — with a password on
  // screen this is an ordinary email+password form and heuristic 2 owns it —
  // and BEFORE the text gate, so a lone email input is never handed to the
  // text path, which would type the CREDENTIAL into it. Inert unless
  // TEST_AUTH_EMAIL is set; see identifierGateVisible for why that gate is the
  // containment and not a convenience.
  if (await identifierGateVisible(page)) return true;
  // Text/access-code gate (detectAndAuth's text-input path): a SINGLE visible text input
  // on a sparse, login-like page — gated on auth-ish context so an arbitrary search/filter
  // box on a content-rich page is NOT treated as auth.
  const t = await textGateSignals(page);
  return t.single && t.looksAuth && t.controls <= 4;
}

// The two mechanism signals, factored so DISCOVERY (detectAuthGate) and the
// post-attempt VERDICT (expectGateCleared) read the same definition and cannot
// drift. VISIBLE elements only — an SPA that hides its PIN view after login
// (rather than unmounting it) still has 10 numeric buttons in the DOM, and
// counting them made the detector return true post-login, which turned
// expectGateCleared() into a throw on every SUCCESSFUL sign-in. A gate the
// user cannot see is not a gate.
async function pinGateVisible(page) {
  const numericButtons = await page.locator('button').filter({ hasText: /^[0-9]$/ }).locator('visible=true').count();
  // WORD-BOUND, not substring (audit 2026-10-11, I-8): `[class*="pin"]` matched
  // `spinner`, so any loading indicator beside a date picker satisfied half of
  // this signal. The CSS pre-filter is case-insensitive; the evaluate keeps an
  // element only when a WORD of its class list — split on whitespace, `-`, `_`
  // and camelCase humps — starts with "pin" or "dot": `pin-dot`, `PinPad_dot__x1`,
  // `pinIndicator` and `dots` count; `spinner`, `anecdote` do not.
  const dotIndicator = await page.locator('[class*="dot" i], [class*="pin" i]').locator('visible=true')
    .evaluateAll((els) => els.filter((el) => (el.getAttribute('class') || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9]+/)
      .some((w) => /^(pin|dot)/i.test(w))).length)
    .catch(() => 0);
  return numericButtons >= 9 && dotIndicator > 0;
}
async function passwordGateVisible(page) {
  // Visible-filtered COUNT, the same idiom as the PIN signal above — never
  // `.first().isVisible()`: in the common SPA pattern a hidden responsive
  // copy sits earlier in the DOM, `.first()` selects it, and a genuinely
  // visible password field behind it reads as "no gate".
  const n = await page.locator('input[type=password]').locator('visible=true').count().catch(() => 0);
  return n > 0;
}

// The first VISIBLE identifier candidate, as a Playwright locator — which is
// what makes the shadow-root case work: the locator pierces open shadow roots,
// so the handle it yields lets identifierPick's existing `pw.getRootNode()`
// scope reach a login component document.querySelectorAll cannot see. Same
// visible-filtered-COUNT-then-first idiom as passwordGateVisible, and for the
// same reason: `.first()` alone selects a hidden responsive copy.
function identifierCandidate(page) {
  return page.locator(IDENTIFIER_UNION).locator('visible=true').first();
}

// DISCOVERY-GRADE, and it says so where it is defined rather than where it is
// read. Four conditions, each earning its place:
//   1. AUTH_EMAIL is set        — nothing to type otherwise, and this is the
//                                 opt-in that keeps the change inert fleet-wide
//   2. no visible password      — with one, this is an ordinary email+password
//                                 form and heuristic 2 already owns it
//   3. poolSize === 1           — EXACTLY one visible, editable,
//                                 identifier-semantic candidate page-wide
//   4. auth-ish page context    — the same vocabulary textGateSignals uses
// There is deliberately NO `controls <= 4` cutoff here, and the difference from
// textGateSignals is the reason: that signal's candidate set is ANY text input,
// so a search box qualifies and only page sparsity separates it from auth.
// This set is already identifier-semantic by construction, and every real
// split-step login (Google, Microsoft, Okta) carries far more than four
// controls — forgot-email, create-account, help, privacy, terms, a language
// select. Importing that cutoff would make this arm dead on arrival.
async function identifierGateVisible(page) {
  if (!AUTH_EMAIL) return false;
  if (await passwordGateVisible(page)) return false;
  // PAGE-WIDE FIRST, before the ladder's own count. identifierPick's poolSize is
  // FORM-SCOPED whenever the anchor has a form, so on a page carrying both a
  // newsletter <form> and a login <form> it reports 1 for the newsletter box —
  // and the anchor IS the newsletter box, since identifierCandidate takes the
  // first in DOM order. That is the exact false positive condition 3 exists to
  // rule out, so the page-wide count is the one that has to hold: the comment
  // says "page-wide" and the code must not quietly mean "in this form".
  // A wrongly-INCLUDED page here costs a destructive fill-and-submit on a
  // stranger's newsletter box; a wrongly-EXCLUDED one costs exactly the
  // behaviour this file had yesterday.
  if (await page.locator(IDENTIFIER_UNION).locator('visible=true').count().catch(() => 0) !== 1) return false;
  const anchor = await identifierCandidate(page).elementHandle().catch(() => null);
  if (!anchor) return false;
  const scope = (await anchor.evaluateHandle(el => el.form)).asElement();
  const probe = await identifierPick(page, {
    anchorHandle: anchor, scopeHandle: scope, hasForm: !!scope,
    anchorIsCandidate: true, mark: null,
  });
  if (!probe.pick || probe.poolSize !== 1) return false;
  return authContextVisible(page);
}

// The body-text half of textGateSignals' looksAuth, on the SAME regex source.
// The candidate half is redundant here: a candidate only qualifies via an email
// type, an autocomplete username/email token, an email/user/login-named
// attribute, or an accessible name that says so — its own context has already
// been read by the time this runs.
async function authContextVisible(page) {
  return page.evaluate(src =>
    new RegExp(src, 'i').test((document.body.innerText || '').slice(0, 300).toLowerCase()),
    AUTH_CONTEXT_SRC);
}

// Shared by detectAuthGate (pre-attempt DISCOVERY, where the `controls <= 4`
// sparsity cutoff belongs — it exists to keep a search box on a content-rich
// page from reading as auth) and expectGateCleared (post-attempt VERDICT,
// where that cutoff must NOT apply: a rejected attempt that reveals a Retry
// button or help link pushes the count past 4 while the same gate stands, and
// re-running the discovery heuristic would read the rejection as a cleared
// gate). One evaluate, two thresholds — factored so the two cannot drift.
async function textGateSignals(page) {
  // The vocabulary arrives as SOURCE (AUTH_CONTEXT_SRC) rather than as a literal
  // here, because authContextVisible() needs the same list and an evaluate body
  // cannot close over module scope — one definition, two consumers, the same
  // "factored so the two cannot drift" rule this function was written under.
  return page.evaluate((src) => {
    // Geometry alone misses visibility:hidden (the box survives), so an SPA
    // hiding its gate that way still counted here. Computed style added;
    // opacity:0 deliberately still counts as visible — that is Playwright's own
    // visibility definition, and this file follows it everywhere.
    const vis = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')].filter(vis);
    if (inputs.length !== 1) return { single: false, looksAuth: false, controls: 0 };
    const el = inputs[0];
    const ctx = [el.placeholder, el.getAttribute('aria-label'), el.name, el.id,
                 document.body.innerText?.slice(0, 300)].join(' ').toLowerCase();
    const looksAuth = new RegExp(src, 'i').test(ctx);
    const controls = document.querySelectorAll('button, [role=button], a[href], select, textarea').length;
    return { single: true, looksAuth, controls };
  }, AUTH_CONTEXT_SRC);
}

// After an auth ATTEMPT, a still-present gate is PROOF the attempt failed —
// unlike gate ABSENCE, which is only a window (#302: an app whose gate renders
// late still reads as clear). So presence FAILS LOUDLY here, and absence lets
// the scenario proceed while remaining the window it always was. Before this
// check existed, S3/S4/CTRL/NAV/DISMISS discarded detectAndAuth's result: a
// wrong credential, a rotated secret, or the blank-email defect (#304) left
// every one of them measuring the LOGIN SCREEN and passing green.
// COST: two visible-element counts (~ms) — the verdict no longer reruns
// detectAuthGate, whose 5s waitFor used to burn precisely when the gate was
// gone; the budgets sized for that +5s keep it as headroom.
async function expectGateCleared(page, mechanism, gateViewBefore) {
  if (mechanism === 'none') return; // nothing was attempted — nothing to verify
  // The TEXT-gate detector is DISCOVERY-grade, not proof-grade, in BOTH
  // directions — established by counterexample, not judgement: a rejection that
  // reveals a second text input (request-a-new-code email) breaks the
  // single-input condition toward false-clear, and a hidden-but-boxed input
  // with auth-ish context breaks it toward false-throw. A signal that fails
  // both ways does not get to throw. So mechanism 'text-input' attaches an
  // 'auth-unverified' diagnostic and continues — its loud verdict arrives with
  // directives#302's per-project condition, not from a wider heuristic. The
  // PIN and password verdicts stand: their signals are element-kind checks
  // under Playwright's real visibility, which review did not break.
  if (mechanism === 'text-input') {
    attachJson('auth-unverified', {
      mechanism,
      note: 'Text/access-code attempts are not verified post-attempt: the text-gate heuristic (single visible auth-ish input) fails in both directions as a verdict, so neither its presence nor its absence is treated as proof. If this scenario then measures a rejection screen, start here. Set TEST_AUTH_SUCCESS_SELECTOR to verify this (directives#379): S2 asserts it after the attempt.',
    });
    return;
  }
  // Same grading as the text-gate rule above, and by the same method —
  // counterexample, not judgement. The identifier signal fails as a verdict in
  // BOTH directions: a passwordless magic-link flow REMOVES the email input and
  // renders "check your inbox", which reads as a cleared gate while nothing was
  // authenticated; and a credential step that keeps the chosen email visible
  // beside the password reads as a RETAINED gate while the flow advanced
  // correctly. A signal that fails both ways does not get to throw.
  //
  // What IS known here is not a heuristic: no credential was entered. That is a
  // fact about what this suite DID, so the callers skip on it — they must not
  // measure a login screen — while this function stays silent, because nothing
  // has been proven about the APP.
  //
  // #302 COMPOSITION: when the per-project post-login condition lands, evaluate
  // it ONCE here, after the final step — never per step, since a split flow's
  // intermediate step is legitimately not-signed-in. If that condition is
  // SATISFIED, this mechanism is not a failure at all (an identifier-only SSO
  // that lands signed in), and the callers' skip below must not fire. That is
  // the seam; it is written here so #302's author finds it.
  // LANDED FOR S2 ONLY (#379): TEST_AUTH_SUCCESS_SELECTOR is that condition. S2
  // evaluates it once, after its post-auth settle and before calling this, and
  // does not take its incomplete-auth skip when it holds. The other callers do
  // not read it yet, so this function's behaviour is unchanged.
  // 'no-credential' (#312) joins it on the same grounds and by the same route:
  // a gate stood, nothing was submitted, and that is a fact about the SUITE.
  // The set is the carrier so the next mechanism of this kind cannot be added
  // to detectAndAuth and forgotten here.
  if (AUTH_INCOMPLETE.has(mechanism)) {
    attachJson('auth-unverified', {
      mechanism,
      note: mechanism === 'no-credential'
        ? 'An auth gate was on screen, TEST_AUTH_CREDENTIAL is unset, and the form shipped no credential of its own — so nothing was submitted. NO CREDENTIAL WAS ENTERED and nothing is claimed about the app. Set TEST_AUTH_CREDENTIAL, or — if this app\'s login legitimately ships a working credential and a human signs in by clicking the button — check that the prefilled field is a visible, editable input[type=password]: a prefilled TEXT or PIN gate is deliberately NOT read as a credential source, because a non-empty text input cannot be told from a search box with a default query (directives#312).'
        : 'An identifier-first step was filled and submitted, but no credential step (password, PIN or text) appeared before the settle. NO CREDENTIAL WAS ENTERED. Causes this suite cannot tell apart: a rejected identifier, a passwordless/magic-link login, a credential step that rendered after LOAD_SETTLE_MS, or a submit control that did nothing. Scenarios that need an authenticated view skip on this rather than measuring the login screen. Set TEST_AUTH_SUCCESS_SELECTOR to verify this (directives#379): S2 asserts it after the attempt.',
    });
    return;
  }
  // What a signal may DO here depends on what it can PROVE — and the ONLY
  // signal that proves anything post-attempt is input[type=password]: a
  // semantic element, meaningful anywhere it appears (retained first factor
  // or newly revealed second one). It throws. The PIN signal (page-wide
  // digit-button count + dot/pin class names) proves nothing in EITHER
  // position: as a new-gate detector after a password login it reads a
  // calculator or dial pad — or any visible class with a word starting "pin"
  // ("pinned", "pink") — as a second factor, and even as SAME-KIND
  // retention it cannot tell a rejected PIN's standing gate from the
  // post-login view of a PIN-gated calculator app, whose own keypad
  // satisfies the identical page-wide signals. The count cannot associate
  // itself with the gate that was attempted. So the PIN signal gets what
  // this file gives every non-proof signal (the text-gate rule above): a
  // loud diagnostic, never a throw — directives#302's per-project
  // post-login condition is the real verdict for PIN gates and 2FA alike.
  const pinNow = await pinGateVisible(page);
  const pwNow  = await passwordGateVisible(page);
  if (!pwNow) {
    if (pinNow) {
      attachJson(mechanism === 'pin-keypad' ? 'auth-unverified' : 'auth-second-factor-suspected', {
        mechanism,
        note: mechanism === 'pin-keypad'
          ? 'PIN-keypad-like signals (>=9 digit buttons plus a dot/pin-class element) are still visible after the PIN attempt. This is EITHER the retained gate (rejected PIN) OR the app\'s own post-login numeric UI — a PIN-gated calculator or dial pad satisfies the same page-wide signals — and the signal cannot associate itself with the attempted gate, so this is a diagnostic rather than a failure. If downstream scenarios then measure a PIN screen, start here. Set TEST_AUTH_SUCCESS_SELECTOR to verify this (directives#379): S2 asserts it after the attempt.'
          : 'The password attempt cleared the password field, but PIN-keypad-like signals are visible (>=9 digit buttons plus a dot/pin-class element). This is EITHER a second auth factor this suite cannot pass with a single credential, OR ordinary numeric UI (calculator, dial pad) on the post-login view — the signal cannot distinguish the two, so this is a diagnostic rather than a failure. If downstream scenarios then measure a PIN screen, start here. Set TEST_AUTH_SUCCESS_SELECTOR to verify this (directives#379): S2 asserts it after the attempt.',
      });
    }
    return; // no password gate on screen — cleared, still the WINDOW (#302) stated above
  }
  const attemptedKindGone = mechanism === 'pin-keypad' && !pinNow;
  // THREE versions of a "did login actually succeed" heuristic died in review
  // before this one: (1) any remaining gate fails — false red on an app whose
  // post-login view carries a password field; (2) changed view passes — a
  // rejection's inline error changes the view; (3) changed view + control-rich
  // page passes — login pages with social buttons and footer nav are rich. The
  // counterexamples were not exotic. CONCLUSION, not another heuristic: no DOM
  // shape generically proves a login succeeded. So this check does the one
  // thing it can do honestly — a page that still matches the gate heuristics
  // after an attempt FAILS, loudly, every time.
  //
  // KNOWN LIMIT, accepted: an app whose post-login landing view legitimately
  // shows a visible password field (an in-page change-password form) false-reds
  // here. That failure is LOUD and its message names this paragraph; the
  // alternative — any escape hatch keyed on view change or page richness —
  // passed rejected logins in review, and that failure is SILENT. Loud beats
  // silent. The real fix is per-project post-login evidence (a selector or a
  // request that only exists signed in) — directives#302's condition, which a
  // template cannot invent. When that lands, it replaces this paragraph.
  const viewNow = await viewSignature(page);
  throw new Error(
    `Auth gate still present after a '${mechanism}' attempt` +
    (viewNow === gateViewBefore ? ' (view unchanged)' : ' (view changed — likely a rejection message or reloaded gate)') +
    (attemptedKindGone
      ? ` — the attempted gate cleared but a ${pinNow ? 'PIN/keypad' : 'password'} view is now on screen: ` +
        `a second auth factor, which this suite cannot pass with a single credential`
      : '') +
    ` — refusing to run this scenario against the login screen. Check TEST_AUTH_CREDENTIAL` +
    (mechanism === 'password-form' ? ' and TEST_AUTH_EMAIL (email+password gates need both, directives#304)' : '') +
    `. A rejected credential and a never-filled field look identical from here. If your app's ` +
    `POST-LOGIN view legitimately shows a password field, this is the known limit documented ` +
    `above this throw — the per-project condition in directives#302 is the fix, not a wider heuristic.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — load the app and authenticate if a real auth gate is present
// (mirrors the S3/S4 preamble: skips the test when gated with no credential, so
// the navigation/control invariants below never just exercise the login screen)
// ─────────────────────────────────────────────────────────────────────────────
async function gotoAndAuth(page) {
  // LOAD_SETTLE_MS at BOTH settles here, because every caller measures the view
  // this function returns: CTRL counts primary controls (a late duplicate = a
  // green on a duplicated CTA), DISMISS computes triggerCount (a late trigger is
  // never swept), NAV fingerprints the view. Overhead for none of them.
  await gotoAuthReady(page);
  // Detect once and branch — each detectAuthGate() call burns a 5s waitFor timeout when
  // no gate is present, so calling it in both branches wasted ~10s of the test timeout.
  const gated = await detectAuthGate(page);
  // Same two-source rule as S2/S3/S4 (#312): a form that ships a working
  // credential unlocks the navigation and control invariants for a project
  // that has no secret to set.
  if (gated && (AUTH_CREDENTIAL || await gateShipsCredential(page))) {
    const { mechanism, viewBefore } = await detectAndAuth(page, AUTH_CREDENTIAL);
    await page.waitForLoadState('networkidle', { timeout: LOAD_SETTLE_MS }).catch(() => {});
    await expectGateCleared(page, mechanism, viewBefore);
    // Same position as "gated, no credential". ⚠️ DISMISS calls this function
    // again on every nav reset, so a skip from here aborts that sweep
    // mid-flight — correct (the app has returned to a gate this suite cannot
    // pass) and identical to the no-credential behaviour at that call site.
    if (AUTH_INCOMPLETE.has(mechanism)) {
      test.skip(true, `${authIncompleteNote(mechanism)} Skipping the navigation/control invariants (they would only exercise the login screen). See the auth-steps and auth-unverified attachments.`);
    }
  } else if (gated) {
    test.skip(true, 'Auth gate present and no credential available from either source — skipping navigation/control invariants');
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

// The names the spec and the other lib file import; nothing else is exported.
export {
  AUTH_CREDENTIAL,
  AUTH_EMAIL,
  AUTH_SUCCESS_SELECTOR,
  armAuthReady,
  awaitAuthReady,
  gotoAuthReady,
  AUTH_INCOMPLETE,
  authIncompleteNote,
  gateShipsCredential,
  detectAndAuth,
  detectAuthGate,
  expectGateCleared,
  gotoAndAuth,
  viewSignature,
};
