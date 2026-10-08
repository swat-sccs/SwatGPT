import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ScoreInput } from '../lib/score.ts';
import { isRefusal, matchesFact, scoreAnswer } from '../lib/score.ts';
import { addKnownText, emptyKnownLinks } from '../lib/links.ts';

const known = emptyKnownLinks();
addKnownText(
  known,
  'https://kb.swarthmore.edu/wiki/Help_Desk_Hours_of_Operation support.swarthmore.edu phishing@swarthmore.edu x8513',
);

const HELP_DESK = 'https://kb.swarthmore.edu/wiki/Help_Desk_Hours_of_Operation';

const input = (overrides: Partial<ScoreInput>): ScoreInput => ({
  kind: 'answerable',
  answer: '',
  facts: [],
  expectedSources: [HELP_DESK],
  retrievedSources: [HELP_DESK],
  promptText: '',
  known,
  ...overrides,
});

describe('matchesFact', () => {
  it('matches any alternative regardless of case, emphasis and spacing', () => {
    assert.equal(matchesFact('Call **X8513** anytime', ['x8513', '610-328-8513']), true);
    assert.equal(matchesFact('Pick the 48 × 35 preset', ['48x35']), true);
    assert.equal(matchesFact('It is open until 3:30', ['12:30']), false);
  });

  it('does not match a number inside a longer number', () => {
    assert.equal(matchesFact('Firebird has 19 GPUs.', ['19']), true);
    assert.equal(matchesFact('It was upgraded in 2019.', ['19']), false);
    assert.equal(matchesFact('Drop/add ends 2/15.', ['2/1']), false);
    assert.equal(matchesFact('Opens at 19:30', ['9:30']), false);
    assert.equal(matchesFact('A 0.1 credit lab', ['1 credit']), false);
    assert.equal(matchesFact('It costs $1,300.', ['300']), false);
    assert.equal(matchesFact('Up to 300 participants.', ['300']), true);
    assert.equal(matchesFact('Ten to 12 courses', ['12']), true);
  });
});

describe('isRefusal', () => {
  it('recognizes common ways of saying the KB does not cover something', () => {
    assert.equal(isRefusal("I couldn't find that in the knowledge base."), true);
    assert.equal(isRefusal('The provided context doesn’t mention a pager number.'), true);
    assert.equal(isRefusal('There is no information about Windows 12.'), true);
    assert.equal(isRefusal('I do not have information on who won in 2026.'), true);
    assert.equal(isRefusal('Call the Help Desk at x8513.'), false);
  });

  it('does not mistake a confident negative claim for a refusal', () => {
    assert.equal(
      isRefusal("No, Spotify Premium is not included in the College's institutional licenses."),
      false,
    );
    assert.equal(isRefusal("The guide doesn't say much, but Firebird costs $1 per hour."), false);
  });
});

describe('scoreAnswer', () => {
  it('passes an answer with every fact and a cited retrieved source', () => {
    const score = scoreAnswer(
      input({ answer: `Call x8513 ([Help Desk](${HELP_DESK})).`, facts: [['x8513']] }),
    );
    assert.equal(score.pass, true);
    assert.equal(score.citedExpected, true);
    assert.equal(score.citedRetrieved, true);
    assert.deepEqual(score.inventedUrls, []);
  });

  it('flags a constructed URL even when the facts are right', () => {
    const score = scoreAnswer(
      input({
        answer: 'Call x8513 or see https://www.swarthmore.edu/its/helpdesk-hours.',
        facts: [['x8513']],
      }),
    );
    assert.equal(score.pass, false);
    assert.deepEqual(score.inventedUrls, ['https://www.swarthmore.edu/its/helpdesk-hours']);
  });

  it('accepts bare hosts of KB links and wiki URLs that differ only in case or underscores', () => {
    const score = scoreAnswer(
      input({
        answer:
          'Open a ticket at support.swarthmore.edu or read https://kb.swarthmore.edu/wiki/Help_desk_hours_of_operation.',
      }),
    );
    assert.deepEqual(score.inventedUrls, []);
    assert.equal(score.citedExpected, true);
  });

  it('treats URLs and emails shown in the prompt as known', () => {
    const score = scoreAnswer(
      input({
        answer: 'Email registrar@swarthmore.edu or visit https://example.org/x.',
        promptText: 'contact registrar@swarthmore.edu, see https://example.org/x',
      }),
    );
    assert.deepEqual(score.inventedUrls, []);
    assert.deepEqual(score.inventedEmails, []);
  });

  it('flags invented email addresses', () => {
    const score = scoreAnswer(input({ answer: 'Email firebird-admin@swarthmore.edu.' }));
    assert.deepEqual(score.inventedEmails, ['firebird-admin@swarthmore.edu']);
  });

  it('flags phone numbers that are not in the KB, treating x8513 and 610-328-8513 as one', () => {
    const phones = emptyKnownLinks();
    addKnownText(phones, 'Call x8513 or Public Safety at 610-328-8333.');
    const grounded = scoreAnswer(
      input({ answer: 'Call 610-328-8513 or x8333.', known: phones, facts: [] }),
    );
    const invented = scoreAnswer(
      input({ answer: 'Call the Firebird pager at 610-328-9999.', known: phones }),
    );
    assert.deepEqual(grounded.inventedPhones, []);
    assert.deepEqual(invented.inventedPhones, ['x9999']);
    assert.equal(invented.pass, false);
  });

  it('notices [n] entry citations, which users cannot follow', () => {
    assert.equal(
      scoreAnswer(input({ answer: 'Classes begin January 19 [1][2].' })).numericCitation,
      true,
    );
    assert.equal(
      scoreAnswer(input({ answer: `See [Help Desk](${HELP_DESK}).` })).numericCitation,
      false,
    );
  });

  it('passes an unanswerable question only when the model declines', () => {
    const declined = scoreAnswer(
      input({
        kind: 'unanswerable',
        expectedSources: [],
        answer: "I couldn't find Firebird pricing; contact ITS.",
      }),
    );
    const guessed = scoreAnswer(
      input({
        kind: 'unanswerable',
        expectedSources: [],
        answer: 'Firebird costs $0.02 per core-hour.',
      }),
    );
    assert.equal(declined.pass, true);
    assert.equal(guessed.pass, false);
    assert.ok(guessed.severity > declined.severity);
  });

  it('ranks invented URLs above missing facts', () => {
    const invented = scoreAnswer(
      input({ answer: 'x8513, https://swarthmore.edu/made-up', facts: [['x8513']] }),
    );
    const missing = scoreAnswer(input({ answer: 'Call the desk.', facts: [['x8513']] }));
    assert.ok(invented.severity > missing.severity);
    const uncited = scoreAnswer(input({ answer: 'Call x8513 [1].', facts: [['x8513']] }));
    assert.equal(uncited.pass, true);
    assert.ok(uncited.severity > 0 && uncited.severity < missing.severity);
    assert.equal(missing.goldRetrieved, true);
  });
});
