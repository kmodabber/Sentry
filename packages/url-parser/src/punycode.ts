// Punycode decoding (RFC 3492). Written out here because the extension can't use node:url,
// and the decoded name is what the lookalike and disguised-letter checks compare.

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, first: boolean): number {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - T_MIN) * T_MAX) >> 1) {
    delta = Math.floor(delta / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * delta) / (delta + SKEW));
}

function digit(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x16; // 0-9 -> 26..35
  if (code >= 0x41 && code <= 0x5a) return code - 0x41; // A-Z
  if (code >= 0x61 && code <= 0x7a) return code - 0x61; // a-z
  return -1;
}

/** Decode one punycode string (without the "xn--" prefix). Returns null if it is malformed. */
function decode(input: string): string | null {
  const out: number[] = [];
  const basicEnd = input.lastIndexOf("-");
  for (let j = 0; j < Math.max(basicEnd, 0); j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) return null;
    out.push(c);
  }
  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let idx = basicEnd > 0 ? basicEnd + 1 : 0;
  while (idx < input.length) {
    const oldI = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (idx >= input.length) return null;
      const d = digit(input.charCodeAt(idx++));
      if (d < 0) return null;
      i += d * w;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (d < t) break;
      w *= BASE - t;
    }
    const len = out.length + 1;
    bias = adapt(i - oldI, len, oldI === 0);
    n += Math.floor(i / len);
    i %= len;
    if (n > 0x10ffff) return null;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

/** Decode every "xn--" label of a hostname. Labels that fail to decode are left as they are. */
export function toUnicode(hostname: string): string {
  return hostname
    .split(".")
    .map((label) => {
      if (!label.startsWith("xn--")) return label;
      return decode(label.slice(4)) ?? label;
    })
    .join(".");
}
