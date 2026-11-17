// The pure parts of Records by kind (flutter_app/lib/features/kinds/kinds_view_page.dart): its words, the line saying
// how a kind is set up, the CSV's file name, and recording who holds a record (the holder editor's change).

import { fieldOf, type KindView, kindViewLabel, readyViews } from '../../codex/capabilities';
import { type CodexChanges } from '../../codex/codexChanges';
import { type JsonMap, mapOrNull, str } from '../../json';
import { EntityRef } from '../../model/entityRef';
import { type StoryModel } from '../../model/storyModel';
import { RelationChanges } from '../../relationships/relationChanges';
import { plural } from '../../desk/format';
import { type Category } from '../../records/category';
import { strings } from '../../records/jsonRecord';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type Holding } from '../kinds';

/** What each drawing is called beside its list. */
export const drawnLabel: Readonly<Record<KindView, string>> = { timeline: 'Timeline', map: 'Map', rank: 'Ladder', ownership: 'Holders' };

/** A way to show a kind, as its chip says it. */
export const showChip = (v: KindView | null, ready: readonly KindView[]): string =>
  v === null ? 'Table' : `${kindViewLabel[v]}${ready.includes(v) ? '' : ' · not set up'}`;

export const kindsWords = {
  title: 'Records by kind',
  noKinds: { title: 'No kinds of record yet', message: 'Add one under Organize → World → Categories & fields.', action: 'Open Categories & fields' },
  noRecords: (name: string) => ({ title: `No ${dartToLowerCase(name)} yet`, message: 'Add them under Organize → World.', action: 'Open the world' }),
  cantShow: (name: string, v: KindView) => `${name} can’t be shown ${dartToLowerCase(kindViewLabel[v])} yet:`,
  setUp: (name: string) => `Set it up under Categories & fields (${name} → Visualizations). Meanwhile, here is the table.`,
  openSettings: 'Open Categories & fields',
  kind: 'Kind of record',
  download: 'Download the table (CSV)',
  ways: 'Ways to show it',
  list: 'List',
  change: 'Change this in Categories & fields',
  tableLabel: (name: string, n: number) => `${name}: ${n} ${n === 1 ? 'record' : 'records'}, a row each`,
  noDates: 'None of the records shown has a date that can be placed.',
  timelineLabel: (name: string) => `${name} on the story’s timeline, in story order`,
  noPoints: 'None of the records shown has both numbers.',
  across: (axis: string) => `${axis} (across)`,
  up: (axis: string) => `${axis} (up)`,
  ranksLabel: (name: string, field: string) => `${name} by ${field}, highest first`,
  none: 'none',
  holdersLabel: (name: string, type: string) => `${name} and who holds them (${type})`,
  noHolding: 'No holding recorded',
  selectToRecord: 'Select a record to record who holds it, beside the view.',
  notDrawn: (what: string, n: number) => `Not ${what} (${n})`,
  untitled: 'Untitled',
  fit: 'Fit to view',
} as const;

/** The line under the chips: how many records, the ways it is set up to be shown, and how the knowledge graph has it. */
export function kindLine(category: Category, count: number): string {
  const ready = readyViews(category);
  const graphLabel = fieldOf(category, 'graphLabel', category.uses['graphLabel']);
  const links = Array.isArray(category.uses['graphLinks']) ? strings(category.uses['graphLinks']) : null;
  const graphWords =
    category.raw['graph'] === false
      ? 'left out of the knowledge graph'
      : 'in the knowledge graph' +
        (graphLabel !== null ? `, labelled by ${graphLabel.name}` : '') +
        (links !== null
          ? `, drawing ${
              links.length === 0
                ? 'none of its link fields'
                : category.fields
                    .filter((f) => links.includes(f.id))
                    .map((f) => f.name)
                    .join(', ')
            }`
          : '');
  return (
    `${category.name}: ${plural(count, 'record')}. Set up to be shown ` +
    `${ready.length === 0 ? 'only as a table' : ready.map((v) => dartToLowerCase(kindViewLabel[v])).join(', ')}; ${graphWords}.`
  );
}

/** The CSV's file name: the kind's name in lower-case letters and digits, dashes between. */
export function csvName(category: Category): string {
  const slug = dartToLowerCase(dartTrim(category.name)).replace(/[^a-z0-9]+/g, '-');
  const trimmed = slug.replace(/^-+|-+$/g, '');
  return `${trimmed.length === 0 ? 'records' : trimmed}.csv`;
}

export const holderWords = {
  title: (name: string) => `Record who holds ${name}`,
  holder: 'Holder',
  choose: 'Choose…',
  nobody: 'Nobody: it stops being held',
  from: 'From',
  start: 'The start of the story',
  event: (title: string) => `Event: ${title}`,
  record: 'Record it',
} as const;

/** "n:<id>" for a chapter or scene, "e:<id>" for an event, "" for the start: as the editor's chooser holds it. */
export function holderAnchor(when: string): JsonMap | null {
  if (when.startsWith('n:')) return { kind: 'node', nodeId: when.substring(2) };
  if (when.startsWith('e:')) return { kind: 'event', eventId: when.substring(2) };
  return null;
}

/** Records who holds `entryId` from `when` (the holder editor's press): nobody (ending what is held), a new holder
 * where one holds it now (the holding passes), or a first holder. Returns what is said, or throws what the author must
 * choose first (said as it is). Runs inside a change. */
export function recordHolder(
  c: CodexChanges,
  model: StoryModel,
  entryId: string,
  holder: string,
  when: string,
  open: readonly Holding[],
): string {
  const entry = model.entries.get(entryId)!;
  const category = model.categories.get(entry.category)!;
  const type = str(mapOrNull(category.uses['ownership'])?.['type']);
  const at = holderAnchor(when);
  const relate = <T>(apply: (r: RelationChanges) => T): T => {
    const r = new RelationChanges(c.snapshot, { now: c.now, createId: () => c.newId() });
    const result = apply(r);
    c.snapshot = r.snapshot;
    return result;
  };
  if (holder === 'nobody') {
    if (open.length === 0) throw new Error(`Nobody is recorded as holding ${entry.name} now.`);
    if (at === null) throw new Error('Choose when it stops being held.');
    relate((r) => {
      for (const h of open) r.endConnection(h.connection.source.id, at);
    });
    return `Recorded: nobody holds ${entry.name} from then on.`;
  }
  const name = model.entries.get(holder)?.name ?? 'They';
  if (open.length === 1) {
    if (at === null) throw new Error(`Choose when it passes to them: ${open[0].holderName} holds it until then.`);
    relate((r) => r.changeConnection(open[0].connection.source.id, at, { fromId: holder }));
    return `Recorded: ${name} holds ${entry.name} from then on.`;
  }
  relate((r) => {
    const link = r.createConnection({ from: new EntityRef('entry', holder), to: new EntityRef('entry', entry.id), type });
    if (at !== null) r.startConnectionAt(link.id, at);
    return link;
  });
  return `Recorded: ${name} holds ${entry.name}${at !== null ? ' from then on' : ''}.`;
}
