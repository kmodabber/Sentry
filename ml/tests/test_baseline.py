"""Tests for the STY-115 baseline. Synthetic feature tables only, no URLs."""

import json

import numpy as np
import pandas as pd
import pytest

from sentry_ml import baseline

FEATURES = ["signal", "noise", "is_ip_host", "has_port"]


def make_split(n: int, months: list[str], seed: int, with_host: bool = False) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    y = rng.integers(0, 2, n)
    df = pd.DataFrame(
        {
            "row": range(n),
            "label": np.where(y == 1, "phish", "benign"),
            "month": rng.choice(months, n),
            "mixed_month": True,
            "signal": y * 2.0 + rng.normal(0, 1, n),
            "noise": rng.normal(0, 1, n),
            "is_ip_host": ((y == 1) & (rng.random(n) < 0.02)).astype(int),
            "has_port": 0,
        }
    )
    if with_host:
        df["host_in_train"] = rng.random(n) < 0.3
    return df


@pytest.fixture
def features_dir(tmp_path):
    make_split(2000, ["2024-08", "2025-01"], 1).to_csv(tmp_path / "train.csv", index=False)
    make_split(800, ["2025-09"], 2).to_csv(tmp_path / "val.csv", index=False)
    make_split(800, ["2025-10", "2025-11"], 3, with_host=True).to_csv(
        tmp_path / "test.csv", index=False
    )
    (tmp_path / "train.csv.meta.json").write_text(json.dumps({"features": FEATURES}))
    return tmp_path


def test_threshold_flags_about_one_percent_of_benign():
    rng = np.random.default_rng(0)
    y = np.array([0] * 1000 + [1] * 100)
    scores = rng.random(1100)
    t = baseline.threshold_at_fpr(y, scores)
    _, fa = baseline.rates(y, scores, t)
    assert fa <= 0.01
    assert fa >= 0.009


def test_rates_and_auc_handle_one_class():
    y = np.array([0, 0, 0])
    det, fa = baseline.rates(y, np.array([0.1, 0.9, 0.2]), 0.5)
    assert np.isnan(det) and fa == pytest.approx(1 / 3)
    assert np.isnan(baseline.safe_auc(y, np.array([0.1, 0.2, 0.3])))


def test_report_has_every_section(features_dir):
    report = baseline.run(features_dir)
    for text in [
        "All months, all 20 features (main)",
        "Mixed months only",
        "Without is_ip_host and has_port",
        "## Main model by test month",
        "| 2025-10 |",
        "new host",
        "## Main model: biggest weights",
    ]:
        assert text in report
    assert "example" not in report


def test_main_model_learns_the_signal(features_dir):
    feats = baseline.feature_names(features_dir)
    train, val, test = (baseline.load_split(features_dir, s) for s in ("train", "val", "test"))
    result = baseline.train_and_score("main", train, val, test, feats)
    assert result.test_auc > 0.85
    assert result.test_false_alarms < 0.05
