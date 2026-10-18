import { Check, Copy, Mail, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
import type { SignInLink } from '@/lib/api';
import { smsHref } from '@/lib/sms';

export function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Shows a single-use password link for the admin to pass on: opening it lets the person set
 * (or reset) their password and signs them in. Nothing is sent by the server:
 * Text and Email open the admin's own Messages or mail app with the link filled in.
 */
export function SignInLinkDialog({
  name,
  info,
  onClose,
}: {
  name: string;
  info: SignInLink;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const until = formatDateTime(info.expiresAt);
  const message = `Your RigTracker password link (works once, until ${until}). Open it to set your password: ${info.link}`;
  const mailHref = `mailto:${info.email}?subject=${encodeURIComponent('Your RigTracker password link')}&body=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.link);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Password link for ${name}`}
        description={`It works once, until ${until}, and sets a new password for ${info.email}. Anyone with the link can do that, so only send it to them.`}
      >
        <div className="flex flex-col gap-3">
          <Label htmlFor="sign-in-link" className="sr-only">
            Password link
          </Label>
          <textarea
            id="sign-in-link"
            readOnly
            rows={3}
            value={info.link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-none break-all rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button asChild variant="outline">
              <a href={smsHref([], message)}>
                <MessageSquare /> Text
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={mailHref}>
                <Mail /> Email
              </a>
            </Button>
          </div>
          {copyFailed && (
            <p className="text-xs text-destructive">Couldn't copy. Select the link and copy it.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Nothing is sent by RigTracker: Text and Email open your own apps with the link filled
            in.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
