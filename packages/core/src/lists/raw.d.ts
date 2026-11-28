// Lets src import a text file with Vite's "?raw" suffix (same pattern already used by
// packages/url-parser/test/raw.d.ts, here extended to runtime code, not just tests).
declare module "*?raw" {
  const text: string;
  export default text;
}
