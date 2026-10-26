// C4 Parsed URL: Brandon's parser output. Placeholder until Brandon's C4 draft lands.

export interface ParsedUrl {
  href: string;
  protocol: string;
  /** Full hostname, lowercased, e.g. "login.paypa1.com". */
  hostname: string;
  /** Registrable domain, e.g. "paypa1.com". Null for IPs and unknown suffixes. */
  domain: string | null;
  /** Public suffix, e.g. "com" or "co.uk". */
  publicSuffix: string | null;
  subdomain: string | null;
  isIp: boolean;
  path: string;
}
