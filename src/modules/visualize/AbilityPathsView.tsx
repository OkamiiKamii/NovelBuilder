import { useLiveQuery } from 'dexie-react-hooks';
import { DecisionNote, useDecisions } from '@/modules/continuity/components/DecisionNote';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { connections, db } from '@/core';
import { abilityTree, pathProblems, pathsOf, ROLE_LABELS, ROLES, treeLayout, type AbilityNode, type AbilityTree, type PathEdge, type PathProblem, type PathRole } from '@/modules/abilities/paths';
import { useMe } from '@/modules/collab/identity';
import { CONNECTION_TYPES } from '@/modules/connections/types';
import { parseRefKey } from '@/modules/model/model';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { can } from '@/modules/sync/access';
import { nearestInDirection } from '@/modules/viz/focus';
import { Legend, type SwatchShape } from '@/modules/viz/components/Legend';
import { Viewport } from '@/modules/viz/components/Viewport';
import { ArrowMarker } from '@/modules/viz/components/Arrow';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';

/** The page address: sources and kinds of path hidden, the ability the view is focused on, and whether abilities with no paths are drawn. */
export const ABILITY_PARAMS = ['asrc', 'arole', 'afocus', 'aall'] as const;
export const abilityLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(ABILITY_PARAMS.flatMap((p) => (params.get(p) ? [[p, params.get(p)!]] : [])));
const listOf = (params: URLSearchParams, key: string) => new Set((params.get(key) ?? '').split(',').filter(Boolean));

/** Each kind of path by colour and by line, never by colour alone. The colours are the views' shared palette (global.css), so they follow the light or dark theme. */
const STYLE: Record<PathRole, { color: string; shape: SwatchShape; dash?: string; width: number; arrow: boolean }> = {
  prerequisite: { color: 'var(--text)', shape: 'arrow', width: 2, arrow: true },
  alternative: { color: 'var(--cat-1)', shape: 'dashed', dash: '6 4', width: 2, arrow: true },
  rule: { color: 'var(--cat-other)', shape: 'dotted', dash: '1 4', width: 2.2, arrow: true },
  upgrade: { color: 'var(--cat-4)', shape: 'line', width: 3, arrow: true },
  evolution: { color: 'var(--cat-6)', shape: 'line', width: 3, arrow: true },
  fusion: { color: 'var(--cat-3)', shape: 'longdash', dash: '10 4', width: 3, arrow: true },
  replacement: { color: 'var(--cat-5)', shape: 'dashdot', dash: '6 2 1.5 2', width: 2.5, arrow: true },
  branch: { color: 'var(--cat-other)', shape: 'thin', width: 1.3, arrow: true },
  exclusive: { color: 'var(--cat-7)', shape: 'dashed', dash: '3 3', width: 2, arrow: false },
  other: { color: 'var(--cat-2)', shape: 'dashdot', dash: '4 2 1 2', width: 1.8, arrow: true },
};
const W = 160;
const H = 46;

interface AbilityPathsViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
}

/** A checkbox kept in the page address: it shows a click at once, and follows the address when that changes (an address change is a transition, so the box would otherwise flick back first). */
function Toggle({ className, checked, onChange, children }: { className: string; checked: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  const [local, setLocal] = useState({ from: checked, value: checked });
  if (local.from !== checked) setLocal({ from: checked, value: checked });
  return (
    <label className={`${className}${className === 'chip-toggle' && local.value ? ' on' : ''}`}>
      <input
        type="checkbox"
        checked={local.value}
        onChange={(e) => {
          setLocal({ from: checked, value: e.target.checked });
          onChange(e.target.checked);
        }}
      />
      {children}
    </label>
  );
}

/** A path in words, from one end: "Prerequisite for Iron Fortress", "Evolves from Squire". */
export function pathWords(edge: PathEdge, side: 'from' | 'to', name: (key: string) => string): string {
  const inverse = CONNECTION_TYPES.find((t) => t.label === edge.label)?.inverse;
  if (side === 'from') return `${edge.label} ${name(edge.to)}`;
  if (edge.role === 'branch') return `Branches from ${name(edge.from)}`;
  if (edge.role === 'rule') return `Its requirement rule names ${name(edge.from)}`;
  // A kind of the author's own reads one way only: said from the other end as it stands.
  if (!inverse) return `${name(edge.from)} ${edge.label.charAt(0).toLowerCase()}${edge.label.slice(1)} this`;
  return `${inverse === 'same' ? edge.label : inverse} ${name(edge.from)}`;
}

/**
 * ABILITY PATHS
 * Abilities, skills, classes, techniques and the like, from every system and
 * every kind of record set to show here, with the paths the author records
 * between them, drawn as a tree from what comes first. Prerequisites,
 * alternatives, upgrades, evolutions, fusions, replacements and exclusions
 * are each drawn as what they are. What does not add up is listed, never fixed.
 */
export function AbilityPathsView({ model, projectId, params, setParams, mode, setMode, pick, selectedId }: AbilityPathsViewProps) {
  const snapshots = useLiveQuery(() => db.progressSnapshots.where('projectId').equals(projectId).toArray(), [projectId]);
  const refs = useRef(new Map<string, SVGGElement>());
  const [current, setCurrent] = useState<string | null>(null);
  if (snapshots === undefined) return <VizState status={{ kind: 'loading' }} />;
  const tree = abilityTree(model, snapshots);
  if (!tree.nodes.length)
    return <VizState status={{ kind: 'empty', message: 'No abilities yet. They come from your system blueprints (the Systems page) and from any kind of codex record you set to show here (Codex → Categories & fields → Visualizations → In the ability tree).', action: <Link to={`/project/${projectId}/systems`}>Open Systems</Link> }} />;
  const problems = pathProblems(tree, model);
  const byKey = new Map(tree.nodes.map((n) => [n.key, n]));
  const name = (key: string) => byKey.get(key)?.name ?? 'something deleted';

  // What is shown: sources and kinds of path the author has not hidden, around the focus if there is one, and by default only what has a path.
  const hiddenSources = listOf(params, 'asrc');
  const hiddenRoles = listOf(params, 'arole');
  const focus = params.get('afocus') && byKey.has(params.get('afocus')!) ? params.get('afocus')! : null;
  const all = params.get('aall') === '1';
  const text = (params.get('q') ?? '').trim().toLowerCase();
  const heldBy = params.get('chars');
  const sources = [...new Map(tree.nodes.map((n) => [n.sourceKey, n.source])).entries()];
  let nodes = tree.nodes.filter((n) => !hiddenSources.has(n.sourceKey));
  if (focus) {
    const near = pathsOf(tree, focus);
    nodes = nodes.filter((n) => near.has(n.key));
  }
  const shown = new Set(nodes.map((n) => n.key));
  let edges = tree.edges.filter((e) => !hiddenRoles.has(e.role) && shown.has(e.from) && shown.has(e.to));
  if (text) {
    const hits = new Set(nodes.filter((n) => n.name.toLowerCase().includes(text)).map((n) => n.key));
    for (const e of edges) if (hits.has(e.from) || hits.has(e.to)) (hits.add(e.from), hits.add(e.to));
    nodes = nodes.filter((n) => hits.has(n.key));
    edges = edges.filter((e) => hits.has(e.from) && hits.has(e.to));
  }
  const pathed = new Set(edges.flatMap((e) => [e.from, e.to]));
  const lone = nodes.filter((n) => !pathed.has(n.key));
  if (!all && edges.length && !focus) nodes = nodes.filter((n) => pathed.has(n.key));
  const visible = new Set(nodes.map((n) => n.key));
  const flagged = new Map<string, 'problem' | 'note'>();
  for (const p of problems) for (const k of p.nodes) if (flagged.get(k) !== 'problem') flagged.set(k, p.severity);
  const held = (n: AbilityNode) => Boolean(heldBy && n.holders.some((h) => h.id === heldBy));
  const roles = ROLES.filter((r) => tree.edges.some((e) => e.role === r));
  const toggle = (key: string, set: Set<string>, value: string) => setParams({ [key]: [...(set.has(value) ? [...set].filter((v) => v !== value) : [...set, value])].join(',') || null });

  const left: string[] = [];
  if (hiddenSources.size) left.push(`Sources hidden: ${sources.filter(([k]) => hiddenSources.has(k)).map(([, s]) => s).join(', ')}.`);
  if (hiddenRoles.size) left.push(`Paths hidden: ${[...hiddenRoles].map((r) => ROLE_LABELS[r as PathRole] ?? r).join(', ')}.`);
  if (focus) left.push(`Only the paths of ${name(focus)}.`);

  const controls = (
    <div className="stack tight ap-controls">
      <div className="viz-toolbar">
        <ViewSwitch mode={mode} onChange={setMode} visualLabel="Tree" />
        {focus && (
          <button type="button" className="btn" onClick={() => setParams({ afocus: null })}>
            Show every path again
          </button>
        )}
        {!focus && lone.length > 0 && edges.length > 0 && (
          <Toggle className="check" checked={all} onChange={(on) => setParams({ aall: on ? '1' : null })}>
            Also draw the {lone.length} with no paths
          </Toggle>
        )}
      </div>
      {sources.length > 1 && (
        <div className="chips" role="group" aria-label="Sources">
          {sources.map(([key, label]) => (
            <Toggle key={key} className="chip-toggle" checked={!hiddenSources.has(key)} onChange={() => toggle('asrc', hiddenSources, key)}>
              {label}
            </Toggle>
          ))}
        </div>
      )}
      {roles.length > 0 && (
        <div className="chips" role="group" aria-label="Kinds of path">
          {roles.map((r) => (
            <Toggle key={r} className="chip-toggle" checked={!hiddenRoles.has(r)} onChange={() => toggle('arole', hiddenRoles, r)}>
              {ROLE_LABELS[r]}
            </Toggle>
          ))}
        </div>
      )}
      {left.length > 0 && (
        <p className="muted small" role="status">
          {left.join(' ')}
        </p>
      )}
    </div>
  );

  const report = <Problems problems={problems} tree={tree} name={name} onFocus={(key) => setParams({ afocus: key })} projectId={projectId} />;
  if (!nodes.length)
    return (
      <>
        {controls}
        <VizState status={{ kind: 'no-results', onClearFilters: () => setParams({ asrc: null, arole: null, afocus: null, q: null }) }} />
        {report}
      </>
    );

  if (mode === 'list') {
    const groups = [...new Set(nodes.map((n) => n.source))];
    return (
      <>
        {controls}
        {groups.map((source) => (
          <section key={source} className="stack tight" aria-label={source}>
            <h3>{source}</h3>
            <ul className="viz-list ap-list">
              {nodes
                .filter((n) => n.source === source)
                .map((n) => {
                  const into = edges.filter((e) => e.to === n.key && e.role !== 'exclusive');
                  const out = edges.filter((e) => e.from === n.key && e.role !== 'exclusive');
                  const excl = edges.filter((e) => e.role === 'exclusive' && (e.from === n.key || e.to === n.key)).map((e) => name(e.from === n.key ? e.to : e.from));
                  return (
                    <li key={n.key} className={selectedId === n.ref.id ? 'viz-row selected' : 'viz-row'}>
                      <button type="button" className="link viz-pick" aria-pressed={selectedId === n.ref.id} onClick={() => pick(n.ref)}>
                        {n.name}
                      </button>
                      {n.rank && <span className="muted small"> · {n.rank}</span>}
                      {held(n) && <span className="badge"> held</span>}
                      {flagged.get(n.key) === 'problem' && <span className="field-issue small"> · see what does not add up</span>}
                      <ul className="small">
                        {into.map((e) => (
                          <li key={`in:${e.id}`}>{pathWords(e, 'to', name)}</li>
                        ))}
                        {out.map((e) => (
                          <li key={`out:${e.id}`}>{pathWords(e, 'from', name)}</li>
                        ))}
                        {excl.length > 0 && <li>Mutually exclusive with {excl.join(', ')}</li>}
                        {n.holders.length > 0 && <li>Held by {n.holders.map((h) => `${h.name} (${h.how})`).join(', ')}</li>}
                      </ul>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
        {report}
      </>
    );
  }

  const layout = treeLayout(nodes.map((n) => n.key), edges);
  const pos = (key: string) => layout.at.get(key)!;
  const marks = nodes.map((n) => ({ id: n.key, x: pos(n.key).x, y: pos(n.key).y, node: n }));
  const bounds = { minX: -W, minY: -H - 20, maxX: layout.width + 40, maxY: layout.height + 20 };
  const focusId = current && visible.has(current) ? current : marks[0].id;
  const curve = (e: PathEdge): string => {
    const [a, b] = [pos(e.from), pos(e.to)];
    if (e.role === 'exclusive') return `M${a.x} ${a.y} L${b.x} ${b.y}`;
    if (layout.back.has(e.id) || b.layer <= a.layer) {
      const bow = 70 + Math.abs(b.y - a.y) * 0.15;
      return `M${a.x + W / 2} ${a.y} C${a.x + W / 2 + bow} ${a.y} ${b.x + W / 2 + bow} ${b.y} ${b.x + W / 2} ${b.y}`;
    }
    const [y1, y2] = [a.y + H / 2, b.y - H / 2];
    const dy = Math.max(30, (y2 - y1) / 2);
    return `M${a.x} ${y1} C${a.x} ${y1 + dy} ${b.x} ${y2 - dy} ${b.x} ${y2}`;
  };
  const onKey = (e: KeyboardEvent, n: AbilityNode) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      pick(n.ref);
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      setParams({ afocus: n.key });
      return;
    }
    const next = nearestInDirection(marks, n.key, e.key);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setCurrent(next.id);
    refs.current.get(next.id)?.focus();
  };
  const legendItems = roles.filter((r) => !hiddenRoles.has(r)).map((r) => ({ key: r, label: ROLE_LABELS[r], color: STYLE[r].color, shape: STYLE[r].shape }));

  return (
    <>
      {controls}
      <Viewport label={`Ability paths: ${nodes.length} ${nodes.length === 1 ? 'ability' : 'abilities'} and ${edges.length} ${edges.length === 1 ? 'path' : 'paths'}, from what comes first at the top. Arrow keys move between them, Enter selects, F shows only one’s paths.`} bounds={bounds} of="the tree">
        {(view) => (
          <>
            <defs>
              {ROLES.filter((r) => STYLE[r].arrow).map((r) => (
                <ArrowMarker key={r} id={`ap-arrow-${r}`} color={STYLE[r].color} />
              ))}
            </defs>
            {edges.map((e) => {
              const s = STYLE[e.role];
              const dim = selectedId && ![e.from, e.to].some((k) => byKey.get(k)?.ref.id === selectedId);
              return (
                <g key={e.id} className={`ap-edge role-${e.role}${dim ? ' dim' : ''}`}>
                  <path d={curve(e)} fill="none" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" markerEnd={s.arrow ? `url(#ap-arrow-${e.role})` : undefined} />
                  <title>{`${name(e.from)}: ${pathWords(e, 'from', name)}`}</title>
                  {e.role === 'other' && view.k >= 0.9 && (
                    <text x={(pos(e.from).x + pos(e.to).x) / 2} y={(pos(e.from).y + pos(e.to).y) / 2} textAnchor="middle" className="ap-edge-label" style={{ fontSize: 11 / Math.max(view.k, 0.6) }}>
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {marks.map(({ id, x, y, node: n }) => {
              const selected = selectedId === n.ref.id;
              const flag = flagged.get(id);
              return (
                <g
                  key={id}
                  ref={(el) => void (el ? refs.current.set(id, el) : refs.current.delete(id))}
                  className={`ap-node${selected ? ' selected' : ''}${held(n) ? ' held' : ''}${flag ? ` flag-${flag}` : ''}`}
                  data-mark
                  role="button"
                  tabIndex={id === focusId ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={`${n.name}, ${n.source}${n.rank ? `, rank ${n.rank}` : ''}${held(n) ? ', held' : ''}${flag === 'problem' ? ', something does not add up' : ''}`}
                  transform={`translate(${x - W / 2} ${y - H / 2})`}
                  onClick={() => pick(n.ref)}
                  onKeyDown={(e) => onKey(e, n)}
                  onFocus={() => setCurrent(id)}
                >
                  <rect width={W} height={H} rx={8} className="ap-box" />
                  <rect width={6} height={H} rx={3} style={{ fill: n.color }} />
                  <text x={14} y={19} className="ap-name">
                    {n.name.length > 19 ? `${n.name.slice(0, 18)}…` : n.name}
                  </text>
                  <text x={14} y={35} className="ap-source">
                    {(n.rank ? `${n.rank} · ` : '') + (n.source.length > 22 ? `${n.source.slice(0, 21)}…` : n.source)}
                  </text>
                  {flag && (
                    <text x={W - 14} y={19} textAnchor="middle" className="ap-flag" aria-hidden="true">
                      {flag === 'problem' ? '!' : '•'}
                    </text>
                  )}
                  <title>{`${n.name} (${n.source})`}</title>
                </g>
              );
            })}
          </>
        )}
      </Viewport>
      <Legend title="Paths" items={legendItems} />
      {report}
    </>
  );
}

/** What does not add up, and the path connections that are not drawn. */
function Problems({ problems, tree, name, onFocus, projectId }: { problems: PathProblem[]; tree: AbilityTree; name: (key: string) => string; onFocus: (key: string) => void; projectId: string }) {
  const decided = useDecisions(projectId);
  return (
    <section className="stack tight ap-problems" aria-label="What does not add up">
      <h3>What does not add up</h3>
      <p className="muted small">Read from the paths you record, and said, never changed: a cycle of requirements, something that can never be gained, a requirement that clashes with an exclusion, a rule that cannot be read; and, as notes, loops, fusions of one thing, and holders who hold something without what it requires.</p>
      {problems.length === 0 ? (
        <p className="muted">Nothing.</p>
      ) : (
        <ul className="threads">
          {problems.map((p) => (
            <li key={p.key} className={`thread issue${p.severity === 'note' ? ' reviewed' : ''}`}>
              <span className={`badge ${p.severity === 'problem' ? 'conn-disputed' : ''}`}>{p.severity === 'problem' ? 'Problem' : 'Note'}</span> {p.message}{' '}
              <button type="button" className="link" onClick={() => onFocus(p.nodes[0])}>
                Show {name(p.nodes[0])}’s paths
              </button>{' '}
              <DecisionNote decision={decided.get(p.key)} projectId={projectId} />
            </li>
          ))}
        </ul>
      )}
      {tree.notDrawn.length > 0 && (
        <p className="muted small">
          Not drawn: {tree.notDrawn.map((x) => `a “${x.connection.label}” connection (${x.reason})`).join('; ')}.
        </p>
      )}
    </section>
  );
}

/**
 * Beside the view, for a selected ability: its rank, requirements and
 * limits, who holds it and how they came by it, every path, and adding or
 * removing a path. A path is a typed connection, saved through the
 * connections service like any other.
 */
export function AbilityPathDetails({ model, projectId, selected }: { model: StoryModel; projectId: string; selected: EntityRef }) {
  const snapshots = useLiveQuery(() => db.progressSnapshots.where('projectId').equals(projectId).toArray(), [projectId]);
  const me = useMe(projectId);
  const [type, setType] = useState('prerequisite-for');
  const [own, setOwn] = useState('');
  const [other, setOther] = useState('');
  const [way, setWay] = useState<'out' | 'in'>('out');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  if (!snapshots) return null;
  const tree = abilityTree(model, snapshots);
  const key = `${selected.type}:${selected.id}`;
  const node = tree.nodes.find((n) => n.key === key);
  if (!node) return null;
  const name = (k: string) => tree.nodes.find((n) => n.key === k)?.name ?? 'something deleted';
  const mine = tree.edges.filter((e) => e.from === key || e.to === key);
  const writes = can(me.role, 'write');
  const pathTypes = CONNECTION_TYPES.filter((t) => ['prerequisite-for', 'alternative-for', 'upgrades-to', 'evolves-into', 'fuses-into', 'replaced-by', 'excludes'].includes(t.key));
  const api = connections.forProject(projectId);
  const act = (task: Promise<unknown>, done: string) => void task.then(() => setMessage({ text: done }), (e) => setMessage({ text: e instanceof Error ? e.message : String(e), error: true }));

  return (
    <section className="stack tight viz-editor ap-details" aria-label={`Paths of ${node.name}`}>
      <h4>{node.name}</h4>
      <p className="muted small">
        {node.source}
        {node.rank && ` · rank ${node.rank}`}
      </p>
      {node.requires && <p className="small">Requirement rule: “{node.requires}”</p>}
      {node.limits.length > 0 && <p className="small">Limits: {node.limits.join(' · ')}</p>}
      <p className="small">{node.holders.length ? `Held by ${node.holders.map((h) => `${h.name} (${h.how})`).join(', ')}.` : 'Nobody is recorded as holding it.'}</p>
      {node.acquired.length > 0 && (
        <ul className="small" aria-label="When it was gained or lost">
          {node.acquired.map((a) => (
            <li key={`${a.changeId ?? a.snapshotId}:${a.entryId}`}>
              {a.name}: {a.action === 'gain' ? 'gained' : a.action === 'lose' ? 'lost' : a.action === 'happen' ? 'named in a moment' : 'held'} {a.action === 'snapshot' ? a.when : `(${a.when})`}
            </li>
          ))}
        </ul>
      )}
      <ul className="small ap-paths" aria-label={`Every path of ${node.name}`}>
        {mine.length === 0 && <li className="muted">No paths yet.</li>}
        {mine.map((e) => (
          <li key={e.id}>
            {pathWords(e, e.from === key ? 'from' : 'to', name)}
            {e.linkId === null && <span className="muted"> (from a blueprint)</span>}
            {writes && e.linkId && (
              <button type="button" className="link" aria-label={`Remove the path: ${pathWords(e, e.from === key ? 'from' : 'to', name)}`} onClick={() => act(api.remove(e.linkId!), 'Path removed.')}>
                {' '}
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {writes && (
        <form
          className="stack tight"
          aria-label={`Add a path to or from ${node.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            const target = parseRefKey(other);
            if (!target) return;
            const kind = type === 'own' ? own.trim() : type;
            if (!kind) return setMessage({ text: 'Name your own kind of path.', error: true });
            const [from, to] = way === 'out' ? [node.ref, target] : [target, node.ref];
            act(
              api.create({ from, to, type: kind }).then(() => setOther('')),
              'Path added.',
            );
          }}
        >
          <strong className="small">Add a path</strong>
          <select aria-label="Which way" value={way} onChange={(e) => setWay(e.target.value as 'out' | 'in')}>
            <option value="out">From {node.name} to…</option>
            <option value="in">To {node.name} from…</option>
          </select>
          <select aria-label="Kind of path" value={type} onChange={(e) => setType(e.target.value)}>
            {pathTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
            <option value="own">Your own…</option>
          </select>
          {type === 'own' && <input aria-label="Your own kind of path" value={own} placeholder="Unlocks, Teaches, Corrupts into…" onChange={(e) => setOwn(e.target.value)} />}
          <select aria-label="The other ability" value={other} onChange={(e) => setOther(e.target.value)}>
            <option value="">Choose…</option>
            {tree.nodes
              .filter((n) => n.key !== key)
              .map((n) => (
                <option key={n.key} value={n.key}>
                  {n.name} ({n.source})
                </option>
              ))}
          </select>
          <button type="submit" className="btn" disabled={!other}>
            Add the path
          </button>
        </form>
      )}
      {message && (
        <p className={message.error ? 'error' : 'notice'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
