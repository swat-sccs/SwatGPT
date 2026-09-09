import { RecoilRoot } from 'recoil';
import { render } from '@testing-library/react';
import { dataService } from 'librechat-data-provider';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  const mocked = Object.fromEntries(
    Object.keys(actual.dataService)
      .filter(
        (name) => name.startsWith('getAdmin') || /Admin(User|Flag|Conversation|Pause)/.test(name),
      )
      .map((name) => [name, jest.fn()]),
  );
  return { ...actual, dataService: { ...actual.dataService, ...mocked } };
});

export const ALL_CAPABILITIES = [
  'access:admin',
  'read:usage',
  'read:conversations',
  'export:conversations',
  'manage:controls',
];

type AdminMocks = jest.Mocked<typeof dataService>;

export const mocks = dataService as AdminMocks;

export const CHAT_HOME = 'chat-home';

export function mockCapabilities(capabilities: string[] = ALL_CAPABILITIES): void {
  mocks.getAdminCapabilities.mockResolvedValue({ capabilities });
}

export const pending = <T,>(): Promise<T> => new Promise<T>(() => undefined);

export function renderAdmin(
  ui: ReactElement,
  { route = '/', path = '*' }: { route?: string; path?: string } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RecoilRoot>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/c/new" element={<div>{CHAT_HOME}</div>} />
          </Routes>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}
