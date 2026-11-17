// What the novel tracks about its characters, and each change recorded, as in the original's tracker service. The
// values themselves are never judged: "over nine thousand" is a level if the author says so. A port of
// flutter_app/lib/shared/domain/progression/track_changes.dart.

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { type JsonMap, listOf, mapOrNull, str } from '../json';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { ProgressCategory, ProgressChange } from '../records/progress';
import { SystemBlueprint } from '../records/system';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { actionsOf, progressPresets, progressShapes, unknownTime } from './track';

/** The collections a change to progression reads and writes. */
export const trackerCollections: readonly string[] = [
  'progressCategories',
  'progressChanges',
  'progressSnapshots',
  'loreEntries',
  'chapters',
  'timelineEvents',
  'systems',
  'systemSheets',
];

const precisions = ['exact', 'approximate', 'relative', 'unknown'];

function text(v: unknown, max = 500): string {
  const s = typeof v === 'string' ? dartTrim(v) : '';
  return s.length > max ? s.substring(0, max) : s;
}

function strings(v: unknown): string[] {
  const out = new Set<string>();
  for (const x of listOf(v)) if (text(x, 120).length > 0) out.add(text(x, 120));
  return [...out].slice(0, 100);
}

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const lower = (s: string): string => dartToLowerCase(s);
const freshUnknown = (): JsonMap => ({ kind: unknownTime.kind, when: { ...unknownTime.when } });

/** The tracker's changes on one novel, worked out from it as stored. */
export class TrackChanges extends RecordChanges {
  categories(): ProgressCategory[] {
    return dartSort(
      this.rows('progressCategories').map((r) => new ProgressCategory(r)),
      (a, b) => {
        const o = compareNum(a.order, b.order);
        return o !== 0 ? o : byCodeUnits(a.name, b.name);
      },
    );
  }

  changes(): ProgressChange[] {
    return this.rows('progressChanges').map((r) => new ProgressChange(r));
  }

  private category(id: string): ProgressCategory {
    const row = this.row('progressCategories', id);
    if (row === null) throw new ChangeRefused('That progression category is not in this novel.');
    return new ProgressCategory(row);
  }

  private mine(collection: string, id: unknown): boolean {
    return typeof id === 'string' && id.length > 0 && this.row(collection, id) !== null;
  }

  /** Creates a category (`id` null) or changes one. Its shape is fixed once changes are recorded in it, so none of them
   * stops making sense. */
  saveCategory(
    id: string | null,
    args: {
      name?: string | null;
      shape?: string | null;
      ladder?: readonly string[] | null;
      characterIds?: readonly string[] | null;
      order?: number | null;
      archived?: boolean | null;
    } = {},
  ): ProgressCategory {
    const all = this.categories();
    const current = id === null ? null : this.category(id);
    const named = text(args.name ?? current?.name, 60);
    if (named.length === 0) throw new ChangeRefused('Give the category a name.');
    const clash = all.find((c) => c.id !== current?.id && lower(c.name) === lower(named));
    if (clash !== undefined) throw new ChangeRefused(`There is already a category called “${clash.name}”.`);
    const shaped = args.shape ?? current?.shape ?? 'held';
    if (!progressShapes.includes(shaped)) throw new ChangeRefused('That is not a shape a category can have.');
    if (current !== null && shaped !== current.shape && this.changes().some((c) => c.categoryId === current.id)) {
      throw new ChangeRefused(`“${current.name}” has changes recorded in it, so its shape stays as it is.`);
    }
    const people = strings(args.characterIds ?? current?.characterIds).filter((characterId) =>
      this.mine('loreEntries', characterId),
    );
    const order = args.order;
    const saved: JsonMap = {
      ...(current?.raw ?? {}),
      id: current?.id ?? this.newId(),
      projectId: this.projectId,
      name: named,
      shape: shaped,
      ladder: shaped === 'value' ? strings(args.ladder ?? current?.ladder) : [],
      characterIds: people,
      order:
        order !== null && order !== undefined && Number.isFinite(order)
          ? order
          : (current?.order ?? all.reduce((m, c) => Math.max(m, c.order), -1) + 1),
      createdAt: current?.raw['createdAt'] ?? this.now,
      updatedAt: this.now,
    };
    delete saved['archived'];
    if (args.archived ?? current?.archived ?? false) saved['archived'] = true;
    this.put('progressCategories', saved);
    return new ProgressCategory(saved);
  }

  /** Adds one of the offered categories, by name; one already here by that name is returned as it is. */
  addPreset(name: string): ProgressCategory {
    const preset = progressPresets.find((p) => p.name === name);
    if (preset === undefined) throw new ChangeRefused('There is no such category to start from.');
    const all = this.categories();
    const here = all.find((c) => lower(c.name) === lower(preset.name));
    if (here !== undefined) return here;
    const saved: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      name: preset.name,
      shape: preset.shape,
      ladder: [],
      characterIds: [],
      order: all.reduce((m, c) => Math.max(m, c.order), -1) + 1,
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('progressCategories', saved);
    return new ProgressCategory(saved);
  }

  /** Removes a category with nothing recorded in it. One with changes is archived instead, so nothing is lost. */
  removeCategory(id: string): void {
    const category = this.category(id);
    const used = this.changes().filter((c) => c.categoryId === id).length;
    if (used > 0) {
      throw new ChangeRefused(
        `“${category.name}” has ${used} ${used === 1 ? 'change' : 'changes'} recorded. Archive it instead: they are kept.`,
      );
    }
    this.remove('progressCategories', id);
  }

  /** A point in the story must be a chapter or scene or event of this novel, or a date; null is before the story. */
  private cleanAt(at: unknown, given: boolean): unknown {
    if (!given) return freshUnknown();
    if (at === null || at === undefined) return null;
    const a = mapOrNull(at);
    if (a === null) return freshUnknown();
    if (a['kind'] === 'node' && this.mine('chapters', a['nodeId'])) return { kind: 'node', nodeId: a['nodeId'] };
    if (a['kind'] === 'event' && this.mine('timelineEvents', a['eventId'])) return { kind: 'event', eventId: a['eventId'] };
    const when = mapOrNull(a['when']);
    if (a['kind'] === 'date' && when !== null && precisions.includes(when['precision'] as string)) {
      if (when['precision'] === 'relative' && !this.mine('timelineEvents', when['anchorId'])) {
        throw new ChangeRefused('When it happens: the event the date counts from is not in this novel.');
      }
      return { kind: 'date', when };
    }
    throw new ChangeRefused('When it happens: that chapter, scene or event is not in this novel.');
  }

  /** An ability of one of this novel's blueprints, by `<systemId>/<itemId>`; null for none. One not there is refused. */
  private ability(id: unknown): string | null {
    if (id === null || id === undefined || id === '') return null;
    const s = typeof id === 'string' ? id : '';
    const slash = s.indexOf('/');
    const system = slash > 0 ? this.row('systems', s.substring(0, slash)) : null;
    const item = system === null ? undefined : new SystemBlueprint(system).items.find((i) => i.id === s.substring(slash + 1));
    if (item === undefined) throw new ChangeRefused('That ability is not in any of this novel’s systems.');
    return item.name;
  }

  /** What the change says, checked against its category's shape. Nothing about the values themselves is judged. */
  private clean(input: JsonMap, current: ProgressChange | null = null): JsonMap {
    if (!this.mine('loreEntries', input['entryId'])) throw new ChangeRefused('That character is not in this novel.');
    const category = this.category(str(input['categoryId']));
    if (category.archived && input['categoryId'] !== current?.categoryId) {
      throw new ChangeRefused(`“${category.name}” is archived: restore it to record changes in it.`);
    }
    const action = str(input['action']);
    const allowed = actionsOf[category.shape];
    if (!allowed.includes(action)) {
      const words = allowed
        .map((a) =>
          a === 'set' ? 'a value set' : a === 'happen' ? 'something that happened' : a === 'gain' ? 'something gained' : 'something lost',
        )
        .join(' or ');
      throw new ChangeRefused(`A change in “${category.name}” is ${words}.`);
    }
    const refId = this.mine('loreEntries', input['refId']) ? (input['refId'] as string) : null;
    const ability = this.ability(input['abilityId']);
    // Named by its codex entry or ability alone, it keeps that name, so it still says what it was if the record goes.
    let subject = text(input['subject'], 120);
    if (subject.length === 0) subject = refId !== null ? str(this.row('loreEntries', refId)?.['name']) : (ability ?? '');
    const value = text(input['value'], 120);
    if (category.shape !== 'value' && subject.length === 0 && refId === null && ability === null) {
      throw new ChangeRefused(
        category.shape === 'named'
          ? 'Say which value changes, such as Strength.'
          : category.shape === 'held'
            ? 'Say what is gained or lost, or choose its codex entry.'
            : 'Say what happened.',
      );
    }
    if (action === 'set' && value.length === 0) throw new ChangeRefused('Say what it is set to.');
    return {
      entryId: input['entryId'],
      categoryId: category.id,
      action,
      subject: category.shape === 'value' ? '' : subject,
      value: action === 'set' ? value : '',
      refId,
      abilityId: ability !== null ? input['abilityId'] : null,
      at: this.cleanAt(input['at'], 'at' in input),
      cost: text(input['cost']),
      note: text(input['note'], 4000),
    };
  }

  /** Records a change. With no time given ("at" left out), its time is "not known": nothing is assumed. "at" null is
   * before the story. */
  record(input: JsonMap): ProgressChange {
    const saved: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      ...this.clean(input),
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('progressChanges', saved);
    return new ProgressChange(saved);
  }

  /** Changes a recorded change, worked out from it as stored. */
  updateChange(id: string, edit: JsonMap): ProgressChange {
    const row = this.row('progressChanges', id);
    if (row === null) throw new ChangeRefused('That change is not in this novel.');
    const current = new ProgressChange(row);
    const next = this.clean(
      {
        entryId: current.entryId,
        categoryId: current.categoryId,
        action: current.action,
        subject: current.subject,
        value: current.value,
        refId: current.refId,
        abilityId: current.abilityId,
        at: current.raw['at'] ?? null,
        cost: current.cost,
        note: current.note,
        ...edit,
      },
      current,
    );
    const saved: JsonMap = { ...current.raw, ...next, updatedAt: this.now };
    this.put('progressChanges', saved);
    return new ProgressChange(saved);
  }

  removeChange(id: string): void {
    if (this.row('progressChanges', id) === null) throw new ChangeRefused('That change is not in this novel.');
    this.remove('progressChanges', id);
  }
}
