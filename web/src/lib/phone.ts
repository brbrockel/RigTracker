/**
 * Phone and email helpers (TeeMate's approach, no libphonenumber). US numbers can be typed any
 * way ("860-555-1234", "(860) 555 1234", "1 860 555 1234"); others need a leading +.
 */
export function normalizePhone(input?: string | null): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+'))
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export const PHONE_HINT = 'A 10-digit US number, or an international one starting with +';

/** "+18605551234" -> "(860) 555-1234"; other countries are shown as stored. */
export function formatPhone(e164?: string | null): string {
  if (!e164) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (value: string) => EMAIL.test(value.trim());

export const mapsUrl = (address: string) =>
  `https://maps.google.com/?q=${encodeURIComponent(address)}`;
