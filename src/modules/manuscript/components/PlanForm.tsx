import { entryPath } from '@/modules/characters/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { codex as codexService } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { LinkedFacts } from '@/modules/canon/components/LinkedFacts';
import { LinkedThreads } from '@/modules/plot/components/LinkedThreads';
import { AppearanceRecords } from '@/modules/characters/components/AppearanceRecords';
import { LabelPicker, useLabelSuggestions } from '@/modules/structure/components/LabelPicker';
import { LinkedEvents } from '@/modules/timeline/components/LinkedEvents';
import { SavedText } from '@/shared/SavedText';
import type { NodeChanges, ProjectManuscript } from '../service';
import { NODE_STATUSES, PLAN_LABELS, STATUS_LABELS, type NodeStatus, type PlanChanges, type PlanTextField, type StoryNode } from '../types';
import { BeatsEditor } from './BeatsEditor';
import { AllConnections } from '@/modules/crossref/components/AllConnections';

/** The workflow pipeline as a row of steps; the current one is highlighted, earlier ones are ticked off. */
export function StatusStepper({ status, onChange }: { status: NodeStatus; onChange: (status: NodeStatus) => void }) {
  const current = NODE_STATUSES.indexOf(status);
  return (
    <div className="stepper" role="radiogroup" aria-label="Status">
      {NODE_STATUSES.map((step, index) => (
        <button
          key={step}
          type="button"
          role="radio"
          aria-checked={step === status}
          className={`status-${step}${step === status ? ' current' : index < current ? ' done' : ''}`}
          onClick={() => onChange(step)}
        >
          {STATUS_LABELS[step]}
        </button>
      ))}
    </div>
  );
}

const PLACEHOLDERS: Record<PlanTextField, string> = {
  objective: 'Why this exists: what it must accomplish for the story.',
  conflict: 'Who wants what, and what stands in the way.',
  emotionalArc: 'Where the reader starts and ends emotionally.',
  dialogue: 'Lines or exchanges you want to land.',
  foreshadowing: 'What to plant now for later.',
  reveals: 'What the reader learns here.',
  openQuestions: 'What should be left hanging.',
  ending: 'The resolution, turn or cliffhanger to end on.',
};
const DYNAMICS: PlanTextField[] = ['conflict', 'emotionalArc', 'dialogue', 'foreshadowing', 'reveals', 'openQuestions'];

interface PlanFormProps {
  node: StoryNode;
  ms: ProjectManuscript;
  onError: (error: unknown) => void;
  /** Called when an attached codex entry is clicked. Without it, entries link to the Codex page. */
  onOpenEntry?: (entryId: string) => void;
}

/**
 * The planning template for one chapter or scene. Everything here is stored
 * in the planning layer; there is deliberately no action that puts any of it
 * into the manuscript.
 */
export function PlanForm({ node, ms, onError, onOpenEntry }: PlanFormProps) {
  const plan = useLiveQuery(() => ms.getPlan(node.id), [ms, node.id]);
  const codex = useMemo(() => codexService.forProject(node.projectId), [node.projectId]);
  const entries = useLiveQuery(() => codex.list(), [codex]) ?? [];
  const labelSuggestions = useLabelSuggestions(node.projectId);

  const update = (changes: NodeChanges) => void ms.update(node.id, changes).catch(onError);
  const updatePlan = (changes: PlanChanges) => void ms.updatePlan(node.id, changes).catch(onError);
  if (!plan) return null;

  const byId = new Map(entries.map((e) => [e.id, e]));
  // An entry deleted from the codex simply stops appearing here.
  const attached = plan.entityIds.flatMap((id) => byId.get(id) ?? []);
  const available = entries.filter((e) => !plan.entityIds.includes(e.id)).sort((a, b) => a.name.localeCompare(b.name));
  // Entries linked inside the text itself (recorded on each save), for reference alongside the plan's own list.
  const inText = (node.mentions ?? []).flatMap((id) => byId.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const text = (field: PlanTextField, rows = 2) => (
    <SavedText key={field} label={PLAN_LABELS[field]} multiline rows={rows} value={plan[field]} placeholder={PLACEHOLDERS[field]} onSave={(value) => updatePlan({ [field]: value })} />
  );

  return (
    <div className="stack plan">
      <div className="field">
        <span>Status</span>
        <StatusStepper status={node.status} onChange={(status) => update({ status })} />
      </div>

      {text('objective')}
      <SavedText label="Summary" multiline rows={3} value={node.summary} placeholder={`What happens in this ${node.kind}, in a sentence or two.`} onSave={(summary) => update({ summary })} />
      <LabelPicker of={`this ${node.kind}`} labels={plan.labels ?? []} suggestions={labelSuggestions} onChange={(labels) => updatePlan({ labels })} />

      <div className="field">
        <span>Key events &amp; plot beats</span>
        <BeatsEditor beats={plan.beats} onSave={(beats) => updatePlan({ beats })} />
      </div>

      <div className="field">
        <span>Entities involved</span>
        {attached.length > 0 && (
          <ul className="entity-chips">
            {attached.map((entry) => (
              <li key={entry.id} className={`cat-${entry.category}`}>
                {onOpenEntry ? (
                  <button type="button" className="chip-name" onClick={() => onOpenEntry(entry.id)}>
                    {entry.name}
                  </button>
                ) : (
                  <Link to={entryPath(node.projectId, entry)} className="chip-name">
                    {entry.name}
                  </Link>
                )}
                <button type="button" aria-label={`Remove ${entry.name}`} onClick={() => updatePlan({ entityIds: plan.entityIds.filter((id) => id !== entry.id) })}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {entries.length === 0 ? (
          <p className="muted small">
            Create <Link to={`/project/${node.projectId}/characters`}>characters</Link>, and places and items in the <Link to={`/project/${node.projectId}/codex`}>Codex</Link>, to attach them here.
          </p>
        ) : (
          available.length > 0 && (
            <select value="" aria-label="Add an entity" onChange={(e) => e.target.value && updatePlan({ entityIds: [...plan.entityIds, e.target.value] })}>
              <option value="">Add a character, location, faction or item…</option>
              <EntryOptions entries={available} />
            </select>
          )
        )}
      </div>

      {inText.length > 0 && (
        <div className="field linked-in-text">
          <span>Linked in the text</span>
          <ul className="entity-chips">
            {inText.map((entry) => (
              <li key={entry.id} className={`cat-${entry.category}`}>
                {onOpenEntry ? (
                  <button type="button" className="chip-name solo" onClick={() => onOpenEntry(entry.id)}>
                    {entry.name}
                  </button>
                ) : (
                  <Link to={entryPath(node.projectId, entry)} className="chip-name solo">
                    {entry.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AppearanceRecords node={node} plan={plan} entries={entries} onChange={updatePlan} />

      <fieldset className="plan-group">
        <legend>Narrative dynamics</legend>
        {DYNAMICS.map((field) => text(field))}
      </fieldset>

      {text('ending')}
      <LinkedEvents projectId={node.projectId} nodeId={node.id} match={(event) => event.nodeIds.includes(node.id)} empty={`No timeline events are linked to this ${node.kind} yet.`} />
      <LinkedThreads
        projectId={node.projectId}
        match={({ beats }) => beats.some((b) => b.node?.id === node.id)}
        detail={({ beats }) => beats.filter((b) => b.node?.id === node.id).map((b) => b.beat.title).join(', ')}
        empty={`No plot threads develop in this ${node.kind} yet.`}
      />
      <LinkedFacts projectId={node.projectId} nodeId={node.id} empty={`No canon facts name this ${node.kind} as their source yet.`} />
      <AllConnections projectId={node.projectId} of={{ type: 'node', id: node.id }} />
      <SavedText label="Private notes" multiline rows={6} value={node.notes} placeholder="Scratchpad: loose ideas, reminders, things to fix." onSave={(notes) => update({ notes })} />
      <p className="small">
        <Link to={`/project/${node.projectId}/consequences?node=${node.id}`}>What depends on this {node.kind}?</Link>
      </p>
      <p className="muted small">Planning stays here. Nothing on this panel is ever added to the manuscript.</p>
    </div>
  );
}
