"""Tests for the C6 schema check. Uses made-up example.* rows only."""

from pathlib import Path

import pytest

from sentry_ml import testset as ts

HEADER = ts.COLUMNS
BRANDS = {"interac", "paypal"}


def row(**overrides: str) -> dict[str, str]:
    base = {
        "id": "v1-0001",
        "url_defanged": "hxxps://login[.]example[.]com/verify",
        "label": "phish",
        "source": "openphish",
        "collected_on": "2026-11-18",
        "brand": "",
        "slice": "general",
    }
    return base | overrides


def test_valid_rows_pass():
    rows = [
        row(),
        row(id="v1-0002", url_defanged="hxxp://example[.]org/", brand="paypal"),
        row(
            id="v1-0003",
            url_defanged="hxxps://www[.]example[.]ca/",
            label="benign",
            source="manual",
            slice="hard_benign",
        ),
    ]
    assert ts.validate_rows(HEADER, rows, BRANDS) == []


def test_header_must_match_exactly():
    assert ts.validate_rows(["id", "url"], [row()], BRANDS)
    assert ts.validate_rows(list(reversed(HEADER)), [row()], BRANDS)


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/",  # not defanged at all
        "hxxps://example.com/",  # scheme defanged, host not
        "hxxps://example[.]com/?next=https://example.org",  # live link inside
        "example[.]com",  # no scheme
    ],
)
def test_rejects_urls_that_are_not_safely_defanged(url):
    errors = ts.validate_rows(HEADER, [row(url_defanged=url)], BRANDS)
    assert any("url_defanged" in e for e in errors)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("label", "phishing"),
        ("slice", "canadian"),
        ("source", "twitter"),
        ("collected_on", "Nov 18"),
        ("collected_on", "2026-13-01"),
        ("brand", "notabrand"),
        ("id", "V1 0001"),
    ],
)
def test_rejects_bad_values(field, value):
    errors = ts.validate_rows(HEADER, [row(**{field: value})], BRANDS)
    assert any(field in e for e in errors)


def test_hard_benign_must_be_benign():
    errors = ts.validate_rows(HEADER, [row(slice="hard_benign")], BRANDS)
    assert any("hard_benign" in e for e in errors)


def test_duplicate_ids_and_urls():
    errors = ts.validate_rows(HEADER, [row(), row()], BRANDS)
    assert any("appears 2 times" in e for e in errors)
    assert any("more than once" in e for e in errors)


def test_max_three_phishing_urls_per_domain():
    rows = [row(id=f"v1-{i}", url_defanged=f"hxxps://example[.]com/p{i}") for i in range(4)]
    errors = ts.validate_rows(HEADER, rows, BRANDS)
    assert any("more than 3" in e for e in errors)
    assert ts.validate_rows(HEADER, rows[:3], BRANDS) == []


def test_errors_never_contain_the_url():
    url = "hxxps://example.com/secret-path"
    errors = ts.validate_rows(HEADER, [row(url_defanged=url)], BRANDS)
    assert errors
    assert all("example" not in e and "secret" not in e for e in errors)


def test_validate_file_reads_csv(tmp_path: Path):
    p = tmp_path / "testset_v0.csv"
    p.write_text(
        ",".join(HEADER) + "\nv1-0001,hxxps://example[.]com/,phish,openphish,2026-11-18,,general\n",
        encoding="utf-8",
    )
    assert ts.validate_file(p, BRANDS) == []


# The real check: every committed test set must follow C6. Skips until one exists.
TESTSETS = sorted((ts.REPO_ROOT / "eval").glob("testset_*.csv"))


@pytest.mark.parametrize("path", TESTSETS, ids=[p.name for p in TESTSETS])
def test_committed_testsets_follow_c6(path: Path):
    assert ts.validate_file(path, ts.load_brand_ids()) == []
