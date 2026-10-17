import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '@/auth/session';
import { AppLayout } from '@/components/AppLayout';
import { isAdmin } from '@/lib/api';
import { AccountPage } from '@/pages/AccountPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { EventPage } from '@/pages/EventPage';
import { EventsPage } from '@/pages/EventsPage';
import { GearPage } from '@/pages/GearPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PeoplePage } from '@/pages/PeoplePage';
import { PersonPage } from '@/pages/PersonPage';
import { RigPage } from '@/pages/RigPage';
import { RigsPage } from '@/pages/RigsPage';
import { SignInPage } from '@/pages/SignInPage';
import { UsersPage } from '@/pages/UsersPage';

/** Everything except the sign-in page requires a session. */
function RequireSession() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <div className="min-h-dvh" />;
  if (!me.data) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Admin pages: others are sent home (the API refuses them anyway). */
function RequireAdmin() {
  const me = useMe();
  if (!isAdmin(me.data?.user)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export const routes = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <RequireSession />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'rigs', element: <RigsPage /> },
          { path: 'rigs/:id', element: <RigPage /> },
          { path: 'gear', element: <GearPage /> },
          { path: 'events', element: <EventsPage /> },
          { path: 'events/:id', element: <EventPage /> },
          { path: 'people', element: <PeoplePage /> },
          { path: 'people/:id', element: <PersonPage /> },
          { path: 'account', element: <AccountPage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: 'users', element: <UsersPage /> },
              { path: 'activity', element: <ActivityPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
