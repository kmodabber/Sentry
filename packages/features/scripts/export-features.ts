/**
 * Node feature export (STY-77). Builds the training table for Python from the SAME code
 * the extension runs, so training and the browser compute identical features.
 *
 * Input:  JSON Lines, one object per URL with at least a "url" field. Other fields (label,
 *         date, ...) are copied through to the output.
 * Output: CSV with a "row" column (line number in the input), the copied fields, then the
 *         C5 features in spec order. Plus <output>.meta.json with the spec hash and counts.
 *
 * URLs that won't parse (C5: no features) are dropped and counted. This script never prints
 * or writes a URL (doc 09); keep both files in data/ (gitignored).
 *
 * Usage (from the repo root):
 *   pnpm --filter @sentry-ext/features export ../../data/in.jsonl ../../data/features.csv
 */
import { createReadStream, createWriteStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { extractFeatures } from "../src/extract";
import { FEATURE_NAMES, SPEC_HASH } from "../src/spec";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

async function main(inPath: string, outPath: string): Promise<void> {
  const out = createWriteStream(outPath, { encoding: "utf-8" });
  const lines = createInterface({
    input: createReadStream(inPath, "utf-8"),
    crlfDelay: Infinity,
  });

  let passthrough: string[] | null = null;
  let total = 0;
  let kept = 0;
  let dropped = 0;
  let row = 0;

  for await (const line of lines) {
    row += 1;
    if (!line.trim()) continue;
    total += 1;
    const record = JSON.parse(line) as Record<string, unknown>;
    if (passthrough === null) {
      passthrough = Object.keys(record).filter((k) => k !== "url");
      out.write(["row", ...passthrough, ...FEATURE_NAMES].join(",") + "\n");
    }
    const vector = typeof record.url === "string" ? extractFeatures(record.url) : null;
    if (vector === null) {
      dropped += 1;
      continue;
    }
    kept += 1;
    const cells = [row, ...passthrough.map((k) => record[k]), ...vector];
    out.write(cells.map(csvCell).join(",") + "\n");
  }
  await new Promise<void>((resolve) => out.end(resolve));

  const meta = {
    specHash: SPEC_HASH,
    features: FEATURE_NAMES,
    total,
    kept,
    droppedUnparseable: dropped,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(`${outPath}.meta.json`, JSON.stringify(meta, null, 2) + "\n");
  console.log(
    `rows=${total} kept=${kept} dropped_unparseable=${dropped} spec=${SPEC_HASH.slice(0, 8)}`,
  );
}

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: export-features <in.jsonl> <out.csv>");
  process.exit(2);
}
await main(inPath, outPath);
