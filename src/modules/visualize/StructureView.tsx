import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { structure } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { buildTree, flatten, isDocument, isGroup } from '@/modules/manuscript/tree';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { LengthChart } from '@/modules/structure/components/LengthChart';
import { barOf, labelDistribution, lengthBars, lengthFacts, partBands, placeMarkers, usedLabels, type Grain, type LengthBar } from '@/modules/structure/pacing';
import { SUGGESTED_MARKERS } from '@/modules/structure/types';
import { can } from '@/modules/sync/access';
import { nodeLabel } from '@/modules/timeline/narrative';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { formatNumber } from '@/shared/format';
import { Legend } from '@/modules/viz/components/Legend';

interface StructureViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/**
 * STRUCTURE AND PACING
 * How long each chapter or scene is, the parts it sits in, the author's
 * structural markers, and words by the labels the author gives: all read
 * from what is recorded. These describe the manuscript; they do not measure
 * it, and no structure is expected of it.
 */
export function StructureView({ model, projectId, params, setParams, mode, setMode, pick, selectedId }: StructureViewProps) {
  const markers = useLiveQuery(() => structure.forProject(projectId).list(), [projectId]);
  const me = useMe(projectId);
  const writable = can(me.role, 'write');
  const grain: Grain = params.get('sgrain') === 'scenes' ? 'scenes' : 'chapters';
  const parts = [...model.nodes.values()].filter((n) => isGroup(n.kind)).sort((a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0));
  const partId = parts.some((p) => p.id === params.get('spart')) ? params.get('spart') : null;
  const labels = usedLabels(model);
  const label = labels.find((l) => l.toLowerCase() === (params.get('slabel') ?? '').toLowerCase()) ?? null;
  const bars = useMemo(() => lengthBars(model, { grain, partId }), [model, grain, partId]);
  const [error, setError] = useState<string | null>(null);
  if (!markers) return <VizState status={{ kind: 'loading' }} />;
  if (!model.order.chapters.length) return <VizState status={{ kind: 'empty', message: 'No chapters yet. Add chapters in the Organizer or the manuscript; their lengths, and the labels and markers you give them, appear here.' }} />;

  const bands = partBands(bars, model);
  const facts = lengthFacts(bars);
  const picked = label ? bars.filter((b) => b.labels.some((l) => l.toLowerCase() === label.toLowerCase())) : bars;
  const dist = labelDistribution(bars, model, grain);
  const placed = placeMarkers(markers, model);
  const onBars = new Map<number, string[]>();
  for (const p of placed) {
    const i = barOf(p, bars, model);
    if (i >= 0) onBars.set(i, [...(onBars.get(i) ?? []), p.marker.kind]);
  }
  const partTitle = (id: string | null) => (id ? model.nodes.get(id)?.title : undefined);
  const barWords = (bar: LengthBar, i: number) =>
    [`${bar.label}: ${bar.words > 0 ? plural(bar.words, 'word') : 'no words yet'}`, bar.labels.length ? `labels: ${bar.labels.join(', ')}` : '', bar.partId ? `in ${partTitle(bar.partId)}` : '', onBars.get(i)?.length ? `markers: ${onBars.get(i)!.join(', ')}` : ''].filter(Boolean).join('; ');
  const act = (task: Promise<unknown>) => void task.then(() => setError(null), (e) => setError(e instanceof Error ? e.message : String(e)));
  const max = Math.max(1, ...dist.cells.flatMap((c) => [...c.words.values(), c.unlabelled]));
  const head = (bar: LengthBar, i: number) => (bars.filter((b) => b.chapterId === bar.chapterId).length > 1 ? `${bar.chapterNumber}.${bars.slice(0, i + 1).filter((b) => b.chapterId === bar.chapterId).length}` : `${bar.chapterNumber}`);
  const where = (nodeId: string | null) => (nodeId ? nodeLabel(model, nodeId) : 'Not placed');

  const controls = (
    <div className="viz-toolbar ps-controls">
      <div className="segmented" role="group" aria-label="Bars for">
        {(['chapters', 'scenes'] as const).map((g) => (
          <button key={g} type="button" className={grain === g ? 'active' : ''} aria-pressed={grain === g} onClick={() => setParams({ sgrain: g === 'scenes' ? 'scenes' : null })}>
            {g === 'chapters' ? 'Chapters' : 'Scenes'}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Pick out a label</span>
        <select aria-label="Pick out a label" value={label ?? ''} onChange={(e) => setParams({ slabel: e.target.value || null })}>
          <option value="">No label picked out</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {parts.length > 0 && (
        <label className="field">
          <span>Part of the book</span>
          <select aria-label="Part of the book" value={partId ?? ''} onChange={(e) => setParams({ spart: e.target.value || null })}>
            <option value="">The whole book</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <ViewSwitch mode={mode} onChange={setMode} visualLabel="Charts" />
    </div>
  );

  const factLine = bars.length ? (
    <p role="status" className="ps-facts">
      {plural(facts.count, grain === 'chapters' ? 'chapter' : 'bar')} · {plural(facts.total, 'word')}
      {facts.average > 0 && ` · average ${formatNumber(facts.average)} and median ${formatNumber(facts.median)} words, over the ${plural(facts.count - facts.empty, grain === 'chapters' ? 'chapter' : 'bar')} with words`}
      {facts.longest && facts.shortest && facts.longest !== facts.shortest && ` · longest ${facts.longest.label} (${formatNumber(facts.longest.words)}), shortest ${facts.shortest.label} (${formatNumber(facts.shortest.words)})`}
      {facts.empty > 0 && ` · ${plural(facts.empty, grain === 'chapters' ? 'chapter has' : 'bar has', grain === 'chapters' ? 'chapters have' : 'bars have')} no words yet`}
      {` · ${facts.labelled} of ${facts.count} labelled`}
      {label && ` · ${picked.length} with “${label}”`}
    </p>
  ) : (
    <p role="status">Nothing in this part of the book yet.</p>
  );

  return (
    <div className="stack structure-view">
      <p className="notice ps-about">
        <strong>What these charts are.</strong> Word counts the editor keeps, and the parts, labels and markers you record, laid out in reading order. They describe the manuscript as it stands. They do not measure quality, how a chapter reads, or whether a structure is right, and no storytelling formula is assumed: the markers are only the ones you add.
      </p>
      {controls}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {factLine}
      {facts.total === 0 && bars.length > 0 && <p className="muted small">No words are written yet: the bars fill in as you write.</p>}

      <section className="stack" aria-label="Lengths">
        <h3>Length, {grain === 'chapters' ? 'chapter by chapter' : 'scene by scene'}</h3>
        {!bars.length ? null : mode === 'visual' ? (
          <>
            <LengthChart bars={bars} bands={bands} markers={onBars} average={facts.average} label={label} selectedId={selectedId} onSelect={(id) => pick({ type: 'node', id })} words={barWords} />
            <Legend
              title="What the chart shows"
              items={[
                { key: 'words', label: `Words in each ${grain === 'chapters' ? 'chapter' : 'scene'}`, color: 'var(--accent)', shape: 'square' },
                ...(bars.some((b) => b.words === 0) ? [{ key: 'empty', label: 'Nothing written yet', color: 'var(--muted)', shape: 'empty' as const }] : []),
                ...(facts.average > 0 ? [{ key: 'average', label: 'The average length', color: 'var(--text)', shape: 'dashed' as const }] : []),
                ...(onBars.size ? [{ key: 'marker', label: 'A structural marker you placed', color: 'var(--cat-7)', shape: 'diamond' as const }] : []),
                ...(bands.length ? [{ key: 'part', label: 'A part of the book (volume, act or arc), shaded behind its chapters', color: 'var(--sunken)', shape: 'square' as const }] : []),
              ]}
            />
          </>
        ) : (
          <div className="table-scroll">
            <table className="sessions" aria-label="Lengths in reading order">
              <thead>
                <tr>
                  <th scope="col">{grain === 'chapters' ? 'Chapter' : 'Chapter or scene'}</th>
                  <th scope="col">Part</th>
                  <th scope="col">Words</th>
                  <th scope="col">Labels</th>
                  <th scope="col">Markers</th>
                </tr>
              </thead>
              <tbody>
                {bars.map((bar, i) => (
                  <tr key={bar.nodeId} className={bar.nodeId === selectedId ? 'viz-row selected' : 'viz-row'}>
                    <td>
                      <button type="button" className="link viz-pick" aria-pressed={bar.nodeId === selectedId} onClick={() => pick({ type: 'node', id: bar.nodeId })}>
                        {bar.label}
                      </button>
                    </td>
                    <td>{partTitle(bar.partId) ?? <span className="muted">—</span>}</td>
                    <td>{bar.words > 0 ? formatNumber(bar.words) : <span className="muted">No words yet</span>}</td>
                    <td>{bar.labels.join(', ') || <span className="muted">—</span>}</td>
                    <td>{onBars.get(i)?.join(', ') ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack" aria-label="Words by label">
        <h3>Words by label, {grain === 'chapters' ? 'chapter by chapter' : 'scene by scene'}</h3>
        <p className="muted small">From the labels you give chapters and scenes in their plan (the Organizer, or the manuscript’s side panel). A chapter or scene counts its words under each of its labels, so one with two labels counts toward both. Events can carry labels too, on the Timeline; they have no words, so they are not counted here.</p>
        {!dist.labels.length ? (
          <VizState status={{ kind: 'empty', message: 'No chapter or scene has a label yet. Give some a label in their plan (Action, Dialogue, Quiet moment, or your own), and this fills in.' }} />
        ) : mode === 'visual' ? (
          <div className="table-scroll">
            <table className="ps-grid-table" aria-label="Words by label for each chapter">
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  {bars.map((bar, i) => (
                    <th key={bar.nodeId} scope="col" title={bar.label} aria-label={bar.label}>
                      {head(bar, i)}
                    </th>
                  ))}
                  <th scope="col">All</th>
                </tr>
              </thead>
              <tbody>
                {[...dist.labels, null].map((l) => (
                  <tr key={l ?? 'none'} className={label && l?.toLowerCase() === label.toLowerCase() ? 'picked' : ''}>
                    <th scope="row">{l ?? <span className="muted">No label</span>}</th>
                    {dist.cells.map((c, i) => {
                      const w = l === null ? c.unlabelled : (c.words.get(l) ?? 0);
                      const has = l === null ? c.unlabelled > 0 : c.words.has(l);
                      return (
                        <td key={c.nodeId} className={has ? 'has' : ''} style={{ '--w': w / max } as CSSProperties} title={`${bars[i].label}: ${l ?? 'no label'}, ${plural(w, 'word')}`}>
                          {has ? formatNumber(w) : ''}
                        </td>
                      );
                    })}
                    <td className="total">{formatNumber(l === null ? dist.unlabelled : dist.totals.find((t) => t.label === l)!.words)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <table className="sessions" aria-label="Words by label">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Words</th>
                <th scope="col">{grain === 'chapters' ? 'Chapters' : 'Bars'} with it</th>
              </tr>
            </thead>
            <tbody>
              {dist.totals.map((t) => (
                <tr key={t.label}>
                  <td>{t.label}</td>
                  <td>{formatNumber(t.words)}</td>
                  <td>{t.bars}</td>
                </tr>
              ))}
              <tr>
                <td className="muted">No label</td>
                <td>{formatNumber(dist.unlabelled)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <MarkersSection model={model} projectId={projectId} placed={placed} writable={writable} where={where} act={act} />
      <p className="muted small">
        Lengths come from the manuscript; the parts are the volumes, acts and arcs in the <Link to={`/project/${projectId}/organizer`}>Organizer</Link>.
      </p>
    </div>
  );
}

interface MarkersSectionProps {
  model: StoryModel;
  projectId: string;
  placed: ReturnType<typeof placeMarkers>;
  writable: boolean;
  where: (nodeId: string | null) => string;
  act: (task: Promise<unknown>) => void;
}

/** The author's structural markers, in reading order, and a form to add one. None is required. */
function MarkersSection({ model, projectId, placed, writable, where, act }: MarkersSectionProps) {
  const api = structure.forProject(projectId);
  const blank = { kind: '', title: '', nodeId: '', eventId: '', note: '' };
  const [draft, setDraft] = useState(blank);
  const listId = useId();
  const documents = flatten(buildTree([...model.nodes.values()])).filter((t) => isDocument(t.node.kind));
  const events = [...model.events.values()].sort((a, b) => a.name.localeCompare(b.name));
  const kinds = [...new Set([...SUGGESTED_MARKERS, ...placed.map((p) => p.marker.kind)])];
  return (
    <section className="stack" aria-label="Structural markers">
      <h3>Structural markers</h3>
      <p className="muted small">Mark what you consider structural, where it falls: an act break, a turning point, a major reveal, the climax, the resolution, or anything you name. They show as flags on the length chart. None is required, and nothing is expected of their order.</p>
      {placed.length === 0 ? (
        <p className="muted">No markers yet.</p>
      ) : (
        <ol className="ps-markers">
          {placed.map((p) => (
            <li key={p.marker.id}>
              <strong>{p.marker.kind}</strong>
              {p.marker.title && <span> — {p.marker.title}</span>}
              <span className="muted small">
                {' '}
                · {p.missing && !p.nodeId ? 'Its chapter was removed' : where(p.nodeId)}
                {p.via === 'event' && ` (where “${model.events.get(p.marker.eventId!)?.name}” is told)`}
                {p.marker.eventId && p.via !== 'event' && model.events.has(p.marker.eventId) && ` · at “${model.events.get(p.marker.eventId)!.name}”`}
              </span>
              {p.marker.note && <span className="small"> · {p.marker.note}</span>}
              {writable && (
                <button type="button" className="btn ghost icon" aria-label={`Remove the marker ${p.marker.kind}${p.marker.title ? `: ${p.marker.title}` : ''}`} onClick={() => act(api.remove(p.marker.id))}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {writable && (
        <form
          className="kn-form"
          aria-label="Add a structural marker"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.kind.trim()) return;
            const sent = draft;
            setDraft(blank);
            act(api.save(null, { kind: sent.kind, title: sent.title, nodeId: sent.nodeId || null, eventId: sent.eventId || null, note: sent.note }).catch((err) => {
              setDraft((d) => (d.kind ? d : sent));
              throw err;
            }));
          }}
        >
          <div className="kn-form-grid">
            <label className="field">
              <span>Kind</span>
              <input list={listId} value={draft.kind} aria-label="Kind of marker" placeholder="Turning point, Climax, your own…" onChange={(e) => setDraft({ ...draft, kind: e.target.value })} />
              <datalist id={listId}>
                {kinds.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Its own words</span>
              <input value={draft.title} aria-label="Marker title" placeholder="Optional: the bridge falls" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Chapter or scene</span>
              <select value={draft.nodeId} aria-label="Marker chapter or scene" onChange={(e) => setDraft({ ...draft, nodeId: e.target.value })}>
                <option value="">Not said</option>
                {documents.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {'  '.repeat(depth) + (node.title || 'Untitled')}
                  </option>
                ))}
              </select>
            </label>
            {events.length > 0 && (
              <label className="field">
                <span>Event</span>
                <select value={draft.eventId} aria-label="Marker event" onChange={(e) => setDraft({ ...draft, eventId: e.target.value })}>
                  <option value="">Not said</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field kn-wide">
              <span>Note</span>
              <input value={draft.note} aria-label="Marker note" placeholder="Optional" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </label>
          </div>
          <div className="actions start">
            <button type="submit" className="btn" disabled={!draft.kind.trim()}>
              Add marker
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
