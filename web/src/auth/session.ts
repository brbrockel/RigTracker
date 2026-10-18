import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCsrfToken, type Me, type User } from '@/lib/api';

export const ME_KEY = ['me'] as const;

type MeResponse = { authenticated: false } | ({ authenticated: true } & Me);

/** A guest's /me has only id, displayName, roles and isGuest; fill in the rest. */
function normalize(me: Me): Me {
  if (!me.user.isGuest) return me;
  const sent: Partial<User> = me.user;
  return {
    ...me,
    user: {
      id: 'guest',
      displayName: 'Guest',
      roles: [],
      email: '',
      isActive: true,
      lastLoginAt: null,
      loginCount: 0,
      ...sent,
      isGuest: true,
    },
  };
}

/** The signed-in user (or guest), or null when signed out. */
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
      return normalize(me);
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** The signed-in user (pages inside the app shell always have one). */
export function useUser(): User | null {
  return useMe().data?.user ?? null;
}

/** After a sign-in (or "Look around as a guest"): the response answers like /me. */
export function useSignedIn() {
  const qc = useQueryClient();
  return (me: Me) => {
    setCsrfToken(me.csrfToken);
    qc.setQueryData(ME_KEY, normalize(me));
  };
}

/** Ends the session (a guest's too). */
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
