import type { EntityRef } from '@/modules/model/types';
import { Legend, type SwatchShape } from '@/modules/viz/components/Legend';
import { orderWords, type OrderedEvent, type OrderedNode, type Telling } from '../narrative';
import { REVEAL_CHOICES, REVEAL_ROLES, type RevealRole } from '../types';

/** Each way of telling has a line of its own, named in the legend: never colour alone. */
const LINE: Record<RevealRole, { dash: string; shape: SwatchShape }> = {
  told: { dash: '', shape: 'line' },
  flashback: { dash: '6 4', shape: 'dashed' },
  flashforward: { dash: '10 4', shape: 'longdash' },
  foreshadowed: { dash: '0.1 5', shape: 'dotted' },
  mentioned: { dash: '', shape: 'thin' },
  revealed: { dash: '7 3 1.5 3', shape: 'dashdot' },
};
const ROW = 44;

interface TwoOrdersChartProps {
  nodes: OrderedNode[];
  events: OrderedEvent[];
  tellings: Telling[];
  /** Names an event, for the words read out with a chapter. */
  eventName: (id: string) => string;
  nodeName: (id: string) => string;
  selectedId: string | null;
  isRelated: (id: string) => boolean;
  onSelect: (ref: EntityRef) => void;
}

/**
 * The two orders side by side: chapters and scenes down the left in the
 * order the reader meets them, events down the right in the order they
 * happen, and a line for each time a chapter tells an event. A book told in
 * story order has lines that never cross; flashbacks, flash-forwards and
 * reveals cross. The names are ordinary buttons in two lists, each saying
 * what it is linked to, so the drawing is never the only way to read it.
 */
export function TwoOrdersChart({ nodes, events, tellings, eventName, nodeName, selectedId, isRelated, onSelect }: TwoOrdersChartProps) {
  const rows = Math.max(nodes.length, events.length, 1);
  const height = rows * ROW;
  const nodeRow = new Map(nodes.map((n, i) => [n.id, i]));
  const eventRow = new Map(events.map((e, i) => [e.id, i]));
  const y = (i: number) => i * ROW + ROW / 2;
  const touches = (t: Telling) => selectedId !== null && (t.nodeId === selectedId || t.eventId === selectedId);
  const anySelected = selectedId !== null && tellings.some(touches);
  const used = REVEAL_ROLES.filter((r) => tellings.some((t) => t.role === r));
  const itemClass = (id: string) => `to-item${id === selectedId ? ' selected' : isRelated(id) ? ' related' : ''}`;

  return (
    <div className="stack">
      <div className="two-orders">
        <p className="to-head small">As the reader meets it</p>
        <span />
        <p className="to-head small">As it happens</p>
        <ol className="to-col" aria-label="Chapters and scenes, in reading order" style={{ height }}>
          {nodes.map((n) => (
            <li key={n.id}>
              <button type="button" className={itemClass(n.id)} aria-pressed={n.id === selectedId} onClick={() => onSelect({ type: 'node', id: n.id })}>
                <span className="to-name">{n.label}</span>
                <span className="visually-hidden">
                  {' '}
                  tells {n.tellings.map((t) => `${eventName(t.eventId)} (${REVEAL_CHOICES[t.role].toLowerCase()}, ${orderWords(t)})`).join('; ')}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <svg className="to-lines" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" height={height} aria-hidden="true">
          {tellings.map((t) => {
            const from = nodeRow.get(t.nodeId);
            const to = eventRow.get(t.eventId);
            if (from === undefined || to === undefined) return null;
            const [a, b] = [y(from), y(to)];
            return (
              <path
                key={`${t.nodeId}:${t.eventId}`}
                d={`M0 ${a} C50 ${a}, 50 ${b}, 100 ${b}`}
                className={`to-line role-${t.role}${t.back || t.ahead ? ' out' : ''}${anySelected ? (touches(t) ? ' on' : ' dim') : ''}`}
                strokeDasharray={LINE[t.role].dash || undefined}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        <ol className="to-col" aria-label="Events, in story order" style={{ height }}>
          {events.map((e) => (
            <li key={e.id}>
              <button type="button" className={itemClass(e.id)} aria-pressed={e.id === selectedId} onClick={() => onSelect({ type: 'event', id: e.id })}>
                <span className="to-name">{e.title}</span>
                <span className="to-when muted small">{e.storyRank === null ? 'Not placed in time' : e.when}</span>
                <span className="visually-hidden">
                  {' '}
                  {e.tellings.length ? `the reader meets it in ${e.tellings.map((t) => `${nodeName(t.nodeId)} (${REVEAL_CHOICES[t.role].toLowerCase()})`).join('; ')}` : 'not told in any chapter yet'}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      {used.length > 0 && (
        <Legend
          title="How each chapter tells it"
          items={[...used.map((r) => ({ key: r, label: REVEAL_CHOICES[r], color: 'var(--accent)', shape: LINE[r].shape })), { key: 'cross', label: 'Lines that cross: told out of story order', color: 'var(--muted)', shape: 'cross' as SwatchShape }]}
        />
      )}
    </div>
  );
}
