import { useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api, type Me } from '@/lib/api';
import { authError } from '@/lib/passwords';

/**
 * The second step for accounts with an authenticator app: a 6-digit code, or one of the
 * recovery codes. `token` comes from the password (or password link) step and lasts 5 minutes.
 */
export function CodeStep({
  token,
  intro,
  onSignedIn,
  onBack,
}: {
  token: string;
  intro?: string;
  onSignedIn: (me: Me) => void | Promise<void>;
  onBack?: () => void;
}) {
  const [code, setCode] = useState('');
  const verify = useMutation({
    mutationFn: () =>
      api<Me>('/auth/sign-in/code', { method: 'POST', body: { token, code: code.trim() } }),
    onSuccess: onSignedIn,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    verify.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {intro ??
          'Enter the 6-digit code from your authenticator app, or one of your recovery codes.'}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signin-code">Code</Label>
        <Input
          id="signin-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
        />
      </div>
      {verify.isError && <Alert variant="destructive">{authError(verify.error)}</Alert>}
      <Button type="submit" size="lg" disabled={verify.isPending || code.trim().length < 6}>
        {verify.isPending ? 'Checking…' : 'Verify'}
      </Button>
      {onBack && (
        <button type="button" className="text-sm text-muted-foreground underline" onClick={onBack}>
          Back
        </button>
      )}
    </form>
  );
}
