import { useSyncExternalStore } from 'react';
import type { Role } from '@/modules/sync/access';
import { getSyncAccount, membershipOf, useMembership, useSyncAccount } from '@/modules/sync/account';

/** Who the person at this device is, in one project. */
export interface Me {
  id: string;
  name: string;
  role: Role;
}

/** The owner's id on every device that holds the account's key. */
export const OWNER_ID = 'owner';

/**
 * On a project this person was invited to, they are who the relay says they
 * are. On any other, they are its owner: it is their own project, whether
 * it is shared with anyone or not.
 */
export function meIn(projectId: string): Me {
  const membership = membershipOf(projectId);
  if (membership) return { id: membership.memberId, name: membership.name, role: membership.role };
  return { id: OWNER_ID, name: getSyncAccount().userName.trim() || 'The owner', role: 'owner' };
}

export function useMe(projectId: string): Me {
  const membership = useMembership(projectId);
  const account = useSyncAccount();
  return membership ? { id: membership.memberId, name: membership.name, role: membership.role } : { id: OWNER_ID, name: account.userName.trim() || 'The owner', role: 'owner' };
}

const COLORS = ['#b4532a', '#3b6ea5', '#3f7d4e', '#8a4fa3', '#a8324a', '#2f8f8f', '#9a7b1f', '#5b5fc7'];
/** A colour for a person, the same on every device, for telling collaborators' changes apart. */
export function colorOf(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

// Kept so a component can re-render on demand in tests without the stores.
export const useTick = (subscribe: (listener: () => void) => () => void, snapshot: () => number): number => useSyncExternalStore(subscribe, snapshot);
