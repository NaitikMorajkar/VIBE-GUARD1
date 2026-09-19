# VibeGuard

VibeGuard is a small security checker for apps built with AI tools such as Lovable, Cursor, and Claude. Paste a public GitHub repository URL and it scans the default branch for suspicious dependencies, committed secrets, exposed service-role keys, open Firebase rules, and missing Supabase Row Level Security. It returns a risk score from 0 to 100, grouped findings, a plain-language summary, and a repair prompt you can paste back into your AI builder.

## Run it locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the preview URL printed by the dev server. `GITHUB_TOKEN` is optional but helps avoid GitHub's unauthenticated API rate limit. `ANTHROPIC_API_KEY` is optional; without it, VibeGuard uses a local summary and fix prompt.

## Demo it

The deliberately vulnerable sample lives in `demo/vulnerable-app`. To demo the full flow, copy that folder to its own public GitHub repository, paste that repository URL into VibeGuard, review the findings, and paste the generated fix prompt into Lovable, Cursor, or Claude. Scan again after applying the changes.

The demo values are clearly fake and are included only to exercise the scanner. Never use the demo repository as a production template.

## What it checks

- **Packages:** npm and PyPI existence, low adoption, young packages, and close lookalikes of popular packages.
- **Keys and secrets:** private keys, provider tokens, cloud credentials, public-environment leaks, generic hardcoded secrets, and committed `.env` files.
- **Database and backend setup:** permissive Firebase rules, service-role usage, Supabase RLS coverage, and policies that allow every user.

## Limits

VibeGuard scans only the repository's default branch, keeps up to 50 text files, skips files over 200 KB and dependency lock files, and does not execute repository code. A clean result is not a guarantee of security. Package checks depend on the npm and PyPI registries, and GitHub API rate limits may apply.

## Scripts

- `npm run dev` — start the development server.
- `npm run typecheck` — run TypeScript without emitting files.
- `npm run build` — build the client and server bundle.

  Deploy Link-https://vibeguard-aplkuse2.manus.space
