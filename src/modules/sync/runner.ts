import { sync } from '@/core';
import { canSync, getSyncAccount, membershipOf, transportFor } from './account';
import type { SyncSummary } from './types';

const EVERY = 15_000;
let started = false;

/** Syncs one project now, with the account as it is set up on this device. */
export function syncProject(projectId: string): Promise<SyncSummary> {
  const account = getSyncAccount();
  if (!canSync(projectId, account)) return Promise.reject(new Error('Set up the cloud relay and sync key first.'));
  return sync.syncNow(projectId, transportFor(projectId), { id: account.deviceId, name: membershipOf(projectId)?.name ?? account.deviceName });
}

/** One pass over every project set to sync. Offline, it only counts what is waiting. */
export async function tick(): Promise<void> {
  const account = getSyncAccount();
  for (const projectId of await sync.enabled()) {
    if (!canSync(projectId, account) || !navigator.onLine) await sync.pending(projectId).catch(() => {});
    else await syncProject(projectId).catch(() => {});
  }
}

/**
 * BACKGROUND SYNC
 * Started once when the app opens. Edits are always saved locally first, by
 * the same code as ever; this only notices, every so often and whenever the
 * connection returns, what has changed since the last sync and exchanges it.
 * If there is no account or no connection it does nothing but count.
 */
export function startSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.setInterval(() => void tick(), EVERY);
  window.addEventListener('online', () => void tick());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void tick());
  void tick();
}
