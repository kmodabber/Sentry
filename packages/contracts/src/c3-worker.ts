// C3 Worker API: extension <-> Cloudflare Worker. v0, doc 05 section 3. Owner Mo.
// JSON over HTTPS. The Worker never receives a full URL: only hash prefixes or a hostname.

export const WORKER_ROUTES = {
  /** POST SafeBrowsingRequest -> SafeBrowsingResponse */
  safeBrowsing: "/v1/sb",
  /** GET, hostname in the path -> HostResponse. Use hostRoute() to build it. */
  hostPrefix: "/v1/host/",
  /** GET -> OpenPhishResponse */
  openPhish: "/v1/feeds/openphish",
} as const;

export const hostRoute = (hostname: string) =>
  `${WORKER_ROUTES.hostPrefix}${encodeURIComponent(hostname)}`;

export const SB_MAX_PREFIXES = 30;
export const RATE_LIMIT_PER_MINUTE = 60;
/** How long the Worker caches a host answer. */
export const HOST_CACHE_SECONDS = 24 * 60 * 60;
/** How often the Worker refreshes the OpenPhish list. */
export const OPENPHISH_REFRESH_SECONDS = 12 * 60 * 60;

export interface SafeBrowsingRequest {
  /** Base64 SHA-256 hash prefixes, up to SB_MAX_PREFIXES. */
  prefixes: string[];
}
export interface SafeBrowsingResponse {
  fullHashes: {
    /** Base64 full SHA-256 hash; the extension compares locally. */
    hash: string;
    threatTypes: string[];
    /** ISO 8601. The extension may cache the answer until then. */
    expiresAt: string;
  }[];
}

export interface HostResponse {
  /** Null when the host is not listed on URLhaus. */
  urlhaus: { threat: string; urlCount: number } | null;
  /** ISO 8601 registration date from RDAP, or null when unknown. */
  registeredAt: string | null;
  /** Whether RDAP answered at all, so "unknown" is not mistaken for "new". */
  rdap: boolean;
}

export interface OpenPhishResponse {
  /** ISO 8601. */
  updatedAt: string;
  urls: string[];
}

export type WorkerErrorCode =
  | "bad_request"
  | "not_found"
  | "method_not_allowed"
  | "rate_limited"
  | "upstream_down"
  | "not_implemented";

/** Every non-2xx body. 429 carries retryAfter; 503 means an upstream is down. */
export interface WorkerError {
  error: WorkerErrorCode;
  message: string;
  /** Seconds, on 429 only. Also sent as the Retry-After header. */
  retryAfter?: number;
}
