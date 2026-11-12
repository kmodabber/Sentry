"""Tests for the OpenPhish collector. Uses made-up example.* URLs only; no network."""

import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[1] / "scripts" / "collect_openphish.py"
_spec = importlib.util.spec_from_file_location("collect_openphish", _path)
cp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cp)


def test_defang_scheme_and_all_dots():
    assert cp.defang("https://login.example.com/a.php?x=1") == (
        "hxxps://login[.]example[.]com/a[.]php?x=1"
    )
    assert cp.defang("http://192.0.2.10/") == "hxxp://192[.]0[.]2[.]10/"
    assert cp.defang("HTTPS://Example.com/") == "hxxps://Example[.]com/"


def test_defang_embedded_urls():
    # A redirect target in the query must not stay clickable.
    out = cp.defang("https://a.example.com/r?u=https://evil.example.net/login")
    assert out == "hxxps://a[.]example[.]com/r?u=hxxps://evil[.]example[.]net/login"
    # Same for a target in the path, and for upper-case or percent-encoded schemes.
    out = cp.defang("http://a.example.com/go/HTTP://b.example.org/x")
    assert out == "hxxp://a[.]example[.]com/go/hxxp://b[.]example[.]org/x"
    out = cp.defang("https://a.example.com/?next=https%3A%2F%2Fb.example.org")
    assert out == "hxxps://a[.]example[.]com/?next=hxxps%3A%2F%2Fb[.]example[.]org"


def test_defang_leaves_nothing_clickable():
    for raw in [
        "https://a.example.com/r?u=https://b.example.net/",
        "http://a.example.com/www.b.example.org/c.html",
        "https://a.example.com/#http://b.example.org",
    ]:
        out = cp.defang(raw)
        assert "http" not in out.lower()
        assert "." not in out.replace("[.]", "")


def test_domain_of():
    assert cp.domain_of("https://WWW.Example.com:8443/path") == "example.com"
    assert cp.domain_of("not a url") is None


def test_merge_dedupes_and_caps_per_domain():
    feed = [f"https://example.com/p{i}" for i in range(5)] + ["https://example.org/"]
    rows, stats = cp.merge([], feed, "2026-11-09T00:00:00+00:00")
    assert stats["added"] == 4  # 3 from example.com + 1 from example.org
    assert stats["domain_full"] == 2
    rows2, stats2 = cp.merge(rows, feed, "2026-11-09T12:00:00+00:00")
    assert stats2["added"] == 0
    assert len(rows2) == 4
    assert all(r["url_defanged"].startswith("hxxp") for r in rows2)
