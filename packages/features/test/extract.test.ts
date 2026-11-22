import { describe, expect, it } from "vitest";
import { IMPLEMENTED_FEATURES, extractFeatureMap, extractFeatures } from "../src/extract";
import { FEATURE_NAMES } from "../src/spec";

/** Feature map for a URL that must parse. Made-up example.* URLs only. */
function f(url: string): Record<string, number> {
  const m = extractFeatureMap(url);
  if (m === null) throw new Error("expected features");
  return m;
}

describe("extractFeatures", () => {
  it("implements exactly the C5 features, in spec order", () => {
    expect([...IMPLEMENTED_FEATURES].sort()).toEqual([...FEATURE_NAMES].sort());
    const v = extractFeatures("https://example.com/");
    expect(v).toHaveLength(FEATURE_NAMES.length);
    expect(v!.every((x) => Number.isFinite(x))).toBe(true);
  });

  it("returns null for URLs that won't parse or aren't http/https", () => {
    expect(extractFeatures("example.com/login")).toBeNull();
    expect(extractFeatures("chrome://settings")).toBeNull();
  });

  it("gives the same vector for the raw URL and Chrome's tab.url", () => {
    expect(extractFeatures("HTTPS://WWW.Example.COM")).toEqual(
      extractFeatures("https://www.example.com/"),
    );
  });
});

describe("one test per feature", () => {
  it("url_length: normalised URL, at most 1,000", () => {
    expect(f("https://example.com").url_length).toBe(20); // href adds the "/"
    expect(f("https://example.com/" + "a".repeat(5000)).url_length).toBe(1000);
  });

  it("host_length: no port, no IPv6 brackets", () => {
    expect(f("https://login.example.com:8443/").host_length).toBe(17);
    expect(f("http://[::1]/").host_length).toBe(3);
  });

  it("path_length: a bare '/' counts as 1", () => {
    expect(f("https://example.com").path_length).toBe(1);
    expect(f("https://example.com/a/b?x=1").path_length).toBe(4);
  });

  it("query_length: after '?', not counting it", () => {
    expect(f("https://example.com/").query_length).toBe(0);
    expect(f("https://example.com/?ab=1#frag").query_length).toBe(4);
  });

  it("host_dots", () => {
    expect(f("https://a.b.example.com/").host_dots).toBe(3);
  });

  it("host_hyphens", () => {
    expect(f("https://secure-log-in.example.com/").host_hyphens).toBe(2);
  });

  it("url_digits", () => {
    expect(f("https://example123.com/4").url_digits).toBe(4);
  });

  it("url_digit_ratio: digits / url_length", () => {
    const m = f("https://example123.com/4");
    expect(m.url_digit_ratio).toBeCloseTo(4 / m.url_length!);
  });

  it("special_chars: counts @~%_=&!*+$,;|", () => {
    expect(f("https://example.com/a_b?x=1&y=2").special_chars).toBe(4);
  });

  it("subdomain_depth: 'www' counts, IPs are 0", () => {
    expect(f("https://example.com/").subdomain_depth).toBe(0);
    expect(f("https://www.example.com/").subdomain_depth).toBe(1);
    expect(f("https://a.b.example.co.uk/").subdomain_depth).toBe(2);
    expect(f("http://192.0.2.1/").subdomain_depth).toBe(0);
  });

  it("host_entropy: 0 for one repeated letter, higher for random-looking", () => {
    expect(f("https://aaaa/").host_entropy).toBe(0);
    expect(f("https://ab.ab/").host_entropy).toBeCloseTo(1);
    expect(f("https://x7k2q9.example.com/").host_entropy).toBeGreaterThan(
      f("https://www.example.com/").host_entropy!,
    );
  });

  it("is_ip_host: IPv4 and IPv6", () => {
    expect(f("http://192.0.2.1/").is_ip_host).toBe(1);
    expect(f("http://[2001:db8::1]/").is_ip_host).toBe(1);
    expect(f("https://example.com/").is_ip_host).toBe(0);
  });

  it("has_punycode", () => {
    expect(f("https://xn--bcher-kva.example/").has_punycode).toBe(1);
    expect(f("https://bücher.example/").has_punycode).toBe(1); // href encodes it
    expect(f("https://example.com/").has_punycode).toBe(0);
  });

  it("has_at_sign", () => {
    expect(f("https://user@example.com/").has_at_sign).toBe(1);
    expect(f("https://example.com/").has_at_sign).toBe(0);
  });

  it("has_port: only non-default ports", () => {
    expect(f("https://example.com:8443/").has_port).toBe(1);
    expect(f("https://example.com:443/").has_port).toBe(0);
  });

  it("no_https", () => {
    expect(f("http://example.com/").no_https).toBe(1);
    expect(f("https://example.com/").no_https).toBe(0);
  });

  it("path_depth: non-empty segments", () => {
    expect(f("https://example.com/").path_depth).toBe(0);
    expect(f("https://example.com/a//b/c/").path_depth).toBe(3);
  });

  it("query_params: non-empty parts split on '&'", () => {
    expect(f("https://example.com/?a=1&b=2&&c").query_params).toBe(3);
    expect(f("https://example.com/").query_params).toBe(0);
  });

  it("phishing_words: distinct, substring, case-insensitive", () => {
    expect(f("https://MyLogin.example.com/Verify?next=login").phishing_words).toBe(2);
    expect(f("https://example.com/").phishing_words).toBe(0);
  });

  it("risky_file_type: last path segment only", () => {
    expect(f("https://example.com/files/Setup.EXE").risky_file_type).toBe(1);
    expect(f("https://example.com/app.apk?x=1").risky_file_type).toBe(1);
    expect(f("https://example.com/exe/readme.txt").risky_file_type).toBe(0);
  });
});
