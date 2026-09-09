import { detectIntent } from './intent';

describe('detectIntent', () => {
  it('ignores messages without housing vocabulary', () => {
    expect(detectIntent('How do I reset my password?')).toBeUndefined();
    expect(detectIntent('')).toBeUndefined();
    expect(detectIntent('Tell me about Jane Doe')).toBeUndefined();
  });

  it.each([
    ['Where does Jane Doe live?', 'jane doe'],
    ["where's Jane Doe living this year", 'jane doe'],
    ['What dorm is Jane Doe in?', 'jane doe'],
    ['Which building does jdoe1 live in', 'jdoe1'],
    ["what's jane doe's room number", 'jane doe'],
    ['dorm of Jane Doe', 'jane doe'],
    ['hey, where does Jane Doé live', 'jane doe'],
    ['Where does jdoe1@swarthmore.edu live?', 'jdoe1'],
  ])('extracts the person span from %j', (text, span) => {
    expect(detectIntent(text)).toEqual({ kind: 'person', span, roommates: false, explicit: true });
  });

  it.each([
    ['Where is Jane Doe?', 'jane doe'],
    ['where can I find Jane Doe', 'jane doe'],
  ])('treats %j as a loose person question', (text, span) => {
    expect(detectIntent(text)).toEqual({ kind: 'person', span, roommates: false, explicit: false });
  });

  it.each([
    ["Who are Jane Doe's roommates?", 'jane doe'],
    ['who lives with Jane Doe', 'jane doe'],
  ])('flags roommate questions like %j', (text, span) => {
    expect(detectIntent(text)).toEqual({ kind: 'person', span, roommates: true, explicit: true });
  });

  it.each([
    ['Who lives in Willets 214?', 'willets 214'],
    ["who's in Willets room 214", 'willets room 214'],
    ['who lives on the 3rd floor of Wharton', 'the 3rd floor of wharton'],
  ])('extracts the place span from %j', (text, span) => {
    expect(detectIntent(text)).toEqual({ kind: 'place', span });
  });
});
