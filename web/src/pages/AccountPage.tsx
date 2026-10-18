import { useQuery } from '@tanstack/react-query';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useMe, useSignOut } from '@/auth/session';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, formatDate, isAdmin } from '@/lib/api';
import { useTheme, type Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Device', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function AccountPage() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ ok: boolean; version: string }>('/health'),
    staleTime: 5 * 60_000,
  });
  if (!me) return null;
  const role = isAdmin(me.user) ? 'Admin' : me.user.roles.includes('user') ? 'User' : 'Viewer';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Account" subtitle={me.user.email} />
      <Card>
        <CardHeader>
          <CardTitle>{me.user.displayName || me.user.email}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge>{role}</Badge>
            <span>Signed in on this device until {formatDate(me.sessionExpiresAt)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() =>
              signOut.mutate(undefined, {
                onSettled: () => navigate('/sign-in', { replace: true }),
              })
            }
          >
            <LogOut /> Sign out
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Remembered on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border p-1">
            {themes.map((t) => (
              <button
                key={t.value}
                role="radio"
                aria-checked={theme === t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground',
                  theme === t.value && 'bg-accent text-accent-foreground',
                )}
              >
                <t.icon className="size-4" aria-hidden /> {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      {health.data && (
        <p className="text-xs text-muted-foreground">RigTracker {health.data.version}</p>
      )}
    </div>
  );
}
