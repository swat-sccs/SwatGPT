import { describe, expect, it } from 'vitest';
import {
  campusHoursAliases,
  campusHoursAliasesFor,
  campusHoursPlaceMatches,
} from '../src/hoursAliases.js';

describe('campus hours aliases', () => {
  it('provides at least three working aliases for every known hours source', () => {
    expect(Object.keys(campusHoursAliases)).toHaveLength(36);
    for (const [place, aliases] of Object.entries(campusHoursAliases)) {
      expect(aliases.length, place).toBeGreaterThanOrEqual(3);
      expect(new Set(aliases.map((alias) => alias.toLocaleLowerCase())).size, place).toBe(aliases.length);
      for (const alias of aliases) {
        expect(campusHoursPlaceMatches(place, alias), `${alias} -> ${place}`).toBe(true);
      }
    }
  });

  it('keeps Post Office and Package Pickup aliases attached to their separate feeds', () => {
    expect(campusHoursPlaceMatches('Post Office', 'mailroom')).toBe(true);
    expect(campusHoursPlaceMatches('Post Office', 'package room')).toBe(false);
    expect(campusHoursPlaceMatches('Post Office - Package Pickup', 'package room')).toBe(true);
    expect(campusHoursPlaceMatches('Post Office - Package Pickup', 'mailroom')).toBe(false);
  });

  it('exposes aliases for inclusion in hours tool results', () => {
    expect(campusHoursAliasesFor('Dining Center')).toEqual(expect.arrayContaining(['Sharples', 'DCC', 'dining hall']));
    expect(campusHoursAliasesFor('Post Office - Package Pickup')).toEqual(expect.arrayContaining([
      'package pickup', 'package room', 'parcel pickup',
    ]));
  });
});
