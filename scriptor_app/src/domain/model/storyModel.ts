// SINGLE SOURCE OF TRUTH, READ ONCE: one novel's records indexed by id. A port of
// flutter_app/lib/shared/domain/model/story_model.dart.
//
// A read model over the stored rows: it adds no record and copies none. Every view reads this; every change goes
// through the owning record's changes (codex/codexChanges.ts and the like), never through the model. Indexes are
// JavaScript Maps, in the rows' order (a plain object would put ids that look like numbers first).

import { type JsonMap, str } from '../json';
import { Calendar } from '../records/calendar';
import { Category, resolveCategories } from '../records/category';
import { Entry } from '../records/entry';
import { TimelineEvent } from '../records/event';
import { Journey } from '../records/journey';
import { Link } from '../records/link';
import { Novel } from '../records/novel';
import { ProgressCategory, ProgressChange } from '../records/progress';
import { CharacterRelation } from '../records/relation';
import { ChapterPlan, StoryNode } from '../records/storyNode';
import { type SysItem, SystemBlueprint, SystemSheet, isSystemOn } from '../records/system';
import { PlotThread } from '../records/thread';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { type EntityRef, EntityView, abilityId } from './entityRef';
import { StoryOrder } from './storyOrder';
import { TimeContext } from './validity';

/** An ability as a record: the blueprint item, the system it belongs to, and its group's name. */
export class AbilityRecord {
  constructor(
    readonly system: SystemBlueprint,
    readonly item: SysItem,
    readonly group: string,
  ) {}
}

type ModelParts = {
  novel: Novel;
  nodes: ReadonlyMap<string, StoryNode>;
  order: StoryOrder;
  plans: ReadonlyMap<string, ChapterPlan>;
  entries: ReadonlyMap<string, Entry>;
  categories: ReadonlyMap<string, Category>;
  links: readonly Link[];
  relations: ReadonlyMap<string, CharacterRelation>;
  events: ReadonlyMap<string, TimelineEvent>;
  threads: ReadonlyMap<string, PlotThread>;
  systems: ReadonlyMap<string, SystemBlueprint>;
  allSystems: ReadonlyMap<string, SystemBlueprint>;
  abilities: ReadonlyMap<string, AbilityRecord>;
  sheets: readonly SystemSheet[];
  calendar: Calendar;
  progressCategories: ReadonlyMap<string, ProgressCategory>;
  progress: readonly ProgressChange[];
  journeys: readonly Journey[];
};

export class StoryModel {
  readonly novel: Novel;
  readonly nodes: ReadonlyMap<string, StoryNode>;
  readonly order: StoryOrder;
  readonly plans: ReadonlyMap<string, ChapterPlan>;
  readonly entries: ReadonlyMap<string, Entry>;
  readonly categories: ReadonlyMap<string, Category>;
  readonly links: readonly Link[];
  readonly relations: ReadonlyMap<string, CharacterRelation>;
  readonly events: ReadonlyMap<string, TimelineEvent>;
  readonly threads: ReadonlyMap<string, PlotThread>;
  /** The systems that are on: what characters and checks read. */
  readonly systems: ReadonlyMap<string, SystemBlueprint>;
  /** Every system, on and off, in the same order. */
  readonly allSystems: ReadonlyMap<string, SystemBlueprint>;
  /** Built from every system, so a link to an off system's ability still resolves. */
  readonly abilities: ReadonlyMap<string, AbilityRecord>;
  readonly sheets: readonly SystemSheet[];
  readonly calendar: Calendar;
  readonly progressCategories: ReadonlyMap<string, ProgressCategory>;
  readonly progress: readonly ProgressChange[];
  readonly journeys: readonly Journey[];

  private constructor(parts: ModelParts) {
    this.novel = parts.novel;
    this.nodes = parts.nodes;
    this.order = parts.order;
    this.plans = parts.plans;
    this.entries = parts.entries;
    this.categories = parts.categories;
    this.links = parts.links;
    this.relations = parts.relations;
    this.events = parts.events;
    this.threads = parts.threads;
    this.systems = parts.systems;
    this.allSystems = parts.allSystems;
    this.abilities = parts.abilities;
    this.sheets = parts.sheets;
    this.calendar = parts.calendar;
    this.progressCategories = parts.progressCategories;
    this.progress = parts.progress;
    this.journeys = parts.journeys;
  }

  static fromSnapshot(s: NovelSnapshot): StoryModel {
    const index = <T>(collection: string, make: (row: JsonMap) => T): Map<string, T> => {
      const out = new Map<string, T>();
      for (const r of s.rows(collection)) out.set(str(r['id']), make(r));
      return out;
    };
    const nodes = index('chapters', (r) => new StoryNode(r));
    const allSystems = index('systems', (r) => new SystemBlueprint(r));
    const abilities = new Map<string, AbilityRecord>();
    for (const system of allSystems.values()) {
      const groups = new Map<string, string>();
      for (const g of system.groups) groups.set(g.id, g.name);
      for (const item of system.items) {
        abilities.set(abilityId(system.id, item.id), new AbilityRecord(system, item, groups.get(item.groupId) ?? ''));
      }
    }
    const calendarRows = s.rows('storyCalendars');
    const categories = new Map<string, Category>();
    for (const c of resolveCategories(s.rows('loreSchemas').map((r) => new Category(r)), s.rows('loreEntries').map((r) => str(r['category'])))) categories.set(c.key, c);
    return new StoryModel({
      novel: new Novel(s.project),
      nodes,
      order: StoryOrder.of(nodes.values()),
      plans: index('chapterPlans', (r) => new ChapterPlan(r)),
      entries: index('loreEntries', (r) => new Entry(r)),
      categories,
      links: s.rows('loreLinks').map((r) => new Link(r)),
      relations: index('characterRelations', (r) => new CharacterRelation(r)),
      events: index('timelineEvents', (r) => new TimelineEvent(r)),
      threads: index('plotThreads', (r) => new PlotThread(r)),
      systems: new Map([...allSystems].filter(([, s]) => isSystemOn(s))),
      allSystems,
      abilities,
      sheets: s.rows('systemSheets').map((r) => new SystemSheet(r)),
      calendar: Calendar.fromJson(calendarRows.length === 0 ? null : calendarRows[0]),
      progressCategories: index('progressCategories', (r) => new ProgressCategory(r)),
      progress: s.rows('progressChanges').map((r) => new ProgressChange(r)),
      journeys: s.rows('journeys').map((r) => new Journey(r)),
    });
  }

  /** The same novel with another course of events (an alternate history's); every other record is shared. */
  withEvents(events: ReadonlyMap<string, TimelineEvent>): StoryModel {
    return new StoryModel({ ...this.parts(), events });
  }

  private parts(): ModelParts {
    return {
      novel: this.novel,
      nodes: this.nodes,
      order: this.order,
      plans: this.plans,
      entries: this.entries,
      categories: this.categories,
      links: this.links,
      relations: this.relations,
      events: this.events,
      threads: this.threads,
      systems: this.systems,
      allSystems: this.allSystems,
      abilities: this.abilities,
      sheets: this.sheets,
      calendar: this.calendar,
      progressCategories: this.progressCategories,
      progress: this.progress,
      journeys: this.journeys,
    };
  }

  private context: TimeContext | null = null;

  /** Where nodes are in reading order, the events, and the calendar: what points in the story are placed against. */
  get timeContext(): TimeContext {
    return (this.context ??= new TimeContext({
      position: this.order.position,
      events: this.events,
      calendar: this.calendar,
    }));
  }

  categoryOf(key: string): Category {
    return this.categories.get(key) ?? Category.unknown(key);
  }

  /** Finds a record by ref and says what it is called now. Null for a deleted record or another novel's. Never
   * throws, so a stale link can always be shown for what it is. */
  resolve(ref: EntityRef): EntityView | null {
    const view = (label: string, kind: string) => new EntityView(ref, label, kind);
    switch (ref.type) {
      case 'node': {
        const node = this.nodes.get(ref.id);
        return node === undefined ? null : view(node.displayTitle, node.kindKey);
      }
      case 'entry': {
        const entry = this.entries.get(ref.id);
        return entry === undefined ? null : view(entry.name, entry.category);
      }
      case 'event': {
        const event = this.events.get(ref.id);
        return event === undefined ? null : view(event.name, 'event');
      }
      case 'thread': {
        const thread = this.threads.get(ref.id);
        return thread === undefined ? null : view(thread.title, 'thread');
      }
      case 'relation': {
        const relation = this.relations.get(ref.id);
        if (relation === undefined) return null;
        const name = (id: string) => this.entries.get(id)?.name ?? 'Someone';
        return view(`${name(relation.fromId)} and ${name(relation.toId)}`, 'relation');
      }
      case 'ability': {
        const ability = this.abilities.get(ref.id);
        return ability === undefined ? null : view(ability.item.name, 'ability');
      }
    }
  }

  exists(ref: EntityRef): boolean {
    return this.resolve(ref) !== null;
  }
}
