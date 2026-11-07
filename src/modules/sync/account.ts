import { useSyncExternalStore } from 'react';
import { dashboardKey, dashboards } from '@/modules/dashboard/layout';
import { prefsKey, reloadPrefs } from '@/modules/manuscript/preferences';
import { FORMS } from '@/modules/platform/device';
import { studio, studioKeys } from '@/modules/studio/store';
import type { Role } from './access';
import type { RelayDevice, RelayMemberInfo, RelaySnapshot, SyncRequest, SyncResponse } from './relay';
import type { SettingsAdapter } from './service';
import type { Row } from './types';

/** Who this device is and which cloud it talks to. Kept on this device only. */
export interface SyncAccount {
  /** Where the relay is, e.g. `https://sync.example.com`. */
  relayUrl: string;
  /** The account: every device holding the same key shares the same projects. */
  syncKey: string;
  deviceId: string;
  deviceName: string;
  /** The name this person's work is signed with when others are on a project. */
  userName: string;
}

const KEY = 'novel-builder:sync-account';
const random = (bytes: number): string => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
/** A long random key. Whoever holds it can read and change the account's projects, so it is treated like a password. */
export const newSyncKey = (): string => `nb-${random(24)}`;
const guessName = (): string => (typeof navigator === 'undefined' ? 'This device' : /iPhone|iPad|Android/.test(navigator.userAgent) ? 'Phone or tablet' : /Mac/.test(navigator.platform) ? 'Mac' : /Win/.test(navigator.platform) ? 'Windows PC' : 'This device');

function read(): SyncAccount {
  let stored: Partial<SyncAccount> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SyncAccount>;
  } catch {
    // unreadable: start again
  }
  const account: SyncAccount = {
    relayUrl: typeof stored.relayUrl === 'string' ? stored.relayUrl : '', syncKey: typeof stored.syncKey === 'string' ? stored.syncKey : '',
    deviceId: typeof stored.deviceId === 'string' && stored.deviceId ? stored.deviceId : `dev-${random(8)}`, deviceName: typeof stored.deviceName === 'string' && stored.deviceName.trim() ? stored.deviceName : guessName(),
    userName: typeof stored.userName === 'string' ? stored.userName : '',
  };
  if (!stored.deviceId) save(account);
  return account;
}
function save(account: SyncAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    // kept for this visit only
  }
}

let current: SyncAccount | null = null;
const listeners = new Set<() => void>();
export const getSyncAccount = (): SyncAccount => (current ??= read());
export function setSyncAccount(changes: Partial<Pick<SyncAccount, 'relayUrl' | 'syncKey' | 'deviceName' | 'userName'>>): void {
  current = { ...getSyncAccount(), ...changes, relayUrl: (changes.relayUrl ?? getSyncAccount().relayUrl).trim().replace(/\/+$/, ''), syncKey: (changes.syncKey ?? getSyncAccount().syncKey).trim() };
  save(current);
  listeners.forEach((listener) => listener());
}
export const useSyncAccount = (): SyncAccount =>
  useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getSyncAccount);
export const isConfigured = (account: SyncAccount): boolean => /^https?:\/\//.test(account.relayUrl) && account.syncKey.length >= 20;

/**
 * A project this person was invited to. The token is their way in, and is
 * kept on this device only, like the sync key. The role is what the relay
 * said at the last sync; the relay, not this record, decides what they may do.
 */
export interface Membership {
  projectId: string;
  relayUrl: string;
  token: string;
  memberId: string;
  name: string;
  role: Role;
}
const MEMBERSHIPS = 'novel-builder:memberships';
let memberships: Record<string, Membership> | null = null;
const readMemberships = (): Record<string, Membership> => {
  if (memberships) return memberships;
  try {
    memberships = JSON.parse(localStorage.getItem(MEMBERSHIPS) ?? '{}') as Record<string, Membership>;
  } catch {
    memberships = {};
  }
  return memberships;
};
export const membershipOf = (projectId: string): Membership | null => readMemberships()[projectId] ?? null;
export function setMembership(projectId: string, membership: Membership | null): void {
  const next = { ...readMemberships() };
  if (membership) next[projectId] = membership;
  else delete next[projectId];
  memberships = next;
  try {
    localStorage.setItem(MEMBERSHIPS, JSON.stringify(next));
  } catch {
    // kept for this visit only
  }
  listeners.forEach((listener) => listener());
}
export const useMembership = (projectId: string): Membership | null =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => membershipOf(projectId),
  );

/** Whether this device has what it needs to sync this project: the account's key, or an invitation to it. */
export const canSync = (projectId: string, account: SyncAccount = getSyncAccount()): boolean => Boolean(membershipOf(projectId)) || isConfigured(account);

export class RelayError extends Error {}

async function gzip(text: string): Promise<{ body: BodyInit; encoding: Record<string, string> }> {
  if (typeof CompressionStream === 'undefined') return { body: text, encoding: {} };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { body: await new Response(stream).blob(), encoding: { 'content-encoding': 'gzip' } };
}

/**
 * Talks to the relay. Changes are sent compressed; nothing but the changed
 * rows of the project being synced, this device's name and id, and the key
 * ever leaves the device, and only to the relay the author entered.
 */
export function relayClient(account: Pick<SyncAccount, 'relayUrl' | 'syncKey'>, fetcher: typeof fetch = fetch) {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      const packed = body === undefined ? null : await gzip(JSON.stringify(body));
      response = await fetcher(`${account.relayUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${account.syncKey}`, ...(packed ? { 'content-type': 'application/json', ...packed.encoding } : {}) },
        body: packed?.body,
      });
    } catch {
      throw new RelayError('The cloud could not be reached. Your work is saved on this device and will be sent when the connection is back.');
    }
    if (response.status === 401) throw new RelayError('The sync key was not accepted.');
    if (!response.ok) {
      const said = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new RelayError(said?.error ?? `The cloud refused the request (${response.status}).`);
    }
    return (await response.json()) as T;
  }
  return {
    sync: (request: SyncRequest) => call<SyncResponse>('/v1/sync', request),
    // The team: only the account's own key can do these. An invitation's token is returned once, here, and is not kept by the relay.
    invite: (invite: { projectId: string; role: Role; name: string; email: string }) => call<{ member: RelayMemberInfo; token: string }>('/v1/members/invite', invite),
    members: (projectId: string) => call<{ members: RelayMemberInfo[] }>(`/v1/members?project=${encodeURIComponent(projectId)}`),
    updateMember: (memberId: string, changes: { role?: Role; status?: 'revoked' | 'active' }) => call<{ member: RelayMemberInfo }>('/v1/members/update', { memberId, ...changes }),
    // For someone holding an invitation (their token is the key here).
    invitation: () => call<{ projectId: string; title: string; role: Role; name: string; joined: boolean }>('/v1/invite'),
    join: (name: string) => call<{ member: RelayMemberInfo; projectId: string; title: string; role: Role; name: string }>('/v1/join', { name }),
    projects: () => call<{ projects: { id: string; title: string; updatedAt: number; rows: number }[]; devices: RelayDevice[] }>('/v1/projects'),
    snapshots: (projectId: string) => call<{ snapshots: RelaySnapshot[] }>(`/v1/snapshots?project=${encodeURIComponent(projectId)}`),
    snapshot: (projectId: string, id: string) => call<{ state: Record<string, Row> }>(`/v1/snapshot?project=${encodeURIComponent(projectId)}&id=${encodeURIComponent(id)}`),
    backupNow: (projectId: string) => call<{ snapshot: RelaySnapshot }>('/v1/backup', { projectId }),
    forgetDevice: (deviceId: string) => call<{ ok: boolean }>('/v1/forget-device', { deviceId }),
  };
}

// Each kind of device has its own layouts and editor appearance. All of them travel, each under its own key, so a
// phone's layout arrives on a desktop as the phone's layout and is never read as the desktop's.
const GLOBAL_SETTINGS = [...FORMS.flatMap((form) => [prefsKey(form), studioKeys(form).global]), 'novel-builder:studio:shortcuts'];
const projectSettings = (projectId: string) => [...FORMS.flatMap((form) => [studioKeys(form).project(projectId), studioKeys(form).session(projectId)]), `novel-builder:scratch:${projectId}`, dashboardKey(projectId)];

/**
 * The settings that travel with sync: editor appearance, workspace layouts,
 * shortcuts, the active workspace, the project's notes and its dashboard. The sync account
 * itself and the assistant's API key are deliberately not among them.
 */
/** Every settings key that travels with a project. */
export const syncedSettingKeys = (projectId: string): string[] => [...GLOBAL_SETTINGS, ...projectSettings(projectId)];
/** Whether a key arriving from the cloud is one this app keeps settings under. Anything else is ignored. */
export const isSyncedSetting = (key: string): boolean => GLOBAL_SETTINGS.includes(key) || /^novel-builder:(studio:(tablet:|phone:)?(layout|session)|scratch|dashboard):[\w-]+$/.test(key);

export const browserSettings: SettingsAdapter = {
  read(projectId) {
    const out = new Map<string, string>();
    // Someone else's project: this person's layouts and appearance are their own and stay on their devices.
    if (membershipOf(projectId)) return out;
    for (const key of syncedSettingKeys(projectId)) {
      try {
        const value = localStorage.getItem(key);
        if (value !== null) out.set(key, value);
      } catch {
        // storage unavailable: nothing to sync
      }
    }
    return out;
  },
  write(key, value) {
    if (!isSyncedSetting(key)) return;
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      return;
    }
    // Let the parts of the app that hold these in memory read them again.
    studio.refresh();
    dashboards.refresh();
    reloadPrefs();
  },
};

/**
 * How this device reaches the cloud for a project: on its invitation if it
 * has one, otherwise with the account's own key. On an invitation, whatever
 * the relay says of the person's role and name is taken as the truth.
 */
export function transportFor(projectId: string): { sync: (request: SyncRequest) => Promise<SyncResponse> } {
  const membership = membershipOf(projectId);
  if (!membership) return relayClient(getSyncAccount());
  const client = relayClient({ relayUrl: membership.relayUrl, syncKey: membership.token });
  return {
    async sync(request) {
      const response = await client.sync(request);
      const told = response.member;
      const now = membershipOf(projectId);
      if (told && now && (told.role !== now.role || told.name !== now.name)) setMembership(projectId, { ...now, role: told.role, name: told.name });
      return response;
    },
  };
}
