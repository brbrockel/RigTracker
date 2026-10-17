import { Mail, MapPin, MessageSquare, Phone } from 'lucide-react';
import { formatPhone, mapsUrl } from '@/lib/phone';
import { cn } from '@/lib/utils';

const link =
  'inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-primary sm:min-h-0';

/** Tap-to-call, text, email and map links for a person. */
export function ContactLinks({
  email,
  phone,
  address,
  className,
}: {
  email?: string;
  phone?: string | null;
  address?: string | null;
  className?: string;
}) {
  if (!email && !phone && !address) return null;
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-0.5', className)}>
      {phone && (
        <>
          <a className={link} href={`tel:${phone}`} aria-label={`Call ${formatPhone(phone)}`}>
            <Phone className="size-4" aria-hidden /> {formatPhone(phone)}
          </a>
          <a className={link} href={`sms:${phone}`} aria-label={`Text ${formatPhone(phone)}`}>
            <MessageSquare className="size-4" aria-hidden /> Text
          </a>
        </>
      )}
      {email && (
        <a className={cn(link, 'min-w-0 break-all')} href={`mailto:${email}`}>
          <Mail className="size-4 shrink-0" aria-hidden /> {email}
        </a>
      )}
      {address && (
        <a className={link} href={mapsUrl(address)} target="_blank" rel="noreferrer">
          <MapPin className="size-4 shrink-0" aria-hidden /> {address}
        </a>
      )}
    </div>
  );
}

/** One line for a stored address, or '' when it's empty. */
export function addressLine(a?: {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string {
  if (!a) return '';
  const cityState = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a.line1, a.line2, cityState].filter((s) => s && s.trim()).join(', ');
}

/** "First Middle Last", or "Unnamed person". */
export const fullName = (p: { firstName?: string; middleName?: string; lastName?: string }) =>
  [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim() || 'Unnamed person';
