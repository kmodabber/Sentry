import { parse } from "tldts";
import type { ParsedUrl } from "@sentry-ext/contracts";
import { toUnicode } from "./punycode";

/**
 * Parse a page URL into the shared ParsedUrl shape (STY-FR-13). Throws on input that
 * isn't an absolute URL.
 *
 * Choices every check inherits:
 * - hostname is lowercase, punycode (ASCII) and has no trailing dot.
 * - domain and publicSuffix use the ICANN list only, so "foo.github.io" has domain
 *   "github.io". Free-hosting platforms are handled by the red-flag lists, not here.
 * - IPv6 hosts keep their brackets, and IPv4 shorthand ("0x7f.1") is normalised by
 *   the URL parser before tldts sees it.
 */
export function parseUrl(input: string): ParsedUrl {
  const url = new URL(input);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const info = parse(hostname);
  const userInfo = url.password ? `${url.username}:${url.password}` : url.username;
  return {
    href: url.href,
    protocol: url.protocol,
    hostname,
    domain: info.domain,
    publicSuffix: info.publicSuffix,
    subdomain: info.subdomain || null,
    isIp: info.isIp ?? false,
    path: url.pathname,
    port: url.port ? Number(url.port) : null,
    userInfo: userInfo || null,
    hostnameUnicode: toUnicode(hostname),
    isPunycode: hostname.split(".").some((label) => label.startsWith("xn--")),
  };
}
