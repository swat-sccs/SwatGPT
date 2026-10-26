import { QueryKeys, dataService } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';
import type {
  TAdminFlag,
  TAdminBanRequest,
  TAdminFlagRequest,
  TAdminPauseState,
  TAdminUserControls,
  TAdminPauseRequest,
  TAdminBalanceRequest,
} from 'librechat-data-provider';

export type TFlagConversationVars = { conversationId: string; payload: TAdminFlagRequest };
export type TBanUserVars = { userId: string; payload: TAdminBanRequest };
export type TSetBalanceVars = { userId: string; payload: TAdminBalanceRequest };

export type TAdminConversationExport = Awaited<
  ReturnType<typeof dataService.getAdminConversationExport>
>;

const flagRelatedKeys = [
  QueryKeys.adminConversation,
  QueryKeys.adminConversations,
  QueryKeys.adminFlags,
  QueryKeys.adminUsageSummary,
  QueryKeys.adminUsageUsers,
  QueryKeys.adminUsageUser,
];

const userUsageKeys = [QueryKeys.adminUsageUsers, QueryKeys.adminUsageUser];

/** `flagged` on lists, summaries and user rows counts unresolved flags, so any change touches all. */
const invalidateFlagRelated = (queryClient: QueryClient): void => {
  for (const key of flagRelatedKeys) {
    queryClient.invalidateQueries([key]);
  }
};

export const useFlagConversation = (): UseMutationResult<
  TAdminFlag,
  unknown,
  TFlagConversationVars
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ conversationId, payload }) => dataService.flagAdminConversation(conversationId, payload),
    { onSuccess: () => invalidateFlagRelated(queryClient) },
  );
};

/** A mutation, not a query: the export is audited, so it must only run on an explicit click. */
export const useExportConversation = (): UseMutationResult<
  TAdminConversationExport,
  unknown,
  string
> => useMutation((conversationId) => dataService.getAdminConversationExport(conversationId));

export const useResolveFlag = (): UseMutationResult<TAdminFlag, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation((flagId) => dataService.resolveAdminFlag(flagId), {
    onSuccess: () => invalidateFlagRelated(queryClient),
  });
};

export const useSetPause = (): UseMutationResult<TAdminPauseState, unknown, TAdminPauseRequest> => {
  const queryClient = useQueryClient();
  return useMutation((payload) => dataService.setAdminPause(payload), {
    onSuccess: (state) => queryClient.setQueryData([QueryKeys.adminPause], state),
  });
};

const useUserControlsMutation = <TVars extends { userId: string }>(
  mutationFn: (vars: TVars) => Promise<TAdminUserControls>,
): UseMutationResult<TAdminUserControls, unknown, TVars> => {
  const queryClient = useQueryClient();
  return useMutation(mutationFn, {
    onSuccess: (controls, { userId }) => {
      queryClient.setQueryData([QueryKeys.adminUserControls, userId], controls);
      for (const key of userUsageKeys) {
        queryClient.invalidateQueries([key]);
      }
    },
  });
};

export const useBanUser = () =>
  useUserControlsMutation<TBanUserVars>(({ userId, payload }) =>
    dataService.banAdminUser(userId, payload),
  );

export const useUnbanUser = () =>
  useUserControlsMutation<{ userId: string }>(({ userId }) => dataService.unbanAdminUser(userId));

export const useSetUserBalance = () =>
  useUserControlsMutation<TSetBalanceVars>(({ userId, payload }) =>
    dataService.setAdminUserBalance(userId, payload),
  );
