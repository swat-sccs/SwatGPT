import React from 'react';
import { RecoilRoot } from 'recoil';
import { renderHook } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TInterfaceConfig, TEndpointsConfig } from 'librechat-data-provider';
import useUnifiedSidebarLinks from '../useUnifiedSidebarLinks';
import useSideNavLinks from '../useSideNavLinks';

const mockUseGetStartupConfig = jest.fn();
const mockUseGetEndpointsQuery = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
  useGetEndpointsQuery: () => mockUseGetEndpointsQuery(),
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useUserKeyQuery: () => ({ data: { expiresAt: undefined } }),
}));

jest.mock('~/hooks', () => ({
  useHasAccess: () => true,
  useMCPServerManager: () => ({ availableMCPServers: [] }),
  useGetAgentsConfig: () => ({ agentsConfig: { capabilities: [] } }),
  useAgentCapabilities: () => ({ skillsEnabled: true }),
}));

jest.mock('~/components/UnifiedSidebar/ConversationsSection', () => () => null);
jest.mock('~/components/SidePanel/MCPBuilder/MCPBuilderPanel', () => () => null);
jest.mock('~/components/SidePanel/Agents/AgentPanelSwitch', () => () => null);
jest.mock('~/components/SidePanel/Bookmarks/BookmarkPanel', () => () => null);
jest.mock('~/components/SidePanel/Builder/PanelSwitch', () => () => null);
jest.mock('~/components/SidePanel/Parameters/Panel', () => () => null);
jest.mock('~/components/SidePanel/Memories', () => ({ MemoryPanel: () => null }));
jest.mock('~/components/SidePanel/Files/Panel', () => () => null);
jest.mock('~/components/Prompts', () => ({ PromptsAccordion: () => null }));
jest.mock('~/components/Skills', () => ({ SkillsAccordion: () => null }));

const endpointsConfig = {
  [EModelEndpoint.agents]: { order: 0 },
} as TEndpointsConfig;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

function renderLinks() {
  const { result } = renderHook(() => useUnifiedSidebarLinks(), { wrapper });
  return result.current.map((link) => link.id);
}

describe('useUnifiedSidebarLinks', () => {
  beforeEach(() => {
    mockUseGetEndpointsQuery.mockReturnValue({ data: endpointsConfig });
  });

  it('shows only chat history when the startup config is missing', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined });
    expect(renderLinks()).toEqual(['conversations']);
  });

  it('shows only chat history when the startup config has no interface block', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: {} });
    expect(renderLinks()).toEqual(['conversations']);
  });

  it('honours explicit interface flags from a loaded startup config', () => {
    const iface: Partial<TInterfaceConfig> = {
      agents: { use: false },
      skills: { use: false },
      memories: false,
      fileSearch: false,
    };
    mockUseGetStartupConfig.mockReturnValue({ data: { interface: iface } });
    expect(renderLinks()).toEqual(['conversations', 'prompts', 'bookmarks', 'mcp-builder']);
  });

  it('shows enabled features when the interface allows them', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: { interface: {} } });
    expect(renderLinks()).toEqual([
      'conversations',
      EModelEndpoint.agents,
      'skills',
      'prompts',
      'memories',
      'bookmarks',
      'files',
      'mcp-builder',
    ]);
  });
});

describe('useSideNavLinks', () => {
  it('keeps the hide-panel control but no feature links without an interface config', () => {
    const hidePanel = jest.fn();
    const { result } = renderHook(
      () =>
        useSideNavLinks({
          hidePanel,
          keyProvided: true,
          interfaceConfig: undefined,
          endpointsConfig,
        }),
      { wrapper },
    );
    expect(result.current.map((link) => link.id)).toEqual(['hide-panel']);
  });
});
