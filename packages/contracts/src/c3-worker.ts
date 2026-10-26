// C3 Worker API: extension <-> Cloudflare Worker. Draft v0, see docs/contracts/C3.md.
// Full URLs never leave the device: only hash prefixes or a host.

export const C3_VERSION = "c3.v0";

export interface HealthResponse {
  ok: true;
  version: string;
}

export interface SafeBrowsingRequest {
  /** Base64, 4 bytes each. */
  hashPrefixes: string[];
}
export interface SafeBrowsingResponse {
  matches: { fullHash: string; threatType: string }[];
}

export interface UrlhausRequest {
  host: string;
}
export interface UrlhausResponse {
  listed: boolean;
  threat?: string;
}

export interface DomainAgeRequest {
  registrableDomain: string;
}
export interface DomainAgeResponse {
  /** ISO 8601, or null when unknown. */
  createdAt: string | null;
}

export interface WorkerError {
  error: { code: string; message: string };
}

export const WORKER_ROUTES = {
  health: "/health",
  safeBrowsing: "/v0/safebrowsing",
  openPhish: "/v0/openphish",
  urlhaus: "/v0/urlhaus",
  domainAge: "/v0/domain-age",
} as const;
