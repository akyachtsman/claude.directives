# Directives: S2 Diagnostic Protocol Upgrade

These upgrades were battle-tested in `apfp.claude` and allow the ui-tester + orchestrator to autonomously diagnose and fix Airtable field-key issues (and other login failures) within 2 rounds without human escalation.

---

## What changed and why

Previously, S2 (login) failures required human diagnosis because there was no structured data to distinguish between token errors, wrong field keys, empty results, and PIN mismatches.

The upgrade adds:
- `captureApiCalls()` — wraps `window.fetch` to record HTTP status, record count, and first field key of each API response
- S2 diagnostic block — when login fails, attaches `s2-diagnostics` JSON and throws a structured error the orchestrator can parse
- `fieldKeyFormat` diagnosis — detects name-keyed vs ID-keyed fields automatically

---

## Diagnostic decision tree for orchestrator

| Diagnostic result | Root cause | Fix |
|---|---|---|
| API status 401/403 | Invalid or missing token | Check `AIRTABLE_TOKEN` in app config |
| API status 404 | Wrong base/table ID | Verify `BASE_ID` and table ID |
| No API call made | JS error before fetch | Check console errors |
| Records returned, field key is name (e.g. `"Active"`) | Missing `returnFieldsByFieldId=true` | Add `returnFieldsByFieldId: 'true'` to `URLSearchParams` in `atList()` |
| Records returned, field key is ID, activeRows=0 | Active field type mismatch | Check Active field value: checkbox returns `true`/`undefined`, not `1`/`0` |
| Records returned, active employees found, no match | PIN type or format mismatch | Log PIN values; check for leading-zero stripping if numeric field |

---

## S2 Failure Diagnostic Protocol (for ui-tester agent)

When S2 fails, before issuing any fix:

1. Read the structured error message from the test output:
   `S2 FAIL | loginError: "..." | API status: ... | recordCount: ... | fieldKeyFormat: ... | consoleErrors: ...`
2. Read the `s2-diagnostics` JSON attachment from the Playwright report artifact
3. Apply the decision tree above to identify exact root cause
4. Implement only the targeted fix — do not guess or apply multiple changes at once
5. Wait for deployment, re-run ui-tester

**What previously took 6+ back-and-forth exchanges now completes in 2 rounds:**
- Round 1: S2 fails → diagnostic shows `fieldKeyFormat: name-keyed` → add `returnFieldsByFieldId=true`
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
        const records = body?.records;
        const firstFieldKey = records?.[0]?.fields
          ? Object.keys(records[0].fields)[0]
          : null;
        window.__apiCalls.push({
          url: typeof args[0] === 'string' ? args[0] : args[0]?.url,
          status: res.status,
          recordCount: records?.length ?? null,
          firstFieldKey,
          error: body?.error ?? null,
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
