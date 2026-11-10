// C3 fixtures: Google's Safe Browsing test pages. Owner Mo.
// Shared by the fake Worker (STY-108), the stand-in Safe Browsing check and STY-63's tests,
// so all three hash exactly the same strings. Typed only, never visited.

export interface SbTestUrl {
  /** The page to type into a test, e.g. in the popup. */
  url: string;
  /** The canonical Safe Browsing expression (host + path, no scheme) that Google lists. */
  expression: string;
  threatType: "SOCIAL_ENGINEERING" | "MALWARE" | "UNWANTED_SOFTWARE";
}

export const SB_TEST_URLS: readonly SbTestUrl[] = [
  {
    url: "https://testsafebrowsing.appspot.com/s/phishing.html",
    expression: "testsafebrowsing.appspot.com/s/phishing.html",
    threatType: "SOCIAL_ENGINEERING",
  },
  {
    url: "https://testsafebrowsing.appspot.com/s/malware.html",
    expression: "testsafebrowsing.appspot.com/s/malware.html",
    threatType: "MALWARE",
  },
  {
    url: "https://testsafebrowsing.appspot.com/s/unwanted.html",
    expression: "testsafebrowsing.appspot.com/s/unwanted.html",
    threatType: "UNWANTED_SOFTWARE",
  },
];
