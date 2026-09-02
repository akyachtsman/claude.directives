// Shared test object for this kit. Import `test` and `expect` FROM HERE, not
// from '@playwright/test' directly — a spec that imports the bare object opts
// out of the evidence below and its widths go unrecorded.
//
// WHY THIS FILE EXISTS. check-ui-viewports.js certifies that the app is rendered
// at a laptop, a tablet and a phone width. The Playwright JSON report names the
// PROJECT that owned each result and carries no viewport, so a gate reading it
// alone can only establish that a test executed in a project which DECLARES a
// width. That is not the same claim, and Codex reproduced two ways past it
// (directives#347 round 5):
//
//   * a test marked expected-to-fail whose `beforeAll` throws records `failed`
//     in every project while its body never starts;
//   * an assertion-only test that never requests `page` counts identically,
//     with no browser installed at all.
//
// Both certify project scheduling and neither renders anything. So the width is
// recorded from the page itself, at the only moment it is knowable: after the
// test has finished with it.
//
// AFTER, NOT BEFORE, and that is the point. A test that calls
// setViewportSize() — the kit's S4 does, at 390 — is credited to the width it
// ACTUALLY ended on rather than the one its project declared. A test that
// changes width more than once is credited only to its last, which under-counts
// rather than over-counts: a band with no evidence fails loudly, so the safe
// direction is to claim less.
//
// A test that never requests `page` gets no annotation, because this fixture
// only runs when a page was actually created. That is the whole mechanism — no
// list of test names, no rule about test sources, nothing to keep in sync.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);
    // The page can be closed by the test, or by a crash. `viewportSize()` on a
    // closed page throws, and a fixture that throws in teardown turns a passing
    // test red — this must never be able to fail a suite it exists to measure.
    let vp = null;
    try { vp = page.viewportSize(); } catch { /* no evidence, not an error */ }
    if (vp && Number.isFinite(vp.width) && Number.isFinite(vp.height)) {
      testInfo.annotations.push({
        type: 'rendered-at',
        description: `${vp.width}x${vp.height}`,
      });
    }
  },
});

export { expect };
