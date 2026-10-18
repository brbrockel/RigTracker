import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSignedIn } from '@/auth/session';
import { CodeStep } from '@/components/auth/CodeStep';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { api, type Me } from '@/lib/api';
import { authError, MIN_PASSWORD, PASSWORD_HINT } from '@/lib/passwords';

interface LinkInfo {
  email: string;
  displayName: string;
  hasPassword: boolean;
}

/**
 * Where an admin's password link lands (/sign-in#token=…): it shows who it's for and asks for
 * a password. Opening the link doesn't use it up; saving does, and signs in (after an
 * authenticator code, if the account has one, so a link alone can't get past it).
 */
export function SetPassword({ token }: { token: string }) {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [codeToken, setCodeToken] = useState<string | null>(null);
  const link = useQuery({
    queryKey: ['password-link', token],
    queryFn: () => api<LinkInfo>('/auth/link/check', { method: 'POST', body: { token } }),
    retry: false,
    staleTime: Infinity,
  });
  const done = (me: Me) => {
    // Drop the token from the address bar and history, then go in.
    window.history.replaceState(null, '', '/sign-in');
    signedIn(me);
    navigate('/', { replace: true });
  };
  const save = useMutation({
    mutationFn: () =>
      api<Me | { needsCode: true; token: string }>('/auth/link/redeem', {
        method: 'POST',
        body: { token, password },
      }),
    onSuccess: (r) => {
      if ('needsCode' in r) setCodeToken(r.token);
      else done(r);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const mismatch = again.length > 0 && again !== password;

  if (link.isError)
    return (
      <Card>
        <CardHeader>
          <CardTitle>This link doesn't work</CardTitle>
          <CardDescription>{authError(link.error)}</CardDescription>
        </CardHeader>
      </Card>
    );

  const who = link.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" aria-hidden />
          {who?.hasPassword ? 'Reset your password' : 'Set your password'}
        </CardTitle>
        <CardDescription>
          {who ? (
            <>
              For{' '}
              <strong className="text-foreground">
                {who.displayName ? `${who.displayName} (${who.email})` : who.email}
              </strong>
              . You'll sign in with this email and password from now on.
            </>
          ) : (
            'Checking your link…'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {codeToken ? (
          <CodeStep
            token={codeToken}
            intro="Password saved. Your account also uses an authenticator app: enter the 6-digit code from it, or one of your recovery codes."
            onSignedIn={done}
          />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            {/* Lets password managers save the right account. */}
            <input type="email" autoComplete="username" value={who?.email ?? ''} readOnly hidden />
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password-again">Type it again</Label>
              <Input
                id="new-password-again"
                type="password"
                autoComplete="new-password"
                required
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                aria-invalid={mismatch}
              />
            </div>
            <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
            {mismatch && <Alert variant="destructive">The two passwords don't match.</Alert>}
            {save.isError && <Alert variant="destructive">{authError(save.error)}</Alert>}
            <Button
              type="submit"
              size="lg"
              disabled={
                save.isPending || !who || password.length < MIN_PASSWORD || password !== again
              }
            >
              {save.isPending ? 'Saving…' : 'Save password and sign in'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
