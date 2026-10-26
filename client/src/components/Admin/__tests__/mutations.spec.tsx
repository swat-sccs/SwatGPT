import { QueryKeys } from 'librechat-data-provider';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mocks } from '../testing/utils';
import { useFlagConversation, useResolveFlag } from '~/data-provider';
import { flag } from '../testing/fixtures';

const FLAG_RELATED = [
  QueryKeys.adminConversation,
  QueryKeys.adminConversations,
  QueryKeys.adminFlags,
  QueryKeys.adminUsageSummary,
  QueryKeys.adminUsageUsers,
  QueryKeys.adminUsageUser,
];

function setup<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(hook, { wrapper }), invalidate };
}

const invalidatedKeys = (spy: jest.SpyInstance) => spy.mock.calls.map((call) => call[0]);

describe('admin flag mutations', () => {
  it('invalidates every flag-derived query after resolving a flag', async () => {
    mocks.resolveAdminFlag.mockResolvedValue({ ...flag, resolvedAt: '2026-09-09T00:00:00.000Z' });
    const { result, invalidate } = setup(() => useResolveFlag());

    result.current.mutate('flag-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidatedKeys(invalidate)).toEqual(FLAG_RELATED.map((key) => [key]));
  });

  it('invalidates the same queries after flagging a conversation', async () => {
    mocks.flagAdminConversation.mockResolvedValue({ ...flag, id: 'flag-2', source: 'manual' });
    const { result, invalidate } = setup(() => useFlagConversation());

    result.current.mutate({ conversationId: 'convo-1', payload: { reason: 'spam' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidatedKeys(invalidate)).toEqual(FLAG_RELATED.map((key) => [key]));
  });
});
