# Directives: S2 Diagnostic Protocol Upgrade

These upgrades were battle-tested in `apfp.claude` and allow the ui-tester + orchestrator to autonomously diagnose and fix backend data/field issues (and other login failures) within 2 rounds without human escalation.

---

## What changed and why

Previously, S2 (login) failures required human diagnosis because there was no structured data to distinguish between token errors, wrong field keys, empty results, and PIN mismatches.

The upgrade adds:
- `captureApiCalls()` — wraps `window.fetch` to record HTTP status, record count, and first field key of each API response
- S2 diagnostic block — when login fails, attaches `s2-diagnostics` JSON and throws a structured error the orchestrator can parse
- `responseShape` diagnosis — captures the response shape and first field/column name automatically

---

## Diagnostic decision tree for orchestrator

| Diagnostic result | Root cause | Fix |
|---|---|---|
| API status 401/403 | Invalid or missing token | Check the backend API token / `SUPABASE_SERVICE_KEY` in app config |
| API status 404 | Wrong project/connection or table | Verify the backend project ref and table name |
| No API call made | JS error before fetch | Check console errors |
| Rows returned but field/column names are unexpected | Wrong query or field mapping | Check the query params and that the backend returns the expected column names |
| Rows returned but the filtered set is empty | Filter/status value or RLS mismatch | Check the filter value type and that the RLS policy allows the rows |
| Rows returned, candidate rows found, no credential match | Credential type/format mismatch | Log the credential values; check for leading-zero stripping if stored as a number |

---

## S2 Failure Diagnostic Protocol (for ui-tester agent)

When S2 fails, before issuing any fix:

1. Read the structured error message from the test output:
   `S2 FAIL | loginError: "..." | API status: ... | recordCount: ... | responseShape: ... | consoleErrors: ...`
2. Read the `s2-diagnostics` JSON attachment from the Playwright report artifact
3. Apply the decision tree above to identify exact root cause
4. Implement only the targeted fix — do not guess or apply multiple changes at once
5. Wait for deployment, re-run ui-tester

**What previously took 6+ back-and-forth exchanges now completes in 2 rounds:**
- Round 1: S2 fails → diagnostic shows `responseShape` with unexpected columns → fix the query / field mapping
- Round 2: S2 passes → pipeline continues

---

## `captureApiCalls()` implementation

Add this helper to `app.spec.js` before the test scenarios:

```javascript
async function captureApiCalls(page) {
  await page.addInitScript(() => {
    const orig = window.fetch;
    window.__apiCalls = [];
    window.fetch = async (...args) => {
      const res = await orig(...args);
      const clone = res.clone();
      clone.json().then(body => {
        // Backend-agnostic: Supabase/REST returns an array of row objects; some
        // backends wrap rows as { records: [{ fields: {...} }] }.
        const rows = Array.isArray(body) ? body : (body?.records ?? null);
        const firstRow = rows?.[0];
        const firstFieldKey = firstRow
          ? Object.keys(firstRow.fields ?? firstRow)[0] ?? null
          : null;
        window.__apiCalls.push({
          url: typeof args[0] === 'string' ? args[0] : args[0]?.url,
          status: res.status,
          recordCount: Array.isArray(rows) ? rows.length : null,
          firstFieldKey,
          error: body?.error ?? body?.message ?? null,
        });
      }).catch(() => {});
      return res;
    };
  });
  return () => page.evaluate(() => window.__apiCalls);
}
```

---

## `page.goto()` — always use `'./'` not `'/'`

When `baseURL` includes a path (e.g. `https://user.github.io/repo/`), using `page.goto('/')` resolves to the origin root (`https://user.github.io/`) — a GitHub 404 page. Always use `page.goto('./')` so navigation resolves relative to the base path.

This was the root cause of all 14 `qa-live.yml` failures in the initial `apfp.claude` deployment.

---

## `APP_URL` normalization

Always normalize `APP_URL` to end with `/` in `playwright.config.js`:

```javascript
baseURL: (process.env.APP_URL || 'https://default.github.io/repo/').replace(/\/?$/, '/'),
```

This prevents `page.goto('./')` from resolving incorrectly when the URL is provided without a trailing slash.
