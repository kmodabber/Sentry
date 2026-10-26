import { describe, expect, it } from "vitest";
import { parseUrl } from "../src";

// Starter cases. Brandon grows this into the 100-case parsing table (STY-FR-13).
describe("parseUrl", () => {
  it("splits subdomain, domain and suffix", () => {
    const p = parseUrl("https://login.paypa1.com/signin");
    expect(p.hostname).toBe("login.paypa1.com");
    expect(p.domain).toBe("paypa1.com");
    expect(p.subdomain).toBe("login");
    expect(p.publicSuffix).toBe("com");
    expect(p.path).toBe("/signin");
  });

  it("handles multi-part suffixes", () => {
    expect(parseUrl("https://www.example.co.uk/").domain).toBe("example.co.uk");
  });

  it("flags IP hosts", () => {
    expect(parseUrl("http://192.0.2.10/login").isIp).toBe(true);
  });

  it("rejects input that isn't a URL", () => {
    expect(() => parseUrl("not a url")).toThrow();
  });
});
