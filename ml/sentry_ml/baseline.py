"""Baseline logistic regression (STY-115, Stage 2 gate). Owner: Ethan Rajack. Doc 02, section 5.

Trains logistic regression on the C5 features (STY-77 export) with the FR-25 splits (STY-78)
and reports honest numbers:

- ROC-AUC on the PhreshPhish test split, overall and per test month
- detection at 1% false alarms: the threshold is picked on the VALIDATION set so that 1% of
  benign validation URLs are flagged, then applied unchanged to test (never tuned on test)
- variants: all months vs mixed months only; without the one-sided flags (is_ip_host,
  has_port); test rows whose host is new to training

Input:  data/features/{train,val,test}.csv (+ .meta.json) from the Node export.
Output: printed report and <features-dir>/baseline_report.md (data/ is gitignored).
No URLs are read or printed.

Usage (from ml/, venv active):
    python -m sentry_ml.baseline ../data/features
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

TARGET_FPR = 0.01
ONE_SIDED = ["is_ip_host", "has_port"]


@dataclass
class Result:
    name: str
    val_auc: float
    threshold: float
    test_auc: float
    test_detection: float  # share of test phishing flagged at the val threshold
    test_false_alarms: float  # share of test benign flagged at the val threshold
    model: object
    features: list[str]


def load_split(features_dir: Path, name: str) -> pd.DataFrame:
    return pd.read_csv(features_dir / f"{name}.csv")


def feature_names(features_dir: Path) -> list[str]:
    meta = json.loads((features_dir / "train.csv.meta.json").read_text(encoding="utf-8"))
    return list(meta["features"])


def labels(df: pd.DataFrame) -> np.ndarray:
    return (df["label"] == "phish").astype(int).to_numpy()


def threshold_at_fpr(y: np.ndarray, scores: np.ndarray, fpr: float = TARGET_FPR) -> float:
    """Smallest score threshold that flags at most `fpr` of the benign rows."""
    benign = np.sort(scores[y == 0])
    if len(benign) == 0:
        raise ValueError("no benign rows to set a threshold on")
    k = int(np.floor(len(benign) * (1 - fpr)))
    k = min(k, len(benign) - 1)
    return float(np.nextafter(benign[k], np.inf))


def rates(y: np.ndarray, scores: np.ndarray, threshold: float) -> tuple[float, float]:
    """(detection, false alarm rate) at a threshold. NaN when a class is missing."""
    flagged = scores >= threshold
    det = float(flagged[y == 1].mean()) if (y == 1).any() else float("nan")
    fa = float(flagged[y == 0].mean()) if (y == 0).any() else float("nan")
    return det, fa


def safe_auc(y: np.ndarray, scores: np.ndarray) -> float:
    return float(roc_auc_score(y, scores)) if len(set(y)) == 2 else float("nan")


def train_and_score(
    name: str, train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame, features: list[str]
) -> Result:
    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    model.fit(train[features].to_numpy(), labels(train))
    val_scores = model.predict_proba(val[features].to_numpy())[:, 1]
    threshold = threshold_at_fpr(labels(val), val_scores)
    test_scores = model.predict_proba(test[features].to_numpy())[:, 1]
    det, fa = rates(labels(test), test_scores, threshold)
    return Result(
        name=name,
        val_auc=safe_auc(labels(val), val_scores),
        threshold=threshold,
        test_auc=safe_auc(labels(test), test_scores),
        test_detection=det,
        test_false_alarms=fa,
        model=model,
        features=features,
    )


def breakdown(result: Result, test: pd.DataFrame, by: pd.Series) -> pd.DataFrame:
    scores = result.model.predict_proba(test[result.features].to_numpy())[:, 1]
    y = labels(test)
    rows = []
    for key in sorted(by.unique()):
        mask = (by == key).to_numpy()
        det, fa = rates(y[mask], scores[mask], result.threshold)
        rows.append(
            {
                "group": key,
                "rows": int(mask.sum()),
                "phish_share": float(y[mask].mean()),
                "auc": safe_auc(y[mask], scores[mask]),
                "detection": det,
                "false_alarms": fa,
            }
        )
    return pd.DataFrame(rows)


def pct(x: float) -> str:
    return "n/a" if np.isnan(x) else f"{x:.1%}"


def num(x: float) -> str:
    return "n/a" if np.isnan(x) else f"{x:.3f}"


def run(features_dir: Path) -> str:
    features = feature_names(features_dir)
    train, val, test = (load_split(features_dir, s) for s in ("train", "val", "test"))
    without = [f for f in features if f not in ONE_SIDED]

    results = [
        train_and_score("All months, all 20 features (main)", train, val, test, features),
        train_and_score(
            "Mixed months only", train[train["mixed_month"].astype(bool)], val, test, features
        ),
        train_and_score(f"Without {' and '.join(ONE_SIDED)}", train, val, test, without),
    ]
    main = results[0]

    lines = [
        "# Baseline logistic regression (STY-115)",
        "",
        (
            f"Train {len(train):,} rows, validation {len(val):,} (Sep 2025), "
            f"test {len(test):,} (PhreshPhish later-dated split). Threshold set on "
            f"validation for {TARGET_FPR:.0%} false alarms, then applied to test unchanged."
        ),
        "",
        "| Model | Val AUC | Test AUC | Test detection | Test false alarms |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in results:
        lines.append(
            f"| {r.name} | {num(r.val_auc)} | {num(r.test_auc)} | "
            f"{pct(r.test_detection)} | {pct(r.test_false_alarms)} |"
        )

    lines += ["", "## Main model by test month", ""]
    lines += [
        "| Month | Rows | Phish | AUC | Detection | False alarms |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for r in breakdown(main, test, test["month"]).itertuples():
        lines.append(
            f"| {r.group} | {r.rows:,} | {pct(r.phish_share)} | {num(r.auc)} | "
            f"{pct(r.detection)} | {pct(r.false_alarms)} |"
        )

    if "host_in_train" in test.columns:
        seen = (
            test["host_in_train"].astype(bool).map({True: "host seen in train", False: "new host"})
        )
        lines += ["", "## Main model: new hosts vs hosts seen in training", ""]
        lines += [
            "| Test rows | Rows | Phish | AUC | Detection | False alarms |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for r in breakdown(main, test, seen).itertuples():
            lines.append(
                f"| {r.group} | {r.rows:,} | {pct(r.phish_share)} | {num(r.auc)} | "
                f"{pct(r.detection)} | {pct(r.false_alarms)} |"
            )

    lr = main.model.steps[-1][1]
    weights = sorted(zip(features, lr.coef_[0]), key=lambda t: -abs(t[1]))
    lines += ["", "## Main model: biggest weights (standardised features)", ""]
    lines += ["| Feature | Weight |", "| --- | --- |"]
    lines += [f"| {f} | {w:+.3f} |" for f, w in weights[:8]]
    lines += [
        "",
        (
            "Notes: test is 45.7% phishing, far above real browsing, so precision here is "
            "optimistic. December 2025 has no phishing, so only false alarms apply there."
        ),
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m sentry_ml.baseline <features-dir>")
        return 2
    features_dir = Path(argv[0])
    report = run(features_dir)
    out = features_dir / "baseline_report.md"
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
