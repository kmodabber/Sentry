// STY-FR-32: splits a checked domain into the part it shares with the brand it's
// imitating and the part that's tricky, so the popup can highlight the latter.

export interface DomainHighlight {
  prefix: string;
  tricky: string;
  suffix: string;
}

export function highlightDomain(host: string, brand: string): DomainHighlight {
  const max = Math.min(host.length, brand.length);

  let prefixLen = 0;
  while (prefixLen < max && host[prefixLen] === brand[prefixLen]) prefixLen++;

  let suffixLen = 0;
  while (
    suffixLen < max - prefixLen &&
    host[host.length - 1 - suffixLen] === brand[brand.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  return {
    prefix: host.slice(0, prefixLen),
    tricky: host.slice(prefixLen, host.length - suffixLen),
    suffix: host.slice(host.length - suffixLen),
  };
}
