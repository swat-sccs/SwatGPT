import type { Fact, QuestionKind, Score } from './types.ts';
import type { KnownLinks } from './links.ts';
import { extractEmails, extractPhones, extractUrls, isKnownUrl, normalizeUrl } from './links.ts';

const NEGATION = "(?:does not|doesn't|do not|don't|did not|didn't)";
const COVERAGE_VERB =
  '(?:cover|include|mention|contain|say|specify|list|provide|address|state|have|indicate)';
const KNOWLEDGE =
  '(?:knowledge[- ]base|kb|context|entries|entry|sources?|documentation|reference material|information (?:i have|available|provided)|available information|provided information)';

/**
 * Phrases that decline because the KB does not cover the question. They must be
 * first-person or refer to the knowledge base: a confident "X is not included in
 * the College's licenses" is a claim, not a refusal.
 */
const REFUSAL_PATTERNS: readonly RegExp[] = [
  /\bi (?:do not|don't|couldn't|could not|can't|cannot|wasn't able to|was not able to|am unable to|'m unable to|am not able to|'m not able to) (?:find|confirm|see|locate|verify|know|tell|determine|say)\b/,
  /\bi (?:do not|don't) have (?:any )?(?:specific |current |up-to-date )?(?:information|details|data|records?)\b/,
  new RegExp(`\\b${KNOWLEDGE}\\b[^.]{0,80}?\\b${NEGATION} (?:appear to )?${COVERAGE_VERB}\\b`),
  new RegExp(
    `\\b(?:is not|isn't|are not|aren't|was not|wasn't) (?:covered|mentioned|listed|specified|addressed|stated|documented|included|found) in (?:the|my|any)[^.]{0,30}?${KNOWLEDGE}`,
  ),
  /\b(?:there is|there's|i have|i found) no (?:specific )?(?:information|details|mention|entry|entries|data|record)s? (?:about|on|regarding|for|of|in)\b/,
  /\bunable to (?:find|confirm|locate|verify|determine)\b/,
  /\bcould not be (?:found|confirmed|verified)\b/,
  /\bnot (?:in|part of|covered by) (?:the|my) (?:knowledge|provided|available)/,
];

const NUMERIC_CITATION = /\[\d+\](?!\()/;

const SEVERITY = {
  inventedUrl: 40,
  inventedEmail: 30,
  inventedPhone: 30,
  unanswerableAnswered: 25,
  noFacts: 20,
  missingFact: 5,
  uncitedSource: 2,
  numericCitation: 1,
} as const;

/** Lowercase, straight quotes and dashes, collapsed whitespace, no markdown emphasis. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const compact = (text: string): string => text.replace(/[\s"']/g, '').replace(/×/g, 'x');

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pattern for one fact alternative. A needle that starts or ends with a digit must not
 * continue a longer number, so "19" does not match "2019" and "2/1" does not match "2/15".
 */
function factPattern(needle: string): RegExp {
  const before = /^\d/.test(needle) ? '(?<!\\d|\\d[.,])' : '';
  const after = /\d$/.test(needle) ? '(?!\\d|[.,]\\d)' : '';
  return new RegExp(`${before}${escapeRegExp(needle)}${after}`);
}

/** True when any alternative appears in the answer, also comparing with spacing removed. */
export function matchesFact(answer: string, fact: Fact): boolean {
  const normalized = normalizeText(answer);
  const squeezed = compact(normalized);
  return fact.some((alternative) => {
    const needle = normalizeText(alternative);
    return factPattern(needle).test(normalized) || factPattern(compact(needle)).test(squeezed);
  });
}

export function isRefusal(answer: string): boolean {
  const normalized = normalizeText(answer);
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export interface ScoreInput {
  kind: QuestionKind;
  answer: string;
  facts: Fact[];
  expectedSources: string[];
  retrievedSources: string[];
  /** Trusted text the model was shown: system prompt, KB context and the user's own turns. */
  promptText: string;
  known: KnownLinks;
}

/**
 * Scores one answer. Answerable (and follow-up) questions pass when every expected
 * fact appears and no URL, email or phone number was invented; unanswerable ones pass
 * when the answer declines and invents nothing. A contact detail counts as invented
 * when it appears neither in the KB nor in the prompt the model saw.
 */
export function scoreAnswer(input: ScoreInput): Score {
  const { answer, facts, kind, known } = input;
  const missingFacts = facts.flatMap((fact, index) => (matchesFact(answer, fact) ? [] : [index]));
  const factsMatched = facts.length - missingFacts.length;
  const promptUrls = new Set(extractUrls(input.promptText).map(normalizeUrl));
  const promptEmails = new Set(extractEmails(input.promptText));
  const promptPhones = new Set(extractPhones(input.promptText));
  const urls = extractUrls(answer);
  const inventedUrls = urls.filter(
    (url) => !isKnownUrl(known, url) && !promptUrls.has(normalizeUrl(url)),
  );
  const emails = extractEmails(answer);
  const inventedEmails = emails.filter(
    (email) => !known.emails.has(email) && !promptEmails.has(email),
  );
  const phones = extractPhones(answer);
  const inventedPhones = phones.filter(
    (phone) => !known.phones.has(phone) && !promptPhones.has(phone),
  );
  const cited = new Set(urls.map(normalizeUrl));
  const hasAny = (sources: string[]): boolean =>
    sources.some((source) => cited.has(normalizeUrl(source)));
  const retrieved = new Set(input.retrievedSources.map(normalizeUrl));
  const refused = isRefusal(answer);
  const citedExpected = hasAny(input.expectedSources);
  const numericCitation = NUMERIC_CITATION.test(answer);
  const clean = !inventedUrls.length && !inventedEmails.length && !inventedPhones.length;
  const pass = kind === 'unanswerable' ? refused && clean : missingFacts.length === 0 && clean;
  const severity =
    inventedUrls.length * SEVERITY.inventedUrl +
    inventedEmails.length * SEVERITY.inventedEmail +
    inventedPhones.length * SEVERITY.inventedPhone +
    (kind === 'unanswerable' && !refused ? SEVERITY.unanswerableAnswered : 0) +
    (facts.length > 0 && factsMatched === 0 ? SEVERITY.noFacts : 0) +
    missingFacts.length * SEVERITY.missingFact +
    (kind !== 'unanswerable' && !citedExpected ? SEVERITY.uncitedSource : 0) +
    (numericCitation ? SEVERITY.numericCitation : 0);
  return {
    factsMatched,
    factsTotal: facts.length,
    missingFacts,
    refused,
    urls,
    inventedUrls,
    emails,
    inventedEmails,
    phones,
    inventedPhones,
    numericCitation,
    citedRetrieved: hasAny(input.retrievedSources),
    citedExpected,
    goldRetrieved: input.expectedSources.some((source) => retrieved.has(normalizeUrl(source))),
    pass,
    severity,
  };
}
