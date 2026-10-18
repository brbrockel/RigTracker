import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/auth/session';
import { isGuest } from '@/lib/api';

/** A link to a person's page; plain text for guests, who can't see People. */
export function PersonLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const guest = isGuest(useUser());
  if (guest) return <span className={className}>{children}</span>;
  return (
    <Link to={`/people/${id}`} className={className}>
      {children}
    </Link>
  );
}
