import { useLiveQuery } from 'dexie-react-hooks';
import { CONNECTION_TYPES, connectionType } from '@/modules/connections/types';
import { fieldsFor, missingFor, typeWords, type KindView, type Slot } from '../capabilities';
import type { CategoryChanges, ProjectCodex } from '../service';
import { FIELD_TYPE_LABELS, type Category, type KindUses } from '../types';
import { Check } from './Check';

interface KindUsesEditorProps {
  codex: ProjectCodex;
  category: Category;
  /** Saves against the category as stored, so quick changes in a row build on each other. */
  save: (edit: (stored: Category) => CategoryChanges) => void;
}

/**
 * Which fields each view reads, chosen by the author: nothing is worked out
 * from a field's name. Each menu offers only the fields of a type the view
 * can read; a setting whose field was later retyped or removed is still
 * shown, with what is wrong, until the author changes it.
 */
export function KindUsesEditor({ codex, category, save }: KindUsesEditorProps) {
  const links = useLiveQuery(() => codex.links(), [codex]) ?? [];
  const uses = category.uses ?? {};
  const setUses = (change: (current: KindUses) => KindUses) => save((stored) => ({ uses: change(stored.uses ?? {}) }));
  const ownTypes = [...new Set(links.map((l) => l.type).filter((t): t is string => Boolean(t) && !CONNECTION_TYPES.some((k) => k.key === t)))];
  const holding = uses.ownership?.type;
  const linkFields = fieldsFor(category, 'graphLinks');

  /** A menu of the fields that can fill a slot. */
  const pick = (slot: Slot, label: string, value: string | undefined, none: string, onChange: (id: string | undefined) => void) => {
    const fitting = fieldsFor(category, slot);
    const stale = value && !fitting.some((f) => f.id === value) ? category.fields.find((f) => f.id === value) : undefined;
    return (
      <label className="field">
        <span>{label}</span>
        <select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{none}</option>
          {fitting.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({FIELD_TYPE_LABELS[f.type]})
            </option>
          ))}
          {value && !fitting.some((f) => f.id === value) && <option value={value}>{stale ? `${stale.name} (does not suit now)` : 'A field that is gone'}</option>}
        </select>
      </label>
    );
  };

  /** Whether a view can be shown, in words: not set up, what is still missing, or ready. */
  const state = (view: KindView, set: boolean, slot: Slot) => {
    const missing = missingFor(category, view);
    if (!set) return <small className="muted">{fieldsFor(category, slot).length ? 'Not set up.' : `Add ${typeWords(slot)} to set this up.`}</small>;
    if (missing.length)
      return (
        <ul className="field-issue kind-use-issues" role="note">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      );
    return <small className="muted">Set up: shown under Visualize → Records by kind.</small>;
  };

  return (
    <fieldset className="plan-group kind-uses">
      <legend>Visualizations</legend>
      <p className="muted small">Choose the field each view reads. Nothing is worked out from field names. A view {category.name} is not set up for shows its records as a table instead.</p>

      <div className="kind-use" role="group" aria-label="On a timeline">
        <strong>On a timeline</strong>
        <div className="grid-2 tight">
          {pick('timeline.start', 'Date on the timeline', uses.timeline?.start, 'Not on a timeline', (start) => setUses((u) => ({ ...u, timeline: { ...u.timeline, start } })))}
          {pick('timeline.end', 'End on the timeline (optional)', uses.timeline?.end, 'No end', (end) => setUses((u) => ({ ...u, timeline: { ...u.timeline, end } })))}
        </div>
        <small className="muted">A Number is a year of the story’s calendar; a Date is a day.</small>
        {state('timeline', Boolean(uses.timeline), 'timeline.start')}
      </div>

      <div className="kind-use" role="group" aria-label="On a map">
        <strong>On a map</strong>
        <div className="grid-2 tight">
          {pick('map.x', 'Across on the map', uses.map?.x, 'Not set', (x) => setUses((u) => ({ ...u, map: { ...u.map, x } })))}
          {pick('map.y', 'Up on the map', uses.map?.y, 'Not set', (y) => setUses((u) => ({ ...u, map: { ...u.map, y } })))}
        </div>
        {state('map', Boolean(uses.map), 'map.x')}
      </div>

      <div className="kind-use" role="group" aria-label="By rank">
        <strong>By rank</strong>
        {pick('rank', 'Rank', uses.rank, 'Not ranked', (rank) => setUses((u) => ({ ...u, rank })))}
        <small className="muted">A Choice (one) ranks by the order of its choices, lowest first.</small>
        {state('rank', Boolean(uses.rank), 'rank')}
      </div>

      <div className="kind-use" role="group" aria-label="By who holds it">
        <strong>By who holds it</strong>
        <div className="grid-2 tight">
          <label className="field">
            <span>Connection that means holding it</span>
            <select aria-label="Connection that means holding it" value={holding ?? ''} onChange={(e) => {
                // Read now: by the time the save runs, the menu shows the stored value again.
                const type = e.target.value || undefined;
                setUses((u) => ({ ...u, ownership: { ...u.ownership, type } }));
              }}
            >
              <option value="">Not set</option>
              {CONNECTION_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
              {[...ownTypes, ...(holding && !CONNECTION_TYPES.some((k) => k.key === holding) && !ownTypes.includes(holding) ? [holding] : [])].map((t) => (
                <option key={t} value={t}>
                  {connectionType(t).label} (your own)
                </option>
              ))}
            </select>
          </label>
          {pick('ownership.field', 'Current holder field (optional)', uses.ownership?.field, 'None', (field) => setUses((u) => ({ ...u, ownership: { ...u.ownership, field } })))}
        </div>
        <small className="muted">A holder is the record a connection of this type comes from: “Mira owns the Ember Crown”.</small>
        {state('ownership', Boolean(uses.ownership), 'ownership.field')}
      </div>

      <div className="kind-use" role="group" aria-label="In the ability tree">
        <strong>In the ability tree</strong>
        <Check label="Its records are abilities, skills, classes or the like" name={`Show ${category.name} in the ability tree`} checked={uses.tree === true} onChange={(tree) => setUses((u) => ({ ...u, tree: tree || undefined }))} />
        <small className="muted">Shown under Visualize → Ability paths, with the paths you record between them (prerequisites, upgrades, evolutions, fusions, replacements, exclusions). Records joined by such a path are shown there whatever their kind.</small>
      </div>

      <div className="kind-use" role="group" aria-label="In the knowledge graph">
        <strong>In the knowledge graph</strong>
        {pick('graphLabel', 'Label in the knowledge graph', uses.graphLabel, 'Its name', (graphLabel) => setUses((u) => ({ ...u, graphLabel })))}
        {linkFields.length > 0 && (
          <div className="kind-use-links" role="group" aria-label="Link fields drawn as connections">
            <span className="small">Link fields drawn as connections:</span>
            {linkFields.map((def) => (
              <Check
                key={def.id}
                label={def.name}
                name={`Draw ${def.name} in the knowledge graph`}
                checked={!uses.graphLinks || uses.graphLinks.includes(def.id)}
                onChange={(on) =>
                  setUses((u) => {
                    const live = fieldsFor({ fields: category.fields }, 'graphLinks').map((d) => d.id);
                    const now = (u.graphLinks ?? live).filter((id) => id !== def.id);
                    const next = on ? [...now, def.id] : now;
                    // Every link field ticked is the same as none chosen: all are drawn, including ones added later.
                    return { ...u, graphLinks: live.every((id) => next.includes(id)) ? undefined : next };
                  })
                }
              />
            ))}
          </div>
        )}
        {[...missingFor(category, 'graphLabel'), ...missingFor(category, 'graphLinks')].length > 0 && (
          <ul className="field-issue kind-use-issues" role="note">
            {[...missingFor(category, 'graphLabel'), ...missingFor(category, 'graphLinks')].map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
