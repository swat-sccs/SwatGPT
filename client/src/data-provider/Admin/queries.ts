import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type {
  TAdminFlagsQuery,
  TAdminUsageRange,
  TAdminPauseState,
  TAdminUsageModel,
  TAdminFlagsResponse,
  TAdminUsageSummary,
  TAdminUserControls,
  TAdminUsageUsersQuery,
  TAdminUsageUserDetail,
  TAdminUsageTimeseries,
  TAdminConversationDetail,
  TAdminConversationsQuery,
  TAdminUsageUsersResponse,
  TAdminUsageTimeseriesQuery,
  TAdminCapabilitiesResponse,
  TAdminConversationsResponse,
} from 'librechat-data-provider';

const adminQueryDefaults = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
} as const;

/** Stable, order-independent key part for a params object. */
const keyOf = (params: object): string => JSON.stringify(params, Object.keys(params).sort());

export const useAdminCapabilities = (
  config?: UseQueryOptions<TAdminCapabilitiesResponse>,
): QueryObserverResult<TAdminCapabilitiesResponse> =>
  useQuery<TAdminCapabilitiesResponse>(
    [QueryKeys.adminCapabilities],
    () => dataService.getAdminCapabilities(),
    { ...adminQueryDefaults, staleTime: 5 * 60 * 1000, ...config },
  );

export const useAdminUsageSummary = (
  range: TAdminUsageRange,
  config?: UseQueryOptions<TAdminUsageSummary>,
): QueryObserverResult<TAdminUsageSummary> =>
  useQuery<TAdminUsageSummary>(
    [QueryKeys.adminUsageSummary, keyOf(range)],
    () => dataService.getAdminUsageSummary(range),
    { ...adminQueryDefaults, keepPreviousData: true, ...config },
  );

export const useAdminUsageTimeseries = (
  params: TAdminUsageTimeseriesQuery,
  config?: UseQueryOptions<TAdminUsageTimeseries>,
): QueryObserverResult<TAdminUsageTimeseries> =>
  useQuery<TAdminUsageTimeseries>(
    [QueryKeys.adminUsageTimeseries, keyOf(params)],
    () => dataService.getAdminUsageTimeseries(params),
    { ...adminQueryDefaults, keepPreviousData: true, ...config },
  );

export const useAdminUsageUsers = (
  params: TAdminUsageUsersQuery,
  config?: UseQueryOptions<TAdminUsageUsersResponse>,
): QueryObserverResult<TAdminUsageUsersResponse> =>
  useQuery<TAdminUsageUsersResponse>(
    [QueryKeys.adminUsageUsers, keyOf(params)],
    () => dataService.getAdminUsageUsers(params),
    { ...adminQueryDefaults, keepPreviousData: true, ...config },
  );

export const useAdminUsageUser = (
  userId: string,
  range: TAdminUsageRange,
  config?: UseQueryOptions<TAdminUsageUserDetail>,
): QueryObserverResult<TAdminUsageUserDetail> =>
  useQuery<TAdminUsageUserDetail>(
    [QueryKeys.adminUsageUser, userId, keyOf(range)],
    () => dataService.getAdminUsageUser(userId, range),
    { ...adminQueryDefaults, keepPreviousData: true, enabled: userId.length > 0, ...config },
  );

export const useAdminUsageModels = (
  range: TAdminUsageRange,
  config?: UseQueryOptions<TAdminUsageModel[]>,
): QueryObserverResult<TAdminUsageModel[]> =>
  useQuery<TAdminUsageModel[]>(
    [QueryKeys.adminUsageModels, keyOf(range)],
    async () => (await dataService.getAdminUsageModels(range)).models,
    { ...adminQueryDefaults, keepPreviousData: true, ...config },
  );

export const useAdminConversations = (params: Omit<TAdminConversationsQuery, 'cursor'>) =>
  useInfiniteQuery<TAdminConversationsResponse>(
    [QueryKeys.adminConversations, keyOf(params)],
    ({ pageParam }) =>
      dataService.getAdminConversations(
        typeof pageParam === 'string' ? { ...params, cursor: pageParam } : params,
      ),
    {
      ...adminQueryDefaults,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

export const useAdminConversation = (
  conversationId: string,
  config?: UseQueryOptions<TAdminConversationDetail>,
): QueryObserverResult<TAdminConversationDetail> =>
  useQuery<TAdminConversationDetail>(
    [QueryKeys.adminConversation, conversationId],
    () => dataService.getAdminConversation(conversationId),
    { ...adminQueryDefaults, enabled: conversationId.length > 0, ...config },
  );

export const useAdminFlags = (params: Omit<TAdminFlagsQuery, 'cursor'>) =>
  useInfiniteQuery<TAdminFlagsResponse>(
    [QueryKeys.adminFlags, keyOf(params)],
    ({ pageParam }) =>
      dataService.getAdminFlags(
        typeof pageParam === 'string' ? { ...params, cursor: pageParam } : params,
      ),
    {
      ...adminQueryDefaults,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

export const useAdminPause = (
  config?: UseQueryOptions<TAdminPauseState>,
): QueryObserverResult<TAdminPauseState> =>
  useQuery<TAdminPauseState>([QueryKeys.adminPause], () => dataService.getAdminPause(), {
    ...adminQueryDefaults,
    ...config,
  });

export const useAdminUserControls = (
  userId: string,
  config?: UseQueryOptions<TAdminUserControls>,
): QueryObserverResult<TAdminUserControls> =>
  useQuery<TAdminUserControls>(
    [QueryKeys.adminUserControls, userId],
    () => dataService.getAdminUserControls(userId),
    { ...adminQueryDefaults, enabled: userId.length > 0, ...config },
  );
