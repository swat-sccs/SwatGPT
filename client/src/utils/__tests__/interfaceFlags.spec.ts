import {
  areProjectsEnabled,
  isFilesPanelEnabled,
  isInterfaceUseEnabled,
  shouldHideModelSelector,
} from '../interfaceFlags';

describe('isInterfaceUseEnabled', () => {
  it('defaults to true when unset', () => {
    expect(isInterfaceUseEnabled(undefined)).toBe(true);
  });

  it('reads a boolean flag', () => {
    expect(isInterfaceUseEnabled(false)).toBe(false);
    expect(isInterfaceUseEnabled(true)).toBe(true);
  });

  it('reads the use field on an object flag', () => {
    expect(isInterfaceUseEnabled({ use: false })).toBe(false);
    expect(isInterfaceUseEnabled({ use: true, create: false })).toBe(true);
    expect(isInterfaceUseEnabled({})).toBe(true);
  });
});

describe('areProjectsEnabled', () => {
  it('is off until the loaded interface explicitly enables projects', () => {
    expect(areProjectsEnabled(undefined)).toBe(false);
    expect(areProjectsEnabled({})).toBe(false);
    expect(areProjectsEnabled({ projects: false })).toBe(false);
    expect(areProjectsEnabled({ projects: true })).toBe(true);
  });
});

describe('isFilesPanelEnabled', () => {
  it('is on unless file search is off', () => {
    expect(isFilesPanelEnabled(undefined)).toBe(true);
    expect(isFilesPanelEnabled({ fileSearch: true })).toBe(true);
    expect(isFilesPanelEnabled({ fileSearch: false })).toBe(false);
  });
});

describe('shouldHideModelSelector', () => {
  it('hides when selection is off and there is at most one spec', () => {
    expect(shouldHideModelSelector(false, 0)).toBe(true);
    expect(shouldHideModelSelector(false, 1)).toBe(true);
    expect(shouldHideModelSelector(false, 2)).toBe(false);
    expect(shouldHideModelSelector(true, 1)).toBe(false);
    expect(shouldHideModelSelector(undefined, 0)).toBe(false);
  });
});
