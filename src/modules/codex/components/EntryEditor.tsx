import { entryPath } from '@/modules/characters/hooks';
import { EntryCollab } from '@/modules/collab/components/Review';
import { CommentLink } from '@/modules/collab/components/Threads';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MentionedIn } from '@/modules/crossref/components/MentionedIn';
import { EntryCanon } from '@/modules/canon/components/LinkedFacts';
import { LinkedThreads } from '@/modules/plot/components/LinkedThreads';
import { EntryProgression } from '@/modules/progression/components/EntryProgression';
import { EntrySystems } from '@/modules/systems/components/EntrySystems';
import { LinkedEvents } from '@/modules/timeline/components/LinkedEvents';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { imageFileToDataUrl } from '@/shared/image';
import { SavedText } from '@/shared/SavedText';
import { EntryOptions, useCategories } from '../categories';
import { displayValue, viewFields } from '../schema';
import { checkValue } from '../validation';
import { relatedTo, type EntryChanges, type ProjectCodex } from '../service';
import { COMMON_FIELD_KEYS, type LoreEntry, type LoreLink } from '../types';
import { TypedInput } from './TypedInput';
import { CategoryBadge, EntryThumb } from './EntryBits';
import { FieldsEditor } from './FieldsEditor';
import { AllConnections } from '@/modules/crossref/components/AllConnections';
import { connections } from '@/core';
import { CANON_STATUSES, type CanonStatus } from '@/modules/canon/types';
import { CONNECTION_STATUS_LABELS, statusOf } from '@/modules/integrity/rules';

interface EntryEditorProps {
  entry: LoreEntry;
  entries: LoreEntry[];
  links: LoreLink[];
  codex: ProjectCodex;
  hrefFor: (entryId: string) => string;
  onDeleted: () => void;
  onError: (error: unknown) => void;
  /** Opens the category editor on this entry's category. */
  onCustomize: () => void;
}

/** An entry's profile page. Every field saves itself; nothing here writes to the manuscript. */
export function EntryEditor({ entry, entries, links, codex, hrefFor, onDeleted, onError, onCustomize }: EntryEditorProps) {
  const categories = useCategories();
  const category = categories.get(entry.category);
  const view = viewFields(entry, category);
  const nameOf = (id: string) => entries.find((e) => e.id === id)?.name;
  const others = entries.filter((e) => e.id !== entry.id);
  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const categoryNames = new Map(categories.list.map((c) => [c.key, c.name]));
  const [confirming, setConfirming] = useState(false);
  const [linkTo, setLinkTo] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const update = (changes: EntryChanges) => void codex.update(entry.id, changes).catch(onError);

  const related = relatedTo(entry.id, entries, links);
  const linkedIds = new Set(related.map((r) => r.entry.id));
  const linkable = entries.filter((e) => e.id !== entry.id && !linkedIds.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack entry">
      <div className="entry-head">
        <div className="entry-image">
          <EntryThumb entry={entry} className="large" />
          <label className="btn">
            {entry.image ? 'Change image' : 'Upload image'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void imageFileToDataUrl(file).then((image) => update({ image }), onError);
              }}
            />
          </label>
          {entry.image && (
            <button type="button" className="btn ghost" onClick={() => update({ image: null })}>
              Remove image
            </button>
          )}
        </div>
        <div className="stack grow">
          <SavedText label="Name" value={entry.name} onSave={(name) => update({ name })} className="entry-name" />
          <div className="entry-talk">
            <CommentLink projectId={entry.projectId} target={{ kind: 'entry', entryId: entry.id }} title={entry.name} />
            <EntryCollab projectId={entry.projectId} entry={entry} />
          </div>
          <div className="grid-2 tight">
            <label className="field">
              <span>Category</span>
              <select value={entry.category} aria-label="Category" onChange={(e) => update({ category: e.target.value })}>
                {categories.list.filter((c) => c.key !== 'character' && (!c.archived || c.key === entry.category)).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <SavedText
              key={entry.image?.startsWith('data:') ? 'uploaded' : 'url'}
              label="Image URL"
              value={entry.image && !entry.image.startsWith('data:') ? entry.image : ''}
              placeholder={entry.image?.startsWith('data:') ? 'Using uploaded image' : 'https://…'}
              onSave={(url) => (url.trim() || !entry.image?.startsWith('data:')) && update({ image: url.trim() || null })}
            />
          </div>
          <SavedText label="Short summary" multiline rows={2} value={entry.summary} placeholder="One or two lines you can take in at a glance." onSave={(summary) => update({ summary })} />
        </div>
      </div>

      <SavedText label="Detailed description" multiline rows={8} value={entry.description} onSave={(description) => update({ description })} />

      <section className="stack">
        <div className="page-header">
          <h3>{category.singular} fields</h3>
          <button type="button" className="btn ghost" onClick={onCustomize}>
            Edit these fields…
          </button>
        </div>
        {view.category.length === 0 && <p className="muted small">This category has no fields of its own yet.</p>}
        <div className="typed-fields">
          {view.category.map(({ def, field }) => {
            // Checked and said, never enforced: the value is saved as written.
            const issue = checkValue(def, field?.value ?? '', entryMap, (key) => categoryNames.get(key) ?? key);
            return (
              <div key={def.id} className={`${def.type === 'longtext' ? 'field wide' : 'field'}${issue ? ' unfit' : ''}`}>
                <span>
                  {def.name}
                  {def.required && (
                    <span className="required-mark" title="Required">
                      {' '}
                      *<span className="visually-hidden"> (required)</span>
                    </span>
                  )}
                </span>
                <TypedInput label={def.name} type={def.type} options={def.options} value={field?.value ?? ''} entries={def.target ? others.filter((o) => o.category === def.target) : others} onSave={(value) => void codex.setFieldValue(entry.id, def.id, value).catch(onError)} />
                {def.help && <small className="muted">{def.help}</small>}
                {issue && (
                  <small className="field-issue" role="note">
                    {issue.message}
                  </small>
                )}
              </div>
            );
          })}
        </div>
        {view.archived.length > 0 && (
          <details className="archived-values">
            <summary>
              {view.archived.length} archived {view.archived.length === 1 ? 'field' : 'fields'} with something written
            </summary>
            <dl className="quick-fields">
              {view.archived.map(({ def, field }) => (
                <div key={field.id}>
                  <dt>{def.name}</dt>
                  <dd>{displayValue({ type: def.type, value: field.value }, nameOf) || field.value}</dd>
                </div>
              ))}
            </dl>
            <p className="muted small">These fields were removed from {category.name}. What you wrote is kept; restore a field under “Edit these fields…” to edit it again.</p>
          </details>
        )}
      </section>

      <section className="stack">
        <div>
          <h3>Fields just for this entry</h3>
          <p className="muted small">Anything that applies only to {entry.name}: any name, any type.</p>
        </div>
        <FieldsEditor key={entry.category} fields={view.own} suggestions={COMMON_FIELD_KEYS} entries={others} onSave={(own) => void codex.setOwnFields(entry.id, own).catch(onError)} />
      </section>

      <SavedText
        label="Tags (comma separated)"
        value={entry.tags.join(', ')}
        placeholder="protagonist, fire, book-1"
        onSave={(tags) => update({ tags: tags.split(',') })}
      />

      <EntrySystems entry={entry} />

      <EntryProgression entry={entry} />

      <EntryCanon entry={entry} />

      <MentionedIn entry={entry} />
      <AllConnections projectId={entry.projectId} of={{ type: 'entry', id: entry.id }} />

      <LinkedEvents
        projectId={entry.projectId}
        match={(event) => event.locationId === entry.id || event.entryIds.includes(entry.id)}
        query=""
        empty={`No events are linked to ${entry.name} yet.`}
      />

      {entry.category === 'location' && (
        <LinkedThreads
          projectId={entry.projectId}
          match={({ thread }) => thread.locationIds.includes(entry.id)}
          empty={`No plot threads involve ${entry.name} yet.`}
        />
      )}

      <section className="stack">
        <h3>Related entries</h3>
        {related.length === 0 && <p className="muted small">Link this entry to others: a faction to its seat, an item to its owner. Each side lists the other.</p>}
        <ul className="related">
          {related.map(({ linkId, entry: other, label, theirLabel }) => (
            <li key={linkId}>
              <CategoryBadge category={other.category} />
              <Link to={other.category === 'character' ? entryPath(entry.projectId, other) : hrefFor(other.id)} className="related-name">
                {other.name}
              </Link>
              <SavedText
                hideLabel
                label={`Relationship to ${other.name}`}
                value={label}
                placeholder={theirLabel ? `They say: ${theirLabel}` : 'Relationship (optional)'}
                onSave={(next) => void codex.labelLink(linkId, entry.id, next).catch(onError)}
              />
              <select className={`chip conn-status conn-${statusOf({ kind: 'link', canon: links.find((l) => l.id === linkId)?.canon })}`} aria-label={`Status of the link to ${other.name}`} value={links.find((l) => l.id === linkId)?.canon ?? 'canon'} onChange={(e) => void connections.forProject(entry.projectId).update(linkId, { canon: e.target.value as CanonStatus }).catch(onError)}>
                {CANON_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CONNECTION_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn ghost icon" aria-label={`Remove link to ${other.name}`} onClick={() => void codex.unlink(linkId).catch(onError)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        {linkable.length > 0 && (
          <form
            className="related-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!linkTo) return;
              void codex.link(entry.id, linkTo, linkLabel).then(() => {
                setLinkTo('');
                setLinkLabel('');
              }, onError);
            }}
          >
            <select value={linkTo} aria-label="Entry to link" onChange={(e) => setLinkTo(e.target.value)}>
              <option value="">Link to…</option>
              <EntryOptions entries={linkable} />
            </select>
            <input value={linkLabel} placeholder="Relationship (optional)" aria-label="Relationship" onChange={(e) => setLinkLabel(e.target.value)} />
            <button type="submit" className="btn" disabled={!linkTo}>
              Link
            </button>
          </form>
        )}
      </section>

      <SavedText label="Author notes (private)" multiline rows={4} value={entry.notes} placeholder="Reminders, open questions, spoilers. For your eyes only." onSave={(notes) => update({ notes })} />

      <div className="entry-foot">
        <span className="muted small">Reference only: nothing here is ever added to your manuscript.</span>
        <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
          Delete entry…
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Delete ${category.singular.toLowerCase()}`}
          confirmLabel="Delete entry"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void codex.remove(entry.id).then(onDeleted, onError);
          }}
        >
          <p>
            Delete <strong>{entry.name}</strong>
            {related.length > 0 && ` and its ${related.length} ${related.length === 1 ? 'link' : 'links'} to other entries`}? The entries it is linked to, and your manuscript, are not changed. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
