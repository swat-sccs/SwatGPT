const DIACRITICS = /[\u0300-\u036f]/g;
const CONTRACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bwhere['’]s\b/g, 'where is'],
  [/\bwho['’]s\b/g, 'who is'],
  [/\bwhat['’]s\b/g, 'what is'],
  [/\bwhich['’]s\b/g, 'which is'],
];
const SWARTHMORE_EMAIL = /@swarthmore\.edu\b/g;
const POSSESSIVE = /(['’])s\b/g;
const APOSTROPHE = /['’]/g;
const NON_WORD = /[^a-z0-9]+/g;

export function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(DIACRITICS, '');
}

/** Lowercases, expands question contractions, and strips diacritics; keeps punctuation for intent regexes. */
export function prepareQuestion(text: string): string {
  const lowered = stripDiacritics(text.toLowerCase()).replace(SWARTHMORE_EMAIL, '');
  return CONTRACTIONS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    lowered,
  )
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase alphanumeric tokens with possessives, apostrophes, and diacritics removed. */
export function tokenize(text: string): string[] {
  return stripDiacritics(text.toLowerCase())
    .replace(POSSESSIVE, '')
    .replace(APOSTROPHE, '')
    .split(NON_WORD)
    .filter(Boolean);
}

export function normalizeKey(text: string): string {
  return tokenize(text).join(' ');
}

/** Room keys ignore case, spacing, and leading zeros so "014", "14", and "A 14" compare sanely. */
export function normalizeRoom(room: string): string {
  return room
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+(?=\d)/, '');
}
