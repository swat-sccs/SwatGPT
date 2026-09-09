import { normalizeKey } from './normalize';

/** Legacy ITS residence codes as shipped in cygnet's `dorms.py`. */
const ITS_CODES: Readonly<Record<string, string>> = {
  ALICEP: 'Alice Paul',
  DANA: 'Dana',
  DKEMP: 'David Kemp',
  HAL: 'Hallowell',
  KYLE: 'Kyle',
  LODGES: 'Lodges',
  MERTZ: 'Mertz',
  ML: 'Mary Lyon',
  PALMER: 'Palmer',
  PARRSH: 'Parrish',
  PITT: 'Pittenger',
  ROBERT: 'Roberts',
  STRATH: 'Strathaven',
  WHARTN: 'Wharton',
  WILLET: 'Willets',
  WOOLMN: 'Woolman',
  WORTH: 'Worth',
};

/** Campus shorthand mapped to the normalized dorm name it refers to. */
const ALIASES: Readonly<Record<string, string>> = {
  ml: 'mary lyon',
  ap: 'alice paul',
  kemp: 'david kemp',
  dk: 'david kemp',
  ppr: 'ppr',
  pprs: 'ppr',
  hal: 'hallowell',
  pitt: 'pittenger',
  willet: 'willets',
  strath: 'strathaven',
  lodge: 'lodges',
  danawell: 'danawell',
};

const GENERIC_WORDS: ReadonlySet<string> = new Set(['hall', 'house', 'apartments', 'apts', 'dorm']);

/** Turns an ITS code or raw dorm string into a display label. */
export function dormLabel(raw: string): string {
  const trimmed = raw.trim();
  return ITS_CODES[trimmed.toUpperCase()] ?? trimmed;
}

export function dormAlias(key: string): string {
  return ALIASES[key] ?? key;
}

/** Normalized lookup keys a dorm label should answer to: its full name plus each distinctive word. */
export function dormKeys(label: string): string[] {
  const full = normalizeKey(label);
  const words = full.split(' ').filter((word) => !GENERIC_WORDS.has(word));
  return Array.from(new Set([full, ...words]));
}
