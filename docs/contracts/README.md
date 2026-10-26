# Contracts

Typed agreements at the seams between people's code. The types are the source of truth:
`packages/contracts/src/`. Change a contract only through a `contract/` PR that also adds
a dated line to `docs/decisions.md`.

| Contract      | Seam                           | File               | Owner   |
| ------------- | ------------------------------ | ------------------ | ------- |
| C1 Verdict    | pipeline -> popup              | `c1-verdict.ts`    | Mo      |
| C2 Check      | each check -> pipeline         | `c2-check.ts`      | Mo      |
| C3 Worker API | extension -> Cloudflare Worker | `c3-worker.ts`     | Mo      |
| C4 Parsed URL | parser -> checks and features  | `c4-parsed-url.ts` | Brandon |
