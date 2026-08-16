import { isValidElementType } from 'react-is';
import { SettingsTabValues } from 'librechat-data-provider';
import type { SettingsContextValue } from '../types';
import en from '~/locales/en/translation.json';
import { registry } from '../registry';
import { TABS } from '../types';

const validTabSections = new Map(TABS.map((t) => [t.id, new Set(t.sections.map((s) => s.id))]));

const settingsContext: SettingsContextValue = {
  balanceEnabled: false,
  hasAnyPersonalizationFeature: false,
  hasMemoryOptOut: false,
  hasRemoteAgents: false,
  hasUserProvidedEndpoints: false,
  hasMultiConvo: false,
  hasPrompts: false,
  hasAgents: false,
  hasModelSelect: false,
  hasToolBadges: false,
  hasSharedLinks: false,
  isLocalProvider: true,
  twoFactorEnabled: false,
  allowAccountDeletion: true,
  aboutEnabled: false,
  engineTTS: 'browser',
  langfuseConnectionAccess: false,
  adminPanelURL: '',
};

describe('settings registry', () => {
  it('has unique ids', () => {
    const ids = registry.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references a valid tab and section for every entry', () => {
    for (const entry of registry) {
      const sections = validTabSections.get(entry.tab);
      expect(sections).toBeDefined();
      expect(sections!.has(entry.section)).toBe(true);
    }
  });

  it('uses label keys that exist in the English locale', () => {
    for (const entry of registry) {
      expect(en).toHaveProperty(entry.labelKey);
    }
  });

  it('has a renderable Component for every entry', () => {
    for (const entry of registry) {
      expect(isValidElementType(entry.Component)).toBe(true);
    }
  });

  describe('Langfuse connection visibility', () => {
    const langfuseEntry = registry.find((entry) => entry.id === 'langfuseConnection');

    it('places the connection in the Langfuse tab', () => {
      expect(langfuseEntry).toMatchObject({
        tab: SettingsTabValues.LANGFUSE,
        section: 'langfuse',
      });
    });

    it('shows the connection when the user can manage it', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          langfuseConnectionAccess: true,
        }),
      ).toBe(true);
    });

    it('hides the connection without Langfuse config access', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          langfuseConnectionAccess: false,
        }),
      ).toBe(false);
    });

    it('shows the connection in single-tenant mode without fanout', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          langfuseConnectionAccess: true,
        }),
      ).toBe(true);
    });
  });

  describe('disabled campus-feature visibility', () => {
    it('hides agent, prompt, tool, and share settings when those features are off', () => {
      const hiddenIds = [
        'duringRunDefaultAction',
        'steerInterruptsByDefault',
        'saveBadgesState',
        'atCommand',
        'autoExpandTools',
        'modularChat',
        'forkSettings',
        'advancedPrompts',
        'sharedLinks',
        'revokeKeys',
      ];

      for (const id of hiddenIds) {
        const entry = registry.find((item) => item.id === id);
        expect(entry?.show?.(settingsContext)).toBe(false);
      }
    });

    it('shows those settings when the matching feature is on', () => {
      const enabled = {
        ...settingsContext,
        hasAgents: true,
        hasModelSelect: true,
        hasToolBadges: true,
        hasPrompts: true,
        hasSharedLinks: true,
        hasUserProvidedEndpoints: true,
      };

      expect(registry.find((item) => item.id === 'forkSettings')?.show?.(enabled)).toBe(true);
      expect(registry.find((item) => item.id === 'atCommand')?.show?.(enabled)).toBe(true);
      expect(registry.find((item) => item.id === 'advancedPrompts')?.show?.(enabled)).toBe(true);
      expect(registry.find((item) => item.id === 'sharedLinks')?.show?.(enabled)).toBe(true);
      expect(registry.find((item) => item.id === 'revokeKeys')?.show?.(enabled)).toBe(true);
    });
  });
});
