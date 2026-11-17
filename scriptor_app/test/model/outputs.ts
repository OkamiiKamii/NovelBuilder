// Scriptor's model outputs for a novel, built exactly as golden/dump.dart builds the Flutter app's, so the two can be
// compared key by key (modelAgreement.test.ts).

import { cleanUses, fieldOf, fieldsFor, kindViews, mergeUses, missingFor, readyViews, remapUses, slots, typeWords } from '../../src/domain/codex/capabilities';
import {
  ChangeRefused,
  CodexChanges,
  categoriesOf,
  cleanDefs,
  cleanList,
  cleanOptions,
  matchesEntry,
  normalizeImage,
  relatedTo,
} from '../../src/domain/codex/codexChanges';
import { checkValue, displayValue, entryIssues, jsNumber, splitChoices } from '../../src/domain/codex/fieldValues';
import { localeCompare } from '../../src/domain/collation';
import { type JsonMap, isMap, str } from '../../src/domain/json';
import { changeWords, connectionsOf, deriveConnections } from '../../src/domain/model/connections';
import { StateError, planDelete } from '../../src/domain/model/deletePolicy';
import { EntityRef, type EntityType } from '../../src/domain/model/entityRef';
import { rowWritesBetween } from '../../src/domain/model/rowWrites';
import { StoryModel } from '../../src/domain/model/storyModel';
import { readingOrder, sortedStages, stageAt, subtreeIds } from '../../src/domain/model/storyOrder';
import {
  Anchor,
  type EventBounds,
  Validity,
  anchorIds,
  boundsOfEvent,
  historyOf,
  overlaps,
  spanOfDate,
  spanOfEvent,
  statesAt,
  truthToJson,
  validAt,
} from '../../src/domain/model/validity';
import { BranchRecord, branchStatusHint, branchStatusLabel } from '../../src/domain/records/branch';
import { Calendar, type Span, calendarProblems } from '../../src/domain/records/calendar';
import { CanonFact, canonStatusLabel } from '../../src/domain/records/canon';
import { Category, FieldDef, builtinCategoryKeys, fieldTypes } from '../../src/domain/records/category';
import { dartNumTryParse } from '../../src/domain/records/dartNum';
import { Entry, viewFields } from '../../src/domain/records/entry';
import { EventDate, EventDuration, revealRoleLabel, timeUnits } from '../../src/domain/records/event';
import { ConnectionType, connectionType, wordingOf } from '../../src/domain/records/link';
import { Novel } from '../../src/domain/records/novel';
import { ReviewItem, decisionCloses, reviewDecisionLabel } from '../../src/domain/records/review';
import { SavedView } from '../../src/domain/records/savedView';
import { blankSheet, toFormulaKey } from '../../src/domain/records/system';
import type { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { foldText, nfkdWords } from '../../src/domain/text/fold';
import { resolveChronology } from '../../src/domain/timeline/chronology';
import {
  calendarSettingsOf,
  cleanCalendar,
  defaultCalendarSettings,
  describeCalendar,
  formatDate,
  formatDuration,
  jsNum,
  jsRound,
  localeNumber,
  normalizeDate,
  startingCalendar,
  unitLabel,
} from '../../src/domain/timeline/dates';
import {
  type StoryTelling,
  nodeLabel,
  orderSummary,
  orderWords,
  ordinal,
  tellingNotes,
  tellingWords,
  twoOrders,
} from '../../src/domain/timeline/narrative';

/** Values as JSON holds them, as the Dart dump writes them: NaN and the infinities as words, Maps as objects. */
export function plain(v: unknown): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    return v + 0;
  }
  if (v === undefined) return null;
  if (v instanceof Map) {
    const out: JsonMap = {};
    for (const [k, x] of v) out[String(k)] = plain(x);
    return out;
  }
  if (Array.isArray(v) || v instanceof Set) return [...v].map(plain);
  if (isMap(v)) {
    const out: JsonMap = {};
    for (const [k, x] of Object.entries(v)) out[k] = plain(x);
    return out;
  }
  return v;
}

const span = (s: Span | null) => (s === null ? null : [s.lo, s.hi]);
const bounds = (b: EventBounds | null) => (b === null ? null : [span(b.start), span(b.end), b.open]);

export const customCalendar: JsonMap = {
  kind: 'custom',
  name: 'The Reckoning',
  months: [
    { name: 'Thaw', days: 40 },
    { name: 'Bloom', days: 40 },
    { name: 'Swelter', days: 40 },
    { name: 'Harvest', days: 40 },
    { name: 'Fall', days: 40 },
    { name: 'Frost', days: 40 },
    { name: 'Deep', days: 40 },
    { name: 'Dark', days: 40 },
    { name: 'Wake', days: 40 },
    { name: 'Mud', days: 41 },
  ],
  hoursPerDay: 20,
  daysPerWeek: 6,
  eras: [
    { name: 'Second Age', startYear: 1000 },
    { name: 'First Age', startYear: 0 },
  ],
  seasons: { spring: 1, summer: 3, autumn: 6, winter: 1 },
};

export function withCalendar(s: NovelSnapshot): NovelSnapshot {
  return s.withRows('storyCalendars', [{ ...customCalendar, id: 'cal', projectId: s.projectId, updatedAt: 0 }]);
}

function calendarReport(c: Calendar): unknown {
  const upTo = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
  return {
    standard: c.standard,
    name: c.name,
    months: c.months,
    monthStarts: c.monthStarts,
    monthLengths: c.monthLengths,
    minutesPerYear: c.minutesPerYear,
    minutesPerDay: c.minutesPerDay,
    hoursPerDay: c.hoursPerDay,
    daysPerWeek: c.daysPerWeek,
    eras: c.eras.map((e) => [e.name, e.startYear]),
    seasons: [...c.seasons].map(([k, v]) => [k, span(v)]),
    units: timeUnits.map((u) => c.unitMinutes(u)),
    daysIn: upTo(c.months.length + 1).map((m) => c.daysIn(m)),
    monthName: upTo(c.months.length + 1).map((m) => c.monthName(m)),
    yearName: [-5, 0, 1, 999, 1000, 1001, 5000].map((y) => c.yearName(y)),
    describe: describeCalendar(c),
  };
}

function allRefs(m: StoryModel): EntityRef[] {
  const of = (type: EntityType, ids: Iterable<string>) => [...ids].map((id) => new EntityRef(type, id));
  return [
    ...of('node', m.nodes.keys()),
    ...of('entry', m.entries.keys()),
    ...of('event', m.events.keys()),
    ...of('thread', m.threads.keys()),
    ...of('relation', m.relations.keys()),
    ...of('ability', m.abilities.keys()),
  ];
}

const date = (d: EventDate | null) => d?.toJson() ?? null;

function modelReport(s: NovelSnapshot): unknown {
  const m = StoryModel.fromSnapshot(s);
  const novel = m.novel;
  const ctx = m.timeContext;
  const nodeIds = [...m.nodes.keys()];
  return {
    novel: [
      novel.id,
      novel.projectId,
      novel.title,
      novel.status,
      novel.targetWordCount,
      novel.accent,
      novel.language,
      novel.viewsOff,
      novel.secondaryGenres,
      novel.pinned,
      novel.lastOpenedAt,
    ],
    reading: readingOrder(m.nodes.values()).map((n) => n.id),
    position: [...m.order.position],
    chapterNumber: [...m.order.chapterNumber],
    chapters: m.order.chapters.map((c) => c.id),
    nodes: [...m.nodes.values()].map((n) => [
      n.id,
      n.parentId,
      n.kindKey,
      n.kind,
      n.title,
      n.displayTitle,
      n.order,
      n.status,
      n.mentions,
      n.wordCount,
      n.charCount,
      n.createdAt,
      n.summary,
      // A parent loop never ends subtreeIds, in Dart as in the port.
      n.id.startsWith('loop') ? 'cycle' : subtreeIds(m.nodes.values(), n.id),
    ]),
    plans: [...m.plans.values()].map((p) => [
      p.id,
      p.nodeId,
      p.objective,
      p.beats.map((b) => [b.id, b.text]),
      p.entityIds,
      p.appearIds,
      p.mentionIds,
      p.povIds,
      p.labels,
    ]),
    categories: [...m.categories.values()].map((c) => [
      c.key,
      c.name,
      c.singular,
      c.color,
      c.builtin,
      c.order,
      c.archived,
      c.fields.map((f) => [f.id, f.name, f.type, f.options, f.archived, f.required, f.help, f.min, f.max, f.target]),
      c.uses,
    ]),
    entries: [...m.entries.values()].map((e) => [
      e.id,
      e.category,
      e.name,
      e.summary,
      e.image,
      e.notes,
      e.tags,
      e.fields.map((f) => [f.id, f.key, f.value, f.type, f.options, f.defId]),
      e.placeLevel,
      e.createdAt,
      e.updatedAt,
    ]),
    links: m.links.map((l) => {
      const w = wordingOf(l);
      return [
        l.id,
        l.fromType,
        l.fromId,
        l.toType,
        l.toId,
        l.from.key,
        l.to.key,
        l.type,
        l.fromLabel,
        l.toLabel,
        l.notes,
        l.canon,
        l.how,
        l.endHow,
        l.isEntryLink,
        [w.forward, w.backward, w.reciprocal],
        l.validity?.from?.raw ?? null,
        l.validity?.until?.raw ?? null,
        anchorIds(l.validity),
      ];
    }),
    relations: [...m.relations.values()].map((r) => [
      r.id,
      r.fromId,
      r.toId,
      r.stages.map((st) => [
        st.id,
        st.startNodeId,
        st.startUnknown,
        st.preset,
        st.category,
        st.label,
        st.fromRole,
        st.toRole,
        st.directional,
        st.title,
        st.affinity,
        st.event,
        st.attributes,
        [st.attribute('trust').from, st.attribute('trust').to, st.attribute('fear').from],
        st.storyAt,
        st.causeEventId,
      ]),
      sortedStages(r, m.order).map((st) => st.id),
      stageAt(r, null, m.order)?.id ?? null,
      nodeIds.slice(0, 40).map((id) => stageAt(r, id, m.order)?.id ?? null),
      stageAt(r, 'not-a-node', m.order)?.id ?? null,
    ]),
    events: [...m.events.values()].map((e) => {
      const when = e.when;
      return [
        e.id,
        e.name,
        date(when),
        date(e.end),
        e.duration?.toJson() ?? null,
        e.importance,
        e.importanceKey,
        e.locationId,
        e.characters.map((c) => [c.id, c.age]),
        e.entryIds,
        e.nodeIds,
        e.afterId,
        e.ongoing,
        e.threadIds,
        e.labels,
        e.statusKey,
        e.canon,
        e.canonKey,
        [...e.reveals].map(([k, v]) => [k, v, revealRoleLabel[v]]),
        span(spanOfEvent(e.id, ctx)),
        bounds(boundsOfEvent(e.id, ctx)),
        span(spanOfDate(when, ctx)),
        when === null ? null : m.calendar.dateProblem(when),
        when === null ? null : span(m.calendar.spanOf(when)),
        formatDate(when, (id) => m.events.get(id)?.name ?? null, m.calendar),
        formatDuration(e.duration),
        m.calendar.durationMinutes(e.duration),
      ];
    }),
    threads: [...m.threads.values()].map((t) => [
      t.id,
      t.title,
      t.premise,
      t.category,
      t.statusKey,
      t.status,
      t.customStatus,
      t.characterIds,
      t.locationIds,
      t.targetNodeId,
      t.beats.map((b) => [b.id, b.role, b.withThreadIds, b.nodeId, b.title, b.note]),
    ]),
    systems: [...m.systems.values()].map((sys) => [
      sys.id,
      sys.name,
      sys.description,
      sys.groups.map((g) => [g.id, g.name]),
      sys.groupList.map((g) => [g.id, g.name, g.single]),
      sys.ranks.map((r) => [r.id, r.name]),
      sys.items.map((i) => [
        i.id,
        i.groupId,
        i.name,
        i.parentId,
        i.rankId,
        sys.rankName(i),
        i.requires,
        i.modifiers.map((x) => [x.id, x.target, x.op, x.value]),
        i.costs.map((x) => [x.id, x.target, x.amount]),
        i.cooldown,
        i.affinity,
        i.evolution,
      ]),
      sys.variables.map((v) => [
        v.id,
        v.name,
        v.key,
        v.kind,
        v.unit,
        v.base,
        v.formula,
        v.options,
        v.note,
        toFormulaKey(v.name),
      ]),
      sys.tracks.map((t) => [
        t.id,
        t.name,
        t.key,
        t.kind,
        t.cap,
        t.curve,
        t.curveUnit,
        t.points,
        t.sources,
        t.stages.map((st) => [st.id, st.name, st.requires, st.note, st.grants]),
      ]),
      sys.matrices.map((x) => [x.id, x.name, x.rows.map((r) => [r.id, r.name]), x.columns.map((c) => [c.id, c.name]), [...x.cells]]),
      sys.createdAt,
    ]),
    abilities: [...m.abilities].map(([k, v]) => [k, v.system.id, v.item.id, v.group]),
    sheets: m.sheets.map((sh) => [
      sh.id,
      sh.systemId,
      sh.entryId,
      sh.itemIds,
      [...sh.values],
      [...sh.progress],
      [...sh.spent],
      sh.xp.map((x) => [x.id, x.trackId, x.amount, x.source, x.nodeId, x.note]),
      sh.note,
    ]),
    calendar: calendarReport(m.calendar),
    progressCategories: [...m.progressCategories.values()].map((c) => [
      c.id,
      c.name,
      c.shape,
      c.ladder,
      c.characterIds,
      c.order,
      c.archived,
    ]),
    progress: m.progress.map((c) => [
      c.id,
      c.entryId,
      c.categoryId,
      c.action,
      c.subject,
      c.value,
      c.refId,
      c.abilityId,
      c.at?.raw ?? null,
      c.createdAt,
      c.cost,
      changeWords(c, m.progressCategories.get(c.categoryId) ?? null, m),
    ]),
    journeys: m.journeys.map((j) => [
      j.id,
      j.travellerIds,
      j.fromId,
      j.toId,
      j.via,
      j.departure?.raw ?? null,
      j.arrival?.raw ?? null,
      j.afterId,
      j.eventIds,
      j.method,
      j.methodId,
      j.duration?.toJson() ?? null,
      j.distance,
      j.distanceUnit,
      j.note,
      j.createdAt,
    ]),
    resolve: [...allRefs(m), new EntityRef('entry', 'not-there'), new EntityRef('ability', 'no/such')].map((r) => {
      const v = m.resolve(r);
      return [r.key, v?.label ?? null, v?.kind ?? null, m.exists(r)];
    }),
    canon: s.rows('canonFacts').map((r) => {
      const f = new CanonFact(r);
      return [
        f.id,
        f.subject,
        f.statement,
        f.kind,
        f.status,
        canonStatusLabel[f.status],
        f.entryIds,
        f.conflictsWith,
        f.replacedById,
        f.history.length,
        f.sources.length,
      ];
    }),
    review: s.rows('continuityResolutions').map((r) => {
      const x = new ReviewItem(r);
      return [x.id, x.key, x.decision, reviewDecisionLabel[x.decision], decisionCloses(x.decision), x.note, x.message, x.nodeId];
    }),
    savedViews: s.rows('savedViews').map((r) => {
      const v = new SavedView(r);
      return [v.id, v.view, v.name, v.filter, v.mode, v.layers, v.scale, v.layout];
    }),
  };
}

function validityReport(s: NovelSnapshot): unknown {
  const m = StoryModel.fromSnapshot(s);
  const ctx = m.timeContext;
  const probes: Anchor[] = [
    ...[...m.order.position.keys()].slice(0, 30).map((id) => Anchor.node(id)),
    ...[...m.events.keys()].slice(0, 30).map((id) => Anchor.event(id)),
    Anchor.date({ precision: 'approximate', year: 0, month: null, season: null }),
    Anchor.date({ precision: 'exact', year: 10, month: 4, day: 2, hour: null, minute: null }),
    Anchor.date({ precision: 'approximate', year: 1000, month: null, season: 'winter' }),
    Anchor.date({ precision: 'unknown' }),
    Anchor.node('not-a-node'),
  ];
  const validities: Validity[] = [
    ...m.links.map((l) => l.validity).filter((v): v is Validity => v !== null),
    ...m.progress.map((c) => new Validity(c.at, null)),
    ...m.journeys.map((j) => new Validity(j.departure, j.arrival)),
    Validity.always,
  ];
  const indexes = validities.map((_, i) => i);
  return {
    validAt: validities.map((v) => probes.map((p) => truthToJson(validAt(v, p, ctx)))),
    overlaps: validities.slice(0, 25).map((a) => validities.slice(0, 25).map((b) => truthToJson(overlaps(a, b, ctx)))),
    history: historyOf(indexes, (i) => validities[i], ctx),
    statesAt: probes
      .slice(0, 10)
      .map((p) => statesAt(indexes, (i) => validities[i], p, ctx).map(([i, t]) => [i, truthToJson(t)])),
  };
}

function connectionsReport(s: NovelSnapshot): unknown {
  const m = StoryModel.fromSnapshot(s);
  const result = deriveConnections(m);
  return {
    connections: result.connections.map((c) => c.toJson()),
    dangling: result.dangling.map((d) => [d.connection.toJson(), ...d.missing.map((r) => r.key)]),
    seen: [...m.entries.keys()].map((id) =>
      connectionsOf(result.connections, new EntityRef('entry', id)).map((x) => [
        x.connection.id,
        x.other.key,
        x.label,
        x.theirLabel,
        x.outgoing,
      ]),
    ),
  };
}

function writes(before: NovelSnapshot, after: NovelSnapshot): unknown[] {
  return rowWritesBetween(before, after).map((w) => [w.collection, w.id, w.value, w.expect ?? null]);
}

function deleteReport(s: NovelSnapshot): unknown {
  const m = StoryModel.fromSnapshot(s);
  const out: JsonMap = {};
  for (const ref of [...allRefs(m), new EntityRef('thread', 'ghost')].filter((r) => !r.id.startsWith('loop'))) {
    try {
      const o = planDelete(s, ref);
      out[ref.key] = {
        effects: o.effects.map((e) => [e.collection, e.id, e.effect, e.why]),
        removed: o.removed.length,
        detached: o.detached.length,
        unresolved: o.unresolved.map((d) => [d.connection.id, ...d.missing.map((r) => r.key)]),
        writes: writes(s, o.snapshot),
      };
    } catch (e) {
      if (!(e instanceof StateError)) throw e;
      out[ref.key] = { error: e.message };
    }
  }
  return out;
}

function codexReport(s: NovelSnapshot): unknown {
  const m = StoryModel.fromSnapshot(s);
  const names = new Map([...m.entries.values()].map((e) => [e.id, e.name]));
  const categories = categoriesOf(s);
  const entries = m.entries;
  return {
    categories: [...categories.values()].map((c) => [
      c.key,
      readyViews(c),
      [...kindViews, 'graphLabel', 'graphLinks', 'other'].map((v) => missingFor(c, v as 'timeline')),
      [...slots.keys()].map((slot) => fieldsFor(c, slot).map((f) => f.id)),
      [
        fieldOf(c, 'rank', c.uses['rank'])?.id ?? null,
        fieldOf(c, 'map.x', isMap(c.uses['map']) ? c.uses['map']['x'] : null)?.id ?? null,
      ],
      CodexChanges.kindTemplate(c),
    ]),
    typeWords: [...slots.keys()].map((slot) => typeWords(slot)),
    entries: [...entries.values()].map((e) => {
      const cat = m.categoryOf(e.category);
      const view = viewFields(e, cat);
      const name = e.name;
      return [
        e.id,
        view.category.map(([d, f]) => [d.id, f?.id ?? null]),
        view.own.map((f) => f.id),
        view.archived.map(([d, f]) => [d.id, f.id]),
        entryIssues(e, cat, entries, { categoryName: (k) => m.categoryOf(k).name }).map((i) => [
          i.defId,
          i.field,
          i.problem,
          i.message,
        ]),
        e.fields.map((f) =>
          displayValue(
            cat.fields.find((d) => d.id === f.defId)?.type ?? f.type,
            f.value,
            (id) => names.get(id) ?? null,
          ),
        ),
        relatedTo(e.id, entries.values(), m.links).map((r) => [r.linkId, r.entry.id, r.label, r.theirLabel]),
        ['a', 'the', '  ', 'É', 'mira', 'zzz', name.length > 2 ? name.substring(1, 3) : 'x'].map((q) =>
          matchesEntry(e, q),
        ),
        foldText(e.name),
        foldText(e.description),
        nfkdWords(`${e.name} ${e.summary}`),
        toFormulaKey(e.name),
      ];
    }),
  };
}

const lastLink = (c: CodexChanges) => {
  const rows = c.rows('loreLinks');
  return rows.length === 0 ? 'none' : str(rows[rows.length - 1]['id']);
};

function changesReport(start: NovelSnapshot, template: JsonMap[]): unknown {
  let s = start;
  let clock = 5000;
  let ids = 0;
  const results: unknown[] = [];
  const act = (what: string, change: (c: CodexChanges) => unknown) => {
    const c = new CodexChanges(s, { now: ++clock, createId: () => `n${++ids}` });
    try {
      const r = change(c);
      s = c.snapshot;
      results.push([what, plain(r ?? null)]);
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      results.push([what, 'refused', e.message, `${e}`]);
    }
  };

  const entryIds = start.rows('loreEntries').map((r) => str(r['id']));
  const nodeIds = start.rows('chapters').map((r) => str(r['id']));
  const eventIds = start.rows('timelineEvents').map((r) => str(r['id']));
  const first = entryIds.length === 0 ? 'none' : entryIds[0];
  const second = entryIds.length < 2 ? 'none' : entryIds[1];
  act('categories', (c) => c.categories().map((x) => x.key));
  act(
    'new kind',
    (c) =>
      c.saveCategory(null, () => ({
        name: ' Spells ',
        fields: [
          { id: 'a', name: 'Rank', type: 'number', min: '0', max: 10, required: true, help: ' How ' },
          { name: '  ', type: 'select', options: [' x ', 'x', '', 5, 'y'.repeat(70)] },
          { id: 'c', name: 'Known by', type: 'references', target: 'character', future: 1 },
          { id: 'd', name: 'Ghost', type: 'reference', target: 'nowhere' },
          { id: 'e', name: 'Back', type: 'number', min: 5, max: '1' },
          'junk',
        ],
        uses: { rank: 'a', graphLinks: ['c', 'zz'], tree: true },
        graph: false,
      })).raw,
  );
  act('clash', (c) => c.saveCategory(null, () => ({ name: 'spells' })).raw);
  act('blank', (c) => c.saveCategory(null, () => ({ name: ' ' })).raw);
  act('unknown', (c) => c.saveCategory('nope', () => ({ name: 'X' })).raw);
  act('builtin change', (c) => c.saveCategory('location', () => ({ name: 'Places', archived: true, order: 0.5 })).raw);
  act(
    'fields kept',
    (c) =>
      c.saveCategory('location', (cur) => ({
        fields: cur!.fields.slice(1).map((f) => ({ ...f.raw, name: `${f.name}!` })),
      })).raw,
  );
  for (const key of ['character', 'location', 'custom-none']) {
    act(`create ${key}`, (c) => c.createEntry(key, key === 'location' ? '  Keep  ' : null).raw);
  }
  act('create with id', (c) => c.createEntry('item', 'Blade', 'fixed-id').raw);
  act('update', (c) => {
    c.updateEntry(first, {
      name: '  ',
      summary: 'S',
      tags: [' a ', 'a', '', 'b'],
      image: { value: 'javascript:x' },
      category: 'nope',
      notes: 'N',
    });
    return c.owned(first).raw;
  });
  act('update image', (c) => {
    c.updateEntry(second, { image: { value: 'https://example.com/x.png' }, category: 'location' });
    return c.owned(second).raw;
  });
  act('field values', (c) => {
    const e = c.owned(first);
    for (const def of c.category(e.category).fields) c.setFieldValue(first, def.id, `v-${def.name}`);
    const defs = c.category(e.category).fields;
    c.setFieldValue(first, defs.length === 0 ? 'x' : defs[0].id, 'again');
    return c.owned(first).raw;
  });
  act('bad field', (c) => {
    c.setFieldValue(first, 'no-such-field', 'x');
    return null;
  });
  act('own fields', (c) => {
    c.setOwnFields(first, [
      { id: 'o1', key: ' Motto ', value: 'Hold', defId: 'x' },
      { key: 'Rank', value: 'S', options: ['A', 'S', 'S', ' '] },
      { id: '', key: '', value: ' ' },
      { id: 'o4', key: 5, value: 'five', options: [] },
    ]);
    return c.owned(first).raw;
  });
  act('link', (c) => c.linkEntries(first, second, ' Ally ').raw);
  act('link again', (c) => c.linkEntries(second, first).raw);
  act('link self', (c) => c.linkEntries(first, first).raw);
  act('label', (c) => {
    const id = lastLink(c);
    c.labelLink(id, second, ' Friend ');
    c.setLinkCanon(id, 'non-canon');
    return c.row('loreLinks', id);
  });
  act('label stranger', (c) => {
    c.labelLink(lastLink(c), 'stranger', 'x');
    return null;
  });
  if (nodeIds.length > 0) {
    act(
      'connect',
      (c) =>
        c.createConnection({
          from: new EntityRef('entry', first),
          to: new EntityRef('node', nodeIds[0]),
          type: '  appears-in ',
          label: ' Seen ',
          notes: ' n ',
          canon: 'canon',
          startsAt: { kind: 'node', nodeId: nodeIds[0] },
          how: 'h'.repeat(100),
        }).raw,
    );
    act(
      'connect twin',
      (c) =>
        c.createConnection({
          from: new EntityRef('entry', first),
          to: new EntityRef('node', nodeIds[0]),
          type: 'appears-in',
          startsAt: { kind: 'node', nodeId: nodeIds[0] },
        }).raw,
    );
    act(
      'connect plain',
      (c) =>
        c.createConnection({
          from: new EntityRef('entry', first),
          to: new EntityRef('node', nodeIds[0]),
          type: 'appears-in',
        }).raw,
    );
  }
  act(
    'connect self',
    (c) => c.createConnection({ from: new EntityRef('entry', first), to: new EntityRef('entry', first) }).raw,
  );
  act(
    'connect missing',
    (c) => c.createConnection({ from: new EntityRef('entry', first), to: new EntityRef('event', 'zz') }).raw,
  );
  act(
    'connect blank',
    (c) => c.createConnection({ from: new EntityRef('entry', ' '), to: new EntityRef('entry', first) }).raw,
  );
  act(
    'connect bad point',
    (c) =>
      c.createConnection({
        from: new EntityRef('entry', first),
        to: new EntityRef('entry', second),
        startsAt: { kind: 'date', when: { precision: 'relative', anchorId: 'nowhere' } },
      }).raw,
  );
  if (eventIds.length > 0) {
    act(
      'connect dated',
      (c) =>
        c.createConnection({
          from: new EntityRef('entry', second),
          to: new EntityRef('event', eventIds[0]),
          type: 'my own words',
          startsAt: {
            kind: 'date',
            when: { precision: 'relative', anchorId: eventIds[0], amount: 1, unit: 'days' },
          },
        }).raw,
    );
  }
  const abilities = [...StoryModel.fromSnapshot(start).abilities.keys()];
  if (abilities.length >= 2) {
    act(
      'connect abilities',
      (c) =>
        c.createConnection({
          from: new EntityRef('ability', abilities[0]),
          to: new EntityRef('ability', abilities[1]),
          type: 'upgrades-to',
        }).raw,
    );
  }
  act(
    'connect bad ability',
    (c) => c.createConnection({ from: new EntityRef('entry', first), to: new EntityRef('ability', 'noslash') }).raw,
  );
  act(
    'update connection',
    (c) =>
      c.updateConnection(lastLink(c), {
        type: ' ',
        label: ' L ',
        reverseLabel: ' R ',
        notes: ' N ',
        canon: { value: null },
        how: ' ',
        endHow: 'lost',
      }).raw,
  );
  act(
    'update connection 2',
    (c) => c.updateConnection(lastLink(c), { canon: { value: 'retconned' }, how: 'won' }).raw,
  );
  act('remove connection', (c) => {
    const rows = c.rows('loreLinks');
    c.removeConnection(rows.length === 0 ? 'none' : str(rows[0]['id']));
    return c.rows('loreLinks').map((r) => r['id']);
  });
  act('unlink missing', (c) => {
    c.unlink('nope');
    return null;
  });
  act('add kinds', (c) => c.addKinds(template).map((k) => k.raw));
  act('add kinds again', (c) => c.addKinds(template).map((k) => k.raw));
  act('add linked kinds', (c) =>
    c
      .addKinds([
        {
          key: 'cells',
          name: 'Cells',
          fields: [
            { id: 'm', name: 'Members', type: 'references', target: 'agents', required: true },
            { id: 'l', name: 'Leader', type: 'reference', target: 'character' },
          ],
          uses: { graphLinks: ['m', 'l', 'zz'], rank: 'm' },
        },
        { key: 'agents', name: 'Agents', fields: [] },
        { key: 'agents', name: ' ', fields: [] },
        {
          key: 'location',
          builtin: true,
          name: 'whatever',
          fields: [
            { name: 'type', type: 'text' },
            { name: 'Climate', type: 'select', options: ['Hot'] },
          ],
          uses: { map: { x: 'zz' } },
        },
      ])
      .map((k) => k.raw),
  );
  act('schema', (c) => c.schemaSnapshot());
  act('archived kind', (c) => {
    const k = c.saveCategory(null, () => ({ name: 'Starships', archived: true, color: '' }));
    return c.createEntry(k.key).raw;
  });
  return { results, writes: writes(start, s) };
}

function timelineReport(s: NovelSnapshot): unknown {
  const m = StoryModel.fromSnapshot(s);
  const cal = m.calendar;
  const orders = twoOrders(m);
  const telling = (t: StoryTelling) => [t.eventId, t.nodeId, t.role, t.storyRank, t.readingRank, t.back, t.ahead];
  return {
    chronology: resolveChronology(m.events.values(), cal).map((p) => [
      p.event.id,
      p.value,
      p.year,
      p.anchored,
      p.label,
      p.issues,
    ]),
    orders: {
      events: orders.events.map((e) => [e.id, e.title, e.when, e.storyRank, ...e.tellings.map(telling)]),
      nodes: orders.nodes.map((n) => [n.id, n.label, n.readingRank, ...n.tellings.map((t) => `${t.eventId}@${t.nodeId}`)]),
      tellings: orders.tellings.map(telling),
      words: orders.tellings.map((t) => [orderWords(t), tellingWords(t, m)]),
      placed: orders.placed,
      linear: orders.linear,
    },
    notes: tellingNotes(orders, m).map((n) => [`${n.telling.eventId}@${n.telling.nodeId}`, n.note]),
    summary: orderSummary(orders),
    labels: [...m.nodes.keys()].map((id) => nodeLabel(m, id)),
    calendar: calendarReport(cal),
  };
}

function miscReport(): unknown {
  const cals = [Calendar.standardCalendar, Calendar.fromJson(customCalendar)];
  const samples: unknown[] = [
    { precision: 'exact', year: 10, month: 2, day: 31, hour: 25, minute: 70 },
    { precision: 'exact', year: '12', month: '13', day: 3 },
    { precision: 'exact', year: 2.5, month: 2.5, day: 1.5, hour: 0.5 },
    { precision: 'exact', year: -2.5, month: 1, day: 40, hour: 19, minute: null },
    { precision: 'exact', year: ' 0x1F ', month: 1, day: 1, hour: 12, minute: 5 },
    { precision: 'exact', year: 9999999.4, month: 10, day: 41, hour: 0, minute: 0 },
    { precision: 'exact', year: 10000000 },
    { precision: 'approximate', year: 7, month: 0, season: 'winter' },
    { precision: 'approximate', year: 7, month: 3, season: 'winter' },
    { precision: 'approximate', year: -0.5 },
    { precision: 'approximate', year: null },
    { precision: 'relative', anchorId: '', amount: -3, unit: 'fortnights', direction: 'sideways' },
    { precision: 'relative', anchorId: 'x', amount: '2.5', unit: 'weeks', direction: 'after' },
    { precision: 'relative', anchorId: 'x', amount: 'Infinity', unit: 'days' },
    { precision: 'nonsense' },
    null,
    'text',
  ];
  const formatted: unknown[] = [
    { precision: 'exact', year: 1020, month: 5, day: 4, hour: 0, minute: 5 },
    { precision: 'exact', year: 1020, month: 5, day: 4, hour: 13, minute: null },
    { precision: 'exact', year: 1020, month: 5, day: 4, hour: 12, minute: 0 },
    { precision: 'exact', year: 1020, month: 5, day: 4, hour: -1, minute: -5 },
    { precision: 'exact', year: 1020.5, month: 0, day: 4, hour: 3 },
    { precision: 'exact', year: 1500, month: 14, day: 0, hour: 3 },
    { precision: 'approximate', year: 1001, month: 2, season: null },
    { precision: 'approximate', year: 1001.25, month: null, season: 'autumn' },
    { precision: 'approximate', year: -3, month: null, season: null },
    { precision: 'relative', anchorId: 'a', amount: 1.5, unit: 'years', direction: 'before' },
    { precision: 'relative', anchorId: 'gone', amount: 1, unit: 'days', direction: 'after' },
    { precision: 'relative', anchorId: null, amount: 1234567.891, unit: 'minutes', direction: 'after' },
    { precision: 'unknown' },
    null,
  ];
  const calendarInputs: JsonMap[] = [
    customCalendar,
    { ...customCalendar, kind: 'standard' },
    {
      ...customCalendar,
      name: ' ',
      months: [{ name: 'A', days: 0 }, { name: 'a', days: 1.5 }, 'x', { name: '  ', days: 2000 }],
      hoursPerDay: 0,
      daysPerWeek: 200,
      eras: [{ name: '', startYear: 5 }, { name: 'B', startYear: 5 }, { name: 'C', startYear: 'x' }, 7],
      seasons: { spring: 0, summer: 3, autumn: 1, winter: 1 },
    },
    { kind: 'standard', name: 'x', months: [], hoursPerDay: 0, daysPerWeek: 0, eras: [], seasons: {} },
    {
      kind: 'custom',
      name: 'One',
      months: [{ name: 'Only', days: 1 }],
      hoursPerDay: 1,
      daysPerWeek: 1,
      eras: [],
      seasons: { spring: 1, summer: 1, autumn: 1, winter: 1 },
    },
    { kind: 'custom' },
  ];
  const numbers = [
    0, 1, -1, 0.5, -0.5, 0.0005, -0.0005, 0.0004, 1234, 12345.6789, -9876543.21, 1e15, 0.1 + 0.2, 2.675, 1.0005,
    999.9995, 1e-7, 1 / 3, 2 / 3, 100, 1000000, 400, 410.5,
  ];
  const numberTexts = [
    '', '0', '42', ' 1e3 ', '0xFF', '0XfF', '0o17', '0b101', '0b2', '0x', '1.', '.5', '-.5', '+3', '1e', 'Infinity',
    '-Infinity', 'NaN', '1_000', '0x10000000000000000', '0x7FFFFFFFFFFFFFFF', '9223372036854775807', '1,000', '٣',
  ];
  const defs = [
    new FieldDef({ id: 'd', name: 'Power', type: 'number', options: [], min: 1, max: 10.5 }),
    new FieldDef({ id: 'd', name: 'Power', type: 'number', options: [], min: -1e21 }),
    new FieldDef({ id: 'd', name: 'When', type: 'date', options: [], required: true }),
    new FieldDef({ id: 'd', name: 'Kind', type: 'select', options: ['Low', 'High'] }),
    new FieldDef({ id: 'd', name: 'Kinds', type: 'multiselect', options: ['Fire', 'Ash'] }),
    new FieldDef({ id: 'd', name: 'On', type: 'toggle', options: [] }),
    new FieldDef({ id: 'd', name: 'Who', type: 'reference', options: [], target: 'character' }),
    new FieldDef({ id: 'd', name: 'Whom', type: 'references', options: [] }),
    new FieldDef({ id: 'd', name: 'Odd', type: 'hologram', options: [], required: true }),
  ];
  const values = [
    '', ' ', '5', '0.5', '11', '1e400', '-1e22', '0x0A', 'many', '2024-02-29', '2023-02-29', '0000-02-29', '1900-02-29',
    '2000-13-01', '2024-04-31', 'yes', 'Yes', 'Low', 'Mid', 'Fire\nSmoke\n\nDust', 'mira', 'keep', 'mira\nkeep\ngone',
  ];
  const entries = new Map([
    ['mira', new Entry({ id: 'mira', category: 'character', name: 'Mira' })],
    ['keep', new Entry({ id: 'keep', category: 'location', name: 'The Keep' })],
  ]);
  const texts = [
    'Émile Ångström',
    'İstanbul ΣΑΣ Straße',
    'Йорк Øster Łódź',
    'é',
    'ﬁre ﬂy Ǆ ǅ',
    'Ŧhe Ωmega ᾼ ᾨ',
    'がぎ パ',
    '한국어',
    '  Max   Health!! ',
    '___',
    '',
    'Café-au-lait 2nd',
  ];
  const sortable = ['zed', 'Émile', 'bran', 'Anna', 'emile', 'Bran', '10 Kings', '#tag', 'ébène', 'Ébène', 'Zoë', 'zoe'];
  let defIds = 0;
  const all = [...formatted, ...samples];
  return {
    normalized: cals.map((c) => samples.map((x) => normalizeDate(x, c))),
    formatted: cals.map((c) => all.map((d) => formatDate(EventDate.fromJson(d), (id) => (id === 'a' ? 'the Siege' : null), c))),
    spans: cals.map((c) =>
      all.map((d) => {
        const when = EventDate.fromJson(d);
        return when === null ? 'unread' : [span(c.spanOf(when)), c.dateProblem(when)];
      }),
    ),
    calendars: calendarInputs.map((i) => ({
      problems: calendarProblems(i),
      cleaned: (() => {
        try {
          return cleanCalendar(i);
        } catch (e) {
          if (!(e instanceof ChangeRefused)) throw e;
          return `refused: ${e.message}`;
        }
      })(),
      settings: calendarSettingsOf(i),
      calendar: calendarReport(Calendar.fromJson(i)),
    })),
    defaults: [startingCalendar(), defaultCalendarSettings(), calendarSettingsOf(null)],
    localeNumber: numbers.map(localeNumber),
    jsNum: numbers.map(jsNum),
    jsRound: numbers.map(jsRound),
    unitLabel: timeUnits.map((u) => [unitLabel(1, u), unitLabel(2.5, u), unitLabel(1000, u)]),
    ordinal: [0, 1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, -1, -11].map(ordinal),
    jsNumber: numberTexts.map(jsNumber),
    numTryParse: numberTexts.map(dartNumTryParse),
    checkValue: defs.map((d) =>
      values.map(
        (v) => checkValue(d, v, entries, { categoryName: (k) => (k === 'character' ? 'Characters' : k) })?.message ?? null,
      ),
    ),
    checkKinds: defs.map((d) => values.map((v) => checkValue(d, v, entries)?.problem ?? null)),
    display: [...fieldTypes, null].map((t) => values.map((v) => displayValue(t, v, (id) => entries.get(id)?.name ?? null))),
    splitChoices: values.map(splitChoices),
    images: [
      'https://example.com/a.png',
      'http://x',
      'HTTPS://X.COM/A B',
      'data:image/jpeg;base64,AAAA',
      'data:image/svg+xml;base64,AAAA',
      'javascript:alert(1)',
      '',
      5,
      null,
      `data:image/png;base64,${'A'.repeat(2000000)}`,
    ].map(normalizeImage),
    cleanList: cleanList([' a', 'a ', '', 3, null, 'b', '  ', 'B']),
    cleanOptions: cleanOptions([' x ', 'x', '', 5, 'y'.repeat(70), ...Array.from({ length: 120 }, (_, i) => `o${i}`)]),
    cleanDefs: cleanDefs(
      [
        { id: 'a', name: 'Rank', type: 'number', min: ' 2 ', max: '0x10', required: true, help: 'h'.repeat(300) },
        { name: 'x'.repeat(80), type: 'select', options: 'not a list', archived: true, required: 'yes' },
        { id: '', name: 5, type: 'reference', target: 'character', future: [1, 2] },
        { id: 'r', name: 'R', type: 'text', target: 'character', min: 1 },
        { id: 'n', name: 'N', type: 'number', min: 'Infinity', max: 'NaN' },
        null,
      ],
      () => `def${++defIds}`,
    ),
    uses: [
      null,
      {},
      'x',
      { timeline: { start: 'a', end: 'zz' } },
      { map: { x: 'a', y: 'b' }, rank: 'c', tree: true },
      { ownership: { type: '  owns  ', field: 'b' }, graphLabel: 'a', graphLinks: ['a', 'a', 'zz', 'c', 5] },
      { ownership: { type: '   ' }, graphLinks: [] },
      { rank: 'zz', timeline: { start: 'zz' }, tree: 'yes', extra: 1 },
      { ownership: { type: 'x'.repeat(80) } },
    ].map((raw) => [
      cleanUses(raw, ['a', 'b', 'c']),
      remapUses(cleanUses(raw, ['a', 'b', 'c']), (id) => (id === 'c' ? null : `${id}2`)),
      mergeUses(cleanUses(raw, ['a', 'b', 'c']), { rank: 'q', tree: true }),
    ]),
    merged: [
      mergeUses(null, { rank: 'a' }),
      mergeUses({ rank: 'a' }, null),
      mergeUses({ rank: 'a', tree: true, map: null }, { rank: 'b', map: { x: 'a' } }),
      mergeUses({}, {}),
    ],
    fold: texts.map((t) => [foldText(t), nfkdWords(t), toFormulaKey(t)]),
    foldAll: foldText(String.fromCharCode(...Array.from({ length: 0x3100 - 0x80 }, (_, i) => 0x80 + i))),
    sorted: [...sortable].sort(localeCompare),
    connectionTypes: [null, '', ' ', 'owns', ' owns ', 'excludes', 'considers-rival', 'made up'].map((k) => {
      const t = connectionType(k);
      return [t.key, t.label, t.inverse === ConnectionType.same ? 'same' : t.inverse, t.reciprocal];
    }),
    refs: ['entry:x', 'ability:a/b', 'planet:x', ':x', 'node:', 'nonsense', 'event:a:b'].map(
      (k) => EntityRef.parse(k)?.toJson() ?? null,
    ),
    refsJson: [{ type: 'node', id: 'n' }, { type: 'node', id: 5 }, { type: 'x', id: 'n' }, 'x'].map(
      (j) => EntityRef.fromJson(j)?.key ?? null,
    ),
    builtins: builtinCategoryKeys.map((k) => Category.builtin(k).raw),
    unknownCategory: Category.unknown('zz').raw,
    dates: all.map((d) => EventDate.fromJson(d)?.toJson() ?? null),
    durations: [{ amount: 2, unit: 'days' }, { amount: '2', unit: 'days' }, { amount: 2, unit: 'fortnights' }, null].map(
      (d) => EventDuration.fromJson(d)?.toJson() ?? null,
    ),
    anchors: [
      { kind: 'node', nodeId: 'n' },
      { kind: 'node', nodeId: ' ' },
      { kind: 'event', eventId: 'e', extra: 1 },
      { kind: 'date', when: { precision: 'relative', anchorId: 'e', amount: 1, unit: 'days' } },
      { kind: 'date', when: 'x' },
      { kind: 'sometime' },
      'x',
    ].map((a) => {
      const x = Anchor.fromJson(a);
      return [x === null ? null : x.constructor.name, x?.raw ?? null, anchorIds(new Validity(x, null))];
    }),
    branches: ['main', 'non-canon', 'abandoned', 'weird', null].map((st) => {
      const b = new BranchRecord({ id: 'b', parentId: ' ', forkNodeId: 'n', forkLabel: 'Ch 1', status: st });
      return [b.parentId, b.forkNodeId, b.forkLabel, b.status, branchStatusLabel[b.status], branchStatusHint[b.status], b.note];
    }),
    novelStatus: ['planning', 'on-hold', 'onHold', null].map((st) => new Novel({ id: 'n', status: st }).status),
    blankSheet: blankSheet({ id: 's', projectId: 'p', systemId: 'sys', entryId: 'e', now: 5 }),
  };
}

/** Every output, keyed as dump.dart keys them. */
export function outputsOf(name: string, s: NovelSnapshot, template: JsonMap[]): Record<string, unknown> {
  return {
    [`${name}.model`]: plain(modelReport(s)),
    [`${name}.validity`]: plain(validityReport(s)),
    [`${name}.connections`]: plain(connectionsReport(s)),
    [`${name}.deletes`]: plain(deleteReport(s)),
    [`${name}.codex`]: plain(codexReport(s)),
    [`${name}.changes`]: plain(changesReport(s, template)),
    [`${name}.timeline`]: plain(timelineReport(s)),
    [`${name}+calendar.timeline`]: plain(timelineReport(withCalendar(s))),
    [`${name}+calendar.validity`]: plain(validityReport(withCalendar(s))),
  };
}

export function miscOutputs(): unknown {
  return plain(miscReport());
}

/** The template the changes report adds to every novel: the `kinds` fixture's kinds. */
export function kindsTemplate(kinds: NovelSnapshot): JsonMap[] {
  return kinds.rows('loreSchemas').map((r) => CodexChanges.kindTemplate(new Category(r)));
}
