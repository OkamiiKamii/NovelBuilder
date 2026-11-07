import type { SyncRequest, SyncResponse } from './relay';
import { differingFields, fingerprint, mergeRows } from './merge';
import { NO_BASE_ROW, TEXT_TABLES, type BaseEntry, type Row, type SyncConflict, type SyncLogEntry, type SyncState, type SyncSummary } from './types';

/** How the engine reaches the cloud. */
export interface Transport {
  sync(request: SyncRequest): Promise<SyncResponse>;
}

/** Everything the engine needs from this device, for one project. */
export interface ProjectStore {
  projectId: string;
  /** Every row of the project as it is right now, by `table:id`. */
  readLocal(): Promise<Map<string, Row>>;
  /** Writes rows exactly as given (null deletes), then lets the app catch up (counts, totals). */
  apply(changes: { key: string; row: Row | null }[]): Promise<void>;
  readBase(): Promise<Map<string, BaseEntry>>;
  writeBase(entries: { key: string; hash: string | null; seq: number; row: Row | null }[]): Promise<void>;
  conflicts(): Promise<SyncConflict[]>;
  putConflict(conflict: SyncConflict): Promise<void>;
  removeConflict(id: string): Promise<void>;
  state(): Promise<SyncState>;
  setState(changes: Partial<SyncState>): Promise<void>;
  log(entry: Omit<SyncLogEntry, 'id' | 'projectId' | 'at' | 'seq'>): Promise<void>;
  /** A name for a row, for telling the author what is in conflict. */
  label(key: string, row: Row | null): string;
  newId(): string;
}

export interface Device {
  id: string;
  name: string;
}

export const tableOf = (key: string): string => key.slice(0, key.indexOf(':'));
export const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);
/** Settings follow the device that changed them last; they never stop a sync. */
const isSetting = (key: string) => tableOf(key) === 'settings';
const baseRow = (key: string, row: Row | null) => (NO_BASE_ROW.includes(tableOf(key)) ? null : row);
const PUSH_BATCH = 150;

/** How many local changes are waiting to be sent. Reads only. */
export async function countPending(store: ProjectStore): Promise<number> {
  const [local, base, conflicts] = [await store.readLocal(), await store.readBase(), new Set((await store.conflicts()).map((c) => c.key))];
  let pending = 0;
  for (const [key, row] of local) if (!conflicts.has(key) && fingerprint(tableOf(key), row) !== (base.get(key)?.hash ?? null)) pending++;
  for (const [key, entry] of base) if (entry.hash !== null && !local.has(key) && !conflicts.has(key) && tableOf(key) !== 'projects') pending++;
  return pending;
}

/**
 * LOCAL AUTHORITY, AND ZERO SILENT DATA OVERWRITE
 * One round of sync for one project.
 *
 *  1. Ask the cloud what has changed since this device last looked.
 *  2. For each such row: if this device has not touched it, take it. If
 *     both changed it, combine the fields each changed on their own; where
 *     both changed the same field (or the same text), stop, keep this
 *     device's version untouched, hold the cloud's beside it and ask the
 *     author. Nothing is chosen on the author's behalf.
 *  3. Send what this device changed and the cloud has not: only the changed
 *     rows, each with the version it started from, so the cloud can refuse
 *     anything that has moved on in the meantime.
 *
 * Everything local was already saved before this runs; sync never stands
 * between the author and the disk.
 */
export async function syncOnce(store: ProjectStore, transport: Transport, device: Device): Promise<SyncSummary> {
  const summary: SyncSummary = { pulled: 0, pushed: 0, merged: 0, conflicts: 0, denied: 0 };
  const state = await store.state();
  const base = await store.readBase();
  const local = await store.readLocal();
  const open = new Map((await store.conflicts()).map((c) => [c.key, c]));
  const request = (cursor: number, changes: SyncRequest['changes']): SyncRequest => ({ deviceId: device.id, deviceName: device.name, projectId: store.projectId, cursor, changes });

  // ---- 1 and 2: take in what others have done
  // After a first sync or a failed one this device cannot be sure of what it was sent, so it asks for everything it may see again.
  const pulled = await transport.sync({ ...request(state.cursor, []), resync: state.cursor === 0 || Boolean(state.lastError) });
  const toApply: { key: string; row: Row | null }[] = [];
  const newBase: { key: string; hash: string | null; seq: number; row: Row | null }[] = [];
  const setBase = (key: string, row: Row | null, seq: number) => {
    const entry = { key, hash: fingerprint(tableOf(key), row), seq, row: baseRow(key, row) };
    newBase.push(entry);
    base.set(key, { id: '', projectId: store.projectId, ...entry });
  };
  const names = new Map(pulled.devices.map((d) => [d.id, d.name]));

  for (const change of pulled.remote) {
    const { key, row: remote, seq } = change;
    const table = tableOf(key);
    const known = base.get(key);
    // `force` marks a row sent because of what this person may now see (or no longer see), not because it moved on.
    if (known && known.seq >= seq && !change.force) continue;
    const mine = local.get(key) ?? null;
    const [mineHash, remoteHash] = [fingerprint(table, mine), fingerprint(table, remote)];
    if (change.force && known && known.seq === seq && known.hash === remoteHash) continue;
    const changedHere = known ? mineHash !== known.hash : mine !== null;

    if (mineHash === remoteHash) {
      // Both ended up the same: nothing to do but remember it.
      setBase(key, remote, seq);
      if (open.has(key)) await store.removeConflict(open.get(key)!.id);
      continue;
    }
    if (!changedHere) {
      // A project is never deleted from under its author by another device.
      if (table === 'projects' && remote === null) continue;
      toApply.push({ key, row: remote });
      local.set(key, remote as Row);
      if (remote === null) local.delete(key);
      setBase(key, remote, seq);
      summary.pulled++;
      continue;
    }
    if (isSetting(key)) {
      // This device's setting stays and is sent on; the other is noted in the history so it can be read back.
      setBase(key, remote, seq);
      await store.log({ kind: 'settings', message: `${store.label(key, mine)} was changed on this device and on ${names.get(change.deviceId) ?? 'another device'}. This device's was kept.`, detail: JSON.stringify(remote) });
      continue;
    }

    // Changed on both sides.
    let fields: SyncConflict['fields'] = [];
    let merged: Row | null = null;
    if (mine && remote && !TEXT_TABLES.includes(table)) {
      if (known?.row) {
        const result = mergeRows(table, known.row, mine, remote);
        if (result.conflicts.length === 0) {
          // Different fields were changed: both sets of changes stand.
          toApply.push({ key, row: result.merged });
          local.set(key, result.merged);
          setBase(key, remote, seq);
          summary.merged++;
          if (open.has(key)) await store.removeConflict(open.get(key)!.id);
          continue;
        }
        fields = result.conflicts;
        merged = result.merged;
      } else {
        fields = differingFields(table, mine, remote);
        merged = { ...mine };
      }
    }
    const existing = open.get(key);
    const conflict: SyncConflict = {
      id: existing?.id ?? store.newId(), projectId: store.projectId, key, table, rowId: idOf(key),
      kind: !mine || !remote ? 'removed' : TEXT_TABLES.includes(table) ? 'text' : 'fields',
      base: known?.row ?? null, local: mine, remote, remoteSeq: seq, fields, merged, label: store.label(key, mine ?? remote),
      remoteDevice: names.get(change.deviceId) ?? 'another device', detectedAt: existing?.detectedAt ?? Date.now(),
    };
    await store.putConflict(conflict);
    open.set(key, conflict);
    if (!existing) {
      summary.conflicts++;
      await store.log({ kind: 'conflict', message: `“${conflict.label}” was changed on this device and on ${conflict.remoteDevice}. Both versions are kept until you choose.` });
    }
  }
  if (toApply.length) await store.apply(toApply);
  if (newBase.length) await store.writeBase(newBase);
  let cursor = Math.max(state.cursor, pulled.cursor);

  // ---- 3: send what this device changed
  const current = toApply.length ? await store.readLocal() : local;
  const changes: SyncRequest['changes'] = [];
  for (const [key, row] of current) {
    if (open.has(key)) continue;
    const known = base.get(key);
    if (fingerprint(tableOf(key), row) !== (known?.hash ?? null)) changes.push({ key, row, baseSeq: known?.seq ?? 0 });
  }
  for (const [key, known] of base) {
    // Deleting a whole project here never deletes it in the cloud or on other devices.
    if (known.hash !== null && !current.has(key) && !open.has(key) && tableOf(key) !== 'projects') changes.push({ key, row: null, baseSeq: known.seq });
  }
  const refused = new Map<string, string>();
  for (let i = 0; i < changes.length; i += PUSH_BATCH) {
    const batch = changes.slice(i, i + PUSH_BATCH);
    const pushed = await transport.sync(request(cursor, batch));
    for (const { key, reason } of pushed.denied ?? []) refused.set(key, reason);
    const sent = new Map(batch.map((c) => [c.key, c.row]));
    await store.writeBase(pushed.accepted.map(({ key, seq }) => ({ key, hash: fingerprint(tableOf(key), sent.get(key) ?? null), seq, row: baseRow(key, sent.get(key) ?? null) })));
    summary.pushed += pushed.accepted.length;
    // Only skip ahead when nobody else got in between; otherwise the next round takes their changes in properly.
    if (pushed.remote.length === 0) cursor = pushed.cursor;
  }

  // A change this person's role does not allow is not sent again and again in silence, and is not thrown away either: it
  // stays on this device, counted as waiting, and is reported the first time it is refused.
  const already = new Set(state.denied ?? []);
  const fresh = [...refused].filter(([key]) => !already.has(key));
  if (fresh.length) await store.log({ kind: 'error', message: `The cloud did not take ${fresh.length === 1 ? 'one change' : `${fresh.length} changes`} your role does not allow: ${fresh.slice(0, 4).map(([key]) => store.label(key, current.get(key) ?? null)).join(', ')}${fresh.length > 4 ? '…' : ''}. ${fresh[0][1]} What you changed is still on this device.` });
  summary.denied = refused.size;

  const conflicts = (await store.conflicts()).length;
  await store.setState({ cursor, lastSyncAt: Date.now(), lastError: null, pending: refused.size, denied: [...refused.keys()] });
  if (summary.pulled || summary.pushed || summary.merged) {
    await store.log({ kind: 'sync', message: [summary.pushed ? `${summary.pushed} sent` : '', summary.pulled ? `${summary.pulled} received` : '', summary.merged ? `${summary.merged} combined` : ''].filter(Boolean).join(', ') + '.' });
  }
  return { ...summary, conflicts };
}

export type Resolution =
  | { choice: 'local' }
  | { choice: 'remote' }
  /** The author's own combination: a whole row (merged text), or a choice per conflicting field. */
  | { choice: 'merged'; row: Row }
  | { choice: 'fields'; take: Record<string, 'local' | 'remote'> };

/**
 * Settles a conflict the way the author chose. Only now does anything
 * change: the chosen version becomes this device's, and is sent to the
 * cloud on the next round as the one that stands.
 */
export async function resolveConflict(store: ProjectStore, conflictId: string, resolution: Resolution, beforeReplacing?: (conflict: SyncConflict) => Promise<void>): Promise<void> {
  const conflict = (await store.conflicts()).find((c) => c.id === conflictId);
  if (!conflict) throw new Error('That conflict has already been settled.');
  const { key, local, remote, remoteSeq } = conflict;
  let chosen: Row | null;
  if (resolution.choice === 'local') chosen = local;
  else if (resolution.choice === 'remote') chosen = remote;
  else if (resolution.choice === 'merged') chosen = resolution.row;
  else {
    chosen = { ...(conflict.merged ?? local ?? {}) };
    for (const field of conflict.fields) {
      const value = resolution.take[field.field] === 'remote' ? field.remote : field.local;
      if (value === undefined) delete chosen[field.field];
      else chosen[field.field] = value;
    }
  }
  // Whatever is about to be replaced on this device gets a chance to be kept somewhere first (text goes to version history).
  if (resolution.choice !== 'local' && beforeReplacing) await beforeReplacing(conflict);
  if (resolution.choice !== 'local') await store.apply([{ key, row: chosen }]);
  // From here on the cloud's version counts as seen, so the chosen one is sent as a change on top of it.
  await store.writeBase([{ key, hash: fingerprint(tableOf(key), remote), seq: remoteSeq, row: baseRow(key, remote) }]);
  await store.removeConflict(conflict.id);
  const how = resolution.choice === 'local' ? 'this device’s version was kept' : resolution.choice === 'remote' ? 'the cloud’s version was kept' : 'the two were combined by hand';
  await store.log({ kind: 'resolved', message: `“${conflict.label}”: ${how}.` });
}
