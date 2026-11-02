// Parsed URL: Brandon's parser output, shared by checks and features. Not a numbered
// contract in doc 05 (C4 there is the brand list), but changes still go through a contract/ PR.

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
