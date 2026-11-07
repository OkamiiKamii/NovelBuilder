import { useMemo, useRef, useState } from 'react';
import type { LoreEntry } from '@/modules/codex/types';
import { roleOf, stageAt, type StoryOrder } from '@/modules/relationships/timeline';
import { AFFINITY_LABELS, RELATION_CATEGORIES, RELATION_CATEGORY_LABELS, type CharacterRelation, type RelationCategory, type RelationStage } from '@/modules/relationships/types';
import type { CharacterProfile } from '../types';

/** Each kind of relationship has its own line, so the map can be read without telling colours apart. */
const DASH: Record<RelationCategory, string | undefined> = { family: undefined, social: '10 5', mentorship: '2 5', romance: '12 4 2 4', hierarchy: '16 6', custom: '2 3 8 3' };
const W = 760;
const H = 520;
const R = 34;

interface Placed {
  entry: LoreEntry;
  x: number;
  y: number;
  degree: 0 | 1 | 2;
}
export interface MapEdge {
  relation: CharacterRelation;
  stage: RelationStage;
}

interface VaultMapProps {
  focus: LoreEntry;
  entries: LoreEntry[];
  profiles: Map<string, CharacterProfile>;
  relations: CharacterRelation[];
  order: StoryOrder;
  /** Relationship kinds to draw. */
  shown: Set<RelationCategory>;
  /** Also draw the people each connected character is tied to. */
  wider: boolean;
  selectedId: string | null;
  onOpenCharacter: (entryId: string) => void;
  onSelect: (relationId: string) => void;
}

// The ring starts a little off the vertical, so no one sits straight above or below another: a line between two people
// then never runs through the name written under one of them.
const ring = (count: number, radius: number, offset = -Math.PI / 2 + Math.PI / (2 * Math.max(1, count))) => (i: number) => ({ x: W / 2 + radius * Math.cos(offset + (2 * Math.PI * i) / Math.max(1, count)), y: H / 2 + radius * Math.sin(offset + (2 * Math.PI * i) / Math.max(1, count)) });

/** Who is on the map and where: the character in the middle, the people they are tied to around them, and (if asked) those people's own ties beyond. */
export function layout(focus: LoreEntry, entries: LoreEntry[], edges: MapEdge[], wider: boolean): Placed[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const other = (r: CharacterRelation, id: string) => (r.fromId === id ? r.toId : r.fromId);
  const first = [...new Set(edges.filter((e) => e.relation.fromId === focus.id || e.relation.toId === focus.id).map((e) => other(e.relation, focus.id)))].filter((id) => byId.has(id));
  const near = new Set([focus.id, ...first]);
  const second = wider ? [...new Set(edges.filter((e) => near.has(e.relation.fromId) !== near.has(e.relation.toId)).map((e) => (near.has(e.relation.fromId) ? e.relation.toId : e.relation.fromId)))].filter((id) => byId.has(id)) : [];
  const inner = ring(first.length, wider && second.length ? 135 : 180);
  const outer = ring(second.length, 225, -Math.PI / 2 + Math.PI / (4 * Math.max(1, second.length)));
  return [{ entry: focus, x: W / 2, y: H / 2, degree: 0 }, ...first.map((id, i) => ({ entry: byId.get(id)!, ...inner(i), degree: 1 as const })), ...second.map((id, i) => ({ entry: byId.get(id)!, ...outer(i), degree: 2 as const }))];
}

/**
 * A character's relationships as a map: the character in the middle with
 * their portrait, the people they are tied to around them. It draws the
 * same relationship records the Relationships page edits, as they stand at
 * the end of the story so far. Drag to move about, use the buttons (or the
 * wheel) to zoom; press a person to open their profile and a line to open
 * that relationship. The list under the map says everything the map does.
 */
export function VaultMap({ focus, entries, profiles, relations, order, shown, wider, selectedId, onOpenCharacter, onSelect }: VaultMapProps) {
  const edges = useMemo(() => relations.flatMap((relation) => {
    const stage = stageAt(relation, null, order);
    return stage && shown.has(stage.category) ? [{ relation, stage }] : [];
  }), [relations, order, shown]);
  const nodes = useMemo(() => layout(focus, entries, edges, wider), [focus, entries, edges, wider]);
  const at = new Map(nodes.map((n) => [n.entry.id, n]));
  const drawn = edges.filter((e) => at.has(e.relation.fromId) && at.has(e.relation.toId));
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const zoom = (factor: number) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.5, Math.round(v.k * factor * 100) / 100)) }));
  const box = { w: W / view.k, h: H / view.k };
  const press = (run: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => !drag.current?.moved && run(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      run();
    },
  });

  return (
    <figure className="vault-map">
      <div className="vault-map-tools" role="group" aria-label="Map view">
        <button type="button" className="tool" aria-label="Zoom in" onClick={() => zoom(1.25)}>
          +
        </button>
        <button type="button" className="tool" aria-label="Zoom out" onClick={() => zoom(0.8)}>
          −
        </button>
        <button type="button" className="btn ghost" onClick={() => setView({ x: 0, y: 0, k: 1 })}>
          Reset view
        </button>
      </div>
      <svg
        ref={svg}
        viewBox={`${W / 2 - box.w / 2 - view.x} ${H / 2 - box.h / 2 - view.y} ${box.w} ${box.h}`}
        role="group"
        aria-label={`Relationship map of ${focus.name}`}
        data-zoom={view.k}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.1 : 0.9)}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !svg.current) return;
          const scale = box.w / svg.current.clientWidth;
          const [dx, dy] = [(e.clientX - d.x) * scale, (e.clientY - d.y) * scale];
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
        onPointerLeave={() => (drag.current = null)}
      >
        <defs>
          {nodes.map(({ entry, degree }) => (
            <clipPath key={entry.id} id={`face-${entry.id}`}>
              <circle r={degree === 0 ? R + 10 : degree === 1 ? R : R - 8} />
            </clipPath>
          ))}
        </defs>
        {drawn.map(({ relation, stage }) => {
          const [a, b] = [at.get(relation.fromId)!, at.get(relation.toId)!];
          const label = stage.title || stage.label || 'Related';
          return (
            <g key={relation.id} className={`vault-edge aff-${stage.affinity}${relation.id === selectedId ? ' selected' : ''}`} aria-label={`${a.entry.name} and ${b.entry.name}: ${label}, ${RELATION_CATEGORY_LABELS[stage.category].toLowerCase()}, ${AFFINITY_LABELS[stage.affinity].toLowerCase()}. Open this relationship`} {...press(() => onSelect(relation.id))}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="hit" />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="line" strokeDasharray={DASH[stage.category]} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 7} textAnchor="middle">
                {label.length > 26 ? `${label.slice(0, 25)}…` : label}
              </text>
            </g>
          );
        })}
        {nodes.map(({ entry, x, y, degree }) => {
          const r = degree === 0 ? R + 10 : degree === 1 ? R : R - 8;
          const profile = profiles.get(entry.id);
          const role = profile?.roles[0];
          return (
            <g key={entry.id} className={`vault-node degree-${degree}`} transform={`translate(${x} ${y})`} aria-label={degree === 0 ? `${entry.name}, the character this map is of` : `${entry.name}${role ? `, ${role}` : ''}. Open their profile`} {...(degree === 0 ? { role: 'img' } : press(() => onOpenCharacter(entry.id)))}>
              <circle r={r + 4} className="halo" />
              {entry.image ? <image href={entry.image} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio={`x${(profile?.focal.x ?? 50) < 34 ? 'Min' : (profile?.focal.x ?? 50) > 66 ? 'Max' : 'Mid'}Y${(profile?.focal.y ?? 30) < 34 ? 'Min' : (profile?.focal.y ?? 30) > 66 ? 'Max' : 'Mid'} slice`} clipPath={`url(#face-${entry.id})`} /> : <circle r={r} className="blank" />}
              {!entry.image && (
                <text className="initial" textAnchor="middle" dy="0.35em">
                  {entry.name.trim().charAt(0).toUpperCase() || '?'}
                </text>
              )}
              <text className="name" textAnchor="middle" y={r + 19}>
                {entry.name.length > 20 ? `${entry.name.slice(0, 19)}…` : entry.name}
              </text>
              {role && degree < 2 && (
                <text className="role" textAnchor="middle" y={r + 33}>
                  {role}
                </text>
              )}
            </g>
          );
        })}
        {nodes.length === 1 && (
          <text className="vault-map-empty" x={W / 2} y={H / 2 + R + 60} textAnchor="middle">
            No relationships to show yet.
          </text>
        )}
      </svg>
      <figcaption className="vault-legend" aria-label="What the lines mean">
        {RELATION_CATEGORIES.map((category) => (
          <span key={category}>
            <svg viewBox="0 0 44 8" width="44" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="43" y2="4" strokeDasharray={DASH[category]} />
            </svg>
            {RELATION_CATEGORY_LABELS[category]}
          </span>
        ))}
        <span className="muted">Each line is labelled with what the two are to each other.</span>
      </figcaption>
    </figure>
  );
}

/** What the other person is to this character in a relationship, as it stands now. */
export const standing = (relation: CharacterRelation, order: StoryOrder, entryId: string): { stage: RelationStage; role: string } | null => {
  const stage = stageAt(relation, null, order);
  const otherId = relation.fromId === entryId ? relation.toId : relation.fromId;
  return stage ? { stage, role: roleOf(stage, relation, otherId) } : null;
};
