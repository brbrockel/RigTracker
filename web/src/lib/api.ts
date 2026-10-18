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
export const canWrite = (u?: User | null) => !!u?.roles.some((r) => r === 'admin' || r === 'user');
/** Only admins delete. */
export const canDelete = isAdmin;

// ── Records ─────────────────────────────────────────────────────────────────

export interface Person {
  id: string;
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

/** The four places on a rig a piece of gear can fill. */
export type RigSlot = 'container' | 'main' | 'reserve' | 'aad';
export const RIG_SLOTS: RigSlot[] = ['container', 'main', 'reserve', 'aad'];
export const SLOT_LABELS: Record<RigSlot, string> = {
  container: 'Container',
  main: 'Main',
  reserve: 'Reserve',
  aad: 'AAD',
};

/** Who a photo or video belongs to. */
export type MediaOwnerType = 'rig' | 'gear' | 'event';

/** A photo or video of a rig, gear or event. Position 0 is the cover. */
export interface Media {
  id: string;
  /** An /uploads/... path (members only), or an https link from 1.x. */
  url: string;
  kind: 'photo' | 'video';
  caption: string | null;
  position: number;
}

/** What rigs, gear and events have: their photos and videos in order, and the first one's URL. */
export interface WithMedia {
  media?: Media[];
  coverUrl?: string | null;
}

/** The gear in one of a rig's slots, as rig responses include it. */
export interface RigComponent {
  id: string;
  name: string | null;
  type: string | null;
  serialNumber: string | null;
  dateOfManufacture: string | null;
  coverUrl: string | null;
}

export interface Rig extends WithMedia {
  id: string;
  name?: string;
  number?: string;
  lastPacked?: string;
  riggerINT?: string;
  repackDue?: string;
  customFields?: Record<string, unknown>;
  primaryUserId?: string;
  notes?: string;
  /** Its container, main, reserve and AAD: the gear in each slot, or null. */
  components?: Record<RigSlot, RigComponent | null>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Gear extends WithMedia {
  id: string;
  serialNumber?: string;
  name?: string;
  type?: string;
  dateOfManufacture?: string;
  notes?: string;
  assignedRigId?: string;
  assignedPersonId?: string;
  /** Which of its rig's components it is; null or missing for other gear. */
  slot?: RigSlot | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RigEvent extends WithMedia {
  id: string;
  name?: string;
  eventDate?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  resourceName?: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  details?: Record<string, unknown> | null;
  /** For changes: the record before and after (2.0.0-alpha.3 and later). */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
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
export function roleLabel(
  p?: Pick<Person, 'roles'> | null,
): 'Admin' | 'User' | 'Viewer' | 'No sign-in' {
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

/** "#4 · Four · Main": the rig, and the slot when the gear is one of its components. */
export function rigSlotLabel(rig: Pick<Rig, 'number' | 'name'> | undefined, slot?: RigSlot | null) {
  const r = rig ? rigLabel(rig) : 'Unknown rig';
  return slot ? `${r} · ${SLOT_LABELS[slot]}` : r;
}

const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
export const isVideo = (url?: string | null) => !!url && VIDEO.test(url.split('?')[0] ?? '');

/** Uploaded media lives under /uploads (members only); anything else is shown as given. */
export function mediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url;
  return `/${url}`;
}

/**
 * Adds a photo or video to the end of a rig's, gear's or event's list (the cover if it's the
 * first). The server checks the file's content, re-encodes photos (no location data) and
 * picks the file name.
 */
export async function uploadMedia(
  ownerType: MediaOwnerType,
  ownerId: string,
  file: File,
  caption?: string,
): Promise<Media> {
  const form = new FormData();
  form.append('ownerType', ownerType);
  form.append('ownerId', ownerId);
  if (caption?.trim()) form.append('caption', caption.trim());
  form.append('file', file);
  return api<Media>('/media', { method: 'POST', body: form });
}

/**
 * Uploads files one at a time, reporting progress ("Uploading 2 of 5…"). Files that fail are
 * listed with the reason; the rest are still added.
 */
export async function uploadAll(
  ownerType: MediaOwnerType,
  ownerId: string,
  files: File[],
  onProgress?: (message: string) => void,
): Promise<{ uploaded: Media[]; failed: string[] }> {
  const uploaded: Media[] = [];
  const failed: string[] = [];
  for (const [i, file] of files.entries()) {
    onProgress?.(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading…');
    try {
      uploaded.push(await uploadMedia(ownerType, ownerId, file));
    } catch (err) {
      failed.push(`${file.name}: ${errorMessage(err, 'upload failed')}`);
    }
  }
  return { uploaded, failed };
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
