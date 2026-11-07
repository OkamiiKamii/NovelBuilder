import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { characters, db } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { EntryCollab } from '@/modules/collab/components/Review';
import { CommentLink } from '@/modules/collab/components/Threads';
import { docBlocks } from '@/modules/search/extract';
import { can } from '@/modules/sync/access';
import { SystemsWorkspace } from '@/modules/systems/pages/SystemsPage';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { imageFileToDataUrl } from '@/shared/image';
import { Modal } from '@/shared/Modal';
import { SavedText } from '@/shared/SavedText';
import { Portrait } from '../components/Portrait';
import { Sections } from '../components/Sections';
import { DetailsExtras, HistoryTab, NotesTab, OverviewExtras, RelationshipsTab, SecretsTab } from '../components/Tabs';
import { useCast } from '../hooks';
import { countMentions, type Listed } from '../library';
import type { References } from '../service';
import { ROLES, STATUSES, TABS, TAB_LABELS, type Tab } from '../types';
import { ProgressTracker } from '@/modules/progression/components/ProgressTracker';

const REFERENCE_WORDS: [keyof References, string, string][] = [
  ['chapters', 'chapter or scene links to them', 'chapters and scenes link to them'], ['relationships', 'relationship', 'relationships'], ['events', 'timeline event', 'timeline events'], ['threads', 'plot thread', 'plot threads'],
  ['links', 'link to a faction, item or other entry', 'links to factions, items and other entries'], ['sheets', 'system sheet', 'system sheets'], ['snapshots', 'progression snapshot', 'progression snapshots'], ['secrets', 'secret of their own', 'secrets of their own'],
  ['inSecrets', 'other character’s secret names them', 'other characters’ secrets name them'], ['notes', 'note', 'notes'],
];

/** The top of a profile: who this is. Read by default; "Edit profile" turns the same block into fields. */
function Header({ listed, mentions, writes, onError }: { listed: Listed; mentions: number | undefined; writes: boolean; onError: (error: unknown) => void }) {
  const { entry, profile } = listed;
  const api = characters.forProject(entry.projectId);
  const [editing, setEditing] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = (changes: Parameters<typeof api.identity>[1]) => void api.identity(entry.id, changes).catch(onError);
  const roles = [...new Set([...ROLES, ...profile.roles])];
  return (
    <header className="vault-header" role="group" aria-label="Character">
      <div className="vault-portrait-col">
        <Portrait name={entry.name} image={entry.image} focal={profile.focal} className="vault-portrait" alt={entry.image ? `Portrait of ${entry.name}` : `${entry.name} has no portrait`} />
        {writes && (
          <div className="vault-portrait-tools">
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = '';
                if (picked) void imageFileToDataUrl(picked).then((image) => save({ image }), onError);
              }}
            />
            <button type="button" className="btn ghost" onClick={() => file.current?.click()}>
              {entry.image ? 'Replace portrait' : 'Upload portrait'}
            </button>
            {entry.image && (
              <>
                <button type="button" className="btn ghost" onClick={() => setFocusing(true)}>
                  Adjust crop
                </button>
                <button type="button" className="btn ghost" onClick={() => save({ image: null })}>
                  Remove
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="vault-identity">
        {editing ? (
          <div className="stack tight">
            <SavedText label="Name" value={entry.name} onSave={(name) => name.trim() && save({ name })} className="vault-name-input" />
            <SavedText label="Title or epithet" value={profile.epithet} placeholder="The Last Heir" onSave={(epithet) => save({ epithet })} />
            <div className="field">
              <span>Narrative role (one or several)</span>
              <div className="chips" role="group" aria-label="Narrative roles">
                {roles.map((role) => (
                  <button key={role} type="button" className={`filter-chip${profile.roles.includes(role) ? ' on' : ''}`} aria-pressed={profile.roles.includes(role)} onClick={() => save({ roles: profile.roles.includes(role) ? profile.roles.filter((r) => r !== role) : [...profile.roles, role] })}>
                    {role}
                  </button>
                ))}
                <input
                  aria-label="Add a role of your own"
                  placeholder="Your own role…"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || !e.currentTarget.value.trim()) return;
                    e.preventDefault();
                    save({ roles: [...profile.roles, e.currentTarget.value] });
                    e.currentTarget.value = '';
                  }}
                />
              </div>
            </div>
            <SavedText label="Summary" multiline rows={3} value={entry.summary} onSave={(summary) => save({ summary })} />
            <div className="grid-2 tight">
              <label className="field">
                <span>Aliases and nicknames (comma separated)</span>
                <input defaultValue={profile.aliases.join(', ')} aria-label="Aliases" onBlur={(e) => save({ aliases: e.target.value.split(',') })} />
              </label>
              <label className="field">
                <span>Status</span>
                <input defaultValue={profile.status} list="status-choices" aria-label="Status" placeholder="Alive, Deceased… or your own" onBlur={(e) => e.target.value.trim() !== profile.status && save({ status: e.target.value })} />
                <datalist id="status-choices">
                  {STATUSES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="field">
              <span>Tags (comma separated)</span>
              <input defaultValue={entry.tags.join(', ')} aria-label="Tags" onBlur={(e) => save({ tags: e.target.value.split(',') })} />
            </label>
            <div className="actions start">
              <button type="button" className="btn primary" onClick={() => setEditing(false)}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="vault-name">{entry.name}</h1>
            {profile.epithet && <p className="vault-epithet">{profile.epithet}</p>}
            <p className="chips">
              {profile.roles.map((role) => (
                <span key={role} className="role-badge-vault">
                  {role}
                </span>
              ))}
              {profile.status && <span className="status-badge-vault">{profile.status}</span>}
              {profile.archived && <span className="status-badge-vault">Archived</span>}
            </p>
            {entry.summary ? <p className="vault-summary">{entry.summary}</p> : writes && <p className="vault-summary vault-empty">No summary yet.</p>}
            {(profile.aliases.length > 0 || entry.tags.length > 0) && (
              <p className="vault-ids small">
                {profile.aliases.length > 0 && (
                  <span>
                    <span className="vault-label">Also known as</span> {profile.aliases.join(', ')}
                  </span>
                )}
                {entry.tags.length > 0 && (
                  <span>
                    <span className="vault-label">Tags</span> {entry.tags.join(', ')}
                  </span>
                )}
              </p>
            )}
            <div className="actions start wrap">
              {writes && (
                <button type="button" className="btn" onClick={() => setEditing(true)}>
                  Edit profile
                </button>
              )}
              <CommentLink projectId={entry.projectId} target={{ kind: 'entry', entryId: entry.id }} title={entry.name} />
              <EntryCollab projectId={entry.projectId} entry={entry} />
            </div>
          </>
        )}
      </div>

      <dl className="vault-stats" aria-label="In the manuscript">
        <div title="Chapters and scenes whose text has a link to this character">
          <dt>Linked in</dt>
          <dd>
            {listed.linkedIn.length} <span>{listed.linkedIn.length === 1 ? 'Chapter' : 'Chapters'}</span>
          </dd>
        </div>
        <div title="Times their name, aliases or title occur in the text. Words on the page, not a count of appearances.">
          <dt>Name mentions</dt>
          <dd>{mentions ?? '…'}</dd>
        </div>
      </dl>

      {focusing && entry.image && (
        <Modal title="Adjust the portrait’s crop" onClose={() => setFocusing(false)}>
          <div className="stack">
            <p className="muted small">Click the part of the picture to keep in view. The whole image is kept; this only chooses what shows when it is cropped.</p>
            <button
              type="button"
              className="focal-pick"
              aria-label="Choose the point of the portrait to keep in view"
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                save({ focal: { x: ((e.clientX - box.left) / box.width) * 100, y: ((e.clientY - box.top) / box.height) * 100 } });
              }}
            >
              <img src={entry.image} alt="" />
              <span className="focal-dot" style={{ left: `${profile.focal.x}%`, top: `${profile.focal.y}%` }} />
            </button>
            <div className="focal-preview">
              <Portrait name={entry.name} image={entry.image} focal={profile.focal} className="vault-portrait" />
              <Portrait name={entry.name} image={entry.image} focal={profile.focal} className="card-portrait" />
              <Portrait name={entry.name} image={entry.image} focal={profile.focal} className="list-portrait" />
            </div>
            <div className="actions">
              <button type="button" className="btn primary" onClick={() => setFocusing(false)}>
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </header>
  );
}

/**
 * CHARACTER PROFILE
 * Everything about one character, on six tabs. It is a view of the one
 * record every other feature uses; opening the character from a chapter, the
 * story graph, a timeline event or a search result all lead here.
 */
export function CharacterPage() {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const { entryId = '', tab: tabParam } = useParams();
  const me = useMe(project.id);
  const writes = can(me.role, 'write');
  const cast = useCast(project.id);
  const api = useMemo(() => characters.forProject(project.id), [project.id]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<References | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');
  const listed = cast.list.find((l) => l.entry.id === entryId);
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'overview';
  const names = listed ? [listed.entry.name, listed.profile.epithet, ...listed.profile.aliases] : [];
  // Counted from the saved text of every chapter. It can take a moment on a long book, so the header shows "…" until it is in.
  const mentions = useLiveQuery(async () => (names.length ? countMentions((await db.chapterContents.where('projectId').equals(project.id).toArray()).flatMap((c) => docBlocks(c.doc).map((b) => b.text)), names) : 0), [project.id, names.join('\n')]);
  const profiles = useMemo(() => new Map(cast.list.map((l) => [l.entry.id, l.profile])), [cast.list]);
  const base = `/project/${project.id}`;

  if (cast.loading) return null;
  if (!listed) {
    return (
      <div className="vault">
        <div className="empty">
          <h2>Character not found</h2>
          <p className="muted">It may have been deleted, or the link is to something that is not a character.</p>
          <Link to={`${base}/characters`} className="btn primary">
            Character Library
          </Link>
        </div>
      </div>
    );
  }
  const { entry, profile } = listed;
  const common = { projectId: project.id, entry, profile, entries: cast.entries, nodes: cast.nodes, order: cast.order, onError: fail };
  const tabs = TABS.filter((t) => writes || !['secrets', 'notes', 'history'].includes(t));
  const item = (label: string, action: () => void, className = '') => (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.currentTarget.closest('details')?.removeAttribute('open');
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="vault vault-profile">
      <nav className="vault-crumbs" aria-label="Where you are">
        <Link to={`${base}/characters`}>← Character Library</Link>
        <span aria-hidden="true">›</span>
        <span>Character: {entry.name}</span>
        {writes && (
          <details className="menu">
            <summary aria-label={`More options for ${entry.name}`}>More options</summary>
            <div className="menu-items">
              <label className="menu-label">
                Add sections from a layout
                <select value="" aria-label="Add sections from a layout" onChange={(e) => e.target.value && void api.applyTemplate(entry.id, e.target.value).catch(fail)}>
                  <option value="">Choose…</option>
                  {cast.templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              {item('Save this layout as a template…', () => setSaving(`${entry.name}’s layout`))}
              {item(profile.archived ? 'Restore from the archive' : 'Archive', () => void api.setArchived(entry.id, !profile.archived).catch(fail))}
              {item('Delete…', () => void api.references(entry.id).then(setDeleting, fail), 'danger-text')}
            </div>
          </details>
        )}
      </nav>

      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
      {profile.archived && (
        <p className="notice" role="status">
          This character is archived: out of the library, with everything about them kept and every reference to them still working.
          {writes && (
            <button type="button" className="btn" onClick={() => void api.setArchived(entry.id, false).catch(fail)}>
              Restore
            </button>
          )}
        </p>
      )}

      <Header listed={listed} mentions={mentions} writes={writes} onError={fail} />

      <nav className="vault-tabs" aria-label="Profile sections">
        {tabs.map((t) => (
          <NavLink key={t} to={`${base}/characters/${entry.id}${t === 'overview' ? '' : `/${t}`}`} end className={t === tab ? 'active' : ''} aria-current={t === tab ? 'page' : undefined}>
            {TAB_LABELS[t]}
          </NavLink>
        ))}
      </nav>

      <div className="vault-tab" role="region" aria-label={TAB_LABELS[tab]}>
        {tab === 'overview' && (
          <>
            <Sections {...common} templates={cast.templates} tab="overview" />
            <OverviewExtras {...common} listed={listed} mentions={mentions} />
          </>
        )}
        {tab === 'system' && <SystemsWorkspace projectId={project.id} focus={entry} />}
        {tab === 'progression' && <ProgressTracker projectId={project.id} entryId={entry.id} />}
        {tab === 'relationships' && <RelationshipsTab {...common} profiles={profiles} />}
        {tab === 'details' && (
          <>
            <Sections {...common} templates={cast.templates} tab="details" />
            <DetailsExtras {...common} links={cast.links} />
          </>
        )}
        {tab === 'secrets' && writes && <SecretsTab {...common} />}
        {tab === 'notes' && writes && <NotesTab {...common} />}
        {tab === 'history' && writes && <HistoryTab {...common} />}
        {!writes && ['secrets', 'notes', 'history'].includes(tab) && <p className="muted">This part of a character is kept to the people writing the book.</p>}
      </div>

      {saving !== null && (
        <Modal title="Save this layout as a template" onClose={() => setSaving(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void api.saveTemplate(entry.id, saving).then(() => setSaving(null), fail);
            }}
          >
            <p className="muted small">Saves the sections of this profile and the names and types of their fields, not what is written in them. It is then offered when you create a character in this project.</p>
            <label className="field">
              <span>Template name</span>
              <input value={saving} autoFocus aria-label="Template name" onChange={(e) => setSaving(e.target.value)} />
            </label>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setSaving(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!saving.trim()}>
                Save template
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${entry.name}`}
          confirmLabel="Delete forever"
          requireText={entry.name}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            setDeleting(null);
            void api.remove(entry.id).then(() => navigate(`${base}/characters`), fail);
          }}
        >
          <p>
            This permanently deletes <strong>{entry.name}</strong>: the record, the profile, and their secrets, notes and history. It cannot be undone.
          </p>
          {REFERENCE_WORDS.some(([key]) => deleting[key] > 0) ? (
            <>
              <p>They are referred to elsewhere:</p>
              <ul className="delete-refs" aria-label="What refers to this character">
                {REFERENCE_WORDS.filter(([key]) => deleting[key] > 0).map(([key, one, many]) => (
                  <li key={key}>
                    {deleting[key]} {deleting[key] === 1 ? one : many}
                  </li>
                ))}
              </ul>
              <p className="muted small">
                Their relationships, links, sheets and secrets are deleted with them. The manuscript’s words are not touched: a linked name becomes plain text. Timeline events, plot threads and other characters’ secrets are kept and simply no longer show them.
              </p>
            </>
          ) : (
            <p className="muted small">Nothing else in the project refers to them.</p>
          )}
          {!profile.archived && (
            <p>
              To put them away without losing anything, archive instead:{' '}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDeleting(null);
                  void api.setArchived(entry.id, true).catch(fail);
                }}
              >
                Archive {entry.name}
              </button>
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
