// Scriptor's outputs for the world, keyed and shaped exactly as dump.dart makes the Flutter app's (see there): what
// each chapter names, what the pages name that the world lacks and the cards made of it, the place tree, the chart
// (laid out with the same stand-in for measured text), the shelves and the encyclopedia, each entry's page, the charter
// begun on the novel; and `misc`.

import { CharacterProfile } from '../../../../src/domain/characters/characterRecords';
import { namesToFind } from '../../../../src/domain/characters/namedIn';
import { CodexChanges, relatedTo } from '../../../../src/domain/codex/codexChanges';
import { entryReferences } from '../../../../src/domain/codex/codexService';
import { checkValue } from '../../../../src/domain/codex/fieldValues';
import { presentIn } from '../../../../src/domain/codex/inChapter';
import { worldFinds, worldKey } from '../../../../src/domain/codex/worldFinder';
import { deleteDialog } from '../../../../src/domain/codex/screens/entryPage';
import { foundInPages } from '../../../../src/domain/codex/screens/foundInPages';
import {
  articleOf,
  chaptersMentioning,
  fileByLetter,
  letterOf,
} from '../../../../src/domain/codex/screens/world';
import {
  type ChartPlace,
  type LayoutLabel,
  type Laid,
  chartLabels,
  layOutChart,
  seaMarks,
  seedOf,
  shorePoints,
  worldChartOf,
} from '../../../../src/domain/codex/screens/worldChart';
import { foundWorld } from '../../../../src/domain/codex/screens/worldCharter';
import { localeCompare } from '../../../../src/domain/collation';
import { str } from '../../../../src/domain/json';
import { dartSort } from '../../../../src/domain/manuscript/dartSort';
import { StoryModel } from '../../../../src/domain/model/storyModel';
import { readingOrder } from '../../../../src/domain/model/storyOrder';
import { placeTree } from '../../../../src/domain/places/explore';
import { MapPin, PlaceSettings } from '../../../../src/domain/places/places';
import { blockTexts } from '../../../../src/domain/prose';
import { stableSorted } from '../../../../src/domain/reader/stableSort';
import { Category } from '../../../../src/domain/records/category';
import { Entry, viewFields } from '../../../../src/domain/records/entry';
import type { NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';

/** The same stand-in for measured text as dump.dart's `fakeWidth` / `FakeText`. */
export const fakeWidth = (text: string, size: number, spacing: number) => text.length * size * 0.55 + text.length * spacing;
export const fakeLayout: LayoutLabel = (text, style) => {
  const raw = fakeWidth(text, style.size, style.letterSpacing);
  const lines = raw <= style.maxWidth ? 1 : Math.ceil(raw / style.maxWidth);
  return { width: Math.min(raw, style.maxWidth), height: Math.min(lines, style.maxLines) * style.size * 1.1, exceeded: lines > style.maxLines };
};

/** dump.dart's `rounded`: a number that is not whole, to nine significant places. */
export function rounded(v: unknown): unknown {
  if (typeof v === 'number') return Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(9)) : v;
  if (Array.isArray(v)) return v.map(rounded);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, rounded(x)]));
  }
  return v;
}

const fmt = (n: number) => {
  const s = `${Math.abs(n)}`;
  let out = n < 0 ? '-' : '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
};
const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const pt = (p: { x: number; y: number }) => [p.x, p.y];

const placeJson = (p: ChartPlace): unknown => ({
  id: p.entry.id,
  depth: p.depth,
  chapters: p.chapters,
  seals: p.seals.map((e) => e.id),
  children: p.children.map(placeJson),
});

const laidJson = (l: Laid, caps: boolean) => ({
  height: l.height,
  sea: l.sea,
  compact: l.compact,
  drawn: l.drawn.map((d) => ({ id: d.place.entry.id, centre: pt(d.centre), r: d.r })),
  seals: l.seals.map((s) => ({ id: s.entry.id, at: pt(s.at), r: s.r, more: s.more })),
  adrift: l.adrift.map((s) => ({ id: s.entry.id, at: pt(s.at), r: s.r, more: s.more })),
  labels: chartLabels(l.drawn, { caps, layout: fakeLayout }).map((x) => ({
    id: x.id,
    text: x.text,
    size: x.size,
    at: pt(x.at),
    width: x.width,
    height: x.height,
  })),
  shores: l.drawn.map((d) => {
    const points = shorePoints(d.centre, d.r, seedOf(d.place.entry.id), d.place.depth === 0 ? 0.06 : 0.035);
    const half = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x * (1 - 0.5) + b.x * 0.5, y: a.y * (1 - 0.5) + b.y * 0.5 });
    const n = points.length;
    return [half(points[n - 1], points[0]), ...points, ...points.map((p, i) => half(p, points[(i + 1) % n]))].map(pt);
  }),
});

export function reads(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const entries = s.rows('loreEntries').map((r) => new Entry(r)).sort((a, b) => byCodeUnits(a.id, b.id));
  const profiles = new Map(s.rows('characterProfiles').map((r) => [str(r['entryId']), new CharacterProfile(r)]));
  const names = namesToFind(entries, profiles);
  const nameMap = new Map(Object.entries(names));
  const contents = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r]));

  const present: unknown[] = [];
  for (const node of readingOrder(model.nodes.values())) {
    const row = contents.get(node.id);
    if (row === undefined) continue;
    const links = new Map<string, number>();
    for (const id of node.mentions) links.set(id, (links.get(id) ?? 0) + 1);
    present.push([node.id, presentIn(blockTexts(row['doc']), nameMap, { links }).map((p) => [p.id, p.mentions])]);
  }

  const known = new Set<string>();
  for (const e of entries) known.add(worldKey(e.name));
  for (const p of profiles.values()) for (const a of p.aliases) known.add(worldKey(a));
  const chaptersIn: [number, string[]][] = [];
  for (const row of s.rows('chapterContents')) {
    const number = model.order.chapterNumber.get(str(row['id']));
    if (number !== undefined) chaptersIn.push([number, blockTexts(row['doc'])]);
  }
  const finds = worldFinds(chaptersIn, { known, limit: 40 });
  const cards = foundInPages(finds, null, model.categories, true)?.cards.map((c) => c.line) ?? [];

  const settingsRows = s.rows('placeSettings');
  const tree = placeTree(model, {
    settings: settingsRows.length === 0 ? null : new PlaceSettings(settingsRows[0]),
    pins: s.rows('mapPins').map((r) => new MapPin(r)),
  });

  const chapters = chaptersMentioning(model.nodes.values(), model.order);
  const chart = worldChartOf(model, chapters);

  const shelfKinds = dartSort(
    [...model.categories.values()].filter((c) => c.key !== 'character'),
    (a, b) => (a.order !== b.order ? (a.order < b.order ? -1 : 1) : localeCompare(a.name, b.name)),
  );
  const all = stableSorted(
    entries.filter((e) => e.category !== 'character'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const tags = dartSort([...new Set(all.flatMap((e) => e.tags))], localeCompare);
  const kindOf = (e: Entry) => model.categories.get(e.category) ?? Category.unknown(e.category);
  const count = model.order.chapters.length;

  const categoryNames = new Map([...model.categories.values()].map((c) => [c.key, c.name]));
  const position = model.order.position;
  const pages = all.map((e) => {
    const kind = kindOf(e);
    const view = viewFields(e, kind);
    return {
      id: e.id,
      fields: view.category.map(([def, field]) => [
        `${def.name}${def.required ? ' *' : ''}`,
        checkValue(def, field?.value ?? '', model.entries, { categoryName: (k) => categoryNames.get(k) ?? k })?.message ?? null,
      ]),
      archived: view.archived.map(([def, field]) => [def.name, field.value]),
      own: view.own.map((f) => str(f.raw['key'])),
      related: relatedTo(e.id, model.entries.values(), model.links).map((r) => [r.linkId, r.entry.id, r.label, r.theirLabel]),
      figures: stableSorted(
        [...model.nodes.values()].filter((n) => n.mentions.includes(e.id)),
        (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
      ).map((n) => n.id),
      events: [...model.events.values()].filter((ev) => ev.locationId === e.id || ev.entryIds.includes(e.id)).map((ev) => ev.name),
      threads: [...model.threads.values()].filter((t) => t.locationIds.includes(e.id)).map((t) => t.title),
      delete: deleteDialog(entryReferences(s, e.id), e, kind).message,
    };
  });

  let n = 0;
  const x = new CodexChanges(s, { now: 0, createId: () => `made-${++n}` });
  const made = foundWorld(
    x,
    new Map([
      ['location', '  Harrowmere '],
      ['faction', 'The Salt Court'],
      ['item', ''],
      ['power', 'Bloodsong'],
      ['lore', 'the Long Winter'],
    ]),
  );
  const madeIds = new Set(Array.from({ length: n }, (_, i) => `made-${i + 1}`));

  const laid: Record<string, unknown> = {};
  if (chart.islands.length > 0) {
    for (const w of [390, 1000]) {
      for (const caps of [false, true]) {
        laid[`${w}${caps ? 'caps' : ''}`] = laidJson(layOutChart(w, chart, { caps, measure: fakeWidth }), caps);
      }
    }
  }

  return {
    present,
    finds: finds.map((f) => [f.name, f.kind, f.why, f.times, f.chapters, f.first]),
    cards,
    tree: tree.map((r) => ({
      id: r.entry.id,
      depth: r.depth,
      parent: r.parentId,
      children: r.childIds,
      level: r.levelWords,
      events: r.events,
      within: r.eventsWithin,
      characters: r.characters,
      factions: r.factions,
      chapters: r.chapters,
      maps: r.maps,
      notes: r.notes,
    })),
    chart: { islands: chart.islands.map(placeJson), adrift: chart.adrift.map((e) => e.id) },
    laid: chart.islands.length === 0 ? null : laid,
    shelves: {
      kinds: shelfKinds.map((k) => k.key),
      all: all.map((e) => e.id),
      tags,
      letters: fileByLetter(all).map(([letter, list]) => [letter, list.map((e) => e.id)]),
      where: all.map((e) => articleOf(e, kindOf(e), chapters.get(e.id) ?? new Set(), count).where),
    },
    pages,
    charter: {
      made,
      entries: x.snapshot.rows('loreEntries').filter((r) => madeIds.has(str(r['id']))).map((r) => [r['id'], r['name'], r['category']]),
      links: x.snapshot.rows('loreLinks').filter((r) => madeIds.has(str(r['fromId']))).map((r) => [r['fromId'], r['toId'], r['fromLabel']]),
    },
  };
}

/** The sea's marks as numbers, read back from their paths: each wave's point and half-width. */
function seaNumbers(width: number, height: number): number[][] {
  return seaMarks(width, height).map((d) => {
    const nums = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
    // M x-w y Q … x y …: the middle point is the 5th and 6th numbers; w from the first.
    const x = nums[4];
    const y = nums[5];
    return [x, y, x - nums[0]];
  });
}

export function misc(): Record<string, unknown> {
  const names = new Map<string, string[]>([
    ['wren', ['Wren Hollis', 'Wren']],
    ['bird', ['wren']],
    ['obrien', ["O'Brien", 'O’Brien']],
    ['mj', ['Mary-Jane']],
    ['kai', ['Kai']],
    ['droid', ['3PO']],
    ['cafe', ['Café Noir']],
    ['stars', ['***']],
    ['empty', ['  ', '']],
    ['none', ['Nobody Here']],
  ]);
  const cases = [
    ['Wren Hollis came. Wren sat; a wren sang.'],
    ["O'Brien and O’Brien met Mary-Jane, not Mary or Jane."],
    ['Kai2 is not Kai, but Kai is; Kaiser is not.'],
    ['3PO spoke. R3PO did not. 3PO.'],
    ['At the Café Noir, the café noir.', 'Then *** and then ***.'],
    ['', 'Nothing here names anyone.'],
  ];
  const texts = [
    'That was James, flying towards the nearest city; he cut through the Mimir Forest to do so.',
    'For now, James was flying by using the Smart Atoms skill.',
    'The Salt Guild sent its factors. House Vane said nothing. She kept the Brass Compass close.',
    'They sailed to the Isle of Skye, past Mount Ash, to the Order of the Rose.',
    'The Forest was dark. The Provost’s power was absolute. They spoke of Vell, Tower and all.',
    'This skill was new. Water spell or not, it held. His Fireball spell burned. She knew the old Frost spell.',
    'Into the Mimir Forest. The Drowned Road rose. Down the Glass River’s banks, to the Iron Gate of Old Merrow.',
    '“The Lantern Guild!” she cried. Mt Doom’s fires. The Sword of Dawn, the Crown of Ash; Castle Grey.',
    'Élan Spire and the Øresund Bridge. ÉCOLE Society. A van der Berg Company. Order of de Rose.',
  ];
  const links = new Map([
    ['kai', 5],
    ['linkedOnly', 2],
  ]);
  return {
    present: cases.flatMap((p) => [
      presentIn(p, names).map((x) => [x.id, x.mentions]),
      presentIn(p, names, { links }).map((x) => [x.id, x.mentions]),
    ]),
    finds: [
      ...texts.map((t, i) => worldFinds([[i + 1, [t]]]).map((f) => [f.name, f.kind, f.why, f.times, f.chapters, f.first])),
      worldFinds(
        texts.map((t, i): [number, string[]] => [i + 1, [t, t]]),
        { limit: 40 },
      ).map((f) => [f.name, f.kind, f.times, f.chapters, f.first]),
    ],
    keys: ['The Drowned Road', "Merrow's Bell", '  the   Glass  River ', 'Mt’s O’Neil'].map(worldKey),
    letters: ['Élan Spire', '7 Bells', '  ash', 'Øresund', '', '#hash', 'ßand'].map(letterOf),
    sea: [seaNumbers(390, 500), seaNumbers(1000, 600)],
    seeds: ['a', 'place-1', 'f3a9c0de-1234-4abc-9def-0123456789ab'].map(seedOf),
  };
}

export { fmt };
