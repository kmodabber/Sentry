"""C6 test set schema check (STY-114). Owner: Ethan Rajack. Doc 05, section 3.

Validates eval/testset_v1.csv and eval/testset_v2.csv (and any eval/testset_*.csv).
The rules are written up in eval/README.md; this file is the executable version.

Run by hand (from the repo root):
    python -m sentry_ml.testset eval/testset_v1.csv
CI runs it through ml/tests/test_testset.py on every pull request.

Safety: error messages name the row number and column, never the URL itself.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

COLUMNS = ["id", "url_defanged", "label", "source", "collected_on", "brand", "slice"]
LABELS = {"phish", "benign"}
SLICES = {"general", "canada", "hard_benign"}
# Where a row came from. Add a source here (and to eval/README.md) through a contract/ PR.
SOURCES = {"openphish", "manual"}
MAX_PER_DOMAIN = 3

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
SCHEME_RE = re.compile(r"^hxxps?://", re.IGNORECASE)
LIVE_URL_RE = re.compile(r"https?://", re.IGNORECASE)

REPO_ROOT = Path(__file__).resolve().parents[2]
BRANDS_JSON = REPO_ROOT / "brands" / "brands.json"


def load_brand_ids(path: Path = BRANDS_JSON) -> set[str] | None:
    """Brand ids from C4 (brands/brands.json), or None if the file isn't there."""
    if not path.exists():
        return None
    return {b["id"] for b in json.loads(path.read_text(encoding="utf-8"))}


def defanged_host(url_defanged: str) -> str | None:
    """The host of a defanged URL with [.] turned back into dots, lower-cased (text only)."""
    if not SCHEME_RE.match(url_defanged):
        return None
    rest = url_defanged.split("://", 1)[1]
    end = min((i for i in (rest.find(c) for c in "/?#") if i != -1), default=len(rest))
    host = rest[:end].replace("[.]", ".")
    try:
        return urlsplit("x://" + host).hostname
    except ValueError:
        return None


def check_url(value: str) -> str | None:
    """Return an error message if the URL is not safely defanged, else None."""
    if not SCHEME_RE.match(value):
        return "must start with hxxp:// or hxxps://"
    if LIVE_URL_RE.search(value):
        return "contains a live http:// or https:// link"
    rest = value.split("://", 1)[1]
    end = min((i for i in (rest.find(c) for c in "/?#") if i != -1), default=len(rest))
    host = rest[:end]
    if "." in host.replace("[.]", ""):
        return "host has a dot that is not written as [.]"
    if not host:
        return "has no host"
    return None


def validate_rows(
    header: list[str], rows: list[dict[str, str]], brand_ids: set[str] | None = None
) -> list[str]:
    """Check a test set already read from CSV. Returns a list of errors (empty means valid)."""
    if header != COLUMNS:
        return [f"header must be exactly: {','.join(COLUMNS)}"]
    if not rows:
        return ["file has no rows"]

    errors: list[str] = []
    ids: Counter = Counter()
    urls: Counter = Counter()
    phish_hosts: Counter = Counter()

    for n, row in enumerate(rows, start=2):  # row 1 is the header
        where = f"row {n}"
        if None in row or any(v is None for v in row.values()):
            errors.append(f"{where}: wrong number of fields")
            continue
        ids[row["id"]] += 1
        urls[row["url_defanged"]] += 1

        if not ID_RE.match(row["id"]):
            errors.append(f"{where}: id must be lower-case letters, digits, '-' or '_'")
        url_err = check_url(row["url_defanged"])
        if url_err:
            errors.append(f"{where}: url_defanged {url_err}")
        if row["label"] not in LABELS:
            errors.append(f"{where}: label must be one of {sorted(LABELS)}")
        if row["source"] not in SOURCES:
            errors.append(f"{where}: source must be one of {sorted(SOURCES)}")
        try:
            if len(row["collected_on"]) != 10:
                raise ValueError
            date.fromisoformat(row["collected_on"])
        except ValueError:
            errors.append(f"{where}: collected_on must be a date like 2026-11-20")
        if row["brand"] and brand_ids is not None and row["brand"] not in brand_ids:
            errors.append(f"{where}: brand must be empty or an id from brands/brands.json")
        if row["slice"] not in SLICES:
            errors.append(f"{where}: slice must be one of {sorted(SLICES)}")
        if row["slice"] == "hard_benign" and row["label"] != "benign":
            errors.append(f"{where}: hard_benign rows must have label benign")
        if row["label"] == "phish" and not url_err:
            host = defanged_host(row["url_defanged"])
            if host:
                phish_hosts[host.removeprefix("www.")] += 1

    errors += [f"id {i!r} appears {c} times" for i, c in ids.items() if c > 1]
    dupes = sum(1 for c in urls.values() if c > 1)
    if dupes:
        errors.append(f"{dupes} URL(s) appear more than once")
    crowded = sum(1 for c in phish_hosts.values() if c > MAX_PER_DOMAIN)
    if crowded:
        errors.append(f"{crowded} phishing domain(s) have more than {MAX_PER_DOMAIN} URLs")
    return errors


def validate_file(path: Path, brand_ids: set[str] | None = None) -> list[str]:
    """Read and check one test set CSV (UTF-8, comma-separated, header row)."""
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        header = list(reader.fieldnames or [])
        rows = list(reader)
    return validate_rows(header, rows, brand_ids)


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: python -m sentry_ml.testset eval/testset_v1.csv [...]")
        return 2
    brand_ids = load_brand_ids()
    failed = False
    for arg in argv:
        errors = validate_file(Path(arg), brand_ids)
        if errors:
            failed = True
            print(f"{arg}: {len(errors)} problem(s)")
            for e in errors[:50]:
                print(f"  - {e}")
        else:
            print(f"{arg}: OK")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
