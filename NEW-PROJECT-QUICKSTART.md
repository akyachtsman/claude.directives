# New Project Quickstart

## HUMAN STEPS — Do these once per new repo

### Step 1 — Create and configure the GitHub repo
1. Create a new **public** repo under `akyachtsman`
2. Initialize with a README (required to enable GitHub Pages)
3. Enable GitHub Pages: **Settings → Pages → Source: `main` / `root`**
4. Set repo Watch: **Watch → All Activity**
5. Add repository secrets (**Settings → Secrets and variables → Actions → Secrets**):
   - `TEST_AUTH_CREDENTIAL` — valid login credential for Playwright tests
   - `SUPABASE_SERVICE_KEY` — Supabase service-role key (required before the heatmap workflow can run)
   - Any project-specific secrets the app requires
6. Add repository variables (**Settings → Secrets and variables → Actions → Variables**):
   - `APP_URL` = `https://akyachtsman.github.io/[repo-name]/`
   - `SUPABASE_URL` — your Supabase project URL (required before the heatmap workflow can run)

### Step 2 — Bootstrap the project
Open a Claude Code session scoped to the new repo and type:

```
/new.repo
```

That's it. Claude handles everything else autonomously.
