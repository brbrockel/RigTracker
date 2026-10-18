import { useMutation } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useMe, useSignedIn } from '@/auth/session';
import { CodeStep } from '@/components/auth/CodeStep';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { api, type Me } from '@/lib/api';
import { authError } from '@/lib/passwords';
import { SetPassword } from '@/pages/SetPasswordPage';

function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
}

/**
 * /sign-in: email and password (then an authenticator code, if the account has one), or a
 * look around as a guest. /sign-in#token=… is a password link (see SetPassword).
 */
export function SignInPage() {
  const me = useMe();
  const [token, setToken] = useState(tokenFromHash);
  // A link pasted while already on this page only changes the #fragment.
  useEffect(() => {
    const onHash = () => setToken(tokenFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (me.isPending) return <div className="min-h-dvh" />;
  if (me.data && !token) return <Navigate to="/" replace />;
  return (
    <AuthShell>
      {token ? (
        <SetPassword key={token} token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <PasswordSignIn />
          <GuestButton />
        </div>
      )}
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/img/logo1.jpg" alt="" className="size-14 rounded-xl object-cover" />
          <h1 className="text-2xl font-semibold tracking-tight">RigTracker</h1>
          <p className="text-sm text-muted-foreground">
            Rigs, gear, events and people for the club
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Email and password, then an authenticator code if the account has one. */
function PasswordSignIn() {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codeToken, setCodeToken] = useState<string | null>(null);
  const done = (me: Me) => {
    signedIn(me);
    navigate('/', { replace: true });
  };
  const signIn = useMutation({
    mutationFn: () =>
      api<Me | { needsCode: true; token: string }>('/auth/sign-in', {
        method: 'POST',
        body: { email, password },
      }),
    onSuccess: (r) => {
      if ('needsCode' in r) setCodeToken(r.token);
      else done(r);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    signIn.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {codeToken ? 'One more step.' : 'With your email and RigTracker password.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {codeToken ? (
          <CodeStep
            token={codeToken}
            onSignedIn={done}
            onBack={() => {
              setCodeToken(null);
              signIn.reset();
            }}
          />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {signIn.isError && <Alert variant="destructive">{authError(signIn.error)}</Alert>}
            <Button type="submit" size="lg" disabled={signIn.isPending}>
              {signIn.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-xs text-muted-foreground">
              New, or forgot your password? Ask a RigTracker admin for a password link. It works
              once, lasts 72 hours and lets you set a new password.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/** No account: look around read-only (rigs, gear and events; people by first name only). */
function GuestButton() {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const look = useMutation({
    mutationFn: () => api<Me>('/auth/guest', { method: 'POST' }),
    onSuccess: (me) => {
      signedIn(me);
      navigate('/', { replace: true });
    },
  });
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Button variant="outline" disabled={look.isPending} onClick={() => look.mutate()}>
        <Eye /> Look around as a guest
      </Button>
      <p className="text-xs text-muted-foreground">
        See rigs, gear and events. People show by first name and last initial, and nothing can be
        changed.
      </p>
      {look.isError && <Alert variant="destructive">{authError(look.error)}</Alert>}
    </div>
  );
}
