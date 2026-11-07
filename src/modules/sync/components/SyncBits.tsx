import { EditorContent, useEditor } from '@tiptap/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, sync } from '@/core';
import { CompareDialog } from '@/modules/manuscript/components/CompareDialog';
import { ReadOnlyDoc } from '@/modules/manuscript/components/ReadOnlyDoc';
import { createExtensions } from '@/modules/manuscript/editor/extensions';
import type { DocJSON } from '@/modules/manuscript/types';
import { Modal } from '@/shared/Modal';
import { useOnline } from '@/shared/useOnline';
import { canSync, isConfigured, membershipOf, newSyncKey, relayClient, setSyncAccount, useMembership, useSyncAccount } from '../account';
import type { RelayDevice } from '../relay';
import { STATUS_LABELS, type SyncConflict, type SyncState, type SyncStatus } from '../types';

/** Where a project stands with the cloud, in one of the five words the author sees. */
export function useSyncStatus(projectId: string): { status: SyncStatus; state: SyncState | undefined; conflicts: number } {
  const online = useOnline();
  const account = useSyncAccount();
  const state = useLiveQuery(() => sync.state(projectId), [projectId]);
  const conflicts = useLiveQuery(() => db.syncConflicts.where('projectId').equals(projectId).count(), [projectId]) ?? 0;
  useMembership(projectId);
  const status: SyncStatus = !state?.enabled || !canSync(projectId, account) ? 'off' : conflicts > 0 ? 'conflict' : !online ? 'offline' : state.syncing ? 'syncing' : state.lastError ? 'error' : 'synced';
  return { status, state, conflicts };
}

/** The sync status of the project, wherever the author is in it. Hidden until the project is set to sync. */
export function SyncBadge({ projectId }: { projectId: string }) {
  const { status, state, conflicts } = useSyncStatus(projectId);
  // Recount what is waiting shortly after the project changes, so the badge is honest between syncs and while offline.
  const touched = useLiveQuery(async () => (await db.projects.get(projectId))?.updatedAt, [projectId]);
  useEffect(() => {
    if (status === 'off') return;
    const timer = window.setTimeout(() => void sync.pending(projectId).catch(() => {}), 1200);
    return () => window.clearTimeout(timer);
  }, [projectId, touched, status === 'off']);
  if (status === 'off') return null;
  const waiting = state?.pending ?? 0;
  return (
    <Link to={`/project/${projectId}/${membershipOf(projectId) ? 'team' : 'sync'}`} className={`sync-badge sync-${status}`} title={state?.lastError ?? 'Cloud sync'} aria-label={`Cloud sync: ${STATUS_LABELS[status]}`}>
      <span className="sync-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
      {status === 'conflict' && conflicts > 1 ? ` (${conflicts})` : ''}
      {(status === 'offline' || status === 'error') && waiting > 0 ? ` · ${waiting} waiting` : ''}
    </Link>
  );
}

/** The relay, the key and this device's name; and who else is on the account. */
export function AccountPanel() {
  const account = useSyncAccount();
  const [devices, setDevices] = useState<RelayDevice[] | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [shown, setShown] = useState(false);
  const check = () =>
    relayClient(account).projects().then(
      (result) => {
        setDevices(result.devices.filter((d) => !d.member).sort((a, b) => b.lastSyncAt - a.lastSyncAt));
        setNotice({ text: `Connected. ${result.projects.length} ${result.projects.length === 1 ? 'project' : 'projects'} in this account.` });
      },
      (err: unknown) => {
        setDevices(null);
        setNotice({ text: err instanceof Error ? err.message : 'Could not connect.', error: true });
      },
    );
  return (
    <section className="panel" aria-label="Cloud account">
      <h2>Cloud account</h2>
      <div className="grid-2 tight">
        <label className="field">
          <span>Relay address</span>
          <input value={account.relayUrl} aria-label="Relay address" placeholder="https://sync.example.com" onChange={(e) => setSyncAccount({ relayUrl: e.target.value })} />
        </label>
        <label className="field">
          <span>This device is called</span>
          <input value={account.deviceName} aria-label="Device name" onChange={(e) => setSyncAccount({ deviceName: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Sync key</span>
        <input type={shown ? 'text' : 'password'} autoComplete="off" value={account.syncKey} aria-label="Sync key" placeholder="Paste the key from your other device, or create one" onChange={(e) => setSyncAccount({ syncKey: e.target.value })} />
      </label>
      <div className="actions start wrap">
        <button type="button" className="btn" onClick={() => (setSyncAccount({ syncKey: newSyncKey() }), setShown(true))}>
          Create a new key
        </button>
        <button type="button" className="btn ghost" onClick={() => setShown(!shown)}>
          {shown ? 'Hide key' : 'Show key'}
        </button>
        <button type="button" className="btn primary" disabled={!isConfigured(account)} onClick={() => void check()}>
          Connect
        </button>
      </div>
      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      {devices && (
        <table className="analytics-table" aria-label="Devices on this account">
          <thead>
            <tr>
              <th scope="col">Device</th>
              <th scope="col">Last synced</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <th scope="row">
                  {device.name}
                  {device.id === account.deviceId && <span className="muted small"> (this device)</span>}
                </th>
                <td>{new Date(device.lastSyncAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td>
                  {device.id !== account.deviceId && (
                    <button type="button" className="btn ghost" onClick={() => void relayClient(account).forgetDevice(device.id).then(check)}>
                      Remove from list
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No device has synced yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <p className="muted small">
        The key is the account: every device with the same relay address and key shares the same projects. Keep it like a password. It is stored on this device only. The relay is a small server you or someone you trust runs (it comes with this app as
        <code> server/relay.ts</code>).
      </p>
    </section>
  );
}

const show = (value: unknown): string => (value === undefined ? '—' : typeof value === 'string' ? value || '(empty)' : JSON.stringify(value));

/** A field's two values as an author would read them: for a list of named values, only the ones that differ. */
function describe(local: unknown, remote: unknown): { name: string; local: string; remote: string }[] {
  const named = (list: unknown): Map<string, string> | null =>
    Array.isArray(list) && list.every((item) => item && typeof item === 'object' && ('key' in item || 'name' in item) && 'value' in item) ? new Map(list.map((item) => [String((item as { key?: string; name?: string }).key ?? (item as { name?: string }).name), show((item as { value: unknown }).value)])) : null;
  const [a, b] = [named(local), named(remote)];
  if (!a || !b) return [{ name: '', local: show(local), remote: show(remote) }];
  return [...new Set([...a.keys(), ...b.keys()])].filter((key) => a.get(key) !== b.get(key)).map((key) => ({ name: key, local: a.get(key) ?? '—', remote: b.get(key) ?? '—' }));
}

function MergeEditor({ conflict, onSave, onClose }: { conflict: SyncConflict; onSave: (doc: DocJSON) => void; onClose: () => void }) {
  const extensions = useMemo(createExtensions, []);
  const [local, remote] = [conflict.local!.doc as DocJSON, conflict.remote!.doc as DocJSON];
  const editor = useEditor({ extensions, content: local, enableInputRules: false, enablePasteRules: false, editorProps: { attributes: { class: 'manuscript-text', 'aria-label': 'Merged text', role: 'textbox', 'aria-multiline': 'true' } } });
  return (
    <Modal title={`Resolve manually: ${conflict.label}`} onClose={onClose}>
      <div className="stack merge-editor">
        <p className="muted small">Edit the left side until it reads as you want. The cloud's version is on the right to copy from. Nothing changes until you save.</p>
        <div className="actions start wrap">
          <button type="button" className="btn" onClick={() => editor?.commands.setContent(local)}>
            Start from this device’s
          </button>
          <button type="button" className="btn" onClick={() => editor?.commands.setContent(remote)}>
            Start from the cloud’s
          </button>
          <button type="button" className="btn" onClick={() => editor?.commands.setContent({ type: 'doc', content: [...((editor.getJSON().content as unknown[]) ?? []), ...((remote as { content?: unknown[] }).content ?? [])] } as never)}>
            Add the cloud’s text below
          </button>
        </div>
        <div className="merge-sides">
          <section aria-label="Merged version">
            <h3>Merged version</h3>
            <EditorContent editor={editor} className="merge-surface" />
          </section>
          <section aria-label="Cloud version">
            <h3>The cloud’s version ({conflict.remoteDevice})</h3>
            <ReadOnlyDoc doc={remote} />
          </section>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={() => editor && onSave(editor.getJSON() as DocJSON)}>
            Save the merged version
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** One conflict, with both versions and the author's ways of settling it. Nothing has been decided until a button here is pressed. */
export function ConflictCard({ conflict, onError }: { conflict: SyncConflict; onError: (err: unknown) => void }) {
  const [comparing, setComparing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [take, setTake] = useState<Record<string, 'local' | 'remote'>>({});
  const settle = (resolution: Parameters<typeof sync.resolve>[2]) => void sync.resolve(conflict.projectId, conflict.id, resolution).catch(onError);
  return (
    <li className="thread conflict-card" aria-label={`Conflict: ${conflict.label}`}>
      <div className="thread-top">
        <strong className="thread-title as-text">{conflict.label}</strong>
        <span className="badge">{conflict.kind === 'text' ? 'Manuscript text' : conflict.kind === 'removed' ? 'Deleted on one device' : 'Details'}</span>
      </div>
      <p className="small">
        Changed on this device and on {conflict.remoteDevice}. This device still has its own version; the cloud's is held here until you choose.
      </p>

      {conflict.kind === 'text' && (
        <>
          <div className="actions start wrap">
            <button type="button" className="btn" onClick={() => setComparing(true)}>
              Compare versions
            </button>
            <button type="button" className="btn" onClick={() => settle({ choice: 'local' })}>
              Keep local version
            </button>
            <button type="button" className="btn" onClick={() => settle({ choice: 'remote' })}>
              Keep cloud version
            </button>
            <button type="button" className="btn" onClick={() => setMerging(true)}>
              Resolve manually
            </button>
          </div>
          <p className="muted small">If you keep the cloud's version, this device's text goes into the chapter's version history first.</p>
          {comparing && (
            <CompareDialog
              title={conflict.label}
              sources={[{ id: 'local', label: 'This device', load: async () => conflict.local!.doc as DocJSON }, { id: 'remote', label: `Cloud (${conflict.remoteDevice})`, load: async () => conflict.remote!.doc as DocJSON }]}
              from="remote"
              to="local"
              onClose={() => setComparing(false)}
            />
          )}
          {merging && (
            <MergeEditor
              conflict={conflict}
              onClose={() => setMerging(false)}
              onSave={(doc) => {
                setMerging(false);
                settle({ choice: 'merged', row: { ...conflict.local!, doc } });
              }}
            />
          )}
        </>
      )}

      {conflict.kind === 'fields' && (
        <>
          <table className="analytics-table conflict-fields">
            <thead>
              <tr>
                <th scope="col">What differs</th>
                <th scope="col">This device</th>
                <th scope="col">Cloud ({conflict.remoteDevice})</th>
              </tr>
            </thead>
            <tbody>
              {conflict.fields.map((field) =>
                describe(field.local, field.remote).map((part, i) => (
                  <tr key={`${field.field}-${part.name}-${i}`}>
                    <th scope="row">{part.name || field.field}</th>
                    <td>
                      <label className="check wrap">
                        <input type="radio" name={`${conflict.id}-${field.field}`} checked={(take[field.field] ?? 'local') === 'local'} aria-label={`Keep this device's ${part.name || field.field}`} onChange={() => setTake({ ...take, [field.field]: 'local' })} />
                        {part.local}
                      </label>
                    </td>
                    <td>
                      <label className="check wrap">
                        <input type="radio" name={`${conflict.id}-${field.field}`} checked={take[field.field] === 'remote'} aria-label={`Keep the cloud's ${part.name || field.field}`} onChange={() => setTake({ ...take, [field.field]: 'remote' })} />
                        {part.remote}
                      </label>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <div className="actions start wrap">
            <button type="button" className="btn primary" onClick={() => settle({ choice: 'fields', take })}>
              Use the chosen values
            </button>
            <button type="button" className="btn" onClick={() => settle({ choice: 'local' })}>
              Keep local version
            </button>
            <button type="button" className="btn" onClick={() => settle({ choice: 'remote' })}>
              Keep cloud version
            </button>
          </div>
          <p className="muted small">Anything only one device changed has already been kept from both.</p>
        </>
      )}

      {conflict.kind === 'removed' && (
        <div className="actions start wrap">
          <button type="button" className="btn" onClick={() => settle({ choice: conflict.local ? 'local' : 'remote' })}>
            Keep it ({conflict.local ? 'this device’s version' : 'the cloud’s version'})
          </button>
          <button type="button" className="btn danger" onClick={() => settle({ choice: conflict.local ? 'remote' : 'local' })}>
            Delete it everywhere
          </button>
        </div>
      )}
    </li>
  );
}
