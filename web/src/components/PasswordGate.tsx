import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SECURITY_KEY, SecurityCard, type Security } from '@/components/SecurityCard';
import { Alert } from '@/components/ui/alert';
import { api } from '@/lib/api';

/**
 * Someone signed in without a password (a session from before passwords) sets one before
 * anything else. Guests and everyone with a password see the page as usual.
 */
export function PasswordGate({
  guest,
  isAdmin,
  children,
}: {
  guest: boolean;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const q = useQuery({
    queryKey: SECURITY_KEY,
    queryFn: () => api<Security>('/auth/security'),
    enabled: !guest,
  });
  if (guest || q.data?.hasPassword !== false) return <>{children}</>;
  return (
    <div className="flex flex-col gap-4">
      <Alert>Set a password to keep using RigTracker. You’ll sign in with it from now on.</Alert>
      <SecurityCard isAdmin={isAdmin} />
    </div>
  );
}
