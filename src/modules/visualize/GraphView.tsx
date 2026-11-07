import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EDGE_GROUP_LABELS, EDGE_GROUP_SWATCH, EDGE_GROUPS, groupOf, KnowledgeMap, SHAPE_SWATCH, shapeOf, typeCodes, type Pair } from '@/modules/graph/components/KnowledgeMap';
import { collapseGraph, DRAW_LIMIT, DRAW_STEP, edgeTypeLabel, edgeWords, isGroupNode, knowledgeGraph, limitGraph, nodeTypeLabel, pathBetween, queryGraph, refOf, typeCounts, type GraphEdge, type GraphNode } from '@/modules/graph/knowledge';
import { mergeMarks, type Overlay } from '@/modules/canon/overlay';
import { MarkText } from './CanonMarks';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { Legend } from '@/modules/viz/components/Legend';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { decodeFilter } from '@/modules/viz/params';
import { STATUS_WORDS, statusOf, type ConnectionStatus } from '@/modules/integrity/rules';
import { formatNumber } from '@/shared/format';

interface GraphViewProps {
  /** Canon and continuity markers, when they are on. */
  marks?: Overlay | null;
  model: StoryModel;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
}

const listOf = (value: string | null) => new Set((value ?? '').split(',').filter(Boolean));
const SOURCE_WORDS: Record<string, string> = { loreLinks: 'a connection you recorded', characterRelations: 'a character relationship', loreEntries: 'a field of the entry', chapters: 'the manuscript', chapterPlans: 'a chapter’s plan', timelineEvents: 'a timeline event', plotThreads: 'a plot thread', systemSheets: 'a system sheet', systems: 'a system blueprint' };
/** Every setting of the view: cleared together to restore the full view. */
const VIEW_SETTINGS = ['ghide', 'gedges', 'gstatus', 'gfocus', 'gdepth', 'gcollapse', 'gfold', 'glimit', 'gall', 'gpath', 'q', 'chars'];

/** A checkbox that shows a click at once, and follows the page address when it changes another way. */
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const [local, setLocal] = useState({ from: checked, value: checked });
  if (local.from !== checked) setLocal({ from: checked, value: checked });
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={local.value}
        onChange={(e) => {
          setLocal({ from: checked, value: e.target.checked });
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}

/**
 * A list of types as checkboxes, each with its count, and (for kinds of
 * record) a toggle to fold them together into one group. They live in the
 * page address; each box shows its change at once.
 */
function TypeChecks({ label, types, hidden, name, onChange, folded, onFold }: { label: string; types: [string, number][]; hidden: Set<string>; name: (type: string) => string; onChange: (hidden: Set<string>) => void; folded?: Set<string>; onFold?: (type: string) => void }) {
  const key = [...hidden].sort().join(',');
  const [local, setLocal] = useState({ from: key, hidden });
  if (local.from !== key) setLocal({ from: key, hidden });
  return (
    <fieldset className="kg-types">
      <legend>{label}</legend>
      {types.map(([type, count]) => (
        <div key={type} className="kg-type-row">
          <label className="check">
            <input
              type="checkbox"
              checked={!local.hidden.has(type)}
              onChange={(e) => {
                const next = new Set(local.hidden);
                if (e.target.checked) next.delete(type);
                else next.add(type);
                setLocal({ from: key, hidden: next });
                onChange(next);
              }}
            />
            {name(type)} <span className="muted small">{count}</span>
          </label>
          {onFold && !local.hidden.has(type) && count > 1 && (
            <button type="button" className="btn ghost small" aria-pressed={folded?.has(type)} aria-label={`${folded?.has(type) ? 'Open' : 'Fold together'} ${name(type)}`} onClick={() => onFold(type)}>
              {folded?.has(type) ? 'Open' : 'Fold together'}
            </button>
          )}
        </div>
      ))}
    </fieldset>
  );
}

/**
 * THE KNOWLEDGE GRAPH
 * Every record and every connection the novel holds, drawn or listed. The
 * graph is read from the records each time: there are no graph-only
 * records. Against clutter: layers, focus, search, folding records
 * together, and a limit on how many are drawn at once; whenever any of
 * these leaves part of the story out, the view says so, with a way back.
 */
export function GraphView({ model, marks, params, setParams, mode, setMode, pick, selectedId }: GraphViewProps) {
  const full = useMemo(() => knowledgeGraph(model), [model]);
  const [pairKey, setPairKey] = useState<string | null>(null);
  const asked = decodeFilter(params);
  const hiddenNodes = listOf(params.get('ghide'));
  const hiddenEdges = listOf(params.get('gedges'));
  const hiddenStatuses = listOf(params.get('gstatus'));
  const collapsedTypes = listOf(params.get('gcollapse'));
  const fold = params.get('gfold') === '1';
  const depth: 1 | 2 = params.get('gdepth') === '2' ? 2 : 1;
  const limit = params.get('glimit') === 'all' ? Infinity : Math.max(DRAW_LIMIT, Number(params.get('glimit')) || DRAW_LIMIT);
  const byKey = useMemo(() => new Map(full.nodes.map((n) => [n.key, n])), [full]);
  const focusKey = byKey.has(params.get('gfocus') ?? '') ? params.get('gfocus') : asked.characters?.[0] && byKey.has(`entry:${asked.characters[0]}`) ? `entry:${asked.characters[0]}` : null;
  const isolated = params.get('gall') === '1';
  // The layers open by themselves only when the page opens with some set; after that they stay as the author leaves them.
  const [layersOpen] = useState(() => hiddenNodes.size > 0 || hiddenEdges.size > 0 || hiddenStatuses.size > 0 || collapsedTypes.size > 0);

  // 1. Layers, words and focus.
  const filtered = useMemo(() => queryGraph(full, { hiddenNodes, hiddenEdges, hiddenStatuses, text: asked.text, focus: focusKey ? { key: focusKey, depth } : null, isolated }), [full, params]); // eslint-disable-line react-hooks/exhaustive-deps
  // The same, with records that have no connection shown: the difference is what that leaves out.
  const withIsolated = useMemo(() => (isolated ? filtered.nodes.length : queryGraph(full, { hiddenNodes, hiddenEdges, hiddenStatuses, text: asked.text, focus: focusKey ? { key: focusKey, depth } : null, isolated: true }).nodes.length), [full, params, filtered]); // eslint-disable-line react-hooks/exhaustive-deps
  // 2. Folding: scenes into their chapters, kinds of record into one group each.
  const collapsed = useMemo(() => {
    const folder = (key: string) => {
      const ref = refOf(key);
      const node = ref?.type === 'node' ? model.nodes.get(ref.id) : undefined;
      return node?.kind === 'scene' && node.parentId && model.nodes.get(node.parentId)?.kind === 'chapter' ? `node:${node.parentId}` : null;
    };
    return collapseGraph(filtered, { types: collapsedTypes, fold: fold ? folder : undefined }, (type, count) => `${count} ${nodeTypeLabel(type, model).toLowerCase()}`);
  }, [filtered, params, model]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = full.nodes.find((n) => n.ref?.id === selectedId) ?? null;
  const pathTo = params.get('gpath');
  const path = useMemo(() => (selected && pathTo && byKey.has(pathTo) ? pathBetween(filtered.edges, selected.key, pathTo) : null), [selected, pathTo, filtered, byKey]);
  const hiddenPath = useMemo(() => (selected && pathTo && byKey.has(pathTo) && !path ? pathBetween(full.edges, selected.key, pathTo) : null), [selected, pathTo, path, full, byKey]);
  const mapped = (key: string) => collapsed.into.get(key) ?? key;
  // 3. The limit, always keeping the selection, the focus and a path in.
  const keep = new Set([selected && mapped(selected.key), focusKey && mapped(focusKey), ...(path ?? []).flatMap((e) => [mapped(e.from), mapped(e.to)])].filter((k): k is string => Boolean(k)));
  const keepKey = [...keep].sort().join(',');
  const limited = useMemo(() => limitGraph(collapsed.graph, limit, keep), [collapsed, limit, keepKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const drawn = limited.graph;
  const counts = useMemo(() => typeCounts(full), [full]);
  // Kinds of record that share a shape carry a letter code, worked out from every kind in the novel so a filter never changes it.
  const codes = useMemo(() => typeCodes(full.nodes.map((n) => n.type), (t) => nodeTypeLabel(t, model)), [full, model]);
  const labelOf = (key: string) => byKey.get(key)?.label ?? drawn.nodes.find((n) => n.key === key)?.label ?? 'Something deleted';
  if (!full.nodes.length) return <VizState status={{ kind: 'empty', message: 'Nothing is recorded yet. Characters, places, events, chapters, plot threads and every connection between them show up here as you add them.' }} />;

  const pairs = new Map<string, Pair>();
  for (const e of drawn.edges) {
    const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
    const key = `${a}~${b}`;
    if (!pairs.has(key)) pairs.set(key, { key, a, b, edges: [] });
    pairs.get(key)!.edges.push(e);
  }
  const pair = pairKey ? (pairs.get(pairKey) ?? null) : null;
  const pairWords = (p: Pair) => p.edges.map((e) => edgeWords(e, labelOf)).join('; ');
  // A connection's marks: a stored connection's own, or its relationship's; a folded group's are its records'.
  const edgeMark = (e: GraphEdge) => (!marks ? undefined : e.kind === 'link' ? marks.get(e.id) : e.kind === 'relationship' ? marks.get(`relation:${e.connection.source.id}`) : undefined);
  const nodeMark = (node: GraphNode) => (!marks ? undefined : isGroupNode(node) ? mergeMarks(node.members.map((k) => marks.get(k))) : marks.get(node.key));
  const toggleFold = (type: string) => {
    const next = new Set(collapsedTypes);
    if (!next.delete(type)) next.add(type);
    setParams({ gcollapse: next.size ? [...next].join(',') : null });
  };
  const select = (node: GraphNode) => {
    setPairKey(null);
    if (isGroupNode(node)) return toggleFold(node.type);
    if (node.ref) pick(node.ref);
  };
  const focusOn = (node: GraphNode) => node.ref && setParams({ gfocus: node.key });
  const onPath = (node: GraphNode) => (selected && node.key !== selected.key ? setParams({ gpath: node.key }) : select(node));
  const groupsShown = EDGE_GROUPS.filter((g) => drawn.edges.some((e) => groupOf(e) === g));
  const records = drawn.nodes.reduce((n, x) => n + (isGroupNode(x) ? x.members.length : 1), 0);
  const groupCount = drawn.nodes.filter(isGroupNode).length;
  const status = `Showing ${formatNumber(records)} of ${formatNumber(full.nodes.length)} records and ${formatNumber(drawn.edges.length)} of ${formatNumber(full.edges.length)} connections${focusKey ? `, around ${labelOf(focusKey)}` : ''}${groupCount ? `, ${groupCount} ${groupCount === 1 ? 'group' : 'groups'} folded together` : ''}.${full.dangling ? ` ${full.dangling} ${full.dangling === 1 ? 'connection points' : 'connections point'} at something deleted, and ${full.dangling === 1 ? 'is' : 'are'} left out.` : ''}`;
  const others = full.nodes.filter((n) => n.key !== selected?.key);
  const unconnected = withIsolated - filtered.nodes.length;
  const name = (types: Set<string>, label: (t: string) => string) => [...types].map(label).join(', ');

  // Everything that leaves part of the story out, each with its way back.
  const partial: { key: string; text: string; undo: { label: string; changes: Record<string, string | null> }[]; link?: { to: string; label: string } }[] = [];
  if (limited.cut > 0)
    partial.push({
      key: 'limit',
      text: `Only the ${formatNumber(drawn.nodes.length)} most connected of ${formatNumber(limited.total)} records and groups are drawn, so the graph stays readable and quick; ${formatNumber(limited.cut)} more are left out.`,
      undo: [
        { label: `Draw ${formatNumber(Math.min(DRAW_STEP, limited.cut))} more`, changes: { glimit: String(drawn.nodes.length + DRAW_STEP) } },
        { label: `Draw all ${formatNumber(limited.total)} (may be slow)`, changes: { glimit: 'all' } },
      ],
    });
  if (hiddenNodes.size) partial.push({ key: 'nodes', text: `Hidden kinds of record: ${name(hiddenNodes, (t) => nodeTypeLabel(t, model))}.`, undo: [{ label: 'Show them', changes: { ghide: null } }] });
  if (full.excluded?.length) {
    const count = full.excluded.reduce((n, x) => n + x.count, 0);
    partial.push({ key: 'excluded', text: `Set, in the Codex, not to appear in the graph: ${full.excluded.map((x) => `${nodeTypeLabel(`entry:${x.category}`, model)} (${x.count})`).join(', ')}, ${count} ${count === 1 ? 'record' : 'records'} in all.`, undo: [], link: { to: `/project/${model.project.id}/codex`, label: 'Change it in the Codex' } });
  }
  if (full.undrawn?.length) {
    const count = full.undrawn.reduce((n, x) => n + x.count, 0);
    partial.push({ key: 'undrawn', text: `Link fields set, in the Codex, not to be drawn: ${full.undrawn.map((x) => `${nodeTypeLabel(`entry:${x.category}`, model)}: ${x.field} (${x.count})`).join(', ')}, ${count} ${count === 1 ? 'connection' : 'connections'} in all.`, undo: [], link: { to: `/project/${model.project.id}/codex`, label: 'Change it in the Codex' } });
  }
  if (hiddenStatuses.size) partial.push({ key: 'statuses', text: `Connections hidden by status: ${name(hiddenStatuses, (t) => STATUS_WORDS[t as ConnectionStatus] ?? t)}.`, undo: [{ label: 'Show them', changes: { gstatus: null } }] });
  if (hiddenEdges.size) partial.push({ key: 'edges', text: `Hidden kinds of connection: ${name(hiddenEdges, edgeTypeLabel)}.`, undo: [{ label: 'Show them', changes: { gedges: null } }] });
  if (focusKey) partial.push({ key: 'focus', text: `Only what is within ${depth === 1 ? 'one step' : 'two steps'} of ${labelOf(focusKey)}.`, undo: [{ label: 'Drop the focus', changes: { gfocus: null, gdepth: null, chars: null } }] });
  if (asked.text) partial.push({ key: 'text', text: `Only records named “${asked.text}”, and what they are connected to.`, undo: [{ label: 'Clear the search', changes: { q: null } }] });
  if (collapsedTypes.size) partial.push({ key: 'groups', text: `Folded together, one node each: ${name(collapsedTypes, (t) => nodeTypeLabel(t, model))}. Connections inside a group are not drawn.`, undo: [{ label: 'Open them', changes: { gcollapse: null } }] });
  if (fold) partial.push({ key: 'fold', text: 'Scenes are folded into their chapters: a scene’s connections are drawn on its chapter.', undo: [{ label: 'Unfold them', changes: { gfold: null } }] });
  if (!isolated && unconnected > 0) partial.push({ key: 'isolated', text: `${formatNumber(unconnected)} ${unconnected === 1 ? 'record has' : 'records have'} no connection shown, and ${unconnected === 1 ? 'is' : 'are'} not drawn.`, undo: [{ label: 'Draw them', changes: { gall: '1' } }] });
  const restorable = partial.some((p) => p.key !== 'limit' && p.key !== 'isolated') || params.has('glimit') || isolated;

  return (
    <div className="stack graph-view">
      <p className="muted small">Every record of the novel and every connection between them, read from where each is kept: connections you record, relationships, fields, the timeline, plot threads, the manuscript and systems. Nothing is stored for the graph itself.</p>
      <div className="viz-toolbar kg-toolbar">
        <ViewSwitch mode={mode} onChange={setMode} visualLabel="Graph" />
        <Check label="Show records with no connection shown" checked={isolated} onChange={(on) => setParams({ gall: on ? '1' : null })} />
        <Check label="Fold scenes into their chapters" checked={fold} onChange={(on) => setParams({ gfold: on ? '1' : null })} />
        {focusKey && (
          <>
            <label className="field">
              <span>Around {labelOf(focusKey)}</span>
              <select aria-label="Steps out from the focus" value={depth} onChange={(e) => setParams({ gdepth: e.target.value === '2' ? '2' : null })}>
                <option value="1">One step</option>
                <option value="2">Two steps</option>
              </select>
            </label>
            <button type="button" className="btn ghost" onClick={() => setParams({ gfocus: null, gdepth: null, chars: null })}>
              Show the whole graph
            </button>
          </>
        )}
      </div>
      <details className="kg-layers" open={layersOpen || undefined}>
        <summary>Layers: what is shown, and what is folded together</summary>
        <div className="kg-layer-grid">
          <TypeChecks label="Records" types={counts.nodes} hidden={hiddenNodes} name={(t) => nodeTypeLabel(t, model)} onChange={(next) => setParams({ ghide: next.size ? [...next].join(',') : null })} folded={collapsedTypes} onFold={toggleFold} />
          <TypeChecks label="Connections" types={counts.edges} hidden={hiddenEdges} name={edgeTypeLabel} onChange={(next) => setParams({ gedges: next.size ? [...next].join(',') : null })} />
          {counts.statuses.length > 0 && <TypeChecks label="Connection status" types={counts.statuses} hidden={hiddenStatuses} name={(t) => STATUS_WORDS[t as ConnectionStatus] ?? t} onChange={(next) => setParams({ gstatus: next.size ? [...next].join(',') : null })} />}
        </div>
      </details>
      <p role="status" className="kg-status">
        {status}
      </p>
      {partial.length > 0 && (
        <section className="kg-partial" aria-label="What this view leaves out">
          <p>
            <strong>This is part of the story, not all of it.</strong>
          </p>
          <ul>
            {partial.map((p) => (
              <li key={p.key}>
                {p.text}{' '}
                {p.link && <Link to={p.link.to}>{p.link.label}</Link>}
                {p.undo.map((u) => (
                  <button key={u.label} type="button" className="btn ghost small" onClick={() => setParams(u.changes)}>
                    {u.label}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          {restorable && (
            <button type="button" className="btn" onClick={() => setParams(Object.fromEntries(VIEW_SETTINGS.map((k) => [k, null])))}>
              Restore the full view
            </button>
          )}
        </section>
      )}
      {!drawn.nodes.length ? (
        <VizState
          status={{
            kind: 'empty',
            message: 'Nothing is shown with these layers and filters.',
            action: (
              <button type="button" className="btn" onClick={() => setParams(Object.fromEntries(VIEW_SETTINGS.map((k) => [k, null])))}>
                Restore the full view
              </button>
            ),
          }}
        />
      ) : mode === 'visual' ? (
        <>
          <KnowledgeMap nodes={drawn.nodes} edges={drawn.edges} selectedKey={selected ? mapped(selected.key) : null} pairKey={pairKey} path={path ? new Set(path.map((e) => e.id)) : null} onSelect={select} onPair={(p) => setPairKey(p.key)} onFocus={focusOn} onPath={onPath} pairWords={pairWords} nodeMark={marks ? nodeMark : undefined} pairMark={marks ? (p) => mergeMarks(p.edges.map(edgeMark)) : undefined} typeName={(t) => nodeTypeLabel(t, model)} typeCode={(t) => codes.get(t)} />
          <div className="kg-legends">
            <Legend title="Records" items={[...new Set(drawn.nodes.map((n) => n.type))].map((t) => ({ key: t, label: nodeTypeLabel(t, model), color: drawn.nodes.find((n) => n.type === t)!.color, shape: SHAPE_SWATCH[shapeOf(t)], glyph: codes.get(t) }))} />
            <Legend title="Connections" items={groupsShown.map((g) => ({ key: g, label: EDGE_GROUP_LABELS[g], color: `var(--kg-${g})`, shape: EDGE_GROUP_SWATCH[g] }))} />
            <Legend title="Status of a connection you recorded" items={(['provisional', 'disputed', 'invalid'] as const).filter((st) => drawn.edges.some((e) => statusOf(e.connection) === st)).map((st) => ({ key: st, label: STATUS_WORDS[st], color: st === 'disputed' ? 'var(--conn-disputed)' : 'var(--kg-typed)', shape: st === 'provisional' ? 'dashed' : st === 'disputed' ? 'line' : 'fade' }))} />
          </div>
        </>
      ) : (
        <div className="table-scroll">
          <table className="sessions" aria-label="Connections shown">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">Connection</th>
                <th scope="col">To</th>
                <th scope="col">Kept in</th>
                {marks && <th scope="col">Canon and checks</th>}
              </tr>
            </thead>
            <tbody>
              {drawn.edges.map((e) => (
                <tr key={e.id} className={selected && (e.from === selected.key || e.to === selected.key) ? 'viz-row related' : 'viz-row'}>
                  {[e.from, e.to].map((k, i) => {
                    const node = drawn.nodes.find((n) => n.key === k);
                    const cell = (
                      <td key={k}>
                        {node ? (
                          <button type="button" className="link viz-pick" onClick={() => select(node)}>
                            {labelOf(k)}
                          </button>
                        ) : (
                          labelOf(k)
                        )}
                      </td>
                    );
                    return i === 0 ? (
                      [
                        cell,
                        <td key="how">
                          {e.label}
                          {e.label !== edgeTypeLabel(e.type) && <span className="muted small"> · {edgeTypeLabel(e.type)}</span>}
                          {e.directed ? ' →' : ''}
                        </td>,
                      ]
                    ) : (
                      cell
                    );
                  })}
                  <td className="muted small">{SOURCE_WORDS[e.connection.source.table] ?? e.connection.source.table}</td>
                  {marks && <td>{edgeMark(e) ? <MarkText mark={edgeMark(e)} /> : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {drawn.nodes.some((n) => !drawn.edges.some((e) => e.from === n.key || e.to === n.key)) && (
            <p className="muted small">
              With no connection shown:{' '}
              {drawn.nodes
                .filter((n) => !drawn.edges.some((e) => e.from === n.key || e.to === n.key))
                .map((n) => n.label)
                .join(', ')}
              .
            </p>
          )}
        </div>
      )}

      {pair && (
        <section className="stack kg-pair" aria-label={`Connections between ${labelOf(pair.a)} and ${labelOf(pair.b)}`}>
          <h3>
            {labelOf(pair.a)} and {labelOf(pair.b)}
          </h3>
          <ul>
            {pair.edges.map((e) => (
              <li key={e.id}>
                {edgeWords(e, labelOf)} <span className="muted small">· {edgeTypeLabel(e.type)}, kept in {SOURCE_WORDS[e.connection.source.table] ?? e.connection.source.table}</span>
                {e.kind === 'relationship' && (
                  <button type="button" className="link small" onClick={() => pick({ type: 'relation', id: e.connection.source.id })}>
                    {' '}
                    Open the relationship
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="actions start">
            {[pair.a, pair.b].map((k) => {
              const node = drawn.nodes.find((n) => n.key === k);
              return (
                node && (
                  <button key={k} type="button" className="btn ghost" onClick={() => select(node)}>
                    {isGroupNode(node) ? `Open ${labelOf(k)}` : `Show ${labelOf(k)}`}
                  </button>
                )
              );
            })}
            <button type="button" className="btn ghost" onClick={() => setPairKey(null)}>
              Close
            </button>
          </div>
        </section>
      )}

      {selected && (
        <section className="stack kg-path" aria-label="How they are connected">
          <h3>How is {selected.label} connected to…</h3>
          <p className="muted small">Choose a record, or Shift-click it on the graph (or press P on it).</p>
          <label className="field">
            <span>Another record</span>
            <select aria-label={`A record to connect ${selected.label} to`} value={pathTo ?? ''} onChange={(e) => setParams({ gpath: e.target.value || null })}>
              <option value="">Choose…</option>
              {others.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label} ({nodeTypeLabel(n.type, model)})
                </option>
              ))}
            </select>
          </label>
          {pathTo &&
            byKey.has(pathTo) &&
            (path ? (
              <ol className="kg-steps" aria-label="The chain of connections">
                {path.map((e) => (
                  <li key={e.id}>{edgeWords(e, labelOf)}</li>
                ))}
              </ol>
            ) : hiddenPath ? (
              <p>
                Connected only through what this view hides ({hiddenPath.length} {hiddenPath.length === 1 ? 'step' : 'steps'}).{' '}
                <button type="button" className="btn ghost small" onClick={() => setParams(Object.fromEntries(VIEW_SETTINGS.filter((k) => k !== 'gpath').map((k) => [k, null])))}>
                  Restore the full view to see it
                </button>
              </p>
            ) : (
              <p className="muted">Not connected within eight steps.</p>
            ))}
        </section>
      )}
    </div>
  );
}
