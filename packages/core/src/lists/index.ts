// Static lookup lists for red_flags (STY-71) and, later, the known-sites check (STY-FR-19).
// Parsed once at module load, not per check -- ES modules only evaluate once per process.
import abusedTldsRaw from "./abused_tlds.txt?raw";
import shortenersRaw from "./shorteners.txt?raw";
import hostingPlatformsRaw from "./hosting_platforms.txt?raw";

function parseList(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.toLowerCase());
}

export const ABUSED_TLDS: ReadonlySet<string> = new Set(parseList(abusedTldsRaw));
export const SHORTENERS: ReadonlySet<string> = new Set(parseList(shortenersRaw));
/** Kept as an array, not a Set: matching needs to check host-suffix, not just exact equality. */
export const HOSTING_PLATFORMS: readonly string[] = parseList(hostingPlatformsRaw);
