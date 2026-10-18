import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '@/router';

type Handler = (init: RequestInit | undefined) => { status: number; body?: unknown };

/** Stubs fetch with handlers keyed by "METHOD /api/path"; unmatched requests fail the test. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url}`;
      calls.push({ key, init });
      const handler = handlers[key];
      if (!handler) throw new Error(`Unexpected request: ${key}`);
      const { status, body } = handler(init);
      return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

export const signedOut = () => ({ status: 200, body: { authenticated: false } });

const user = (roles: string[]) => ({
  id: 'u1',
  email: 'brian@example.com',
  displayName: 'Brian B',
  roles,
  isActive: true,
  lastLoginAt: null,
  loginCount: 1,
});

export const asAdmin = () => ({
  status: 200,
  body: {
    authenticated: true,
    user: user(['admin']),
    csrfToken: 'csrf-123',
    sessionExpiresAt: '2026-11-16T00:00:00.000Z',
  },
});
export const asUser = () => ({ ...asAdmin(), body: { ...asAdmin().body, user: user(['user']) } });
export const asViewer = () => ({
  ...asAdmin(),
  body: { ...asAdmin().body, user: user(['viewer']) },
});

/** "Look around as a guest". */
export const asGuest = () => ({
  status: 200,
  body: {
    authenticated: true,
    user: { id: 'guest', displayName: 'Guest', roles: [], isGuest: true },
    csrfToken: 'csrf-guest',
    sessionExpiresAt: '2026-10-18T12:00:00.000Z',
  },
});
