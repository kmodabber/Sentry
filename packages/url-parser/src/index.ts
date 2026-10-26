import { parse } from "tldts";
import type { ParsedUrl } from "@sentry-ext/contracts";

/** Parse a page URL into the C4 shape. Throws on input that isn't a URL. */
export function parseUrl(input: string): ParsedUrl {
  const url = new URL(input);
  const info = parse(url.hostname);
  return {
    href: url.href,
    protocol: url.protocol,
    hostname: url.hostname.toLowerCase(),
    domain: info.domain,
    publicSuffix: info.publicSuffix,
    subdomain: info.subdomain || null,
    isIp: info.isIp ?? false,
    path: url.pathname,
  };
}
