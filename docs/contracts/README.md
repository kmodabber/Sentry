# Contracts

Typed agreements at the seams between people's code, numbered as in doc 05 section 3. The
types are the source of truth: `packages/contracts/src/`. Change a contract only through a
`contract/` PR that Mo approves and that adds a dated line to `docs/decisions.md`.

| Contract                | Seam                                | File            | Owner            | Due              |
| ----------------------- | ----------------------------------- | --------------- | ---------------- | ---------------- |
| C1 Check result         | each check -> pipeline              | `c1-check.ts`   | Mo               | v0 Wed Oct 28    |
| C2 Verdict              | scorer -> popup and history         | `c2-verdict.ts` | Brandon          | v0 Wed Oct 28    |
| C3 Worker API           | extension -> Cloudflare Worker      | `c3-worker.ts`  | Mo               | v0 Wed Oct 28    |
| C4 Brand list           | `data/brands.json` -> brand checks  | not yet         | Brandon          | start of Stage 2 |
| C5 Feature spec, model  | features -> model evaluator         | not yet         | Ethan Rajack, Mo | start of Stage 2 |
| C6 Test set             | `eval/testset_v*.csv` -> evaluation | not yet         | Ethan Rajack     | start of Stage 2 |
| Parsed URL (unnumbered) | parser -> checks and features       | `parsed-url.ts` | Brandon          | n/a              |

## Rules that the contracts encode

- **Checks are plugins.** Each check implements `Check` from C1. The pipeline and popup never
  know which checks exist.
- **Fail visibly.** A check that throws or times out becomes `signal: "error"` with 0 points and
  lands in `Verdict.missing`; the verdict is `partial`. It never counts as a pass.
- **Feed hits win.** Any `feedHit` makes the verdict dangerous with score 100.
- **Least data.** The Worker gets hash prefixes (`POST /v1/sb`) or a hostname
  (`GET /v1/host/{hostname}`), never a full URL. It rejects anything that isn't a hostname.
- **Configuration over code.** Scorer thresholds live in `packages/core/src/scoring.json`.
- **Google attribution.** A reason with `source: "google"` shows "Advisory provided by Google".
