"""Collect fresh phishing URLs from the OpenPhish community feed (STY-113).

Runs every few hours from cron. Each run downloads the feed as plain text,
defangs every URL, and appends the new ones to data/openphish/collected.csv
with the time they were first seen. At most 3 URLs per domain are kept.

Safety (doc 09):
- URLs are handled as text only. Nothing is opened, clicked or previewed.
- URLs are defanged before they are written anywhere (hxxps://example[.]com).
- This script never prints a URL. It logs counts only.
- data/ is gitignored. Never commit collected.csv.

Usage (from the Sentry repo root, with ml/.venv active):
    python ml/scripts/collect_openphish.py
"""

from __future__ import annotations

import csv
import sys
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

FEED_URL = "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt"
MAX_PER_DOMAIN = 3
REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "openphish"
OUT_CSV = OUT_DIR / "collected.csv"
LOG_FILE = OUT_DIR / "collect.log"
COLUMNS = ["url_defanged", "domain", "first_seen_utc", "source"]


def domain_of(url: str) -> str | None:
    """Return the lower-case host without port or leading www., or None if unparseable."""
    try:
        host = urlsplit(url.strip()).hostname
    except ValueError:
        return None
    if not host:
        return None
    host = host.lower().rstrip(".")
    return host.removeprefix("www.")


def defang(url: str) -> str:
    """hxxp(s) for the scheme and [.] for every dot in the host, so the link can't be clicked."""
    url = url.strip()
    scheme, sep, rest = url.partition("://")
    if not sep:
        scheme, rest = "", url
    host_end = len(rest)
    for ch in "/?#":
        i = rest.find(ch)
        if i != -1:
            host_end = min(host_end, i)
    host = rest[:host_end].replace(".", "[.]")
    scheme = scheme.lower().replace("http", "hxxp")
    prefix = f"{scheme}://" if sep else ""
    return prefix + host + rest[host_end:]


def fetch_feed(url: str = FEED_URL, timeout: int = 60) -> list[str]:
    req = urllib.request.Request(url, headers={"User-Agent": "sentry-wcs-collector"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    return [line.strip() for line in text.splitlines() if line.strip()]


def load_existing(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def merge(
    existing: list[dict[str, str]], feed_urls: list[str], now: str
) -> tuple[list[dict[str, str]], Counter]:
    """Add new defanged URLs, keeping at most MAX_PER_DOMAIN per domain. Returns rows and counts."""
    seen = {row["url_defanged"] for row in existing}
    per_domain = Counter(row["domain"] for row in existing)
    stats: Counter = Counter()
    new_rows = []
    for raw in feed_urls:
        stats["in_feed"] += 1
        domain = domain_of(raw)
        if domain is None:
            stats["unparseable"] += 1
            continue
        safe = defang(raw)
        if safe in seen:
            stats["already_have"] += 1
            continue
        if per_domain[domain] >= MAX_PER_DOMAIN:
            stats["domain_full"] += 1
            continue
        row = {
            "url_defanged": safe,
            "domain": domain,
            "first_seen_utc": now,
            "source": "openphish",
        }
        new_rows.append(row)
        seen.add(safe)
        per_domain[domain] += 1
        stats["added"] += 1
    return existing + new_rows, stats


def write_rows(path: Path, rows: list[dict[str, str]]) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)  # atomic swap, so a crash never leaves a half-written file


def log(message: str) -> None:
    line = f"{datetime.now(UTC).isoformat(timespec='seconds')}  {message}"
    print(line)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(UTC).isoformat(timespec="seconds")
    try:
        feed = fetch_feed()
    except OSError as exc:  # no network, timeout, HTTP error (all subclasses of OSError)
        log(f"ERROR fetching feed: {type(exc).__name__}")
        return 1
    rows, stats = merge(load_existing(OUT_CSV), feed, now)
    write_rows(OUT_CSV, rows)
    log(
        f"feed={stats['in_feed']} added={stats['added']} "
        f"already_have={stats['already_have']} domain_full={stats['domain_full']} "
        f"unparseable={stats['unparseable']} total={len(rows)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
