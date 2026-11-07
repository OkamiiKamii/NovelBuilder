import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { resolveCategories } from '@/modules/codex/schema';
import { audit, type AuditResult } from './audit';
import { DECISION_KINDS, POSSESSION_STATES, RULE_KINDS, STATUS_STATES, TIME_UNITS, type ContinuityRule, type Fix, type Issue, type Resolution, type RuleInput, type RuleKind, type RuleState, type TimeUnit } from './types';

export class RuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Continuity rule ${id} not found in this project`);
    this.name = 'RuleNotFoundError';
  }
}

/** Hooks tracked rules and the author's decisions into project isolation, duplication and backup. */
export function registerContinuity(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'continuityRules',
    refs: ['entryId', 'toEntryId', 'holderId', 'fromNodeId', 'untilNodeId'],
    // A death or a loss that happens later has not happened in the new timeline; one that ends later is still in force.
    fork: (rows, reached) => rows.filter((row) => !row.fromNodeId || reached(row.fromNodeId)).map((row) => ({ ...row, untilNodeId: reached(row.untilNodeId) ? row.untilNodeId : null })),
  });
  registry.registerCollection({
    table: 'continuityResolutions',
    refs: ['nodeId'],
    fork: (rows, reached) => rows.filter((row) => !row.nodeId || reached(row.nodeId)),
    // A decision is tied to a finding by its key, which names the rule, entry and chapter by id.
    remap: (row, mapId) => ({ ...row, key: String(row.key).split('|').map(mapId).join('|') }),
  });
}

const words = (value: unknown): string[] => [...new Set((Array.isArray(value) ? value : String(value ?? '').split(',')).map((w) => String(w).trim()).filter(Boolean))].slice(0, 40);

export function createContinuityService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; ids from another project are treated as not found. */
  function forProject(projectId: string) {
    async function owned(ruleId: string): Promise<ContinuityRule> {
      const rule = await db.continuityRules.get(ruleId);
      if (!rule || rule.projectId !== projectId) throw new RuleNotFoundError(ruleId);
      return rule;
    }
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    const mine = async (table: 'loreEntries' | 'chapters', id: unknown): Promise<string | null> => {
      if (typeof id !== 'string' || !id) return null;
      const row = (await db.table(table).get(id)) as { projectId: string } | undefined;
      return row?.projectId === projectId ? id : null;
    };

    /** Checks a rule's values, keeping only references to this project's entries and chapters. */
    async function clean(kind: RuleKind, current: ContinuityRule | null, input: RuleInput): Promise<Omit<ContinuityRule, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>> {
      const given = { ...current, ...input };
      const states: readonly string[] = kind === 'status' ? STATUS_STATES : kind === 'possession' ? POSSESSION_STATES : [];
      const amount = Number(given.amount);
      return {
        kind,
        entryId: await mine('loreEntries', given.entryId),
        aliases: words(given.aliases),
        state: states.includes(given.state as string) ? (given.state as RuleState) : ((states[0] as RuleState | undefined) ?? null),
        label: String(given.label ?? '').trim().slice(0, 200),
        words: words(given.words),
        scope: given.scope === 'paragraph' ? 'paragraph' : 'scene',
        holderId: kind === 'possession' ? await mine('loreEntries', given.holderId) : null,
        toEntryId: kind === 'travel' ? await mine('loreEntries', given.toEntryId) : null,
        amount: kind === 'travel' && Number.isFinite(amount) && amount > 0 ? amount : null,
        unit: TIME_UNITS.includes(given.unit as TimeUnit) ? (given.unit as TimeUnit) : 'days',
        fromNodeId: kind === 'status' || kind === 'possession' ? await mine('chapters', given.fromNodeId) : null,
        untilNodeId: kind === 'status' || kind === 'possession' ? await mine('chapters', given.untilNodeId) : null,
        note: String(given.note ?? ''),
      };
    }

    /** Everything a check reads, as it is saved right now. */
    async function gather() {
      const [nodes, contents, entries, schemas, rules, resolutions] = await Promise.all([
        db.chapters.where('projectId').equals(projectId).toArray(),
        db.chapterContents.where('projectId').equals(projectId).toArray(),
        db.loreEntries.where('projectId').equals(projectId).toArray(),
        db.loreSchemas.where('projectId').equals(projectId).toArray(),
        db.continuityRules.where('projectId').equals(projectId).toArray(),
        db.continuityResolutions.where('projectId').equals(projectId).toArray(),
      ]);
      const categories = new Map(resolveCategories(schemas).map((c) => [c.key, c]));
      rules.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      return { nodes, docs: new Map<string, unknown>(contents.map((c) => [c.id, c.doc])), entries, rules, resolutions, categoryOf: (key: string) => categories.get(key) };
    }

    return {
      rules: () => db.continuityRules.where('projectId').equals(projectId).toArray(),
      resolutions: () => db.continuityResolutions.where('projectId').equals(projectId).toArray(),

      /**
       * Runs a continuity check over the whole manuscript. Reads only: the
       * result is a list of findings, and nothing is saved or changed.
       */
      async run(): Promise<AuditResult> {
        return audit(await gather());
      },

      createRule: (kind: RuleKind, input: RuleInput = {}) =>
        write(async () => {
          if (!RULE_KINDS.includes(kind)) throw new Error('Unknown kind of rule.');
          const now = Date.now();
          const rule: ContinuityRule = { id: createId(), projectId, ...(await clean(kind, null, input)), createdAt: now, updatedAt: now };
          await db.continuityRules.add(rule);
          return rule;
        }),

      updateRule: (ruleId: string, input: RuleInput) =>
        write(async () => {
          const current = await owned(ruleId);
          await db.continuityRules.update(ruleId, { ...(await clean(current.kind, current, input)), updatedAt: Date.now() });
        }),

      /** Deletes a tracked rule. Decisions made about its findings are kept, and simply stop applying. */
      removeRule: (ruleId: string) =>
        write(async () => {
          await owned(ruleId);
          await db.continuityRules.delete(ruleId);
        }),

      /**
       * Records the author's decision about a finding (resolved,
       * intentional, dismissed, or needing review), with an optional note,
       * replacing any earlier one. Later checks leave it out of what is open,
       * except one that needs review. Nothing else is touched: not the text,
       * not the rule, not the codex.
       */
      resolve: (issue: Pick<Issue, 'key' | 'message' | 'nodeId'>, kind: Resolution['kind'], note = '') =>
        write(async () => {
          const existing = await db.continuityResolutions.where('projectId').equals(projectId).filter((r) => r.key === issue.key).first();
          const resolution: Resolution = { id: existing?.id ?? createId(), projectId, key: issue.key, kind: DECISION_KINDS.includes(kind) ? kind : 'dismissed', note: note.trim(), message: issue.message, nodeId: (await mine('chapters', issue.nodeId)) ?? null, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() };
          await db.continuityResolutions.put(resolution);
          return resolution;
        }),

      /** Withdraws a decision, so the finding is raised again if it still applies. */
      reopen: (resolutionId: string) =>
        write(async () => {
          const resolution = await db.continuityResolutions.get(resolutionId);
          if (resolution?.projectId === projectId) await db.continuityResolutions.delete(resolutionId);
        }),

      /**
       * "Update canon": changes a tracked rule or a codex field so that it
       * agrees with the text. Called only after the author has chosen the
       * action and confirmed the exact change. The manuscript is never
       * written to from here.
       */
      applyFix: (fix: Fix) =>
        write(async () => {
          if (fix.type === 'field') {
            const entry = await db.loreEntries.get(fix.entryId);
            if (!entry || entry.projectId !== projectId || !entry.fields.some((f) => f.id === fix.fieldId)) throw new Error('That codex field no longer exists.');
            await db.loreEntries.update(entry.id, { fields: entry.fields.map((f) => (f.id === fix.fieldId ? { ...f, value: fix.value } : f)), updatedAt: Date.now() });
            return;
          }
          const rule = await owned(fix.ruleId);
          const changes: Partial<ContinuityRule> =
            fix.type === 'end-rule' ? { untilNodeId: await mine('chapters', fix.nodeId) }
            : fix.type === 'travel' ? (fix.amount > 0 && TIME_UNITS.includes(fix.unit) ? { amount: fix.amount, unit: fix.unit } : {})
            : { words: rule.words.filter((w) => w.toLowerCase() !== fix.word.toLowerCase()) };
          await db.continuityRules.update(rule.id, { ...changes, updatedAt: Date.now() });
        }),
    };
  }

  return { forProject };
}

export type ContinuityService = ReturnType<typeof createContinuityService>;
export type ProjectContinuity = ReturnType<ContinuityService['forProject']>;
