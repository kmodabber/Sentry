// Whole-word matching for a brand keyword against a hostname or path (STY-67 review).
//
// A naive "contains" check flags unrelated text that merely has the keyword as a run of
// letters inside a longer word: "chase" inside "purchase", "irs" inside "shirts" or "affairs",
// "cra" inside "craigslist" or "crafts". Splitting on the delimiters a hostname or URL path
// actually uses, and matching whole segments only, avoids that false alarm while still
// catching the real pattern (chase-secure-login.com, login.chase.com.verify.net).

const DELIMITERS = /[.\-/]+/;

/** True if `keyword` appears as a whole dot/hyphen/slash-separated segment of `text`. */
export function matchesBrandKeyword(text: string, keyword: string): boolean {
  const segments = text.toLowerCase().split(DELIMITERS);
  return segments.includes(keyword.toLowerCase());
}
