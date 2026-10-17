import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCsrfToken, type Me, type User } from '@/lib/api';

export const ME_KEY = ['me'] as const;

type MeResponse = { authenticated: false } | ({ authenticated: true } & Me);

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<Me | null> => {
      const me = await api<MeResponse>('/auth/me');
      if (!me.authenticated) {
        setCsrfToken(null);
        return null;
      }
      setCsrfToken(me.csrfToken);
      return me;
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** The signed-in user (pages inside the app shell always have one). */
export function useUser(): User | null {
  return useMe().data?.user ?? null;
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      setCsrfToken(null);
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    },
  });
}
