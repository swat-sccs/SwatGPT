import { prepareQuestion, tokenize } from './normalize';

export type DirectoryIntent =
  | { kind: 'person'; span: string; roommates: boolean; explicit: boolean }
  | { kind: 'place'; span: string };

const HOUSING_GATE =
  /\b(live|lives|living|lived|dorm|dorms|dormed|room|rooms|rooming|roommate|roommates|housing|reside|resides|residence|hall|building|stay|stays|staying|find|neighbor|neighbors|where (?:is|are))\b/;

const ROOMMATE_PATTERNS: ReadonlyArray<RegExp> = [
  /who (?:lives|rooms|stays|is rooming|is living|is) with (.+)$/,
  /([a-z0-9]+(?: [a-z0-9]+){0,4})['’]s? roommates?\b/,
  /roommates? (?:of|for) (.+)$/,
];

const PLACE_PATTERNS: ReadonlyArray<RegExp> = [
  /who(?: all| else)? (?:lives|live|is living|are living|stays|is staying|is|are) (?:in|at|on) (.+)$/,
  /who(?: all)? (?:lives|live) (.+)$/,
  /(?:residents|people|students) (?:of|in|living in) (.+)$/,
];

/** Phrasings that unambiguously ask where a person lives; a miss is worth reporting. */
const PERSON_PATTERNS: ReadonlyArray<RegExp> = [
  /where (?:does|do|did|is|are|would|will|might) (.+?) (?:live|lives|living|stay|stays|staying|reside|resides|residing|dorm|dorms|dorming|room|rooming|located)\b/,
  /where (?:does|do|did|is|are) (.+?) (?:live|stay|reside) (?:on campus|this year|this semester|now)\b/,
  /(?:what|which) (?:dorm|room|building|hall|residence hall|dorm room|house) (?:is|does|do|did|are|has|have) (.+?) (?:in|live in|living in|stay in|staying in|reside in|at|located in)\b/,
  /(?:what|which) (?:dorm|room|building|hall|residence hall|dorm room|house) (?:is|does|do|are) (.+)$/,
  /([a-z0-9]+(?: [a-z0-9]+){0,4})['’]s? (?:dorm|room|dorm room|building|housing|residence|hall|room number|address)\b/,
  /(?:dorm|room|dorm room|housing|residence|room number|address) (?:of|for) (.+)$/,
  /(?:find|locate|look up|lookup) (.+?) (?:in the )?(?:dorm|room|directory|housing)\b/,
];

/** Phrasings that may be about a person or a building; only a confident name hit counts. */
const LOOSE_PERSON_PATTERNS: ReadonlyArray<RegExp> = [
  /where (?:can|could|do|would) (?:i|we|you|one) find (.+)$/,
  /where (?:is|are) (.+)$/,
];

/** Question lead-ins that precede a name in a span such as "what is jane doe". */
const LEAD_STOPWORDS: ReadonlySet<string> = new Set([
  'what',
  'whats',
  'is',
  'are',
  'where',
  'who',
  'whos',
  'tell',
  'me',
  'know',
  'do',
  'does',
  'did',
  'you',
  'can',
  'could',
  'would',
  'i',
  'we',
  'find',
  'show',
  'give',
  'about',
  'of',
  'for',
  'if',
  'info',
  'information',
  'on',
  'please',
  'exactly',
  'the',
  'a',
  'an',
  'my',
  'our',
  'his',
  'her',
  'their',
  'this',
  'that',
  'friend',
  'friends',
  'student',
  'students',
  'someone',
  'somebody',
  'person',
  'named',
  'called',
  'name',
  'classmate',
  'swattie',
  'freshman',
  'sophomore',
  'junior',
  'senior',
  'one',
  'guy',
  'girl',
  'kid',
]);
/** Descriptors that trail a name, such as "jane doe the freshman" or "jane doe 27". */
const TRAIL_STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'freshman',
  'sophomore',
  'junior',
  'senior',
  'student',
  'students',
  'please',
  'exactly',
  'currently',
  'actually',
  'now',
  'on',
  'campus',
  'at',
  'swarthmore',
  'swat',
  'this',
  'year',
  'semester',
  'from',
  'class',
  'of',
  'in',
  'here',
  'right',
]);
function trimEdges(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && LEAD_STOPWORDS.has(tokens[start])) {
    start++;
  }
  while (end > start && (TRAIL_STOPWORDS.has(tokens[end - 1]) || /^\d+$/.test(tokens[end - 1]))) {
    end--;
  }
  return tokens.slice(start, end);
}

/** Reduces a captured span to the tokens that can be a name, e.g. "what is jane doe 27" → "jane doe". */
function nameSpan(capture: string): string {
  return trimEdges(tokenize(capture)).join(' ');
}

function firstCapture(text: string, patterns: ReadonlyArray<RegExp>): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

/**
 * Classifies a user message as a housing-directory question and extracts the
 * span naming the person or place. Cheap enough to run on every message: a
 * keyword gate rejects most text before any regex runs.
 */
export function detectIntent(text: string): DirectoryIntent | undefined {
  const question = prepareQuestion(text);
  if (!question || !HOUSING_GATE.test(question)) {
    return undefined;
  }
  const roommateSpan = firstCapture(question, ROOMMATE_PATTERNS);
  if (roommateSpan) {
    return { kind: 'person', span: nameSpan(roommateSpan), roommates: true, explicit: true };
  }
  const placeSpan = firstCapture(question, PLACE_PATTERNS);
  if (placeSpan) {
    return { kind: 'place', span: placeSpan };
  }
  const personSpan = firstCapture(question, PERSON_PATTERNS);
  if (personSpan) {
    return { kind: 'person', span: nameSpan(personSpan), roommates: false, explicit: true };
  }
  const looseSpan = firstCapture(question, LOOSE_PERSON_PATTERNS);
  if (looseSpan) {
    return { kind: 'person', span: nameSpan(looseSpan), roommates: false, explicit: false };
  }
  return undefined;
}
