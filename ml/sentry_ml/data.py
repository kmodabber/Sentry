"""FR-25 training data pipeline (STY-78). Owner: Ethan Rajack. Doc 02, section 5.

Turns the saved PhreshPhish files (url, label, date only) into honest splits:

- train: PhreshPhish train, minus the validation month, minus Sep 8 2025
- val:   the latest month of PhreshPhish train (Sep 2025), minus Sep 8
- test:  PhreshPhish's later-dated test split, unchanged

Decisions (also in docs/decisions.md):
- Sep 8 2025 appears in both PhreshPhish train and test. It is dropped from train and val and
  kept in test, so no day is on both sides.
- A month is "mixed" when phishing is between 5% and 95% of its rows. Jul 2024 and
  Nov 2024 to Apr 2025 are not. Every row carries mixed_month so STY-115 can compare training
  on all months against mixed months only.
- Test rows whose host (lower-cased, "www." removed) also appears in train get
  host_in_train = true, so results can be reported with and without them.

Writes data/splits/{train,val,test}.jsonl (input for the Node feature export, STY-77) and
data/splits/summary.json. data/ is gitignored. Never prints or logs a URL (doc 09).

Usage (from ml/, venv active):
    python -m sentry_ml.data
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"

VAL_MONTH = "2025-09"
OVERLAP_DAY = "2025-09-08"
MIXED_MIN, MIXED_MAX = 0.05, 0.95
TRUNCATION_LENGTH = 1000


def host_of(url: str) -> str:
    """Lower-cased host without 'www.', or '' if it won't parse. Text only, nothing is opened."""
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        return ""
    return host.removeprefix("www.")


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    """Keep url, label, date; add day, month and is_phish."""
    out = df[["url", "label", "date"]].copy()
    dt = pd.to_datetime(out["date"], utc=True, errors="coerce")
    if dt.isna().any():
        raise ValueError(f"{int(dt.isna().sum())} rows have an unreadable date")
    out["day"] = dt.dt.strftime("%Y-%m-%d")
    out["month"] = dt.dt.strftime("%Y-%m")
    out["is_phish"] = (out["label"] == "phish").astype(int)
    return out


def mixed_months(train: pd.DataFrame) -> set[str]:
    share = train.groupby("month")["is_phish"].mean()
    return set(share[(share >= MIXED_MIN) & (share <= MIXED_MAX)].index)


def build_splits(
    train_raw: pd.DataFrame, test_raw: pd.DataFrame
) -> tuple[dict[str, pd.DataFrame], dict]:
    """Return the three splits and a summary of counts (no URLs)."""
    train_all = prepare(train_raw)
    test = prepare(test_raw)

    overlap_rows = int((train_all["day"] == OVERLAP_DAY).sum())
    train_all = train_all[train_all["day"] != OVERLAP_DAY]

    mixed = mixed_months(train_all)
    is_val = train_all["month"] == VAL_MONTH
    splits = {"train": train_all[~is_val].copy(), "val": train_all[is_val].copy(), "test": test}
    for df in splits.values():
        df["mixed_month"] = df["month"].isin(mixed)

    train_hosts = set(splits["train"]["url"].map(host_of)) - {""}
    splits["test"]["host_in_train"] = splits["test"]["url"].map(host_of).isin(train_hosts)

    summary = {
        "val_month": VAL_MONTH,
        "dropped_from_train_on_overlap_day": overlap_rows,
        "mixed_months": sorted(mixed),
        "splits": {
            name: {
                "rows": len(df),
                "phish_share": round(float(df["is_phish"].mean()), 4) if len(df) else None,
                "first_day": df["day"].min() if len(df) else None,
                "last_day": df["day"].max() if len(df) else None,
                "rows_in_mixed_months": int(df["mixed_month"].sum()),
            }
            for name, df in splits.items()
        },
        "test_rows_with_host_in_train": int(splits["test"]["host_in_train"].sum()),
        # Known artifacts from STY-100, measured on the raw URLs before any cut.
        "artifacts": {
            "raw_longer_than_1000_by_label": count_by_label(
                train_all, train_all["url"].str.len() > TRUNCATION_LENGTH
            ),
            "ip_host_by_label": count_by_label(
                train_all, train_all["url"].map(host_of).str.match(r"^\d+\.\d+\.\d+\.\d+$|.*:")
            ),
        },
    }
    if len(splits["val"]) == 0:
        raise ValueError(f"no rows in the validation month {VAL_MONTH}")
    return splits, summary


def count_by_label(df: pd.DataFrame, mask: pd.Series) -> dict[str, int]:
    counts = df.loc[mask, "label"].value_counts()
    return {label: int(counts.get(label, 0)) for label in ("phish", "benign")}


def write_jsonl(df: pd.DataFrame, path: Path) -> None:
    cols = ["url", "label", "date", "month", "mixed_month"]
    if "host_in_train" in df.columns:
        cols.append("host_in_train")
    out = df[cols].copy()
    out["date"] = out["date"].astype(str)
    out.to_json(path, orient="records", lines=True, force_ascii=False)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build PhreshPhish train/val/test splits.")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args(argv)

    train_raw = pd.read_parquet(
        args.data_dir / "phresh_train.parquet", columns=["url", "label", "date"]
    )
    test_raw = pd.read_parquet(
        args.data_dir / "phresh_test.parquet", columns=["url", "label", "date"]
    )
    splits, summary = build_splits(train_raw, test_raw)

    out_dir = args.data_dir / "splits"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, df in splits.items():
        write_jsonl(df, out_dir / f"{name}.jsonl")
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    for name, s in summary["splits"].items():
        print(
            f"{name}: {s['rows']:,} rows, phish {s['phish_share']:.1%}, "
            f"{s['first_day']} to {s['last_day']}"
        )
    print(f"dropped from train on {OVERLAP_DAY}: {summary['dropped_from_train_on_overlap_day']}")
    print(f"test rows whose host is in train: {summary['test_rows_with_host_in_train']:,}")
    print(f"wrote {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
