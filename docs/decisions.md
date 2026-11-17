# Decisions log

One line per contract or design change, newest first: `date · what · who`.

- 2026-11-16 · Popup UI uses React through WXT's React module (@wxt-dev/module-react), not plain TypeScript as doc 02 section 1 says; it came with the first scaffold and the popup is small (STY-109) · Kam, Mo
- 2026-11-16 · Python 3.12 everywhere: CI, the OpenPhish collector and ml/pyproject.toml, matching doc 02 (STY-109) · Kam
- 2026-11-16 · Worker rate limit is exact: one RateLimiter Durable Object per client IP replaces the Cloudflare rate limit binding, which let 70 steady requests through on the deployed Worker; upstream calls send a phishclaw-worker User-Agent because rdap.org answers 403 without one (STY-62) · Mo
- 2026-11-16 · C5 v0: packages/features/src/spec.ts lists 20 URL-only features in order; every feature uses prepareUrl(raw) = new URL(raw).href cut to 1,000 code points, the same text Chrome gives the extension (PhreshPhish benign URLs are truncated at 1,000, STY-100); URLs that won't parse or aren't http/https get no features and are counted by the export script; SPEC_HASH covers the input form, the length limit, the word/file-type/symbol lists and [name, kind, cap] per feature, wording excluded; model.json type in contracts/src/c5-model.ts (STY-112) · Ethan Rajack, Mo
- 2026-11-15 · Worker calls the real upstreams with keys held only as Worker secrets: Safe Browsing v4 fullHashes:find, URLhaus host lookup, RDAP by registrable domain, the OpenPhish public feed. URLhaus failing answers 503 (never a silent "not listed"); RDAP failing answers rdap: false; RDAP 404 answers rdap: true with registeredAt null. 60/min enforced per isolate and by a Cloudflare rate limit binding. C3 types unchanged (STY-62) · Mo
- 2026-11-09 · C3 adds c3-fixtures.ts: SB_TEST_URLS lists Google's three Safe Browsing test pages, shared by the fake Worker, the stand-in Safe Browsing check and STY-63's tests; C3 types unchanged (STY-108) · Mo
- 2026-11-09 · Worker fake mode: FAKE_UPSTREAMS=true (pnpm worker:fake) serves fixed C3 answers marked x-phishclaw-fake; off by default and never set in production (STY-108) · Mo
- 2026-11-09 · Project renamed PhishClaw; the Worker is named phishclaw-worker before its first deploy; the full repo rename is a separate PR · Mo
- 2026-11-09 · ParsedUrl gains port, userInfo, hostnameUnicode and isPunycode (STY-FR-13); new C4 Brand type for brands/brands.json (STY-110) · Brandon
- 2026-10-28 · C1 to C3 v0 aligned with doc 05: C1 is now the check result and C2 the verdict (numbers swapped), C1 uses signal and points, C2 adds host, registrableDomain, missing and version, C3 routes move to /v1 (sb, host, feeds/openphish) with a 60-per-minute limit; ParsedUrl is no longer numbered C4 · Mo
- 2026-10-28 · Stand-in scorer is a sum of points with thresholds in scoring.json; feed hits score 100 · Mo
- 2026-10-26 · Repo created; C1 to C3 v0 drafts added for review · Mo
