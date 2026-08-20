# Next.js production-tier starter

The **production tier** from `directives/global.md` → *Hosting & Deployment*:
**React + Next.js on Vercel + Supabase**. Use this when a project graduates from
the static (GitHub Pages) tier — i.e. it needs auth, server-rendered or per-user
data, or real scale. The static / plain-HTML tier remains the default; reach for
this deliberately.

Development stays **browser-only**: you never run a build locally. Vercel runs
`next build` on every `git push`, exactly like Pages deploys on push today.

## What's here

```
app/
  layout.js        ← root layout, imports globals.css
  page.js          ← server component (SSR/data) rendering a client component
  globals.css      ← the design contract (tokens + components) — see below
components/
  Counter.js       ← example interactive Client Component ('use client')
lib/
  supabase-browser.js  ← anon key + RLS (Client Components)
  supabase-server.js   ← server client; service-role only as a server-only env var
.env.example       ← which keys go where (client-safe vs server-only)
next.config.mjs
package.json
```

## The design contract carries over

`app/globals.css` **is** your `styles/tokens.css` + `styles/components.css` from
`/design-intake` — same CSS custom properties, same component classes (`.btn`,
`.card`, …). Paste your project's tokens/components in there (or `@import` them).
Nothing about the look is rebuilt for React; `className="btn"` uses the exact
same CSS as the static prototype.

## Supabase keys (see `directives/data.md`)

| Key | Where | Var |
|---|---|---|
| anon / publishable | browser + server | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service-role | **server only** — never `NEXT_PUBLIC_*`, never in client code | `SUPABASE_SERVICE_ROLE_KEY` |

RLS is **always on**, even server-side. The service role is for genuinely
privileged operations only.

## Deploy (Vercel)

1. Push this project to GitHub.
2. In Vercel: **Add New → Project → import the repo.** Vercel auto-detects Next.js.
3. **Settings → Environment Variables:** add the three keys from `.env.example`
   (mark `SUPABASE_SERVICE_ROLE_KEY` as a secret; do **not** prefix it with `NEXT_PUBLIC_`).
4. Every `git push` triggers a Vercel build + deploy — no local build, no terminal.
   PRs get preview URLs; `main` deploys to production.

> Point `qa-live.yml` (Playwright) at the Vercel preview/production URL via the
> project's `APP_URL` variable — see `docs/standards/cicd-setup.md`.

## Preview a React component in the browser (no build, no terminal)

You can author and **simulate an interactive React component browser-only**,
before it goes into the Next app — React + Babel from a CDN transpile JSX at
runtime. This is **preview-grade only** (runtime transpile is too slow for
production; Vercel compiles the real thing). Make a local `preview.html`:

```html
<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="app/globals.css">
<div id="root"></div>

<!-- Pin EXACT versions (immutable URLs) and add Subresource Integrity so a
     compromised CDN can't inject code. Compute each hash once with:
       curl -fsSL <url> | openssl dgst -sha384 -binary | openssl base64 -A
     then paste it as integrity="sha384-…". crossorigin="anonymous" is required
     for SRI to be checked. -->
<script src="https://unpkg.com/react@19.0.0/umd/react.development.js"
        integrity="sha384-REPLACE_WITH_COMPUTED_HASH" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@19.0.0/umd/react-dom.development.js"
        integrity="sha384-REPLACE_WITH_COMPUTED_HASH" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"
        integrity="sha384-REPLACE_WITH_COMPUTED_HASH" crossorigin="anonymous"></script>

<script type="text/babel" data-presets="react">
  function Counter() {
    const [n, setN] = React.useState(0);
    return <button className="btn" onClick={() => setN(n + 1)}>Clicked {n}</button>;
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<Counter />);
</script>
```

Open it in any browser to see the live, stateful button. When you're happy,
the component drops into `components/` verbatim (add `'use client'` at the top).
Keep `preview.html` local — it's a dev tool, never deploy it.

> For a real running `next dev` server without a local terminal, open the project
> in **StackBlitz** (it runs Node in the browser via WebContainers).
