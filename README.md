# Sentry

A Chrome extension that tells you, in plain language, whether the page you're on is likely phishing, and why.

## Run it

1. Install Node 22 and git, then run `corepack enable`
2. `pnpm install`
3. `pnpm dev`: Chrome opens with Sentry loaded
4. Click the Sentry icon on any page to see a verdict

Try `https://paypa1.com` as a typed address in a test: the stand-in checks flag it as a lookalike. Never visit it.

## Commands

| Command          | What it does                                      |
| ---------------- | ------------------------------------------------- |
| `pnpm dev`       | Run the extension with live reload                |
| `pnpm build`     | Build the extension into `apps/extension/.output` |
| `pnpm zip`       | Build the zip for the Chrome Web Store            |
| `pnpm lint`      | ESLint and Prettier check                         |
| `pnpm typecheck` | TypeScript checks in every package                |
| `pnpm test`      | Vitest in every package                           |

Python: see `ml/README.md`.

## Where things live

```
apps/extension      WXT extension: popup, background (Mo, Ethan Ung)
apps/worker         Cloudflare Worker: feed proxy, keys as secrets (Mo)
packages/contracts  C1 to C4 TypeScript types (everyone reads, Mo owns)
packages/core       pipeline, scorer, checks (Mo, Brandon)
packages/url-parser tldts wrapper and parsing tests (Brandon)
packages/features   features shared with the in-browser model (Ethan Rajack)
ml/                 Python data, training, evaluation (Ethan Rajack)
fixtures/urls       known-good and known-bad URLs, typed, never visited
data/               gitignored datasets
docs/               contracts, decisions log, CTS material
```

## Rules

- Every change goes through a pull request with one review and green CI.
- Never commit keys, raw data or browsing data.
- Never open a live phishing URL. Test URLs go in `fixtures/` as text only.
