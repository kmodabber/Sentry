import {
  hostRoute,
  WORKER_ROUTES,
  type HostResponse,
  type OpenPhishResponse,
  type SafeBrowsingResponse,
  type WorkerError,
  type WorkerErrorCode,
} from "@sentry-ext/contracts";

/** A non-2xx answer from the Worker. Checks let it throw: the pipeline turns it into "error". */
export class WorkerRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: WorkerErrorCode | "network",
    message: string,
  ) {
    super(message);
    this.name = "WorkerRequestError";
  }
}

export interface WorkerClient {
  /** Base64 SHA-256 prefixes in, full hashes out. The Worker never sees a URL. */
  safeBrowsing(prefixes: string[]): Promise<SafeBrowsingResponse>;
  /** Hostname only, never a full URL. */
  host(hostname: string): Promise<HostResponse>;
  openPhish(): Promise<OpenPhishResponse>;
}

/** Typed C3 client. `fetchImpl` is for tests. */
export function createWorkerClient(baseUrl: string, fetchImpl: typeof fetch = fetch): WorkerClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, init);
    } catch {
      throw new WorkerRequestError(0, "network", "Couldn't reach the PhishClaw Worker.");
    }
    if (res.ok) return (await res.json()) as T;
    const body = (await res.json().catch(() => null)) as WorkerError | null;
    throw new WorkerRequestError(
      res.status,
      body?.error ?? "upstream_down",
      body?.message ?? `Worker answered ${res.status}.`,
    );
  }

  return {
    safeBrowsing: (prefixes) =>
      call(WORKER_ROUTES.safeBrowsing, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefixes }),
      }),
    host: (hostname) => call(hostRoute(hostname)),
    openPhish: () => call(WORKER_ROUTES.openPhish),
  };
}
