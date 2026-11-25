"""Shortcut check (STY-78). Owner: Ethan Rajack. Doc 02, section 5.

Reads a feature table from the Node export (STY-77) and reports any single feature that
separates phishing from benign almost perfectly on its own. A feature like that usually means
the data has a collection artifact (as PhiUSIIL did), not a real phishing signal.

For each feature it reports the single-feature ROC-AUC (how well that one number alone ranks
phishing above benign; 0.5 is no signal, 1.0 is perfect) and the phishing share among rows
where a flag feature is 1. Features at or beyond SHORTCUT_AUC are flagged, and so are
"one-sided" flags: 0/1 features where every row that is 1 has the same label.

Usage (from ml/, venv active):
    python -m sentry_ml.shortcuts ../data/features/train.csv
Writes <table>.shortcuts.md next to the table (data/ is gitignored). No URLs involved.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
from sklearn.metrics import roc_auc_score

SHORTCUT_AUC = 0.95
# A 0/1 feature is "one-sided" when every row where it is 1 has the same label. Rare ones
# barely move the AUC, but the model still learns "1 means phishing" (e.g. is_ip_host, STY-100).
ONE_SIDED_MIN_ROWS = 30


def load_features(path: Path) -> tuple[pd.DataFrame, list[str]]:
    """The table and its feature columns, in spec order (from the .meta.json if present)."""
    df = pd.read_csv(path)
    meta = path.with_name(path.name + ".meta.json")
    if meta.exists():
        names = json.loads(meta.read_text(encoding="utf-8"))["features"]
    else:
        skip = {"row", "url", "label", "date", "month", "mixed_month", "host_in_train"}
        names = [c for c in df.columns if c not in skip]
    return df, names


def shortcut_table(df: pd.DataFrame, features: list[str]) -> pd.DataFrame:
    y = (df["label"] == "phish").astype(int)
    if y.nunique() < 2:
        raise ValueError("need both phish and benign rows")
    rows = []
    for name in features:
        x = df[name]
        auc = float(roc_auc_score(y, x)) if x.nunique() > 1 else 0.5
        strength = max(auc, 1 - auc)  # a feature that is low for phishing counts too
        is_flag = set(x.unique()) <= {0, 1}
        phish_when_1 = float(y[x == 1].mean()) if is_flag and (x == 1).any() else None
        rows.append(
            {
                "feature": name,
                "auc": round(auc, 4),
                "strength": round(strength, 4),
                "flag_rows_1": int((x == 1).sum()) if is_flag else None,
                "phish_share_when_1": round(phish_when_1, 4) if phish_when_1 is not None else None,
                "shortcut": strength >= SHORTCUT_AUC,
                "one_sided": bool(
                    phish_when_1 in (0.0, 1.0) and int((x == 1).sum()) >= ONE_SIDED_MIN_ROWS
                ),
            }
        )
    return pd.DataFrame(rows).sort_values("strength", ascending=False).reset_index(drop=True)


def to_markdown(table: pd.DataFrame, n_rows: int) -> str:
    lines = [
        "# Shortcut check",
        "",
        (
            f"{n_rows:,} rows. A feature is flagged when its single-feature ROC-AUC is "
            f"{SHORTCUT_AUC} or more (or {1 - SHORTCUT_AUC:.2f} or less)."
        ),
        "",
        "| feature | AUC | flag rows = 1 | phish share when 1 | shortcut? | one-sided? |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for r in table.itertuples():
        lines.append(
            f"| {r.feature} | {r.auc} | {'' if pd.isna(r.flag_rows_1) else int(r.flag_rows_1)} | "
            f"{'' if pd.isna(r.phish_share_when_1) else r.phish_share_when_1} | "
            f"{'YES' if r.shortcut else ''} | {'YES' if r.one_sided else ''} |"
        )
    flagged = table[table["shortcut"]]["feature"].tolist()
    one_sided = table[table["one_sided"]]["feature"].tolist()
    lines += [
        "",
        f"Shortcuts (AUC): {', '.join(flagged) if flagged else 'none'}",
        (
            f"One-sided flags (every row = 1 has one label, at least {ONE_SIDED_MIN_ROWS} rows): "
            f"{', '.join(one_sided) if one_sided else 'none'}"
        ),
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m sentry_ml.shortcuts <features.csv>")
        return 2
    path = Path(argv[0])
    df, features = load_features(path)
    table = shortcut_table(df, features)
    report = to_markdown(table, len(df))
    out = path.with_name(path.name + ".shortcuts.md")
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
