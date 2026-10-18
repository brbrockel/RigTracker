import {
  CalendarDays,
  ExternalLink,
  History,
  Home,
  LogIn,
  LogOut,
  Package,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useMe, useSignOut } from '@/auth/session';
import { NoticeBanners } from '@/components/NoticeBanners';
import { NoticesButton } from '@/components/NoticesPanel';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isAdmin, isGuest } from '@/lib/api';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/rigs', label: 'Rigs', icon: Wrench, end: false },
  { to: '/gear', label: 'Gear', icon: Package, end: false },
  { to: '/events', label: 'Events', icon: CalendarDays, end: false },
  { to: '/people', label: 'People', icon: Users, end: false },
];

export function AppLayout() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [noticesOpen, setNoticesOpen] = useState(false);
  if (!me) return null;
  const admin = isAdmin(me.user);
  const guest = isGuest(me.user);
  // Guests don't see People.
  const shown = guest ? tabs.filter((t) => t.to !== '/people') : tabs;
  const signOutAndLeave = () =>
    signOut.mutate(undefined, { onSettled: () => navigate('/sign-in', { replace: true }) });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b print:hidden bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/img/logo1.jpg" alt="" className="size-7 rounded-md object-cover" />
            <span>RigTracker</span>
          </NavLink>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {shown.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground',
                    isActive && 'bg-accent text-accent-foreground',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NoticesButton
              admin={admin}
              guest={guest}
              open={noticesOpen}
              onOpenChange={setNoticesOpen}
            />
            {guest ? (
              // Ends the guest session, then the sign-in page.
              <Button size="sm" onClick={signOutAndLeave}>
                <LogIn /> Sign in
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account menu">
                    <UserRound />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{me.user.displayName || me.user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigate('/account')}>
                    <UserRound /> Account
                  </DropdownMenuItem>
                  {admin && (
                    <DropdownMenuItem onSelect={() => navigate('/activity')}>
                      <History /> Activity log
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <a
                      href="https://github.com/brbrockel/RigTracker"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink /> GitHub
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={signOutAndLeave}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <main
        key={pathname.split('/')[1]}
        className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 md:pb-10"
      >
        <NoticeBanners guest={guest} />
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
      >
        <div className="mx-auto flex max-w-md">
          {shown.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground',
                  isActive && 'text-primary',
                )
              }
            >
              <t.icon className="size-5" aria-hidden />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
