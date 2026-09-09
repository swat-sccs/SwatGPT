import type { DirectoryEntry } from '@librechat/data-schemas';
import type { DirectoryIntent } from './intent';
import { dormAlias, dormKeys } from './dorms';
import { normalizeKey, normalizeRoom, tokenize } from './normalize';
import { nameVariants } from './nicknames';

export const MAX_PERSON_MATCHES = 5;
export const MAX_RESIDENTS = 40;

export interface DirectoryIndex {
  entries: ReadonlyArray<DirectoryEntry>;
  byFirst: ReadonlyMap<string, ReadonlyArray<number>>;
  byLast: ReadonlyMap<string, ReadonlyArray<number>>;
  byUid: ReadonlyMap<string, number>;
  byDorm: ReadonlyMap<string, ReadonlyArray<number>>;
  dorms: ReadonlyMap<string, string>;
}

export type DirectoryLookup =
  | {
      kind: 'person';
      query: string;
      matches: DirectoryEntry[];
      total: number;
      roommates?: DirectoryEntry[];
    }
  | {
      kind: 'place';
      dorm: string;
      room?: string;
      floor?: string;
      residents: DirectoryEntry[];
      total: number;
    };

const PLACE_STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'in',
  'at',
  'on',
  'of',
  'room',
  'rooms',
  'number',
  'no',
  'hall',
  'dorm',
  'building',
  'floor',
  'apartment',
  'apt',
  'unit',
  'campus',
  'this',
  'year',
  'semester',
]);
const MAX_NAME_TOKENS = 3;

function push(map: Map<string, number[]>, key: string, index: number): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(index);
    return;
  }
  map.set(key, [index]);
}

export function buildIndex(entries: ReadonlyArray<DirectoryEntry>): DirectoryIndex {
  const byFirst = new Map<string, number[]>();
  const byLast = new Map<string, number[]>();
  const byUid = new Map<string, number>();
  const byDorm = new Map<string, number[]>();
  const dorms = new Map<string, string>();
  entries.forEach((entry, index) => {
    byUid.set(entry.uid.toLowerCase(), index);
    for (const token of tokenize(entry.firstName)) {
      for (const variant of nameVariants(token)) {
        push(byFirst, variant, index);
      }
    }
    for (const token of tokenize(entry.lastName)) {
      push(byLast, token, index);
    }
    if (!entry.dorm) {
      return;
    }
    const dormKey = normalizeKey(entry.dorm);
    push(byDorm, dormKey, index);
    if (!dorms.has(dormKey)) {
      for (const key of dormKeys(entry.dorm)) {
        dorms.set(key, dormKey);
      }
    }
  });
  return { entries, byFirst, byLast, byUid, byDorm, dorms };
}

function intersect(
  a: ReadonlyArray<number> | undefined,
  b: ReadonlyArray<number> | undefined,
): number[] {
  if (!a || !b) {
    return [];
  }
  const set = new Set(b);
  return a.filter((index) => set.has(index));
}

/** Full-name hits (first+last or last+first) anywhere in the token list; safe to run over free text. */
function fullNameMatches(tokens: string[], index: DirectoryIndex): number[] {
  const found = new Set<number>();
  for (let i = 0; i + 1 < tokens.length; i++) {
    const first = tokens[i];
    for (let j = i + 1; j < Math.min(tokens.length, i + MAX_NAME_TOKENS); j++) {
      const last = tokens[j];
      for (const hit of intersect(index.byFirst.get(first), index.byLast.get(last))) {
        found.add(hit);
      }
      for (const hit of intersect(index.byFirst.get(last), index.byLast.get(first))) {
        found.add(hit);
      }
    }
  }
  return Array.from(found);
}

function singleTokenMatches(token: string, index: DirectoryIndex): number[] {
  const uidHit = index.byUid.get(token);
  if (uidHit !== undefined) {
    return [uidHit];
  }
  const firstHits = index.byFirst.get(token) ?? [];
  const lastHits = index.byLast.get(token) ?? [];
  return Array.from(new Set([...firstHits, ...lastHits]));
}

function nameTokens(span: string): string[] {
  return tokenize(span);
}

function looksLikeName(tokens: string[]): boolean {
  return (
    tokens.length > 0 &&
    tokens.length <= MAX_NAME_TOKENS &&
    tokens.every((token) => !/\d/.test(token))
  );
}

function sameRoom(a: DirectoryEntry, b: DirectoryEntry): boolean {
  return (
    a.uid !== b.uid &&
    !!a.dorm &&
    !!a.room &&
    a.dorm === b.dorm &&
    normalizeRoom(a.room) === normalizeRoom(b.room ?? '')
  );
}

function strongMatches(tokens: string[], index: DirectoryIndex): number[] {
  const byName = fullNameMatches(tokens, index);
  if (byName.length > 0 || tokens.length !== 1) {
    return byName;
  }
  const uidHit = index.byUid.get(tokens[0]);
  return uidHit === undefined ? [] : [uidHit];
}

function lookupPerson(
  intent: Extract<DirectoryIntent, { kind: 'person' }>,
  index: DirectoryIndex,
): DirectoryLookup | undefined {
  const tokens = nameTokens(intent.span);
  if (tokens.length === 0) {
    return undefined;
  }
  const strong = strongMatches(tokens, index);
  if (!intent.explicit && strong.length === 0) {
    return undefined;
  }
  const single = tokens.length === 1 ? singleTokenMatches(tokens[0], index) : [];
  const hits = strong.length > 0 ? strong : single;
  const query = tokens.join(' ');
  if (hits.length === 0 && !looksLikeName(tokens)) {
    return undefined;
  }
  const roommates = intent.roommates;
  const matches = hits.slice(0, MAX_PERSON_MATCHES).map((hit) => index.entries[hit]);
  const result: DirectoryLookup = { kind: 'person', query, matches, total: hits.length };
  if (!roommates || matches.length !== 1) {
    return result;
  }
  const person = matches[0];
  return {
    ...result,
    roommates: index.entries.filter((entry) => sameRoom(person, entry)),
  };
}

function resolveDorm(
  tokens: string[],
  index: DirectoryIndex,
): { dorm: string; rest: string[] } | undefined {
  for (let size = MAX_NAME_TOKENS; size >= 1; size--) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const key = dormAlias(tokens.slice(start, start + size).join(' '));
      const dorm = index.dorms.get(key);
      if (dorm) {
        return { dorm, rest: [...tokens.slice(0, start), ...tokens.slice(start + size)] };
      }
    }
  }
  return undefined;
}

const FLOOR_WORDS: ReadonlyArray<string> = ['first', 'second', 'third', 'fourth', 'fifth'];

function floorOf(room: string | undefined): string | undefined {
  return /\d/.exec(normalizeRoom(room ?? ''))?.[0];
}

function parseFloor(span: string): string | undefined {
  const ordinal = /\b(\d)(?:st|nd|rd|th)? floor\b/.exec(span);
  if (ordinal) {
    return ordinal[1];
  }
  const named = /\b(first|second|third|fourth|fifth) floor\b/.exec(span);
  return named ? String(FLOOR_WORDS.indexOf(named[1]) + 1) : undefined;
}

function lookupPlace(span: string, index: DirectoryIndex): DirectoryLookup | undefined {
  const tokens = tokenize(span).filter((token) => !PLACE_STOPWORDS.has(token));
  const resolved = resolveDorm(tokens, index);
  if (!resolved) {
    return undefined;
  }
  const dormEntries = (index.byDorm.get(resolved.dorm) ?? []).map((hit) => index.entries[hit]);
  const dorm = dormEntries[0]?.dorm ?? resolved.dorm;
  const floor = parseFloor(span);
  const roomToken =
    floor === undefined ? resolved.rest.find((token) => /\d/.test(token)) : undefined;
  if (roomToken !== undefined) {
    const room = normalizeRoom(roomToken);
    const residents = dormEntries.filter((entry) => normalizeRoom(entry.room ?? '') === room);
    return {
      kind: 'place',
      dorm,
      room: roomToken.toUpperCase(),
      residents,
      total: residents.length,
    };
  }
  if (floor !== undefined) {
    const residents = dormEntries.filter((entry) => floorOf(entry.room) === floor);
    return {
      kind: 'place',
      dorm,
      floor,
      residents: residents.slice(0, MAX_RESIDENTS),
      total: residents.length,
    };
  }
  return { kind: 'place', dorm, residents: [], total: dormEntries.length };
}

export function runLookup(
  intent: DirectoryIntent,
  index: DirectoryIndex,
): DirectoryLookup | undefined {
  if (intent.kind === 'place') {
    return lookupPlace(intent.span, index);
  }
  return lookupPerson(intent, index);
}
