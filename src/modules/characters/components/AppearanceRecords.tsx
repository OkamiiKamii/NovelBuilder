import type { LoreEntry } from '@/modules/codex/types';
import type { ChapterPlan, PlanChanges, StoryNode } from '@/modules/manuscript/types';

interface AppearanceRecordsProps {
  node: StoryNode;
  plan: ChapterPlan;
  /** Every codex entry of the novel; characters are picked out. */
  entries: LoreEntry[];
  onChange: (changes: PlanChanges) => void;
}

/**
 * Who appears in a chapter or scene, and who is only mentioned, as the
 * author records it. Characters linked in the text are offered to record
 * with a click; nothing is recorded for the author, and no text is searched
 * for names.
 */
export function AppearanceRecords({ node, plan, entries, onChange }: AppearanceRecordsProps) {
  const characters = entries.filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(characters.map((c) => [c.id, c]));
  const appear = (plan.appearIds ?? []).filter((id) => byId.has(id));
  const mention = (plan.mentionIds ?? []).filter((id) => byId.has(id));
  const recorded = new Set([...appear, ...mention]);
  const linked = (node.mentions ?? []).filter((id) => byId.has(id) && !recorded.has(id));
  const here = `this ${node.kind}`;
  const pov = (plan.povIds ?? []).filter((id) => byId.has(id));
  const list = (title: string, ids: string[], field: 'appearIds' | 'mentionIds' | 'povIds', add: string) => (
    <div className="field">
      <span>{title}</span>
      {ids.length > 0 && (
        <ul className="entity-chips" aria-label={title}>
          {ids.map((id) => (
            <li key={id} className="cat-character">
              <span className="chip-name">{byId.get(id)!.name}</span>
              <button type="button" aria-label={`Remove ${byId.get(id)!.name} from ${title.toLowerCase()}`} onClick={() => onChange({ [field]: ids.filter((x) => x !== id) })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {characters.some((c) => !ids.includes(c.id)) && (
        <select value="" aria-label={add} onChange={(e) => e.target.value && onChange({ [field]: [...ids, e.target.value] })}>
          <option value="">{add}…</option>
          {characters
            .filter((c) => !ids.includes(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {field !== 'povIds' && recorded.has(c.id) ? ' (moves from the other list)' : ''}
              </option>
            ))}
        </select>
      )}
    </div>
  );
  if (!characters.length) return null;
  return (
    <fieldset className="plan-group appearance-records">
      <legend>Who appears here</legend>
      <p className="muted small">Your record of who is on the page in {here}, who is only mentioned, and whose point of view it is told from. The Character appearances view shows these as appearances, and Charts counts points of view; a character with no record is “not recorded”, not absent.</p>
      {list('Appears', appear, 'appearIds', 'Add a character who appears')}
      {list('Mentioned, not on the page', mention, 'mentionIds', 'Add a character who is mentioned')}
      {list('Point of view', pov, 'povIds', 'Add whose point of view it is told from')}
      {linked.length > 0 && (
        <div className="field">
          <span>Linked in the text, with no record yet</span>
          <ul className="appearance-offers">
            {linked.map((id) => (
              <li key={id}>
                {byId.get(id)!.name}
                <button type="button" className="btn ghost" aria-label={`Record ${byId.get(id)!.name} as appearing in ${here}`} onClick={() => onChange({ appearIds: [...appear, id] })}>
                  Appears
                </button>
                <button type="button" className="btn ghost" aria-label={`Record ${byId.get(id)!.name} as mentioned in ${here}`} onClick={() => onChange({ mentionIds: [...mention, id] })}>
                  Mentioned
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}
