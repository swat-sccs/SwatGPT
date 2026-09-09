import { logger } from '@librechat/data-schemas';

export interface KeywordRule {
  reason: string;
  pattern: RegExp;
}

/**
 * Curated screen applied to the user prompt and assistant reply when a
 * generation is recorded; each matched `reason` becomes one Flag. Deliberately
 * high-precision: false positives cost reviewer time, misses are caught by the
 * manual flag path. Extend per deployment through `OVERSIGHT_KEYWORDS`.
 */
export const KEYWORD_RULES: ReadonlyArray<KeywordRule> = [
  {
    reason: 'self-harm',
    pattern:
      /\b(?:kill(?:ing)? myself|end(?:ing)? my (?:own )?life|want(?:ing)? to die|suicid(?:e|al)|hurt(?:ing)? myself|self[- ]harm|cut(?:ting)? myself|overdos(?:e|ing) on)\b/i,
  },
  {
    reason: 'violence',
    pattern:
      /\b(?:(?:kill|shoot|stab|murder|bomb|attack|beat up)\s+(?:him|her|them|you|everyone|everybody|people|someone|my \w+|the \w+)|school shooting|bring(?:ing)? a gun|(?:make|build|making|building) a bomb|blow up (?:the|a|my))\b/i,
  },
  {
    reason: 'harassment',
    pattern:
      /\b(?:n[i1]gg(?:er|a)s?|f[a@]gg?[o0]ts?|k[i1]kes?|sp[i1]cs?|ch[i1]nks?|tr[a@]nn(?:y|ies)|r[e3]t[a@]rd(?:ed|s)?|wetbacks?|towelheads?)\b/i,
  },
  {
    reason: 'academic-integrity',
    pattern:
      /\b(?:write my (?:essay|paper|thesis|homework|assignment|lab report) for|take my (?:exam|test|quiz|midterm|final) for me|answers? (?:to|for) the (?:midterm|final|exam|test|quiz)|do my (?:homework|assignment|problem set) for me)\b/i,
  },
  {
    reason: 'credential-extraction',
    pattern:
      /\b(?:passwords? (?:for|of|to)|social security number|ssn (?:of|for)|credit card number|login credentials (?:for|of)|api key (?:for|of))\b/i,
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

/** Returns the de-duplicated reasons whose pattern matches `text`; `[]` for empty input. */
export function findKeywordFlags(text: string): string[] {
  if (!text || !text.trim()) {
    return [];
  }
  const reasons = new Set<string>();
  for (const rule of allRules()) {
    if (rule.pattern.test(text)) {
      reasons.add(rule.reason);
    }
  }
  return Array.from(reasons);
}
