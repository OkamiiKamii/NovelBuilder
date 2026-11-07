import type { LoreEntry } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { formatNumber } from '@/modules/systems/formula';
import type { SystemBlueprint } from '@/modules/systems/types';
import { compare, placeOf } from '../state';
import type { ProgressSnapshot } from '../types';
import { StateView } from './StateView';

interface CompareViewProps {
  from: ProgressSnapshot;
  to: ProgressSnapshot;
  systems: SystemBlueprint[];
  entries: LoreEntry[];
  nodes: StoryNode[];
  projectId: string;
}

const title = (snapshot: ProgressSnapshot, nodes: StoryNode[]) => `${placeOf(snapshot, nodes)}${snapshot.label ? `: ${snapshot.label}` : ''}`;

/** Two snapshots side by side, with what changed between them picked out. */
export function CompareView({ from, to, systems, entries, nodes, projectId }: CompareViewProps) {
  const diff = compare(from, to, systems);
  const many = new Set([...diff.stats, ...diff.advancement].map((x) => x.system)).size > 1;
  return (
    <div className="stack">
      <section className="panel compare-changes" aria-label="What changed">
        <h3>What changed</h3>
        {diff.same ? (
          <p className="muted">Nothing differs between these two snapshots.</p>
        ) : (
          <ul>
            {diff.advancement.map((x) => (
              <li key={`${x.system}-${x.name}`} className="chg-moved">
                <strong>{x.name}</strong> {x.from} → {x.to}
              </li>
            ))}
            {diff.stats.map((x) => (
              <li key={`${x.system}-${x.name}`} className={x.delta === null ? 'chg-moved' : x.delta > 0 ? 'chg-up' : 'chg-down'}>
                <strong>{many ? `${x.system}: ${x.name}` : x.name}</strong> {x.from} → {x.to}
                {x.delta !== null && <span className="delta"> ({x.delta > 0 ? '+' : '−'}{formatNumber(Math.abs(x.delta))})</span>}
              </li>
            ))}
            {diff.gained.map((x) => (
              <li key={`gained-${x.group}-${x.name}`} className="chg-up">
                Gained <strong>{x.name}</strong> <span className="muted">({x.group})</span>
              </li>
            ))}
            {diff.lost.map((x) => (
              <li key={`lost-${x.group}-${x.name}`} className="chg-down">
                Lost <strong>{x.name}</strong> <span className="muted">({x.group})</span>
              </li>
            ))}
            {diff.gear.map((x) => (
              <li key={`gear-${x.change}-${x.name}`} className={x.change === 'gained' ? 'chg-up' : x.change === 'lost' ? 'chg-down' : 'chg-moved'}>
                {x.change === 'gained' ? 'Gear gained' : x.change === 'lost' ? 'Gear lost' : 'Gear changed'}: <strong>{x.name}</strong>
                {x.detail && <span className="muted"> ({x.detail})</span>}
              </li>
            ))}
            {diff.status.flatMap((x) => [
              ...x.added.map((line) => (
                <li key={`${x.dimension}+${line}`} className="chg-up">
                  {x.label}: now <strong>{line}</strong>
                </li>
              )),
              ...x.removed.map((line) => (
                <li key={`${x.dimension}-${line}`} className="chg-down">
                  {x.label}: no longer <strong>{line}</strong>
                </li>
              )),
            ])}
          </ul>
        )}
      </section>
      <div className="compare-sides">
        {[from, to].map((snapshot, i) => (
          <section key={i === 0 ? 'from' : 'to'} className="panel sheet-card" aria-label={i === 0 ? 'Earlier snapshot' : 'Later snapshot'}>
            <h3>{title(snapshot, nodes)}</h3>
            <StateView snapshot={snapshot} systems={systems} entries={entries} projectId={projectId} />
          </section>
        ))}
      </div>
    </div>
  );
}
