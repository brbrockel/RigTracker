/** Thin fetch wrapper for the RigTracker API (same origin; nginx or the Vite dev server proxies /api). */

let csrfToken: string | null = null;

/** The session's CSRF token, sent with every state-changing request. */
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T>(
  path: string,
  options: { method?: Method; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  // FormData (file uploads) sets its own multipart content type.
  const form = options.body instanceof FormData;
  if (options.body !== undefined && !form) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body:
      options.body === undefined
        ? undefined
        : form
          ? (options.body as FormData)
          : JSON.stringify(options.body),
  });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof data === 'object' && data && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** A readable message for a failed request. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session ended. Sign in again.';
    if (err.status === 403 && !/csrf/i.test(err.message))
      return "Your account can't do that. Ask an admin.";
    return err.message || fallback;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

// ── Accounts ────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'user' | 'viewer';

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  isActive: boolean;
  lastLoginAt: string | null;
  loginCount: number;
}

export interface Me {
  user: User;
  csrfToken: string;
  sessionExpiresAt: string;
}

export const isAdmin = (u?: User | null) => !!u?.roles.includes('admin');
/** Admins and users can add and change records; viewers can only look. */
export const canWrite = (u?: User | null) =>
  !!u?.roles.some((r) => r === 'admin' || r === 'user');
/** Only admins delete. */
export const canDelete = isAdmin;

// ── Records ─────────────────────────────────────────────────────────────────

export interface Person {
  _id: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  /** E.164, e.g. +18605551234 */
  phone?: string;
  address?: { line1?: string; line2?: string; city?: string; state?: string; zip?: string };
  dob?: string;
  emergencyContacts?: Array<{ name?: string; phone?: string; relation?: string }>;
  customFields?: Record<string, unknown>;
  /** Sign-in roles; missing or empty means they can't sign in. */
  roles?: Role[];
  /** false means sign-in is turned off. */
  isActive?: boolean;
  /** Only sent to admins. */
  lastLoginAt?: string | null;
  loginCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Rig {
  _id: string;
  name?: string;
  number?: string;
  container?: string;
  containerSerialNumber?: string;
  containerDOM?: string;
  mainSize?: string;
  mainDOM?: string;
  mainSerialNumber?: string;
  reserveSize?: string;
  reserveDOM?: string;
  reserveSerialNumber?: string;
  lastPacked?: string;
  riggerINT?: string;
  repackDue?: string;
  aadType?: string;
  aadDOM?: string;
  aadSerialNumber?: string;
  customFields?: Record<string, unknown>;
  primaryUserId?: string;
  notes?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Gear {
  _id: string;
  serialNumber?: string;
  name?: string;
  type?: string;
  dateOfManufacture?: string;
  notes?: string;
  imageUrl?: string;
  assignedRigId?: string;
  assignedPersonId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RigEvent {
  _id: string;
  name?: string;
  eventDate?: string;
  description?: string;
  /** The event's main photo or video. */
  eventPhotoUrl?: string;
  photoUrls?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditEntry {
  _id: string;
  action: string;
  resource: string;
  resourceId: string;
  resourceName?: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

/** GET /audit?resource=&action=&page=&limit= (admins only), newest first. */
export interface AuditPage {
  logs: AuditEntry[];
  total: number;
}

export interface SignInLink {
  link: string;
  email: string;
  expiresAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function personName(p?: Pick<Person, 'firstName' | 'lastName'> | null): string {
  if (!p) return '';
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
}

/** They have a sign-in role and sign-in isn't turned off. */
export const canSignIn = (p?: Pick<Person, 'roles' | 'isActive'> | null) =>
  !!p?.roles?.length && p.isActive !== false;

/** The person's sign-in access as a word. */
export function roleLabel(p?: Pick<Person, 'roles'> | null): 'Admin' | 'User' | 'Viewer' | 'No sign-in' {
  const roles = p?.roles ?? [];
  if (roles.includes('admin')) return 'Admin';
  if (roles.includes('user')) return 'User';
  if (roles.includes('viewer')) return 'Viewer';
  return 'No sign-in';
}

export function rigLabel(r?: Pick<Rig, 'number' | 'name'> | null): string {
  if (!r) return '';
  if (r.number && r.name) return `#${r.number} · ${r.name}`;
  return r.name || (r.number ? `Rig #${r.number}` : 'Unnamed rig');
}

const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
export const isVideo = (url?: string) => !!url && VIDEO.test(url.split('?')[0] ?? '');

/** Uploaded media lives under /uploads (members only); anything else is shown as given. */
export function mediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url;
  return `/${url}`;
}

/**
 * Uploads a photo or video. The server checks the file's content, re-encodes photos (no
 * location data) and picks the file name. folder is e.g. "gear/<name>", "rigs/<name>" or "events/<name>".
 */
export async function uploadMedia(file: File, folder: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { url } = await api<{ url: string }>(
    `/uploads/image?folder=${encodeURIComponent(folder)}`,
    { method: 'POST', body: form },
  );
  return url;
}

/**
 * A stored date, or null if there's none. Dates before 1950 are blanks from the old
 * spreadsheet import (an empty Excel date cell becomes 1899/1900), so they count as unset.
 */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1950) return null;
  return d;
}

/** "Mar 4, 2026" for a stored date, without shifting the day across time zones. */
export function formatDate(value?: string | null): string {
  const d = parseDate(value);
  if (!d) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The yyyy-mm-dd an <input type="date"> wants. */
export function dateInputValue(value?: string | null): string {
  return parseDate(value)?.toISOString().slice(0, 10) ?? '';
}

/** Whole days from today (UTC) to the date; negative when it's past. */
export function daysUntil(value?: string | null): number | null {
  const d = parseDate(value);
  if (!d) return null;
  const today = new Date();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((d.getTime() - t) / 86_400_000);
}
