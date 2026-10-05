import { logger } from '@librechat/data-schemas';

/**
 * `prompt` rules screen only what the user typed; `any` rules also screen the
 * assistant reply. Replies routinely quote KB help text ("reset your password
 * for ...", CAPS crisis resources), so only rules that are wrong in any voice
 * run against them.
 */
export type KeywordScope = 'prompt' | 'any';

export interface KeywordRule {
  reason: string;
  pattern: RegExp;
  scope?: KeywordScope;
}

const PEERS =
  'roommates?|suitemates?|friends?|professors?|profs?|teachers?|tas|ta|ras?|ex|boyfriend|girlfriend|partner|classmates?|dean';
const PEER_TARGET = `(?:${PEERS})`;
const PERSON_TARGET = `(?:${PEERS}|family|mom|dad|mother|father|brother|sister|students?|kids?)`;
const STRANGER = '(?:someone(?: else)?|somebody(?: else)?|another (?:student|person|user))';
const SECRET = '(?:password|login|credentials|ssn|social security number|credit card(?: number)?)';

const MESSAGE_IDIOM =
  '(?!\\s+(?:an?\\s+)?(?:quick\\s+|short\\s+)?(?:e-?mails?|messages?|texts?|notes?|dms?|msgs?|line)\\b)';

const VIOLENCE_SOURCE =
  '\\b(?:(?:kill|shoot|stab|murder|bomb|attack|beat up)\\s+(?:him|her|them|you|everyone|everybody|people|someone|somebody|(?:my|the|that|this|his|her|their) ' +
  PERSON_TARGET +
  ')' +
  MESSAGE_IDIOM +
  '|school shooting|bring(?:ing)? a gun|(?:make|build|making|building) a bomb|blow up (?:the|a|my))\\b';

const CREDENTIAL_SOURCE =
  `\\b(?:(?:${STRANGER}|my ${PEER_TARGET})(?:['’]s|s['’]) ${SECRET}s?` +
  `|(?<!\\b(?:my|your|our) )(?:passwords?|login credentials|credentials|ssn|social security number|credit card number) (?:of|for) (?:${STRANGER}|the (?:registrar|dean)))\\b`;

/**
 * Curated screen applied when a generation is recorded; each matched `reason`
 * becomes one Flag. Deliberately high-precision: false positives cost reviewer
 * time, misses are caught by the manual flag path. Extend per deployment
 * through `OVERSIGHT_KEYWORDS` (those rules screen prompt and reply).
 */
export const KEYWORD_RULES: ReadonlyArray<KeywordRule> = [
  {
    reason: 'self-harm',
    scope: 'prompt',
    pattern:
      /\b(?:kill(?:ing)? myself|end(?:ing)? my (?:own )?life|want(?:ing)? to die|suicid(?:e|al)|hurt(?:ing)? myself|self[- ]harm|cut(?:ting)? myself|overdos(?:e|ing) on)\b/i,
  },
  {
    reason: 'violence',
    scope: 'prompt',
    pattern: new RegExp(VIOLENCE_SOURCE, 'i'),
  },
  {
    reason: 'harassment',
    scope: 'any',
    pattern:
      /\b(?:n[i1]gg(?:er|a)s?|f[a@]gg?[o0]ts?|k[i1]kes?|sp[i1]cs?|ch[i1]nks?|tr[a@]nn(?:y|ies)|r[e3]t[a@]rd(?:ed|s)?|wetbacks?|towelheads?)\b/i,
  },
  {
    reason: 'academic-integrity',
    scope: 'prompt',
    pattern:
      /\b(?:write my (?:essay|paper|thesis|homework|assignment|lab report) for|take my (?:exam|test|quiz|midterm|final) for me|answers? (?:to|for) the (?:midterm|final|exam|test|quiz)|do my (?:homework|assignment|problem set) for me)\b/i,
  },
  {
    reason: 'credential-extraction',
    scope: 'prompt',
    pattern: new RegExp(CREDENTIAL_SOURCE, 'i'),
  },
];

const RULE_SEPARATOR = ';';
const PAIR_SEPARATOR = '=';

/** Parses `reason=regex;reason2=regex2`; malformed pairs are logged and skipped. */
export function parseKeywordRules(raw: string | undefined): KeywordRule[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(RULE_SEPARATOR)
    .map(parseRule)
    .filter((rule): rule is KeywordRule => rule != null);
}

function parseRule(entry: string): KeywordRule | null {
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }
  const separatorAt = trimmed.indexOf(PAIR_SEPARATOR);
  if (separatorAt <= 0) {
    logger.warn(`[oversight] OVERSIGHT_KEYWORDS entry lacks "reason=regex": ${trimmed}`);
    return null;
  }
  const reason = trimmed.slice(0, separatorAt).trim();
  const source = trimmed.slice(separatorAt + 1).trim();
  if (!reason || !source) {
    logger.warn(`[oversight] OVERSIGHT_KEYWORDS entry is incomplete: ${trimmed}`);
    return null;
  }
  try {
    return { reason, pattern: new RegExp(source, 'i') };
  } catch (error) {
    logger.warn(`[oversight] OVERSIGHT_KEYWORDS regex for "${reason}" is invalid`, error);
    return null;
  }
}

let envRules: KeywordRule[] | undefined;

function allRules(): ReadonlyArray<KeywordRule> {
  envRules ??= parseKeywordRules(process.env.OVERSIGHT_KEYWORDS);
  return envRules.length ? KEYWORD_RULES.concat(envRules) : KEYWORD_RULES;
}

/** Clears the memoized `OVERSIGHT_KEYWORDS` rules. Exposed for tests only. */
export function resetKeywordRules(): void {
  envRules = undefined;
}

/**
 * Returns the de-duplicated reasons whose pattern matches; `[]` for empty input.
 * `prompt` is the user's text and is screened by every rule; `reply` (the
 * assistant's text) is screened only by rules scoped `any`.
 */
export function findKeywordFlags(prompt: string, reply?: string): string[] {
  const hasPrompt = Boolean(prompt?.trim());
  const hasReply = Boolean(reply?.trim());
  if (!hasPrompt && !hasReply) {
    return [];
  }
  const reasons = new Set<string>();
  for (const rule of allRules()) {
    if (reasons.has(rule.reason)) {
      continue;
    }
    const matched =
      (hasPrompt && rule.pattern.test(prompt)) ||
      (hasReply && rule.scope !== 'prompt' && rule.pattern.test(reply ?? ''));
    if (matched) {
      reasons.add(rule.reason);
    }
  }
  return Array.from(reasons);
}
