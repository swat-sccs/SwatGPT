const URL_PATTERN = /\bhttps?:\/\/[^\s<>()[\]"'`]+/gi;
const BARE_HOST_PATTERN = /(?<![\w./@-])(?:[a-z0-9-]+\.)+swarthmore\.edu(?:\/[^\s<>()[\]"'`]*)?/gi;
const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const PHONE_PATTERN = /(?<![\d-])\(?(\d{3})\)?[-. ]?(\d{3})[-. ](\d{4})(?![\d-])/g;
const EXTENSION_PATTERN = /(?<![\w-])(?:x|ext\.?)\s?(\d{4})(?!\d)/gi;
const CAMPUS_PREFIX = '610328';
const WIKI_HOST = 'kb.swarthmore.edu';
const TRAILING_PUNCTUATION = /[.,;:!?*_~]+$/;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Canonical comparison key for a URL: no scheme, `www.` or fragment, lowercase host,
 * percent-decoded path, no trailing punctuation or slash. Paths stay case-sensitive
 * except on the MediaWiki KB, where title case and `_` versus space are not significant.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(TRAILING_PUNCTUATION, '');
  const withoutScheme = trimmed.replace(/^https?:\/\//i, '').replace(/#.*$/, '');
  const slash = withoutScheme.indexOf('/');
  const host = (slash === -1 ? withoutScheme : withoutScheme.slice(0, slash))
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/:(80|443)$/, '');
  const decoded = slash === -1 ? '' : safeDecode(withoutScheme.slice(slash));
  const path = host === WIKI_HOST ? decoded.toLowerCase().replace(/_/g, ' ') : decoded;
  return `${host}${path}`.replace(/\/+$/, '').replace(TRAILING_PUNCTUATION, '');
}

export function hostOf(normalized: string): string {
  const slash = normalized.indexOf('/');
  return slash === -1 ? normalized : normalized.slice(0, slash);
}

/** URLs in `text`: explicit http(s) links plus bare `*.swarthmore.edu` hosts and paths. */
export function extractUrls(text: string): string[] {
  const explicit = text.match(URL_PATTERN) ?? [];
  const withoutExplicit = text.replace(URL_PATTERN, ' ');
  const bare = (withoutExplicit.match(BARE_HOST_PATTERN) ?? []).filter(
    (candidate) => !candidate.includes('@'),
  );
  const cleaned = [...explicit, ...bare].map((url) => url.replace(TRAILING_PUNCTUATION, ''));
  return [...new Set(cleaned)];
}

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_PATTERN) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase().replace(/\.+$/, '')))];
}

/**
 * Phone numbers as comparison keys: campus numbers (610-328-XXXX) collapse to their
 * extension `xXXXX`, so "x8513" and "610-328-8513" are the same number.
 */
export function extractPhones(text: string): string[] {
  const full = [...text.matchAll(PHONE_PATTERN)].map(([, area, exchange, line]) =>
    `${area}${exchange}` === CAMPUS_PREFIX ? `x${line}` : `${area}${exchange}${line}`,
  );
  const extensions = [...text.matchAll(EXTENSION_PATTERN)].map(([, line]) => `x${line}`);
  return [...new Set([...full, ...extensions])];
}

export interface KnownLinks {
  urls: Set<string>;
  hosts: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
}

export function emptyKnownLinks(): KnownLinks {
  return { urls: new Set(), hosts: new Set(), emails: new Set(), phones: new Set() };
}

export function addKnownText(known: KnownLinks, text: string): void {
  for (const url of extractUrls(text)) {
    const normalized = normalizeUrl(url);
    known.urls.add(normalized);
    known.hosts.add(hostOf(normalized));
  }
  for (const email of extractEmails(text)) {
    known.emails.add(email);
  }
  for (const phone of extractPhones(text)) {
    known.phones.add(phone);
  }
}

/**
 * A URL is known when it appears in the KB, or when it is a bare host (or host
 * root) of a URL that does. Anything else was constructed by the model.
 */
export function isKnownUrl(known: KnownLinks, url: string): boolean {
  const normalized = normalizeUrl(url);
  if (known.urls.has(normalized)) {
    return true;
  }
  return normalized === hostOf(normalized) && known.hosts.has(normalized);
}
