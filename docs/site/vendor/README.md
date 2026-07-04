# docs/site/vendor/ — vendored third-party libraries

Same-origin copies so the `react-demo.html` preview has **no runtime CDN
dependency** (no external `<script src>`, so no Subresource-Integrity risk — the
files ride this repo's normal review/diff process).

| File | Source | Version |
|------|--------|---------|
| `react.production.min.js` | npm `react` UMD build | 18.3.1 |
| `react-dom.production.min.js` | npm `react-dom` UMD build | 18.3.1 |

Downloaded from `registry.npmjs.org` and committed verbatim. To update, fetch the
new tarball, extract `package/umd/*.production.min.js`, and replace these files.
