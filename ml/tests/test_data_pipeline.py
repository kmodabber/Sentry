"""Tests for the STY-78 data pipeline and shortcut check. Made-up example.* rows only."""

import pandas as pd
import pytest

from sentry_ml import data, shortcuts


def frame(rows):
    return pd.DataFrame(rows, columns=["url", "label", "date"])


@pytest.fixture
def raw():
    train = frame(
        [
            # Jul 2024: phishing only, so not a mixed month
            ("https://a.example.com/1", "phish", "2024-07-02"),
            ("https://b.example.com/1", "phish", "2024-07-03"),
            # Aug 2024: mixed
            ("https://c.example.com/1", "phish", "2024-08-01"),
            ("https://www.shared.example/1", "benign", "2024-08-02"),
            # Sep 2025: validation month (mixed), plus the overlap day
            ("https://d.example.com/1", "phish", "2025-09-01"),
            ("https://e.example.org/1", "benign", "2025-09-02"),
            ("https://f.example.org/1", "benign", "2025-09-08"),
        ]
    )
    test = frame(
        [
            ("https://g.example.net/1", "phish", "2025-09-08"),
            ("https://shared.example/2", "benign", "2025-10-01"),
        ]
    )
    return train, test


def test_splits_by_month(raw):
    splits, summary = data.build_splits(*raw)
    assert set(splits["val"]["month"]) == {"2025-09"}
    assert "2025-09" not in set(splits["train"]["month"])
    assert summary["splits"]["train"]["rows"] == 4
    assert summary["splits"]["test"]["rows"] == 2


def test_overlap_day_dropped_from_train_and_val_only(raw):
    splits, summary = data.build_splits(*raw)
    assert "2025-09-08" not in set(splits["train"]["day"]) | set(splits["val"]["day"])
    assert "2025-09-08" in set(splits["test"]["day"])
    assert summary["dropped_from_train_on_overlap_day"] == 1


def test_mixed_months(raw):
    splits, summary = data.build_splits(*raw)
    assert "2024-08" in summary["mixed_months"]
    assert "2024-07" not in summary["mixed_months"]
    assert not splits["train"].loc[splits["train"]["month"] == "2024-07", "mixed_month"].any()


def test_host_in_train_ignores_www(raw):
    splits, summary = data.build_splits(*raw)
    flags = dict(zip(splits["test"]["url"].map(data.host_of), splits["test"]["host_in_train"]))
    assert flags == {"g.example.net": False, "shared.example": True}
    assert summary["test_rows_with_host_in_train"] == 1


def test_bad_dates_fail_loudly(raw):
    train, test = raw
    train.loc[0, "date"] = "not a date"
    with pytest.raises(ValueError, match="unreadable date"):
        data.build_splits(train, test)


def test_summary_has_no_urls(raw):
    _, summary = data.build_splits(*raw)
    assert "example" not in str(summary)


def test_write_jsonl_keeps_fields_for_export(raw, tmp_path):
    splits, _ = data.build_splits(*raw)
    path = tmp_path / "test.jsonl"
    data.write_jsonl(splits["test"], path)
    first = pd.read_json(path, lines=True).iloc[0]
    assert {"url", "label", "date", "month", "mixed_month", "host_in_train"} <= set(first.index)


def test_shortcut_check_flags_a_perfect_feature():
    df = pd.DataFrame(
        {
            "label": ["phish"] * 50 + ["benign"] * 50,
            "leaky": [1] * 50 + [0] * 50,  # perfectly separates: a shortcut
            "useful": [3, 1] * 25 + [2, 0] * 25,  # some signal, not perfect
            "noise": [1, 2] * 50,
        }
    )
    table = shortcuts.shortcut_table(df, ["leaky", "useful", "noise"]).set_index("feature")
    assert table.loc["leaky", "shortcut"]
    assert table.loc["leaky", "phish_share_when_1"] == 1.0
    assert not table.loc["useful", "shortcut"]
    assert table.loc["noise", "auc"] == 0.5


def test_shortcut_check_counts_low_for_phishing_too():
    df = pd.DataFrame({"label": ["phish"] * 10 + ["benign"] * 10, "x": [0] * 10 + [5] * 10})
    table = shortcuts.shortcut_table(df, ["x"])
    assert table.loc[0, "shortcut"]


def test_shortcut_check_flags_rare_one_sided_flags():
    n = 1000
    df = pd.DataFrame(
        {
            "label": ["phish"] * (n // 2) + ["benign"] * (n // 2),
            "ip": [1] * 40 + [0] * (n - 40),  # rare, all phishing
            "rare_mixed": [1, 0] * 20 + [0] * (n - 40),
        }
    )
    table = shortcuts.shortcut_table(df, ["ip", "rare_mixed"]).set_index("feature")
    assert not table.loc["ip", "shortcut"]  # too rare to move the AUC much
    assert table.loc["ip", "one_sided"]
    assert not table.loc["rare_mixed", "one_sided"]
