import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ME_KEY, useMe } from '@/auth/session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';

function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
}

/**
 * /sign-in explains how to get in; /sign-in#token=… is a sign-in link. Opening a link only
 * checks it (so a phone previewing the link can't spoil it); pressing Sign in uses it up.
 */
export function SignInPage() {
  const me = useMe();
  const [token] = useState(tokenFromHash);
  if (me.isPending) return <div className="min-h-dvh" />;
  if (me.data && !token) return <Navigate to="/" replace />;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/img/logo1.jpg" alt="" className="size-14 rounded-xl object-cover" />
          <h1 className="text-2xl font-semibold tracking-tight">RigTracker</h1>
          <p className="text-sm text-muted-foreground">Rigs, gear, events and people for the club</p>
        </div>
        {token ? <UseLink token={token} /> : <HowToSignIn />}
      </div>
    </div>
  );
}

function HowToSignIn() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-5 text-primary" aria-hidden /> Sign in with a link
        </CardTitle>
        <CardDescription>
          RigTracker doesn't use passwords yet. Ask a RigTracker admin for a sign-in link, then
          open it on this device. Each link works once and lasts 72 hours.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function UseLink({ token }: { token: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [who, setWho] = useState<{ email: string; displayName: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ email: string; displayName: string }>('/auth/link/check', {
      method: 'POST',
      body: { token },
    })
      .then(setWho)
      .catch((err) => setError(errorMessage(err, 'This sign-in link is not valid.')))
      .finally(() => setChecking(false));
  }, [token]);

  async function signIn() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/link/redeem', { method: 'POST', body: { token } });
      // Drop the token from the address bar and history, then load the new session.
      window.history.replaceState(null, '', '/sign-in');
      await qc.invalidateQueries({ queryKey: ME_KEY });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'This sign-in link is not valid.'));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" aria-hidden /> Sign in
        </CardTitle>
        {who && (
          <CardDescription>
            Signing in as{' '}
            <strong className="text-foreground">
              {who.displayName ? `${who.displayName} (${who.email})` : who.email}
            </strong>
            . The link works once.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {checking && <p className="text-sm text-muted-foreground">Checking your link…</p>}
        {error && <Alert variant="destructive">{error}</Alert>}
        {who && (
          <Button onClick={signIn} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
