import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import type { Question, QuestionSet } from '../lib/types.ts';
import { matchesFact } from '../lib/score.ts';
import { validateQuestions } from '../lib/questions.ts';
import { loadCorpus } from '../lib/corpus.ts';

const KB = join(import.meta.dirname, '..', '..', 'information');
const QUESTIONS = join(import.meta.dirname, '..', 'questions.json');

const question = (overrides: Partial<Question>): Question => ({
  id: 'q',
  kind: 'answerable',
  turns: ['?'],
  docs: ['a.md'],
  facts: [['x']],
  ...overrides,
});

describe('validateQuestions', () => {
  it('rejects unknown files, duplicate ids and misshapen kinds', () => {
    const set: QuestionSet = {
      version: 1,
      questions: [
        question({ docs: ['missing.md'] }),
        question({}),
        question({ id: 'u', kind: 'unanswerable', docs: [], facts: [['x']] }),
        question({ id: 'f', kind: 'followup', turns: ['one'] }),
      ],
    };
    assert.throws(
      () => validateQuestions(set, new Set(['a.md'])),
      (error: Error) => {
        assert.match(error.message, /unknown KB file\(s\) missing\.md/);
        assert.match(error.message, /q: duplicate id/);
        assert.match(error.message, /u: unanswerable questions take no facts/);
        assert.match(error.message, /f: follow-ups need at least two turns/);
        return true;
      },
    );
  });
});

describe('questions.json', () => {
  it('is valid against the real KB, with the planned mix of kinds', async () => {
    const [corpus, text] = await Promise.all([loadCorpus(KB), readFile(QUESTIONS, 'utf8')]);
    const set = JSON.parse(text) as QuestionSet;
    validateQuestions(set, new Set(corpus.documents.keys()));
    const kinds = set.questions.reduce<Record<Question['kind'], number>>(
      (counts, entry) => ({ ...counts, [entry.kind]: counts[entry.kind] + 1 }),
      { answerable: 0, unanswerable: 0, followup: 0 },
    );
    assert.ok(set.questions.length >= 45);
    assert.ok(kinds.unanswerable >= 10);
    assert.ok(kinds.followup >= 5);
  });

  it('only expects facts that actually appear in the cited KB files', async () => {
    const [corpus, text] = await Promise.all([loadCorpus(KB), readFile(QUESTIONS, 'utf8')]);
    const set = JSON.parse(text) as QuestionSet;
    const unsupported = set.questions.flatMap((entry) => {
      const body = entry.docs.map((doc) => corpus.documents.get(doc)?.body ?? '').join('\n');
      return entry.facts
        .filter((fact) => !matchesFact(body, fact))
        .map((fact) => `${entry.id}: ${fact.join(' | ')}`);
    });
    assert.deepEqual(unsupported, []);
  });
});
