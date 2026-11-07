import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sync } from '@/core';
import { useProjects } from '@/modules/projects/hooks';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { isConfigured, relayClient, useSyncAccount } from '../account';
import { AccountPanel, ConflictCard, useSyncStatus } from '../components/SyncBits';
import type { RelaySnapshot } from '../relay';
import { syncProject } from '../runner';
import { STATUS_LABELS } from '../types';

const when = (at: number) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Cloud sync for one project: its status, anything waiting for a decision, backups and a record of what happened. */
export function SyncPage() {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const account = useSyncAccount();
  const { status, state } = useSyncStatus(project.id);
  const conflicts = useLiveQuery(() => sync.conflicts(project.id), [project.id]);
  const log = useLiveQuery(() => sync.log(project.id), [project.id]);
  const [backups, setBackups] = useState<RelaySnapshot[] | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = (err: unknown) => setNotice({ text: err instanceof Error ? err.message : 'Something went wrong.', error: true });
  if (!state || !conflicts || !log) return null;
  const ready = isConfigured(account);

  const run = async () => {
    setBusy(true);
    try {
      const result = await syncProject(project.id);
      setNotice({ text: result.conflicts ? `Synced, with ${result.conflicts} ${result.conflicts === 1 ? 'thing' : 'things'} for you to decide below.` : `Synced: ${result.pushed} sent, ${result.pulled} received${result.merged ? `, ${result.merged} combined` : ''}.` });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const loadBackups = () => relayClient(account).snapshots(project.id).then((result) => setBackups(result.snapshots), fail);

  return (
    <div className="stack sync-page">
      <header className="page-header">
        <div>
          <h1>Cloud sync</h1>
          <p className="muted" role="status" data-status={status}>
            {STATUS_LABELS[status]}
            {state.lastSyncAt ? ` · last synced ${when(state.lastSyncAt)}` : ''}
            {state.pending > 0 ? ` · ${state.pending} ${state.pending === 1 ? 'change' : 'changes'} waiting to be sent` : ''}
          </p>
        </div>
        <div className="actions">
          {state.enabled ? (
            <>
              <button type="button" className="btn primary" disabled={busy || !ready} onClick={() => void run()}>
                {busy ? 'Syncing…' : 'Sync now'}
              </button>
              <button type="button" className="btn" onClick={() => void sync.disable(project.id)}>
                Stop syncing this project
              </button>
            </>
          ) : (
            <button type="button" className="btn primary" disabled={!ready} onClick={() => void sync.enable(project.id).then(run)}>
              Sync this project
            </button>
          )}
        </div>
      </header>
      <p className="muted small">
        Your work is always saved on this device first, connected or not. Sync then exchanges what changed with your other devices. When two devices changed the same thing it stops and asks; it never chooses for you, and it never deletes a project because
        another device did.
      </p>
      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="btn ghost icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
      {state.lastError && status !== 'offline' && <p className="muted small">The last attempt did not go through: {state.lastError}</p>}

      {conflicts.length > 0 && (
        <section className="stack" aria-label="Conflicts">
          <h2>
            For you to decide <span className="muted">{conflicts.length}</span>
          </h2>
          <ul className="threads">
            {[...conflicts].sort((a, b) => a.detectedAt - b.detectedAt).map((conflict) => (
              <ConflictCard key={conflict.id} conflict={conflict} onError={fail} />
            ))}
          </ul>
        </section>
      )}

      <AccountPanel />

      <section className="panel" aria-label="Cloud backups">
        <h2>Cloud backups</h2>
        <p className="muted small">The cloud keeps point-in-time copies of this project, separate from the saves and version history on this device. Restoring one brings it back as a new project beside this one; nothing here is replaced.</p>
        <div className="actions start wrap">
          <button type="button" className="btn" disabled={!ready} onClick={() => void loadBackups()}>
            {backups ? 'Refresh the list' : 'Show backups'}
          </button>
          <button type="button" className="btn" disabled={!ready || !state.enabled} onClick={() => void relayClient(account).backupNow(project.id).then(loadBackups, fail)}>
            Back up now
          </button>
        </div>
        {backups &&
          (backups.length === 0 ? (
            <p className="muted">No backups yet. One is taken on the first sync, and from time to time after that.</p>
          ) : (
            <ul className="backup-list" aria-label="Backups">
              {backups.map((backup) => (
                <li key={backup.id}>
                  <span>
                    <strong>{when(backup.at)}</strong> <span className="muted small">“{backup.title}” · {backup.rows} items</span>
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void relayClient(account).snapshot(project.id, backup.id).then(async ({ state: rows }) => {
                        const restored = await sync.restoreBackup(rows, backup.at);
                        navigate(`/project/${restored.id}`);
                      }, fail)
                    }
                  >
                    Restore as a copy
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section className="panel" aria-label="Sync history">
        <h2>Sync history</h2>
        {log.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ol className="sync-log">
            {[...log].reverse().slice(0, 60).map((entry) => (
              <li key={entry.id} className={`log-${entry.kind}`}>
                <time className="muted small">{when(entry.at)}</time> {entry.message}
                {entry.detail && (
                  <details>
                    <summary className="small">What the other device had</summary>
                    <pre className="sent-text">{entry.detail}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="muted small">
        Other projects in your cloud account can be brought to this device from the <Link to="/cloud">Cloud page</Link>.
      </p>
    </div>
  );
}

/** The account as a whole: set it up once per device, and bring down projects that are in the cloud but not here. */
export function CloudPage() {
  const navigate = useNavigate();
  const account = useSyncAccount();
  const local = useProjects();
  const [cloud, setCloud] = useState<{ id: string; title: string; updatedAt: number; rows: number }[] | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);
  const fail = (err: unknown) => setNotice({ text: err instanceof Error ? err.message : 'Something went wrong.', error: true });
  const here = new Set((local ?? []).map((p) => p.id));
  return (
    <div className="page stack cloud-page">
      <header className="page-header">
        <div>
          <h1>Cloud</h1>
          <p className="muted">Set this device up for sync, and bring projects down from your account.</p>
        </div>
        <Link to="/" className="btn">
          ← Library
        </Link>
      </header>
      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      <AccountPanel />
      <section className="panel" aria-label="Projects in the cloud">
        <h2>Projects in your account</h2>
        <div className="actions start">
          <button type="button" className="btn" disabled={!isConfigured(account)} onClick={() => void relayClient(account).projects().then((result) => setCloud(result.projects), fail)}>
            {cloud ? 'Refresh' : 'Show projects'}
          </button>
        </div>
        {cloud &&
          (cloud.length === 0 ? (
            <p className="muted">Nothing in this account yet. Open a project on a device that has it and choose “Sync this project”.</p>
          ) : (
            <ul className="backup-list" aria-label="Cloud projects">
              {cloud.map((project) => (
                <li key={project.id}>
                  <span>
                    <strong>{project.title}</strong> <span className="muted small">last changed {when(project.updatedAt)}</span>
                  </span>
                  {here.has(project.id) ? (
                    <Link className="btn" to={`/project/${project.id}/sync`}>
                      On this device
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={fetching === project.id}
                      onClick={async () => {
                        setFetching(project.id);
                        try {
                          await sync.enable(project.id);
                          await syncProject(project.id);
                          navigate(`/project/${project.id}`);
                        } catch (err) {
                          await sync.disable(project.id);
                          fail(err);
                        } finally {
                          setFetching(null);
                        }
                      }}
                    >
                      {fetching === project.id ? 'Downloading…' : 'Download to this device'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}
