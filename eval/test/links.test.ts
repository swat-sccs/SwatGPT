import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addKnownText,
  emptyKnownLinks,
  extractEmails,
  extractPhones,
  extractUrls,
  isKnownUrl,
  normalizeUrl,
} from '../lib/links.ts';

describe('extractUrls', () => {
  it('finds markdown, bare-scheme and bare swarthmore.edu links without trailing punctuation', () => {
    const text =
      'See [KB](https://kb.swarthmore.edu/wiki/VPN). Or https://dash.swarthmore.edu/, and password.swarthmore.edu. Mail phishing@swarthmore.edu.';
    assert.deepEqual(extractUrls(text), [
      'https://kb.swarthmore.edu/wiki/VPN',
      'https://dash.swarthmore.edu/',
      'password.swarthmore.edu',
    ]);
  });

  it('does not treat the domain of an email address as a URL', () => {
    assert.deepEqual(extractUrls('Write to dash@swarthmore.edu'), []);
    assert.deepEqual(extractEmails('Write to Dash@Swarthmore.edu.'), ['dash@swarthmore.edu']);
  });
});

describe('extractPhones', () => {
  it('collapses campus numbers to extensions and keeps other numbers whole', () => {
    assert.deepEqual(
      extractPhones('Call (610) 328-8513, x8333, ext. 6201 or 215-555-0100; ID 1234567890.'),
      ['x8513', '2155550100', 'x8333', 'x6201'],
    );
  });
});

describe('normalizeUrl', () => {
  it('ignores scheme, www, fragments, trailing slashes and percent-encoding', () => {
    assert.equal(
      normalizeUrl('https://www.swarthmore.edu/academics/2027-spring-semester/#top'),
      'swarthmore.edu/academics/2027-spring-semester',
    );
    assert.equal(
      normalizeUrl('https://kb.swarthmore.edu/wiki/Printing_Policies_%26_FAQ'),
      normalizeUrl('http://kb.swarthmore.edu/wiki/printing policies & faq'),
    );
  });

  it('keeps path case outside the wiki', () => {
    assert.notEqual(
      normalizeUrl('https://dell.com/Swarthmore'),
      normalizeUrl('https://dell.com/swarthmore/x'),
    );
  });
});

describe('isKnownUrl', () => {
  it('knows exact KB URLs and bare hosts of KB URLs, nothing else', () => {
    const known = emptyKnownLinks();
    addKnownText(known, 'https://support.swarthmore.edu/support/tickets/new');
    assert.equal(isKnownUrl(known, 'https://support.swarthmore.edu/support/tickets/new/'), true);
    assert.equal(isKnownUrl(known, 'support.swarthmore.edu'), true);
    assert.equal(isKnownUrl(known, 'https://support.swarthmore.edu/support/firebird'), false);
  });
});
