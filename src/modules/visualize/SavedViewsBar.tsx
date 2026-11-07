import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { savedViews } from '@/core';
import type { Filter } from '@/modules/model/query';
import { encodeFilter, FILTER_PARAMS } from '@/modules/viz/params';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { trackAddress, tracksFromLayout } from '@/modules/timeline/tracks';
import { NETWORK_PARAMS } from '@/modules/relationships/networkParams';
import { KNOWLEDGE_PARAMS } from '@/modules/characters/knowledge';
import { STRUCTURE_PARAMS } from '@/modules/structure/pacing';
import { APPEARANCE_PARAMS } from '@/modules/characters/appearances';
import { GRAPH_PARAMS } from '@/modules/graph/knowledge';
import { KIND_PARAMS } from './kinds';
import { ABILITY_PARAMS } from './AbilityPathsView';
import { PLACE_PARAMS } from './PlacesView';
import { JOURNEY_PARAMS } from './JourneysView';
import { FACTION_PARAMS } from './FactionsView';
import { OWNERSHIP_PARAMS } from './OwnershipView';
import { CHART_PARAMS } from '@/modules/analytics/charts';
import type { SavedView, ViewConfig } from './saved';

interface SavedViewsBarProps {
  projectId: string;
  view: string;
  /** The open saved view's id, from the page address. */
  savedId: string | null;
  /** What the view shows now, to save. */
  current: ViewConfig;
  /** Puts a configuration in the page address, and marks which saved view it is (or none). */
  apply: (config: Applied, savedId: string | null) => void;
  onError: (error: unknown) => void;
}

/** What opening a view puts in the page address: its filters, list or drawn, and its layout (the timeline's tracks). */
export type Applied = { filter: Filter; mode: 'visual' | 'list'; layout?: Record<string, unknown> };

/** The address parameters a saved view sets, all at once, so nothing from the view before lingers. */
export function addressFor(config: Applied, savedId: string | null): Record<string, string | null> {
  const changes: Record<string, string | null> = Object.fromEntries(FILTER_PARAMS.map((p) => [p, null]));
  for (const [key, value] of encodeFilter(config.filter)) changes[key] = value;
  const { grouping, prefs } = tracksFromLayout(config.layout ?? {});
  // The relationship map's and the knowledge view's own settings, as plain values: set when the view has them, cleared when it does not.
  const network = Object.fromEntries([...NETWORK_PARAMS, ...KNOWLEDGE_PARAMS, ...STRUCTURE_PARAMS, ...APPEARANCE_PARAMS, ...GRAPH_PARAMS, ...KIND_PARAMS, ...ABILITY_PARAMS, ...PLACE_PARAMS, ...JOURNEY_PARAMS, ...FACTION_PARAMS, ...OWNERSHIP_PARAMS, ...CHART_PARAMS].map((key) => [key, typeof config.layout?.[key] === 'string' ? (config.layout[key] as string) : null]));
  return { ...changes, ...trackAddress(grouping, prefs), ...network, as: config.mode === 'list' ? 'list' : null, saved: savedId };
}

const same = (a: Applied, b: Applied) => JSON.stringify(addressFor(a, null)) === JSON.stringify(addressFor(b, null));

/**
 * Naming the way a view is set up, and coming back to it: open, save as,
 * save changes, rename, duplicate, restore default, delete. A saved view
 * holds settings and record ids, never copies of records.
 */
export function SavedViewsBar({ projectId, view, savedId, current, apply, onError }: SavedViewsBarProps) {
  const api = savedViews.forProject(projectId);
  const list = useLiveQuery(() => api.list(view), [projectId, view]);
  const open = list?.find((s) => s.id === savedId) ?? null;
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<SavedView | null>(null);
  const run = (task: () => Promise<unknown>) => void task().catch(onError);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (naming === 'rename' && open) run(() => api.rename(open.id, name));
    if (naming === 'new') run(async () => apply(current, (await api.save(view, name, current)).id));
    setNaming(null);
  };

  return (
    <div className="viz-saved" role="group" aria-label="Saved views">
      <select aria-label="Saved views of this kind" value={open?.id ?? ''} onChange={(e) => {
          const chosen = list?.find((s) => s.id === e.target.value);
          apply(chosen ?? { filter: {}, mode: 'visual' }, chosen?.id ?? null);
        }}>
        <option value="">{list?.length ? 'Saved views…' : 'No saved views yet'}</option>
        {list?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {naming ? (
        <form className="viz-saved-name" onSubmit={submit}>
          <input aria-label={naming === 'new' ? 'Name for this view' : 'New name for this view'} value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNaming(null)} />
          <button type="submit" className="btn primary">
            {naming === 'new' ? 'Save' : 'Rename'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button type="button" className="btn" onClick={() => (setName(''), setNaming('new'))}>
            Save view as…
          </button>
          {open && (
            <>
              {!same(open, current) && (
                <button type="button" className="btn" onClick={() => run(() => api.update(open.id, current))}>
                  Save changes to “{open.name}”
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => (setName(open.name), setNaming('rename'))}>
                Rename
              </button>
              <button type="button" className="btn ghost" onClick={() => run(async () => apply(open, (await api.duplicate(open.id)).id))}>
                Duplicate
              </button>
              <button type="button" className="btn ghost" onClick={() => run(async () => (await api.restoreDefault(open.id), apply({ filter: {}, mode: 'visual' }, open.id)))}>
                Restore default
              </button>
              <button type="button" className="btn ghost danger" onClick={() => setDeleting(open)}>
                Delete
              </button>
            </>
          )}
        </>
      )}
      {deleting && (
        <ConfirmDialog title="Delete this saved view?" confirmLabel="Delete view" onCancel={() => setDeleting(null)} onConfirm={() => {
            const gone = deleting;
            setDeleting(null);
            run(async () => (await api.remove(gone.id), apply(current, null)));
          }}>
          <p>“{deleting.name}” is only a way of looking at the novel. Deleting it changes no character, event, chapter or other record.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
