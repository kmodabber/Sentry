// Google Safe Browsing check (STY-63, STY-FR-09).
//
// Privacy: the page URL never leaves the browser. The check canonicalises the URL the way
// Google specifies, builds up to 30 host-suffix/path-prefix expressions, hashes each with
// SHA-256, and sends only the first 4 bytes of each hash to the Worker. The Worker answers
// with every full hash Google lists under those prefixes, and the comparison happens here.
// https://developers.google.com/safe-browsing/v4/urls-hashing

import type { Check, CheckResult } from "@sentry-ext/contracts";
import type { WorkerClient } from "../worker-client";

// --- Canonicalisation -------------------------------------------------------------------

const encoder = new TextEncoder();

/** Percent-decodes %XX byte by byte, repeatedly, until nothing changes. */
function unescapeFully(bytes: Uint8Array): Uint8Array {
  let current = bytes;
  for (;;) {
    const out: number[] = [];
    let changed = false;
    for (let i = 0; i < current.length; i++) {
      const b = current[i]!;
      if (b === 0x25 && i + 2 < current.length) {
        const hex = String.fromCharCode(current[i + 1]!, current[i + 2]!);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out.push(Number.parseInt(hex, 16));
          i += 2;
          changed = true;
          continue;
        }
      }
      out.push(b);
    }
    current = Uint8Array.from(out);
    if (!changed) return current;
  }
}

/** Escapes bytes <= 0x20, >= 0x7f, "#" and "%" as uppercase %XX; everything else stays. */
function escape(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out +=
      b <= 0x20 || b >= 0x7f || b === 0x23 || b === 0x25
        ? `%${b.toString(16).toUpperCase().padStart(2, "0")}`
        : String.fromCharCode(b);
  }
  return out;
}

/** One char per byte (true Latin-1), so escape() gets the exact bytes back. */
const bytesToString = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join("");
const unescapeToString = (s: string) => bytesToString(unescapeFully(encoder.encode(s)));
const escapeString = (s: string) => escape(Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff));

/** inet_aton style: 1 to 4 parts, each decimal, octal (0...) or hex (0x...). */
function parseIPv4(host: string): string | null {
  const parts = host.split(".");
  if (parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    let n: number;
    if (/^0x[0-9a-f]*$/i.test(p)) n = p.length === 2 ? 0 : Number.parseInt(p.slice(2), 16);
    else if (/^0[0-7]*$/.test(p)) n = Number.parseInt(p, 8);
    else if (/^[1-9][0-9]*$/.test(p)) n = Number.parseInt(p, 10);
    else return null;
    nums.push(n);
  }
  const last = nums.pop()!;
  if (nums.some((n) => n > 255) || last >= 256 ** (4 - nums.length)) return null;
  const bytes = [...nums];
  for (let i = 3 - nums.length; i >= 0; i--) bytes.push(Math.floor(last / 256 ** i) % 256);
  return bytes.join(".");
}

function canonicalHost(raw: string): { host: string; isIp: boolean } {
  let host = unescapeToString(raw).toLowerCase();
  host = host.replace(/^\.+|\.+$/g, "").replace(/\.{2,}/g, ".");
  const ip = parseIPv4(host);
  return ip ? { host: ip, isIp: true } : { host: escapeString(host), isIp: false };
}

/** Resolves "." and "..", and collapses runs of slashes. */
function canonicalPath(raw: string): string {
  const path = unescapeToString(raw || "/");
  const segments: string[] = [];
  const pieces = path.split("/");
  for (const piece of pieces) {
    if (piece === "" || piece === ".") continue;
    if (piece === "..") segments.pop();
    else segments.push(piece);
  }
  const last = pieces[pieces.length - 1];
  const trailing = segments.length > 0 && (last === "" || last === "." || last === "..");
  return escapeString(`/${segments.join("/")}${trailing ? "/" : ""}`);
}

export interface CanonicalUrl {
  scheme: string;
  host: string;
  isIp: boolean;
  /** Always starts with "/". */
  path: string;
  /** Without the "?"; null when the URL has no "?". */
  query: string | null;
}

/** Google's canonical form. Port, user info and fragment are dropped. */
export function canonicalize(input: string): CanonicalUrl {
  let url = input.replace(/[\t\r\n]/g, "").trim();
  const hash = url.indexOf("#");
  if (hash >= 0) url = url.slice(0, hash);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `http://${url}`;

  const schemeEnd = url.indexOf("://");
  const scheme = url.slice(0, schemeEnd).toLowerCase();
  const rest = url.slice(schemeEnd + 3);
  const authorityEnd = rest.search(/[/?]/);
  const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd);
  const afterAuthority = authorityEnd < 0 ? "" : rest.slice(authorityEnd);

  let hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  if (!hostPort.startsWith("[")) hostPort = hostPort.replace(/:\d*$/, "");

  const queryStart = afterAuthority.indexOf("?");
  const rawPath = queryStart < 0 ? afterAuthority : afterAuthority.slice(0, queryStart);
  const rawQuery = queryStart < 0 ? null : afterAuthority.slice(queryStart + 1);

  const { host, isIp } = canonicalHost(hostPort);
  return {
    scheme,
    host,
    isIp,
    path: canonicalPath(rawPath),
    query: rawQuery === null ? null : escapeString(unescapeToString(rawQuery)),
  };
}

/** The canonical URL as one string, e.g. "http://www.google.com/". */
export function canonicalString(input: string): string {
  const c = canonicalize(input);
  return `${c.scheme}://${c.host}${c.path}${c.query === null ? "" : `?${c.query}`}`;
}

// --- Expressions ------------------------------------------------------------------------

/**
 * Up to 5 hosts x 6 paths = 30 host-suffix/path-prefix expressions, no scheme:
 * the exact host plus up to 4 suffixes from the last 5 labels (never the TLD alone), and the
 * exact path with and without query plus up to 4 directory prefixes from the root.
 */
export function expressions(input: string): string[] {
  const { host, isIp, path, query } = canonicalize(input);

  const hosts = [host];
  if (!isIp) {
    const labels = host.split(".");
    for (let k = Math.min(5, labels.length - 1); k >= 2; k--) {
      hosts.push(labels.slice(-k).join("."));
    }
  }

  const paths = new Set<string>();
  if (query !== null) paths.add(`${path}?${query}`);
  paths.add(path);
  // Root plus directories, at most 4. The last piece is a file name, or "" after a slash.
  const dirs = path.slice(1).split("/").slice(0, -1).slice(0, 3);
  let prefix = "/";
  paths.add(prefix);
  for (const dir of dirs) {
    prefix += `${dir}/`;
    paths.add(prefix);
  }

  const out = new Set<string>();
  for (const h of hosts) for (const p of paths) out.add(`${h}${p}`);
  return [...out];
}

// --- Hashing and the cache --------------------------------------------------------------

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/** The prefix length sent to the Worker. */
export const PREFIX_BYTES = 4;
/**
 * How long "no full hash under this prefix" stays cached. C3 carries no negative cache
 * duration, so this uses the 5 minutes Google typically sends.
 */
export const NEGATIVE_CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX_PREFIXES = 2000;

interface PrefixEntry {
  /** Until then, a full hash missing from `listed` is known not to be listed. */
  checkedUntil: number;
  /** Full hashes Google listed under this prefix, each cached until its own expiry. */
  listed: { hash: string; threatTypes: string[]; expires: number }[];
}

// Most severe first: the reason shown is the first threat type found here.
const THREAT_ORDER = ["SOCIAL_ENGINEERING", "MALWARE", "UNWANTED_SOFTWARE"];

const REASONS: Record<string, string> = {
  SOCIAL_ENGINEERING: "Google Safe Browsing lists this page as a phishing site.",
  MALWARE: "Google Safe Browsing lists this page as spreading malware.",
  UNWANTED_SOFTWARE: "Google Safe Browsing lists this page as pushing unwanted software.",
};
const GENERIC_REASON = "Google Safe Browsing lists this page as unsafe.";

export interface SafeBrowsingOptions {
  /** For tests. */
  now?: () => number;
}

/** The real Safe Browsing check. Each instance keeps its own cache. */
export function createSafeBrowsingCheck(
  worker: Pick<WorkerClient, "safeBrowsing">,
  { now = Date.now }: SafeBrowsingOptions = {},
): Check {
  const cache = new Map<string, PrefixEntry>();

  function remember(prefix: string, entry: PrefixEntry) {
    cache.delete(prefix);
    if (cache.size >= CACHE_MAX_PREFIXES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(prefix, entry);
  }

  /** Listed threat types for a full hash from the cache, [] if known clean, null if unknown. */
  function fromCache(prefix: string, hash: string, t: number): string[] | null {
    const entry = cache.get(prefix);
    if (!entry) return null;
    const hit = entry.listed.find((l) => l.hash === hash && l.expires > t);
    if (hit) return hit.threatTypes;
    const staleHit = entry.listed.some((l) => l.hash === hash);
    return !staleHit && entry.checkedUntil > t ? [] : null;
  }

  return {
    id: "safebrowsing",
    timeoutMs: 2000,
    async check(url): Promise<CheckResult> {
      const base = { check: "safebrowsing" as const, ms: 0 };
      if (!/^https?:/i.test(url)) {
        return { ...base, signal: "skipped", points: 0, reason: null };
      }

      const hashed = await Promise.all(
        expressions(url).map(async (e) => {
          const full = await sha256(e);
          return { hash: toBase64(full), prefix: toBase64(full.subarray(0, PREFIX_BYTES)) };
        }),
      );

      const t = now();
      const threats = new Set<string>();
      const unknown = new Set<string>();
      for (const { hash, prefix } of hashed) {
        const cached = fromCache(prefix, hash, t);
        if (cached === null) unknown.add(prefix);
        else cached.forEach((x) => threats.add(x));
      }

      if (unknown.size > 0) {
        // Only 4-byte prefixes go out. A Worker error throws, and the pipeline marks it "error".
        const { fullHashes } = await worker.safeBrowsing([...unknown]);
        const answeredAt = now();
        for (const prefix of unknown) {
          remember(prefix, {
            checkedUntil: answeredAt + NEGATIVE_CACHE_MS,
            listed: fullHashes
              .filter((f) => f.hash.length > 0 && hashPrefix(f.hash) === prefix)
              .map((f) => ({
                hash: f.hash,
                threatTypes: f.threatTypes,
                expires: Date.parse(f.expiresAt) || answeredAt,
              })),
          });
        }
        // Compare locally: a full hash counts only if it equals one of ours.
        for (const { hash } of hashed) {
          for (const f of fullHashes)
            if (f.hash === hash) f.threatTypes.forEach((x) => threats.add(x));
        }
      }

      if (threats.size === 0) return { ...base, signal: "ok", points: 0, reason: null };
      const threatTypes = [
        ...THREAT_ORDER.filter((x) => threats.has(x)),
        ...[...threats].filter((x) => !THREAT_ORDER.includes(x)),
      ];
      return {
        ...base,
        signal: "danger",
        points: 100,
        feedHit: true,
        reason: REASONS[threatTypes[0]!] ?? GENERIC_REASON,
        evidence: { threatTypes },
        source: "google",
      };
    },
  };
}

function hashPrefix(fullHashBase64: string): string {
  const bytes = Uint8Array.from(atob(fullHashBase64), (c) => c.charCodeAt(0));
  return toBase64(bytes.subarray(0, PREFIX_BYTES));
}
