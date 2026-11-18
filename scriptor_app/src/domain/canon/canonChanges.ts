// Canon statements, as in the original's canon service. A statement's status is set by the author alone, and every
// move is added to its history; the wording of an established statement is only ever revised (a retcon), never
// overwritten, and nothing in its history is erased. A port of flutter_app/lib/shared/domain/canon/canon_changes.dart.

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { type JsonMap, jsonEquals } from '../json';
import { docBlocks } from '../prose';
import { CanonFact, type CanonStatus } from '../records/canon';
import { maps, strings } from '../records/jsonRecord';
import { dartTrim } from '../text/dartString';
import { type Dismissal, FactSource, established, factKinds, sourceTypes } from './facts';
import { normalize } from './review';

/** The collections a change to canon statements or continuity rules reads and writes. */
export const canonCollections: readonly string[] = [
  'canonFacts',
  'continuityRules',
  'continuityResolutions',
  'loreEntries',
  'loreSchemas',
  'chapters',
  'chapterContents',
  'timelineEvents',
];

const sourceTables: Readonly<Record<string, string>> = { chapter: 'chapters', entry: 'loreEntries', event: 'timelineEvents' };

export class CanonChanges extends RecordChanges {
  facts(): CanonFact[] {
    return this.rows('canonFacts').map((r) => new CanonFact(r));
  }

  owned(factId: string): CanonFact {
    const row = this.row('canonFacts', factId);
    if (row === null) throw new ChangeRefused('That canon statement is not in this novel.');
    return new CanonFact(row);
  }

  /** Keeps only ids of this novel's rows in `table`, once each. */
  private existing(table: string, ids: unknown): string[] {
    return [...new Set(strings(ids))].filter((id) => this.row(table, id) !== null);
  }

  private edit(factId: string, change: (fact: CanonFact) => JsonMap): void {
    const fact = this.owned(factId);
    const changes = change(fact);
    if (Object.keys(changes).length > 0) this.put('canonFacts', { ...fact.toJson(), ...changes, updatedAt: this.now });
  }

  private withStep(fact: CanonFact, step: JsonMap): JsonMap[] {
    return [...fact.history, { id: this.newId(), at: this.now, ...step }];
  }

  /** Records a new statement. It starts as Provisional unless the author says otherwise. */
  create(
    args: { subject?: string; statement?: string; status?: CanonStatus; kind?: string; entryIds?: readonly string[] } = {},
  ): CanonFact {
    const subject = args.subject ?? '';
    const words = dartTrim(args.statement ?? '');
    const status = args.status ?? 'provisional';
    const kind = args.kind ?? 'lore';
    const id = this.newId();
    const fact: JsonMap = {
      id,
      projectId: this.projectId,
      subject: dartTrim(subject).length === 0 ? 'New fact' : dartTrim(subject),
      statement: words,
      kind: factKinds.includes(kind) ? kind : 'lore',
      status,
      entryIds: this.existing('loreEntries', args.entryIds ?? []),
      sources: [],
      conflictsWith: [],
      replacedById: null,
      dismissed: [],
      history: [{ id: this.newId(), at: this.now, kind: 'created', statement: words, toStatus: status, reason: '' }],
      notes: '',
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('canonFacts', fact);
    return new CanonFact(fact);
  }

  /** Changes details that are not part of the record. The wording of a statement that is Canon or Conflicting cannot
   * be changed here: `revise` it, so the earlier wording is kept. `replacedById`: `{ value }` (null for none). */
  update(
    factId: string,
    args: {
      subject?: string;
      statement?: string;
      kind?: string;
      entryIds?: readonly string[];
      replacedById?: { value: string | null };
      notes?: string;
    },
  ): void {
    this.edit(factId, (fact) => {
      const next: JsonMap = {};
      if (args.subject !== undefined) next['subject'] = dartTrim(args.subject).length === 0 ? 'Untitled fact' : dartTrim(args.subject);
      if (args.notes !== undefined) next['notes'] = args.notes;
      if (args.kind !== undefined && factKinds.includes(args.kind)) next['kind'] = args.kind;
      if (args.statement !== undefined && args.statement !== fact.statement) {
        if (established.includes(fact.status)) {
          throw new ChangeRefused('This statement is on the record. Revise it, so the earlier wording is kept in its history.');
        }
        next['statement'] = args.statement;
      }
      if (args.entryIds !== undefined) next['entryIds'] = this.existing('loreEntries', args.entryIds);
      if (args.replacedById !== undefined) {
        const id = args.replacedById.value;
        next['replacedById'] = id !== null && id !== factId && this.row('canonFacts', id) !== null ? id : null;
      }
      return next;
    });
  }

  /** Moves a statement to another canon status, because the author chose it; the move is added to its history. */
  setStatus(factId: string, status: CanonStatus, reason = ''): void {
    this.edit(factId, (fact) => {
      if (status === fact.status) return {};
      return {
        status,
        history: this.withStep(fact, {
          kind: 'status',
          statement: fact.statement,
          fromStatus: fact.status,
          toStatus: status,
          reason: dartTrim(reason),
        }),
      };
    });
  }

  /** Replaces a statement's wording and keeps what it said before. For one that is Canon or Conflicting this is a
   * retcon; `minor` records a correction of wording instead. Nothing is ever erased. */
  revise(factId: string, statement: string, args: { reason?: string; minor?: boolean } = {}): void {
    this.edit(factId, (fact) => {
      const words = dartTrim(statement);
      if (words.length === 0 || words === fact.statement) return {};
      return {
        statement: words,
        history: this.withStep(fact, {
          kind: established.includes(fact.status) && !(args.minor ?? false) ? 'retcon' : 'reworded',
          statement: fact.statement,
          newStatement: words,
          fromStatus: fact.status,
          reason: dartTrim(args.reason ?? ''),
        }),
      };
    });
  }

  /** Adds to or corrects the reason noted on a step of the history. The step itself stays as it was recorded. */
  annotate(factId: string, stepId: string, reason: string): void {
    this.edit(factId, (fact) => {
      if (!fact.history.some((c) => c['id'] === stepId)) return {};
      return { history: fact.history.map((c) => (c['id'] === stepId ? { ...c, reason } : c)) };
    });
  }

  /** Which paragraph of a chapter or scene contains `quote`, as the text is saved now. */
  locate(nodeId: string, quote: string): number | null {
    const wanted = normalize(quote);
    if (wanted.length === 0 || this.row('chapters', nodeId) === null) return null;
    const blocks = docBlocks(this.row('chapterContents', nodeId)?.['doc']);
    const index = blocks.findIndex((b) => normalize(b.text).includes(wanted));
    return index < 0 ? null : index;
  }

  /** Records where a statement was established. For a chapter or scene, a quote is looked up in the saved text to pin
   * the source to its paragraph. A source that points nowhere is kept as the author's own note. */
  addSource(
    factId: string,
    args: { type?: string; refId?: string | null; block?: number | null; quote?: string; note?: string } = {},
  ): FactSource {
    const type = args.type ?? 'note';
    const quote = args.quote ?? '';
    const kind = sourceTypes.includes(type) ? type : 'note';
    const table = sourceTables[kind];
    const refId = args.refId ?? null;
    const ref = table === undefined || refId === null || this.row(table, refId) === null ? null : refId;
    let at = args.block !== null && args.block !== undefined && args.block >= 0 ? args.block : null;
    if (kind !== 'chapter' || ref === null) {
      at = null;
    } else if (at === null && dartTrim(quote).length > 0) {
      at = this.locate(ref, quote);
    }
    const source: JsonMap = {
      id: this.newId(),
      type: ref !== null ? kind : 'note',
      refId: ref,
      block: at,
      quote: dartTrim(quote),
      note: dartTrim(args.note ?? ''),
      createdAt: this.now,
    };
    this.edit(factId, (fact) => ({ sources: [...fact.sources, source] }));
    return new FactSource(source);
  }

  removeSource(factId: string, sourceId: string): void {
    this.edit(factId, (fact) => ({ sources: fact.sources.filter((s) => s['id'] !== sourceId) }));
  }

  /** The author says these two statements contradict each other. Neither status is changed. */
  linkConflict(factId: string, otherId: string): void {
    this.edit(factId, (fact) => {
      if (otherId === factId || this.row('canonFacts', otherId) === null || fact.conflictsWith.includes(otherId)) return {};
      return { conflictsWith: [...fact.conflictsWith, otherId] };
    });
  }

  /** Removes the link, whichever of the two holds it. */
  unlinkConflict(factId: string, otherId: string): void {
    for (const [a, b] of [
      [factId, otherId],
      [otherId, factId],
    ]) {
      this.edit(a, (fact) =>
        fact.conflictsWith.includes(b) ? { conflictsWith: fact.conflictsWith.filter((id) => id !== b) } : {},
      );
    }
  }

  /** The author has looked at a possible contradiction and set it aside. */
  dismiss(factId: string, dismissal: Dismissal): void {
    this.edit(factId, (fact) => {
      const clean: JsonMap =
        dismissal.factId !== null ? { factId: dismissal.factId } : { entryId: dismissal.entryId, field: dismissal.field };
      const ok = dismissal.factId !== null || (dismissal.entryId !== null && dismissal.field !== null);
      const current = maps(fact.raw['dismissed']);
      if (!ok || current.some((d) => jsonEquals(d, clean))) return {};
      return { dismissed: [...current, clean] };
    });
  }

  /** Brings back everything set aside for this statement, including what was set aside from the other side. */
  undismiss(factId: string): void {
    this.edit(factId, () => ({ dismissed: [] }));
    for (const other of this.facts()) {
      const before = maps(other.raw['dismissed']);
      const kept = before.filter((d) => d['factId'] !== factId);
      if (kept.length !== before.length) this.put('canonFacts', { ...other.toJson(), dismissed: kept });
    }
  }

  /** Deletes a statement and its whole history. To keep the record, mark it Non-Canon or Retconned instead. */
  removeFact(factId: string): void {
    this.owned(factId);
    this.remove('canonFacts', factId);
  }
}
