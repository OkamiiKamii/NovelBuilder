import { ArrowMarker } from '@/modules/viz/components/Arrow';
import { Legend, type SwatchShape } from '@/modules/viz/components/Legend';
import { MAP, type MapNode } from '../timeline';
import { AFFINITIES, AFFINITY_LABELS, type CharacterRelation, type RelationStage } from '../types';

export interface MapEdge {
  relation: CharacterRelation;
  stage: RelationStage;
  from: MapNode;
  to: MapNode;
}

interface NetworkMapProps {
  nodes: MapNode[];
  edges: MapEdge[];
  selectedId: string | null;
  onFocus: (entryId: string) => void;
  onOpen: (relationId: string) => void;
}

/** Each feeling's line, as well as its colour: dashed hostile, dotted reluctant, dash-dot neutral, solid friendly, double trusting. */
const FEELING_LINES: Record<RelationStage['affinity'], SwatchShape> = { hostile: 'dashed', reluctant: 'dotted', neutral: 'dashdot', friendly: 'line', trusting: 'double' };

/** About how wide a line's label is drawn (16px text), to keep two labels from printing over each other. */
const LABEL_SIZE = 16;
const labelWidth = (text: string) => text.length * LABEL_SIZE * 0.55;

/**
 * Where each line's label goes: halfway along it, unless that would print over
 * a label already placed; then a little nearer one end or the other.
 */
function placeLabels(lines: { id: string; x1: number; y1: number; x2: number; y2: number; text: string }[]): Map<string, { x: number; y: number }> {
  const placed: { x: number; y: number; w: number }[] = [];
  const at = new Map<string, { x: number; y: number }>();
  const clash = (x: number, y: number, w: number) => placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 4 && Math.abs(p.y - y) < LABEL_SIZE + 2);
  for (const line of lines) {
    const w = labelWidth(line.text);
    const spot = (t: number) => ({ x: line.x1 + (line.x2 - line.x1) * t, y: line.y1 + (line.y2 - line.y1) * t - 6 });
    const best = [0.5, 0.35, 0.65, 0.25, 0.75].map(spot).find((p) => !clash(p.x, p.y, w)) ?? spot(0.5);
    placed.push({ ...best, w });
    at.set(line.id, best);
  }
  return at;
}

const activate = (run: () => void) => ({
  onClick: run,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      run();
    }
  },
});

/**
 * The relationship network as a node graph. Characters are circles; each
 * relationship is a line whose colour runs from warm (hostile) through grey
 * (neutral) to cool (trusting). Each feeling also has its own line (dashed,
 * dotted, dash-dot, solid, double) and the line is labelled with the kind of
 * relationship, so nothing depends on colour alone. Click a character to centre the map on them; click a line to open
 * its history.
 */
export function NetworkMap({ nodes, edges, selectedId, onFocus, onOpen }: NetworkMapProps) {
  // Each line drawn from the edge of one circle to the edge of the other, and its label, kept clear of the others.
  const lines = edges.map(({ relation, stage, from, to }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const pad = (node: MapNode) => (node.focus ? MAP.radius + 12 : MAP.radius + 6);
    const label = stage.title || stage.label || 'Related';
    return { id: relation.id, x1: from.x + (dx / length) * pad(from), y1: from.y + (dy / length) * pad(from), x2: to.x - (dx / length) * pad(to), y2: to.y - (dy / length) * pad(to), text: label.length > 30 ? `${label.slice(0, 29)}…` : label };
  });
  const labelAt = placeLabels(lines);
  return (
    <figure className="rel-map">
      <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="group" aria-label="Relationship map">
        <defs>
          {AFFINITIES.map((affinity) => (
            <ArrowMarker key={affinity} id={`arrow-${affinity}`} className={`aff-fill aff-${affinity}`} size={16} />
          ))}
        </defs>

        {edges.map(({ relation, stage, from, to }, i) => {
          const { x1, y1, x2, y2, text } = lines[i];
          const spot = labelAt.get(relation.id)!;
          return (
            <g
              key={relation.id}
              className={`rel-edge${relation.id === selectedId ? ' selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${from.entry.name} and ${to.entry.name}: ${stage.label || 'related'}, ${AFFINITY_LABELS[stage.affinity].toLowerCase()}. Open history`}
              {...activate(() => onOpen(relation.id))}
            >
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="hit" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} className={`aff-stroke aff-${stage.affinity}`} markerEnd={stage.directional ? `url(#arrow-${stage.affinity})` : undefined} />
              {stage.affinity === 'trusting' && <line x1={x1} y1={y1} x2={x2} y2={y2} className="aff-inner" />}
              <text x={spot.x} y={spot.y} textAnchor="middle">
                {text}
              </text>
            </g>
          );
        })}

        {nodes.map(({ entry, x, y, focus }) => (
          <g key={entry.id} className={`rel-node${focus ? ' focus' : ''}`} role="button" tabIndex={0} aria-label={`${entry.name}${focus ? ', centre of the map' : '. Centre the map here'}`} transform={`translate(${x} ${y})`} {...activate(() => onFocus(entry.id))}>
            {focus && <circle r={MAP.radius + 7} className="ring" />}
            <circle r={MAP.radius} />
            <text className="initial" textAnchor="middle" dy="0.35em">
              {entry.name.trim().charAt(0).toUpperCase() || '?'}
            </text>
            <text className="name" textAnchor="middle" y={MAP.radius + 18}>
              {entry.name.length > 22 ? `${entry.name.slice(0, 21)}…` : entry.name}
            </text>
          </g>
        ))}
      </svg>
      <Legend
        title="How each tie feels"
        items={[
          ...AFFINITIES.map((affinity) => ({ key: affinity, label: AFFINITY_LABELS[affinity], color: `var(--aff-${affinity})`, shape: FEELING_LINES[affinity] })),
          { key: 'arrow', label: 'An arrow points from the first role to the second (Mentor → Student)', color: 'var(--text)', shape: 'arrow' as SwatchShape },
        ]}
      />
    </figure>
  );
}
