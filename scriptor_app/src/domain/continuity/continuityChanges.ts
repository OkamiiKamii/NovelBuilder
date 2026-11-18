// Tracked continuity rules, as in the original's continuity service: what the manuscript check reads the text against.
// Changing one changes nothing else; the text is never written to from here. A port of
// flutter_app/lib/shared/domain/continuity/continuity_changes.dart, with the author's decisions about findings
// (`decide`, `reopen`: features/review/data/integrity_service.dart's, written here in the same transaction model).

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { type JsonMap } from '../json';
import { dartNumTryParse } from '../records/dartNum';
import { maps } from '../records/jsonRecord';
import { type ReviewDecision, ReviewItem } from '../records/review';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { ContinuityRule, type Fix, possessionStates, ruleKinds, ruleTimeUnits, statusStates } from './rules';

/** What a rule's change, a fix and a decision read and write. */
export const continuityCollections: readonly string[] = ['continuityRules', 'continuityResolutions', 'loreEntries', 'loreSchemas', 'chapters'];

/** As Dart's string interpolation writes a stored value (`'$v'`). */
const asText = (v: unknown): string => (v === null || v === undefined ? 'null' : String(v));

/** Words as a rule keeps them: from a list or a comma-separated text, trimmed, without blanks or repeats, at most 40. */
function wordsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value.map(asText) : (value === null || value === undefined ? '' : String(value)).split(',');
  const out = new Set<string>();
  for (const w of list) if (dartTrim(w).length > 0) out.add(dartTrim(w));
  return [...out].slice(0, 40);
}

export class ContinuityChanges extends RecordChanges {
  rules(): ContinuityRule[] {
    return this.rows('continuityRules').map((r) => new ContinuityRule(r));
  }

  owned(ruleId: string): ContinuityRule {
    const row = this.row('continuityRules', ruleId);
    if (row === null) throw new ChangeRefused('That tracked rule is not in this novel.');
    return new ContinuityRule(row);
  }

  private mine(table: string, id: unknown): string | null {
    return typeof id === 'string' && id.length > 0 && this.row(table, id) !== null ? id : null;
  }

  /** A rule's values, keeping only references to this novel's entries and chapters. */
  private clean(kind: string, current: JsonMap | null, input: JsonMap): JsonMap {
    const given: JsonMap = { ...(current ?? {}), ...input };
    const states = kind === 'status' ? statusStates : kind === 'possession' ? possessionStates : [];
    const amountText = given['amount'] === null || given['amount'] === undefined ? '' : String(given['amount']);
    const amount = dartNumTryParse(amountText);
    const label = dartTrim(given['label'] === null || given['label'] === undefined ? '' : String(given['label']));
    return {
      kind,
      entryId: this.mine('loreEntries', given['entryId']),
      aliases: wordsOf(given['aliases']),
      state: states.includes(given['state'] as string) ? given['state'] : (states[0] ?? null),
      label: label.length > 200 ? label.substring(0, 200) : label,
      words: wordsOf(given['words']),
      scope: given['scope'] === 'paragraph' ? 'paragraph' : 'scene',
      holderId: kind === 'possession' ? this.mine('loreEntries', given['holderId']) : null,
      toEntryId: kind === 'travel' ? this.mine('loreEntries', given['toEntryId']) : null,
      amount: kind === 'travel' && amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
      unit: ruleTimeUnits.includes(given['unit'] as never) ? given['unit'] : 'days',
      fromNodeId: kind === 'status' || kind === 'possession' ? this.mine('chapters', given['fromNodeId']) : null,
      untilNodeId: kind === 'status' || kind === 'possession' ? this.mine('chapters', given['untilNodeId']) : null,
      note: given['note'] === null || given['note'] === undefined ? '' : String(given['note']),
    };
  }

  createRule(kind: string, input: JsonMap = {}): ContinuityRule {
    if (!ruleKinds.includes(kind as never)) throw new ChangeRefused('Unknown kind of rule.');
    const rule: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      ...this.clean(kind, null, input),
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('continuityRules', rule);
    return new ContinuityRule(rule);
  }

  updateRule(ruleId: string, input: JsonMap): void {
    const current = this.owned(ruleId);
    this.put('continuityRules', { ...current.toJson(), ...this.clean(current.kind, current.raw, input), updatedAt: this.now });
  }

  /** Deletes a tracked rule. Decisions made about its findings are kept, and simply stop applying. */
  removeRule(ruleId: string): void {
    this.owned(ruleId);
    this.remove('continuityRules', ruleId);
  }

  /** "Update canon": changes a tracked rule or a codex field so that it agrees with the text. Called only after the
   * author has chosen the action and confirmed the exact change. The manuscript is never written to from here. */
  applyFix(fix: Fix): void {
    switch (fix.type) {
      case 'field': {
        const entry = this.row('loreEntries', fix.entryId);
        const fields = maps(entry?.['fields']);
        if (entry === null || !fields.some((f) => f['id'] === fix.fieldId)) throw new ChangeRefused('That codex field no longer exists.');
        this.put('loreEntries', {
          ...entry,
          fields: fields.map((f) => (f['id'] === fix.fieldId ? { ...f, value: fix.value } : f)),
          updatedAt: this.now,
        });
        return;
      }
      case 'end-rule': {
        const rule = this.owned(fix.ruleId);
        this.put('continuityRules', { ...rule.toJson(), untilNodeId: this.mine('chapters', fix.nodeId), updatedAt: this.now });
        return;
      }
      case 'travel': {
        const rule = this.owned(fix.ruleId);
        if (fix.amount > 0 && ruleTimeUnits.includes(fix.unit as never)) {
          this.put('continuityRules', { ...rule.toJson(), amount: fix.amount, unit: fix.unit, updatedAt: this.now });
        }
        return;
      }
      case 'unblock': {
        const rule = this.owned(fix.ruleId);
        this.put('continuityRules', {
          ...rule.toJson(),
          words: rule.words.filter((w) => dartToLowerCase(w) !== dartToLowerCase(fix.word)),
          updatedAt: this.now,
        });
        return;
      }
    }
  }

  /** The author's decisions about findings, as stored. */
  decisions(): ReviewItem[] {
    return this.rows('continuityResolutions').map((r) => new ReviewItem(r));
  }

  /** Keeps the author's decision about a finding, replacing any earlier one. Nothing else changes. */
  decide(key: string, message: string, kind: ReviewDecision, options: { note?: string; nodeId?: string | null } = {}): void {
    const existing = this.rows('continuityResolutions').find((r) => r['key'] === key) ?? null;
    const nodeId = options.nodeId ?? null;
    this.put('continuityResolutions', {
      ...(existing ?? {}),
      id: existing?.['id'] ?? this.newId(),
      projectId: this.projectId,
      key,
      kind,
      note: dartTrim(options.note ?? ''),
      message,
      nodeId: nodeId !== null && this.row('chapters', nodeId) !== null ? nodeId : (existing?.['nodeId'] ?? null),
      createdAt: existing?.['createdAt'] ?? this.now,
      updatedAt: this.now,
    });
  }

  /** Withdraws a decision, so the finding is raised again if it still applies. */
  reopen(decisionId: string): void {
    this.remove('continuityResolutions', decisionId);
  }
}
