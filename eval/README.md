# eval/: test sets (contract C6)

The frozen test sets used for Sentry's official numbers. Contract C6 in doc 05, section 3.
Owner: Ethan Rajack. Change the format only through a `contract/` PR that Mo approves and that
adds a dated line to `docs/decisions.md`.

| File             | Frozen     | Used for                 |
| ---------------- | ---------- | ------------------------ |
| `testset_v1.csv` | Fri Nov 27 | Stage 3 numbers (STY-92) |
| `testset_v2.csv` | Stage 4    | Final numbers before CTS |

**Once a test set is frozen, nobody edits it.** Fixes go into the next version. Don't tune
models, thresholds or features on these rows; use the PhreshPhish validation month for that.

## Format

UTF-8, comma-separated, one header row, columns in exactly this order:

```
id,url_defanged,label,source,collected_on,brand,slice
```

| Column         | Rule                                                                                                                                                    | Example                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `id`           | Unique in the file. Lower-case letters, digits, `-`, `_`                                                                                                | `v1-0001`                              |
| `url_defanged` | Starts with `hxxp://` or `hxxps://`; every dot in the host written `[.]`; no live `http://` or `https://` anywhere                                      | `hxxps://login[.]example[.]com/verify` |
| `label`        | `phish` or `benign`                                                                                                                                     | `phish`                                |
| `source`       | Where the row came from: `openphish` (STY-113 collector) or `manual` (hand-collected hard benign, STY-116)                                              | `openphish`                            |
| `collected_on` | Date first seen or collected, `YYYY-MM-DD`                                                                                                              | `2026-11-18`                           |
| `brand`        | Empty, or a brand `id` from `brands/brands.json` (C4) that the page imitates or belongs to                                                              | `interac`                              |
| `slice`        | `general`, `canada` (Canadian brand or audience) or `hard_benign` (real pages that look risky: bank, government and telecom logins, free-hosting pages) | `general`                              |

Extra rules:

- `hard_benign` rows must have `label` = `benign`.
- No URL appears twice.
- At most 3 phishing URLs per domain (by host, ignoring `www.`), so one campaign can't fill
  the set.
- v1 phishing rows are collected after Nov 15, so they are newer than the PhreshPhish
  training data.

## Safety (doc 09)

- URLs are stored **defanged** so nobody opens one by accident. Never open, click, preview or
  paste one, and don't open these files in apps that turn text into links.
- Only the evaluation script (STY-93) refangs URLs, **in memory only**. Nothing writes a live
  URL back to disk.
- Hard benign URLs must contain no personal data (no account numbers, tokens or emails).

## Check a file

```bash
cd ml && source .venv/bin/activate
python -m sentry_ml.testset ../eval/testset_v1.csv
```

It prints `OK` or a list of problems by row number (never the URL). CI runs the same check on
every `eval/testset_*.csv` through `ml/tests/test_testset.py`.
