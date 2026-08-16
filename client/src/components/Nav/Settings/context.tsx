import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { SettingsContextValue } from './types';
import useProviderKeys from '../SettingsTabs/ProviderKeys/useProviderKeys';
import usePersonalizationAccess from '~/hooks/usePersonalizationAccess';
import { useHasAccess, useAuthContext } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import store from '~/store';

export function useSettingsContext(): SettingsContextValue {
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { hasAnyPersonalizationFeature, hasMemoryOptOut } = usePersonalizationAccess();

  const hasRemoteAgents = useHasAccess({
    permissionType: PermissionTypes.REMOTE_AGENTS,
    permission: Permissions.USE,
  });
  const hasMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });
  const hasPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const hasSharedLinks = useHasAccess({
    permissionType: PermissionTypes.SHARED_LINKS,
    permission: Permissions.CREATE,
  });
  const hasFileSearch = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });
  const hasWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  const hasRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const hasSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });

  const balanceEnabled = startupConfig?.balance?.enabled === true;
  const langfuseConnectionAccess = startupConfig?.langfuseConnectionAccess === true;
  const adminPanelURL = startupConfig?.adminPanelURL ?? '';
  const isLocalProvider = user?.provider === 'local';
  const twoFactorEnabled = user?.twoFactorEnabled === true;
  const allowAccountDeletion = startupConfig?.allowAccountDeletion !== false;
  const aboutEnabled = startupConfig?.interface?.buildInfo !== false;
  const hasRemoteAgentsBool = hasRemoteAgents === true;
  const hasMultiConvoBool = hasMultiConvo === true;
  const hasPromptsBool = hasPrompts === true;
  const hasAgentsBool = hasAgents === true;
  const hasSharedLinksBool = hasSharedLinks === true;
  const hasModelSelect = startupConfig?.interface?.modelSelect !== false;
  const hasToolBadges =
    hasFileSearch === true ||
    hasWebSearch === true ||
    hasRunCode === true ||
    hasSkills === true ||
    hasMemoryOptOut;
  const engineTTS = useRecoilValue<string>(store.engineTTS);
  const hasUserProvidedEndpoints = useProviderKeys().length > 0;

  return useMemo(
    () => ({
      balanceEnabled,
      hasAnyPersonalizationFeature,
      hasMemoryOptOut,
      hasRemoteAgents: hasRemoteAgentsBool,
      hasUserProvidedEndpoints,
      hasMultiConvo: hasMultiConvoBool,
      hasPrompts: hasPromptsBool,
      hasAgents: hasAgentsBool,
      hasModelSelect,
      hasToolBadges,
      hasSharedLinks: hasSharedLinksBool,
      isLocalProvider,
      twoFactorEnabled,
      allowAccountDeletion,
      aboutEnabled,
      engineTTS,
      langfuseConnectionAccess,
      adminPanelURL,
    }),
    [
      balanceEnabled,
      hasAnyPersonalizationFeature,
      hasMemoryOptOut,
      hasRemoteAgentsBool,
      hasUserProvidedEndpoints,
      hasMultiConvoBool,
      hasPromptsBool,
      hasAgentsBool,
      hasModelSelect,
      hasToolBadges,
      hasSharedLinksBool,
      isLocalProvider,
      twoFactorEnabled,
      allowAccountDeletion,
      aboutEnabled,
      engineTTS,
      langfuseConnectionAccess,
      adminPanelURL,
    ],
  );
}
