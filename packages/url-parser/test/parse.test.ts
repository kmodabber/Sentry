import { describe, expect, it } from "vitest";
import type { ParsedUrl } from "@sentry-ext/contracts";
import { parseUrl } from "../src";
import knownGood from "../../../fixtures/urls/known_good.csv?raw";
import knownBad from "../../../fixtures/urls/known_bad.csv?raw";
import lookalikes from "../../../brands/lookalikes.txt?raw";

// STY-FR-13 / TC-03: the parsing test table. 100 cases, grouped by what they pin down.
// Each row lists only the fields it is about; every field it names must match exactly.
// Fields not named are not checked for that row.

type Want = Partial<
  Pick<
    ParsedUrl,
    | "protocol"
    | "hostname"
    | "domain"
    | "publicSuffix"
    | "subdomain"
    | "isIp"
    | "path"
    | "port"
    | "userInfo"
    | "hostnameUnicode"
    | "isPunycode"
  >
>;
type Row = [name: string, input: string, want: Want];

/** A plain name host: shorthand for the common domain / suffix / subdomain triple. */
const host = (
  hostname: string,
  domain: string | null,
  publicSuffix: string | null,
  subdomain: string | null,
): Want => ({ hostname, domain, publicSuffix, subdomain, isIp: false });

const ip = (hostname: string): Want => ({
  hostname,
  domain: null,
  publicSuffix: null,
  subdomain: null,
  isIp: true,
});

const TABLE: Row[] = [
  // --- 1. Plain hosts: subdomain, registrable domain, suffix (15) ---
  ["bare domain", "https://example.com/", host("example.com", "example.com", "com", null)],
  [
    "www subdomain",
    "https://www.example.com/",
    host("www.example.com", "example.com", "com", "www"),
  ],
  [
    "one subdomain",
    "https://login.paypa1.com/signin",
    host("login.paypa1.com", "paypa1.com", "com", "login"),
  ],
  [
    "two subdomains",
    "https://a.b.example.org/",
    host("a.b.example.org", "example.org", "org", "a.b"),
  ],
  [
    "three subdomains",
    "https://a.b.c.example.net/",
    host("a.b.c.example.net", "example.net", "net", "a.b.c"),
  ],
  [
    "five subdomains",
    "https://v.w.x.y.z.example.com/",
    host("v.w.x.y.z.example.com", "example.com", "com", "v.w.x.y.z"),
  ],
  [
    "brand as subdomain",
    "https://paypal.com.secure-login.net/",
    host("paypal.com.secure-login.net", "secure-login.net", "net", "paypal.com"),
  ],
  [
    "brand dashed into subdomain",
    "https://paypal-login.evil.com/",
    host("paypal-login.evil.com", "evil.com", "com", "paypal-login"),
  ],
  [
    "digits in name",
    "https://web2.example123.com/",
    host("web2.example123.com", "example123.com", "com", "web2"),
  ],
  [
    "hyphenated domain",
    "https://my-bank-online.com/",
    host("my-bank-online.com", "my-bank-online.com", "com", null),
  ],
  [
    "single-letter subdomain",
    "https://m.example.com/",
    host("m.example.com", "example.com", "com", "m"),
  ],
  [
    "long tld",
    "https://example.photography/",
    host("example.photography", "example.photography", "photography", null),
  ],
  [
    "new gtld",
    "https://login.example.online/",
    host("login.example.online", "example.online", "online", "login"),
  ],
  ["short domain", "https://t.co/abc", host("t.co", "t.co", "co", null)],
  [
    "underscore label",
    "https://_dmarc.example.com/",
    host("_dmarc.example.com", "example.com", "com", "_dmarc"),
  ],

  // --- 2. Multi-part and country suffixes (15) ---
  [
    "co.uk",
    "https://www.example.co.uk/",
    host("www.example.co.uk", "example.co.uk", "co.uk", "www"),
  ],
  [
    "co.uk no subdomain",
    "https://example.co.uk/",
    host("example.co.uk", "example.co.uk", "co.uk", null),
  ],
  ["org.uk", "https://charity.org.uk/", host("charity.org.uk", "charity.org.uk", "org.uk", null)],
  ["gov.uk", "https://www.gov.uk/", host("www.gov.uk", "www.gov.uk", "gov.uk", null)],
  [
    "com.au",
    "https://shop.example.com.au/",
    host("shop.example.com.au", "example.com.au", "com.au", "shop"),
  ],
  [
    "co.jp",
    "https://www.example.co.jp/",
    host("www.example.co.jp", "example.co.jp", "co.jp", "www"),
  ],
  [
    "com.br",
    "https://login.banco.com.br/",
    host("login.banco.com.br", "banco.com.br", "com.br", "login"),
  ],
  ["co.nz", "https://example.co.nz/", host("example.co.nz", "example.co.nz", "co.nz", null)],
  [
    "com.cn",
    "https://www.example.com.cn/",
    host("www.example.com.cn", "example.com.cn", "com.cn", "www"),
  ],
  [
    "canadian .ca",
    "https://www.rbcroyalbank.com/",
    host("www.rbcroyalbank.com", "rbcroyalbank.com", "com", "www"),
  ],
  ["canada.ca", "https://www.canada.ca/en.html", host("www.canada.ca", "canada.ca", "ca", "www")],
  [
    "gc.ca",
    "https://www.cra-arc.gc.ca/",
    host("www.cra-arc.gc.ca", "cra-arc.gc.ca", "gc.ca", "www"),
  ],
  [
    "province suffix",
    "https://example.on.ca/",
    host("example.on.ca", "example.on.ca", "on.ca", null),
  ],
  ["country tld only", "https://example.de/", host("example.de", "example.de", "de", null)],
  [
    "suffix word inside subdomain",
    "https://co.uk.example.com/",
    host("co.uk.example.com", "example.com", "com", "co.uk"),
  ],

  // --- 3. IP hosts and odd hosts (14) ---
  ["ipv4", "http://192.0.2.10/login", ip("192.0.2.10")],
  ["ipv4 with port", "http://192.0.2.10:8080/", { ...ip("192.0.2.10"), port: 8080 }],
  ["ipv4 loopback", "http://127.0.0.1/", ip("127.0.0.1")],
  ["ipv4 private", "http://10.0.0.1/admin", ip("10.0.0.1")],
  ["ipv4 broadcast", "http://255.255.255.255/", ip("255.255.255.255")],
  ["ipv4 hex shorthand", "http://0x7f.1/", ip("127.0.0.1")],
  ["ipv4 decimal integer", "http://3232235777/", ip("192.168.1.1")],
  ["ipv4 octal part", "http://0300.0250.0.1/", ip("192.168.0.1")],
  ["ipv4 short form", "http://1.2.3/", ip("1.2.0.3")],
  ["ipv6 loopback", "http://[::1]/", ip("[::1]")],
  ["ipv6 full", "http://[2001:db8::1]/", ip("[2001:db8::1]")],
  ["ipv6 with port", "http://[2001:db8::1]:8443/x", { ...ip("[2001:db8::1]"), port: 8443 }],
  ["ipv4 mapped in ipv6", "http://[::ffff:192.0.2.1]/", { isIp: true, domain: null }],
  [
    "localhost",
    "http://localhost:3000/",
    { hostname: "localhost", domain: null, subdomain: null, isIp: false, port: 3000 },
  ],

  // --- 4. Ports (10) ---
  ["explicit port", "https://example.com:8443/", { hostname: "example.com", port: 8443 }],
  ["no port", "https://example.com/", { port: null }],
  ["default https port dropped", "https://example.com:443/", { port: null }],
  ["default http port dropped", "http://example.com:80/", { port: null }],
  ["https on port 80 kept", "https://example.com:80/", { port: 80 }],
  ["http on port 443 kept", "http://example.com:443/", { port: 443 }],
  ["port with leading zeros", "http://example.com:0080/", { port: null }],
  ["high port", "http://example.com:65535/", { port: 65535 }],
  [
    "port with subdomain",
    "https://api.example.com:9000/v1",
    { subdomain: "api", domain: "example.com", port: 9000, path: "/v1" },
  ],
  ["port 1", "http://example.com:1/", { port: 1 }],

  // --- 5. User info (11) ---
  [
    "user only",
    "https://user@example.com/",
    { userInfo: "user", hostname: "example.com", domain: "example.com" },
  ],
  [
    "user and password",
    "https://user:pw@example.com/",
    { userInfo: "user:pw", domain: "example.com" },
  ],
  ["no user info", "https://example.com/", { userInfo: null }],
  [
    "empty user, password set",
    "https://:pw@example.com/",
    { userInfo: ":pw", domain: "example.com" },
  ],
  [
    "trusted name as user",
    "https://paypal.com@evil.com/",
    { userInfo: "paypal.com", hostname: "evil.com", domain: "evil.com" },
  ],
  [
    "url as user",
    "https://www.paypal.com:secure@evil.com/login",
    { userInfo: "www.paypal.com:secure", hostname: "evil.com", domain: "evil.com" },
  ],
  [
    "percent-encoded password stays encoded",
    "http://user:p%40ss@example.com/",
    { userInfo: "user:p%40ss", hostname: "example.com" },
  ],
  [
    "user info with port",
    "http://user:pw@example.com:8080/",
    { userInfo: "user:pw", port: 8080, domain: "example.com" },
  ],
  [
    "user info on ip",
    "http://admin@192.0.2.1/",
    { userInfo: "admin", isIp: true, hostname: "192.0.2.1" },
  ],
  ["last @ wins", "http://a@b@example.com/", { hostname: "example.com", domain: "example.com" }],
  [
    "backslash before @ ends the host",
    "http://example.com\\@evil.com/",
    { hostname: "example.com", domain: "example.com" },
  ],

  // --- 6. Punycode and IDN (12) ---
  [
    "unicode latin",
    "https://bücher.de/",
    {
      hostname: "xn--bcher-kva.de",
      hostnameUnicode: "bücher.de",
      isPunycode: true,
      domain: "xn--bcher-kva.de",
      publicSuffix: "de",
    },
  ],
  [
    "punycode input",
    "https://xn--bcher-kva.de/",
    { hostname: "xn--bcher-kva.de", hostnameUnicode: "bücher.de", isPunycode: true },
  ],
  [
    "cyrillic apple lookalike",
    "https://аррӏе.com/",
    {
      hostnameUnicode: "аррӏе.com",
      isPunycode: true,
      hostname: "xn--80ak6aa92e.com",
      domain: "xn--80ak6aa92e.com",
    },
  ],
  [
    "cyrillic apple, punycode input",
    "https://xn--80ak6aa92e.com/",
    { hostnameUnicode: "аррӏе.com", isPunycode: true },
  ],
  [
    "unicode subdomain",
    "https://login.bücher.de/",
    {
      subdomain: "login",
      hostnameUnicode: "login.bücher.de",
      isPunycode: true,
      domain: "xn--bcher-kva.de",
    },
  ],
  [
    "idn tld",
    "https://пример.рф/",
    {
      hostnameUnicode: "пример.рф",
      isPunycode: true,
      hostname: "xn--e1afmkfd.xn--p1ai",
      publicSuffix: "xn--p1ai",
    },
  ],
  [
    "cjk domain",
    "https://例え.jp/",
    { hostnameUnicode: "例え.jp", isPunycode: true, hostname: "xn--r8jz45g.jp" },
  ],
  [
    "emoji-ish symbol",
    "https://☃.com/",
    { hostnameUnicode: "☃.com", isPunycode: true, hostname: "xn--n3h.com" },
  ],
  [
    "uppercase unicode folded",
    "https://BÜCHER.DE/",
    { hostnameUnicode: "bücher.de", hostname: "xn--bcher-kva.de" },
  ],
  [
    "ascii host is not punycode",
    "https://example.com/",
    { isPunycode: false, hostnameUnicode: "example.com" },
  ],
  ["ascii host containing xn in a word", "https://boxn--x.example.com/", { isPunycode: false }],
  [
    "mixed ascii and punycode labels",
    "https://www.xn--bcher-kva.example.com/",
    {
      isPunycode: true,
      hostnameUnicode: "www.bücher.example.com",
      domain: "example.com",
      subdomain: "www.xn--bcher-kva",
    },
  ],

  // --- 7. Normalisation: case, dots, whitespace, schemes (13) ---
  [
    "uppercase host",
    "HTTPS://WWW.EXAMPLE.COM/Path",
    { protocol: "https:", hostname: "www.example.com", path: "/Path", domain: "example.com" },
  ],
  [
    "mixed case suffix",
    "https://Example.CO.UK/",
    { hostname: "example.co.uk", publicSuffix: "co.uk" },
  ],
  [
    "trailing dot",
    "https://example.com./",
    { hostname: "example.com", domain: "example.com", subdomain: null },
  ],
  [
    "trailing dot with subdomain",
    "https://www.example.com./",
    { hostname: "www.example.com", subdomain: "www" },
  ],
  ["leading and trailing spaces", "  https://example.com/  ", { hostname: "example.com" }],
  ["tab and newline inside are dropped", "https://exa\tmple.co\nm/", { hostname: "example.com" }],
  ["http scheme", "http://example.com/", { protocol: "http:" }],
  ["https scheme", "https://example.com/", { protocol: "https:" }],
  [
    "ftp scheme",
    "ftp://files.example.com/pub",
    { protocol: "ftp:", domain: "example.com", subdomain: "files", path: "/pub" },
  ],
  ["no path", "https://example.com", { path: "/" }],
  ["query and fragment are not the path", "https://example.com/a/b?x=1#top", { path: "/a/b" }],
  ["path with encoded slash", "https://example.com/a%2Fb", { path: "/a%2Fb" }],
  ["dot segments resolved", "https://example.com/a/../b/./c", { path: "/b/c" }],

  // --- 8. Hosts that look like something else (10) ---
  [
    "domain starts with www",
    "https://www-example.com/",
    host("www-example.com", "www-example.com", "com", null),
  ],
  [
    "number-only subdomain",
    "https://123.example.com/",
    { subdomain: "123", domain: "example.com", isIp: false },
  ],
  [
    "ip-looking last label",
    "https://1.2.3.example.com/",
    { subdomain: "1.2.3", domain: "example.com", isIp: false },
  ],
  [
    "looks like ip but has letter",
    "https://192.0.2.a.example.com/",
    { isIp: false, domain: "example.com" },
  ],
  [
    "tld-looking subdomain",
    "https://com.example.org/",
    { subdomain: "com", domain: "example.org" },
  ],
  [
    "github pages (icann list only)",
    "https://user.github.io/",
    { hostname: "user.github.io", domain: "github.io", publicSuffix: "io", subdomain: "user" },
  ],
  [
    "blogspot (icann list only)",
    "https://sample.blogspot.com/",
    { domain: "blogspot.com", subdomain: "sample", publicSuffix: "com" },
  ],
  ["unknown tld", "https://example.invalidtld/", { hostname: "example.invalidtld", isIp: false }],
  ["single label host", "http://intranet/", { hostname: "intranet", domain: null, isIp: false }],
  [
    "onion",
    "http://exampleonionaddress.onion/",
    { hostname: "exampleonionaddress.onion", isIp: false },
  ],
  // The URL standard reads "http:///path" as host "path" (extra slashes are skipped), not as an empty host.
  [
    "extra slashes after scheme",
    "http:///example.com/path",
    { hostname: "example.com", domain: "example.com", path: "/path" },
  ],
];

// Edge: hosts the URL parser accepts but that are not web pages. They parse, with no domain.
const NON_WEB: Row[] = [
  [
    "javascript scheme",
    "javascript:alert(1)",
    { protocol: "javascript:", hostname: "", domain: null, isIp: false },
  ],
  ["mailto scheme", "mailto:a@b.com", { protocol: "mailto:", domain: null }],
  ["file scheme", "file:///C:/Users/a.txt", { protocol: "file:", hostname: "", domain: null }],
  ["data scheme", "data:text/html,hello", { protocol: "data:", domain: null }],
];

const BAD_INPUT: [name: string, input: string][] = [
  ["empty string", ""],
  ["plain words", "not a url"],
  ["no scheme", "example.com"],
  ["scheme-relative", "//example.com"],
  ["space inside host", "http://exa mple.com/"],
  ["bad port", "http://example.com:99999/"],
];

describe("parsing test table (STY-FR-13, TC-03)", () => {
  const all = [...TABLE, ...NON_WEB];

  it("has the 100 cases the requirement asks for", () => {
    expect(all.length + BAD_INPUT.length).toBeGreaterThanOrEqual(100);
  });

  it.each(all)("%s", (_name, input, want) => {
    const got = parseUrl(input);
    for (const [key, value] of Object.entries(want)) {
      expect({ field: key, value: got[key as keyof ParsedUrl] }).toEqual({ field: key, value });
    }
  });

  it.each(BAD_INPUT)("rejects %s", (_name, input) => {
    expect(() => parseUrl(input)).toThrow();
  });
});

describe("parseUrl shape", () => {
  it("returns every field for a full URL", () => {
    expect(parseUrl("https://user:pw@login.bücher.de:8443/a?b=1#c")).toEqual({
      href: "https://user:pw@login.xn--bcher-kva.de:8443/a?b=1#c",
      protocol: "https:",
      hostname: "login.xn--bcher-kva.de",
      domain: "xn--bcher-kva.de",
      publicSuffix: "de",
      subdomain: "login",
      isIp: false,
      path: "/a",
      port: 8443,
      userInfo: "user:pw",
      hostnameUnicode: "login.bücher.de",
      isPunycode: true,
    });
  });
});

// Shared fixtures (README: fixtures/urls, typed text only, never visited). Definition of
// Done asks for a known-bad and a known-good URL; every row in both files must parse.
describe("fixtures/urls", () => {
  const urls = (csv: string): string[] =>
    csv
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((line) => line.split(",")[0] ?? "");

  it.each([
    ["known_good.csv", knownGood],
    ["known_bad.csv", knownBad],
  ])("%s: every URL parses to a host", (_file, csv) => {
    const list = urls(csv);
    expect(list.length).toBeGreaterThan(0);
    for (const url of list) expect(parseUrl(url).hostname).not.toBe("");
  });

  it("splits a known-good and a known-bad brand URL differently", () => {
    expect(parseUrl("https://www.paypal.com/").domain).toBe("paypal.com");
    expect(parseUrl("https://paypa1.com/signin").domain).toBe("paypa1.com");
  });
});

// brands/lookalikes.txt (typed, never visited). The point of FR-13 for the lookalike checks:
// a real brand domain parses as itself, and a fake never parses as the real domain, whether
// it is a typo, a brand placed in a subdomain, or a disguised-letter (punycode) name.
describe("brands/lookalikes.txt", () => {
  const rows = lookalikes
    .split(String.fromCharCode(10))
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",") as [string, string, string]);

  it("has the 50 fake names", () => {
    expect(rows).toHaveLength(50);
  });

  it.each(rows)("%s is not %s", (fake, real) => {
    const fakeUrl = parseUrl("https://" + fake + "/");
    const realUrl = parseUrl("https://" + real + "/");
    expect(realUrl.domain).toBe(real);
    expect(realUrl.subdomain).toBeNull();
    expect(fakeUrl.domain).not.toBeNull();
    expect(fakeUrl.domain).not.toBe(real);
    expect(fakeUrl.hostname.endsWith(fakeUrl.domain as string)).toBe(true);
  });
});
