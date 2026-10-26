import { buildSparseQuery, tokenize } from './lexical';

describe('tokenize', () => {
  it.each([
    ['CS cs, a!', ['cs', 'cs']],
    ['McCabe Café 2nd-floor', ['mccabe', 'caf', '2nd', 'floor']],
    ['a I ?', []],
  ])('%j', (text, tokens) => {
    expect(tokenize(text)).toEqual(tokens);
  });
});

/**
 * Golden values computed by `sparse_vector` in `ingest/ingest.py`. The Qdrant
 * collection is indexed with those hashes, so any drift here (regex, case folding,
 * minimum token length, FNV constants) silently breaks the lexical channel.
 */
describe('buildSparseQuery matches ingest.py sparse_vector', () => {
  it.each([
    ['eduroam', [617671246], [1]],
    ['Sharples', [462714589], [1]],
    ['CS cs, a!', [1177122803], [2]],
    ['Cornell Science Library', [1085122610, 46554813, 2432105424], [1, 1, 1]],
    ['McCabe Café 2nd-floor', [1742809760, 4168369661, 1535048927, 3102149661], [1, 1, 1, 1]],
    ['résumé help', [3712891560, 946971642], [1, 1]],
    ['ITS help desk x9999', [2163763161, 946971642, 2332232888, 1334163995], [1, 1, 1, 1]],
    ['Sharples SHARPLES sharples hours', [462714589, 50267956], [3, 1]],
  ])('%j', (text, indices, values) => {
    expect(buildSparseQuery(text)).toEqual({ indices, values });
  });

  it.each(['', 'a I ?', 'é ü'])('returns undefined when %j has no indexable tokens', (text) => {
    expect(buildSparseQuery(text)).toBeUndefined();
  });
});
