import { QueryKeys, dataService } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
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

const flagRelatedKeys = [
  QueryKeys.adminConversation,
  QueryKeys.adminConversations,
  QueryKeys.adminFlags,
  QueryKeys.adminUsageSummary,
  QueryKeys.adminUsageUsers,
  QueryKeys.adminUsageUser,
];

const userUsageKeys = [QueryKeys.adminUsageUsers, QueryKeys.adminUsageUser];

export const useFlagConversation = (): UseMutationResult<
  TAdminFlag,
  unknown,
  TFlagConversationVars
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ conversationId, payload }) => dataService.flagAdminConversation(conversationId, payload),
    {
      onSuccess: () => {
        for (const key of flagRelatedKeys) {
          queryClient.invalidateQueries([key]);
        }
      },
    },
  );
};

export const useResolveFlag = (): UseMutationResult<TAdminFlag, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation((flagId) => dataService.resolveAdminFlag(flagId), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminFlags]);
      queryClient.invalidateQueries([QueryKeys.adminConversation]);
    },
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
