# Decisions log

One line per contract or design change, newest first: `date · what · who`.

- 2026-11-09 · C3 adds c3-fixtures.ts: SB_TEST_URLS lists Google's three Safe Browsing test pages, shared by the fake Worker, the stand-in Safe Browsing check and STY-63's tests; C3 types unchanged (STY-108) · Mo
- 2026-11-09 · Worker fake mode: FAKE_UPSTREAMS=true (pnpm worker:fake) serves fixed C3 answers marked x-phishclaw-fake; off by default and never set in production (STY-108) · Mo
- 2026-11-09 · Project renamed PhishClaw; the Worker is named phishclaw-worker before its first deploy; the full repo rename is a separate PR · Mo
- 2026-11-09 · ParsedUrl gains port, userInfo, hostnameUnicode and isPunycode (STY-FR-13); new C4 Brand type for brands/brands.json (STY-110) · Brandon
- 2026-10-28 · C1 to C3 v0 aligned with doc 05: C1 is now the check result and C2 the verdict (numbers swapped), C1 uses signal and points, C2 adds host, registrableDomain, missing and version, C3 routes move to /v1 (sb, host, feeds/openphish) with a 60-per-minute limit; ParsedUrl is no longer numbered C4 · Mo
- 2026-10-28 · Stand-in scorer is a sum of points with thresholds in scoring.json; feed hits score 100 · Mo
- 2026-10-26 · Repo created; C1 to C3 v0 drafts added for review · Mo
