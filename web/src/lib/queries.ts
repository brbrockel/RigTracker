import { useQuery } from '@tanstack/react-query';
import { api, type Gear, type Person, type Rig, type RigEvent, type User } from '@/lib/api';

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
  users: ['users'] as const,
  audit: ['audit'] as const,
};

export const useRigs = () => useQuery({ queryKey: keys.rigs, queryFn: () => api<Rig[]>('/rigs') });
export const useRig = (id: string) =>
  useQuery({ queryKey: keys.rig(id), queryFn: () => api<Rig>(`/rigs/${id}`) });

export const useGear = () => useQuery({ queryKey: keys.gear, queryFn: () => api<Gear[]>('/gear') });
export const useGearItem = (id: string) =>
  useQuery({ queryKey: keys.gearItem(id), queryFn: () => api<Gear>(`/gear/${id}`) });

export const usePeople = () =>
  useQuery({ queryKey: keys.people, queryFn: () => api<Person[]>('/people') });
export const usePerson = (id: string) =>
  useQuery({ queryKey: keys.person(id), queryFn: () => api<Person>(`/people/${id}`) });

export const useEvents = () =>
  useQuery({ queryKey: keys.events, queryFn: () => api<RigEvent[]>('/events') });
export const useEvent = (id: string) =>
  useQuery({ queryKey: keys.event(id), queryFn: () => api<RigEvent>(`/events/${id}`) });

/** Sign-in accounts (admins only). */
export const useUsers = () =>
  useQuery({ queryKey: keys.users, queryFn: () => api<User[]>('/auth/users') });
