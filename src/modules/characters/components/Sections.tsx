import { useState } from 'react';
import { Link } from 'react-router-dom';
import { characters, codex } from '@/core';
import { useCategories } from '@/modules/codex/categories';
import { SchemaDialog } from '@/modules/codex/components/SchemaDialog';
import { TypedInput } from '@/modules/codex/components/TypedInput';
import { displayValue, splitChoices, viewFields } from '@/modules/codex/schema';
import { checkValue } from '@/modules/codex/validation';
import { FIELD_TYPES, FIELD_TYPE_LABELS, type FieldType, type LoreEntry, type LoreField } from '@/modules/codex/types';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { entryPath } from '../hooks';
import { suggestionsFor } from '../templates';
import type { CharacterProfile, CharacterTemplate, FieldSuggestion, Section } from '../types';

interface Shared {
  projectId: string;
  entry: LoreEntry;
  profile: CharacterProfile;
  entries: LoreEntry[];
  templates: CharacterTemplate[];
  onError: (error: unknown) => void;
}

/** One field as a small card: its name, and its value shown the way its type deserves. Press it to edit. */
function FieldCard({ field, section, canMove, ...shared }: Shared & { field: LoreField; section: Section | null; canMove: { earlier: boolean; later: boolean } }) {
  const { projectId, entry, profile, entries, onError } = shared;
  const api = characters.forProject(projectId);
  const [editing, setEditing] = useState(false);
  // A field every character shares takes its name, type and choices from the shared set, so they are the same on every profile.
  const categories = useCategories();
  const everyCharacter = categories.get('character');
  const def = field.defId ? everyCharacter.fields.find((d) => d.id === field.defId) : undefined;
  const type: FieldType = def?.type ?? field.type ?? 'text';
  const options = def?.options ?? field.options ?? [];
  const name = def?.name || field.key || 'Untitled field';
  const linked = type === 'reference' ? entries.find((e) => e.id === field.value) : undefined;
  const shown = displayValue({ type, value: field.value }, (id) => entries.find((e) => e.id === id)?.name);
  // A shared field's rules: checked and said, never enforced; the value is kept as written.
  const issue = def ? checkValue(def, field.value, new Map(entries.map((e) => [e.id, e])), (key) => categories.get(key).name) : null;
  const required = def?.required && (
    <span className="required-mark" title="Required">
      {' '}
      *<span className="visually-hidden"> (required)</span>
    </span>
  );
  const note = issue && (
    <small className="field-issue" role="note">
      {issue.message}
    </small>
  );
  const run = (task: Promise<unknown>) => void task.catch(onError);

  if (editing) {
    return (
      <div className="vault-field editing" role="group" aria-label={`Editing ${name}`}>
        <span className="vault-label">
          {name}
          {required}
        </span>
        <TypedInput label={name} type={type} options={options} value={field.value} entries={entries.filter((e) => e.id !== entry.id && (!def?.target || e.category === def.target))} onSave={(value) => run(api.updateField(entry.id, field.id, { value }))} />
        {def?.help && <small className="muted">{def.help}</small>}
        {note}
        <details className="field-settings">
          <summary>Field settings</summary>
          <div className="stack tight">
            {!field.defId && (
              <label className="field">
                <span>Name</span>
                <input defaultValue={field.key} aria-label={`Name of the field ${name}`} onBlur={(e) => e.target.value.trim() !== field.key && run(api.updateField(entry.id, field.id, { key: e.target.value }))} />
              </label>
            )}
            {def && <p className="muted small">Shared by every character: its name, type and choices are set under “Shared fields…”.</p>}
            <label className="field" hidden={Boolean(def)}>
              <span>Type</span>
              <select value={type} aria-label={`Type of ${name}`} onChange={(e) => run(api.updateField(entry.id, field.id, { type: e.target.value as FieldType }))}>
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            {!def && (type === 'select' || type === 'multiselect') && (
              <label className="field">
                <span>Choices (one per line)</span>
                <textarea rows={3} defaultValue={(field.options ?? []).join('\n')} aria-label={`Choices for ${name}`} onBlur={(e) => run(api.updateField(entry.id, field.id, { options: e.target.value.split('\n') }))} />
              </label>
            )}
            <label className="field">
              <span>Section</span>
              <select value={section?.id ?? ''} aria-label={`Section of ${name}`} onChange={(e) => e.target.value && run(api.moveField(entry.id, field.id, { sectionId: e.target.value }))}>
                {!section && <option value="">Not in a section</option>}
                {profile.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="actions start wrap">
              <button type="button" className="btn" disabled={!canMove.earlier} onClick={() => run(api.moveField(entry.id, field.id, { by: -1 }))}>
                Move earlier
              </button>
              <button type="button" className="btn" disabled={!canMove.later} onClick={() => run(api.moveField(entry.id, field.id, { by: 1 }))}>
                Move later
              </button>
              <button type="button" className="btn danger" aria-label={`Delete the field ${name}`} onClick={() => run(api.removeField(entry.id, field.id))}>
                Delete field
              </button>
            </div>
          </div>
        </details>
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`vault-field is-${type}${field.value.trim() ? '' : ' is-empty'}${issue ? ' unfit' : ''}`}>
      <button type="button" className="vault-field-open" aria-label={`Edit ${name}`} onClick={() => setEditing(true)}>
        <span className="vault-label">
          {name}
          {required}
        </span>
        {type === 'tags' || type === 'multiselect' ? (
          <span className="chips">
            {splitChoices(field.value).map((tag) => (
              <span key={tag} className="trait">
                {tag}
              </span>
            ))}
            {!field.value.trim() && <span className="vault-empty">Add…</span>}
          </span>
        ) : (
          <span className="vault-value">{shown || <span className="vault-empty">{type === 'reference' && field.value ? 'The linked entry was deleted' : 'Add…'}</span>}</span>
        )}
      </button>
      {linked && (
        <Link to={entryPath(projectId, linked)} className="vault-ref small">
          Open {linked.name} →
        </Link>
      )}
      {note}
    </div>
  );
}

function AddField({ section, have, ...shared }: Shared & { section: Section; have: string[] }) {
  const { projectId, entry, templates, onError } = shared;
  const api = characters.forProject(projectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('text');
  // Leave out anything the character already has anywhere on the profile, so the same fact is never kept in two places.
  // …nor anything every character already shares (a module's "Species" link, say), which is offered once, under Details.
  const everyone = useCategories().get('character').fields.filter((f) => !f.archived).map((f) => f.name);
  const offered = suggestionsFor(section.name, templates, [...have, ...entry.fields.map((f) => f.key), ...everyone]);
  const add = (field: FieldSuggestion) => void api.addField(entry.id, section.id, field).catch(onError);
  // An empty section shows what it usually holds straight away; otherwise the suggestions wait behind the button.
  const showing = open || have.length === 0;
  return (
    <div className="vault-add">
      {showing && offered.length > 0 && (
        <div className="vault-suggest" role="group" aria-label={`Fields to add to ${section.name}`}>
          {offered.slice(0, open ? 40 : 6).map((field) => (
            <button key={field.name} type="button" className="suggest" onClick={() => add(field)}>
              + {field.name}
            </button>
          ))}
        </div>
      )}
      {open ? (
        <form
          className="vault-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            add({ name, type });
            setName('');
          }}
        >
          <input value={name} autoFocus placeholder="Field name" aria-label={`Name of a new field in ${section.name}`} onChange={(e) => setName(e.target.value)} />
          <select value={type} aria-label="Type of the new field" onChange={(e) => setType(e.target.value as FieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            Add
          </button>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
            Done
          </button>
        </form>
      ) : (
        <button type="button" className="vault-add-open" aria-label={`Add a field to ${section.name}`} onClick={() => setOpen(true)}>
          + Add field
        </button>
      )}
    </div>
  );
}

function SectionCard({ section, peers, ...shared }: Shared & { section: Section; peers: Section[] }) {
  const { projectId, entry, onError } = shared;
  const api = characters.forProject(projectId);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [withFields, setWithFields] = useState(false);
  const fields = section.fieldIds.flatMap((id) => entry.fields.find((f) => f.id === id) ?? []);
  const at = peers.indexOf(section);
  const run = (task: Promise<unknown>) => void task.catch(onError);
  const item = (label: string, action: () => void, disabled = false, className = '') => (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={(e) => {
        e.currentTarget.closest('details')?.removeAttribute('open');
        action();
      }}
    >
      {label}
    </button>
  );
  return (
    <section className="vault-section" aria-label={section.name}>
      <header className="vault-section-head">
        {renaming ? (
          <input
            defaultValue={section.name}
            autoFocus
            aria-label={`New name for ${section.name}`}
            onBlur={(e) => {
              setRenaming(false);
              if (e.target.value.trim() && e.target.value.trim() !== section.name) run(api.updateSection(entry.id, section.id, { name: e.target.value }));
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          <h3>
            {section.name} <span className="vault-count">({fields.length})</span>
          </h3>
        )}
        <details className="menu">
          <summary aria-label={`Options for the section ${section.name}`}>⋯</summary>
          <div className="menu-items">
            {item('Rename', () => setRenaming(true))}
            {item('Move up', () => run(api.moveSection(entry.id, section.id, -1)), at === 0)}
            {item('Move down', () => run(api.moveSection(entry.id, section.id, 1)), at === peers.length - 1)}
            {item('Duplicate', () => run(api.duplicateSection(entry.id, section.id)))}
            {item(section.tab === 'overview' ? 'Move to the Details tab' : 'Move to the Overview tab', () => run(api.updateSection(entry.id, section.id, { tab: section.tab === 'overview' ? 'details' : 'overview' })))}
            {item('Hide', () => run(api.updateSection(entry.id, section.id, { hidden: true })))}
            {item('Delete…', () => setRemoving(true), false, 'danger-text')}
          </div>
        </details>
      </header>
      {fields.length > 0 && (
        <div className="vault-fields">
          {fields.map((field, i) => (
            <FieldCard key={field.id} {...shared} field={field} section={section} canMove={{ earlier: i > 0, later: i < fields.length - 1 }} />
          ))}
        </div>
      )}
      <AddField {...shared} section={section} have={fields.map((f) => f.key)} />
      {removing && (
        <ConfirmDialog
          title={`Delete the section “${section.name}”`}
          confirmLabel="Delete section"
          onCancel={() => setRemoving(false)}
          onConfirm={() => {
            setRemoving(false);
            run(api.removeSection(entry.id, section.id, withFields));
          }}
        >
          {fields.length === 0 ? (
            <p>The section is empty.</p>
          ) : (
            <>
              <p>
                It holds {fields.length} {fields.length === 1 ? 'field' : 'fields'}. Unless you say otherwise they stay on the character, listed under “Fields without a section” on the Details tab.
              </p>
              <label className="check wrap">
                <input type="checkbox" checked={withFields} onChange={(e) => setWithFields(e.target.checked)} />
                Also delete {fields.length === 1 ? 'that field' : 'those fields'} and what is written in {fields.length === 1 ? 'it' : 'them'}
              </label>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}

/**
 * The sections of one tab of a profile, each a card of fields; with the
 * hidden ones put away, any fields that belong to no section, and a way to
 * add a section. Every field shown is a field of the character's one
 * record. Under Details it also offers the fields every character of the
 * project shares (a genre module's "Sanity", a template's "Power Rank").
 */
export function Sections({ tab, ...shared }: Shared & { tab: Section['tab'] }) {
  const { projectId, entry, profile, onError } = shared;
  const api = characters.forProject(projectId);
  const [adding, setAdding] = useState(false);
  const [shaping, setShaping] = useState(false);
  const everyCharacter = useCategories().get('character');
  const lore = codex.forProject(projectId);
  const peers = profile.sections.filter((s) => s.tab === tab);
  const hidden = peers.filter((s) => s.hidden);
  const placed = new Set(profile.sections.flatMap((s) => s.fieldIds));
  const loose = tab === 'details' ? entry.fields.filter((f) => !placed.has(f.id) && (f.key.trim() || f.value.trim())) : [];
  // Shared fields this character has nothing in yet: offered, never forced onto the page.
  const offered = tab === 'details' ? viewFields(entry, everyCharacter).category.filter((slot) => !slot.field).map((slot) => slot.def) : [];
  return (
    <div className="vault-sections">
      {peers.filter((s) => !s.hidden).map((section) => (
        <SectionCard key={section.id} {...shared} section={section} peers={peers} />
      ))}
      {(loose.length > 0 || offered.length > 0) && (
        <section className="vault-section" aria-label="Fields without a section">
          <header className="vault-section-head">
            <h3>
              Fields without a section <span className="vault-count">({loose.length})</span>
            </h3>
            <button type="button" className="btn ghost" onClick={() => setShaping(true)}>
              Shared fields…
            </button>
          </header>
          {loose.length > 0 && <p className="muted small">Shared by every character, or left behind by a section that was removed. Open one to give it a section.</p>}
          {offered.length > 0 && (
            <p className="chips" role="group" aria-label="Shared fields to add">
              <span className="muted small">Shared by every character:</span>
              {offered.map((def) => (
                <button key={def.id} type="button" className="filter-chip" onClick={() => void lore.setFieldValue(entry.id, def.id, '').catch(onError)}>
                  + {def.name}
                </button>
              ))}
            </p>
          )}
          <div className="vault-fields">
            {loose.map((field) => (
              <FieldCard key={field.id} {...shared} field={field} section={null} canMove={{ earlier: false, later: false }} />
            ))}
          </div>
        </section>
      )}
      {shaping && <SchemaDialog codex={lore} entries={shared.entries} initial="character" only="character" onClose={() => setShaping(false)} />}
      {hidden.length > 0 && (
        <details className="vault-hidden">
          <summary>
            {hidden.length} hidden {hidden.length === 1 ? 'section' : 'sections'}
          </summary>
          <ul>
            {hidden.map((section) => (
              <li key={section.id}>
                {section.name}
                <button type="button" className="btn ghost" aria-label={`Show the section ${section.name}`} onClick={() => void api.updateSection(entry.id, section.id, { hidden: false }).catch(onError)}>
                  Show
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {adding ? (
        <form
          className="vault-add-form vault-new-section"
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name') ?? '');
            if (!name.trim()) return;
            void api.addSection(entry.id, name, tab).then(() => setAdding(false), onError);
          }}
        >
          <input name="name" autoFocus placeholder="Section name" aria-label="Name of the new section" />
          <button type="submit" className="btn primary">
            Add section
          </button>
          <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="vault-new-section-open" onClick={() => setAdding(true)}>
          + Add New Section
        </button>
      )}
    </div>
  );
}
