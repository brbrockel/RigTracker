import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useUser } from '@/auth/session';
import {
  api,
  isGuest,
  type Gear,
  type MediaOwnerType,
  type Person,
  type Rig,
  type RigEvent,
} from '@/lib/api';

/** Query keys; invalidate the list key after a change (detail keys sit under it). */
export const keys = {
  rigs: ['rigs'] as const,
  rig: (id: string) => ['rigs', id] as const,
  gear: ['gear'] as const,
  gearItem: (id: string) => ['gear', id] as const,
  people: ['people'] as const,
  person: (id: string) => ['people', id] as const,
  events: ['events'] as const,
  event: (id: string) => ['events', id] as const,
  audit: ['audit'] as const,
};

/** After a gear change: rigs list their components (the gear in their slots), so both. */
export const invalidateGear = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: keys.gear }),
    qc.invalidateQueries({ queryKey: keys.rigs }),
  ]);

/** After a photo or video change: the owner's lists (gear covers also show on rigs). */
export const invalidateMediaOwner = (qc: QueryClient, ownerType: MediaOwnerType) =>
  ownerType === 'event'
    ? qc.invalidateQueries({ queryKey: keys.events })
    : ownerType === 'gear'
      ? invalidateGear(qc)
      : qc.invalidateQueries({ queryKey: keys.rigs });

export const useRigs = () => useQuery({ queryKey: keys.rigs, queryFn: () => api<Rig[]>('/rigs') });
export const useRig = (id: string) =>
  useQuery({ queryKey: keys.rig(id), queryFn: () => api<Rig>(`/rigs/${id}`) });

export const useGear = () => useQuery({ queryKey: keys.gear, queryFn: () => api<Gear[]>('/gear') });
export const useGearItem = (id: string) =>
  useQuery({ queryKey: keys.gearItem(id), queryFn: () => api<Gear>(`/gear/${id}`) });

/**
 * Everyone on People. Guests can't read People: for them it's the people that rigs and gear
 * name, as "First L." (in firstName), so pages can show names the same way.
 */
export function usePeople() {
  const guest = isGuest(useUser());
  const qc = useQueryClient();
  return useQuery({
    queryKey: guest ? [...keys.people, 'guest'] : keys.people,
    queryFn: guest ? () => guestPeople(qc) : () => api<Person[]>('/people'),
  });
}

async function guestPeople(qc: QueryClient): Promise<Person[]> {
  const [rigs, gear] = await Promise.all([
    qc.ensureQueryData({ queryKey: keys.rigs, queryFn: () => api<Rig[]>('/rigs') }),
    qc.ensureQueryData({ queryKey: keys.gear, queryFn: () => api<Gear[]>('/gear') }),
  ]);
  const names = new Map<string, string>();
  for (const r of rigs) if (r.primaryUserId) names.set(r.primaryUserId, r.primaryUserName ?? '');
  for (const g of gear)
    if (g.assignedPersonId) names.set(g.assignedPersonId, g.assignedPersonName ?? '');
  return [...names].map(([id, firstName]) => ({ id, firstName }));
}
export const usePerson = (id: string) =>
  useQuery({ queryKey: keys.person(id), queryFn: () => api<Person>(`/people/${id}`) });

export const useEvents = () =>
  useQuery({ queryKey: keys.events, queryFn: () => api<RigEvent[]>('/events') });
export const useEvent = (id: string) =>
  useQuery({ queryKey: keys.event(id), queryFn: () => api<RigEvent>(`/events/${id}`) });
