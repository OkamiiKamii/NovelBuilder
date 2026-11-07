import { describe, expect, it } from 'vitest';
import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { buildModel } from '@/modules/model/model';
import type { TimelineEvent } from '@/modules/timeline/types';
import { exportFileName, filterWords, NOT_A_BACKUP, tablesCsv, viewRecords } from './exportView';

const entry = (id: string, name: string, category: string, notes = ''): LoreEntry => ({ id, projectId: 'p', category, name, summary: '', description: '', image: null, notes, tags: [], fields: [], createdAt: 0, updatedAt: 0 }) as LoreEntry;
const link = (id: string, fromId: string, toId: string, type: string): LoreLink => ({ id, projectId: 'p', fromId, toId, fromLabel: '', toLabel: '', createdAt: 0, type }) as LoreLink;
const node = (id: string, title: string, order: number, notes = ''): StoryNode => ({ id, projectId: 'p', parentId: null, kind: 'chapter', title, order, summary: '', notes, status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: 0, updatedAt: 0 }) as StoryNode;
const event = (id: string, name: string, more: Partial<TimelineEvent> = {}): TimelineEvent => ({ id, projectId: 'p', name, description: '', when: { precision: 'unknown' }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0, ...more }) as TimelineEvent;

/** Names in several scripts, one very long; a private note on a character and on a chapter. */
function world(events = [event('e1', 'Le siège de Ærøskøbing', { characters: [{ id: 'mira', age: null }], locationId: 'tokyo', nodeIds: ['c1'] }), event('e2', 'Ωμέγα: the last war')]) {
  const entries = [entry('mira', 'Mira Ångström', 'character', 'She is the traitor.'), entry('tokyo', '東京', 'location'), entry('guild', 'The Guild of the Very Long Name That Goes On and On Beyond Any Reasonable Width For a Label', 'faction'), entry('crown', 'Корона', 'faction')];
  return buildModel({ project: { id: 'p', title: 'Le Château — 東京' } as never, nodes: [node('c1', 'Глава первая', 0, 'Cut this chapter?')], plans: [], entries, schemas: [], links: [link('l1', 'guild', 'crown', 'allied-with'), link('l2', 'mira', 'guild', 'member-of')], relations: [], events, threads: [], systems: [], sheets: [] });
}
const all = () => true;

describe('exporting a view', () => {
  it('holds the records the view is about, as kept, with the names of what they point at, in any script', () => {
    const model = world();
    const { records, names, count } = viewRecords(model, 'timeline', { keep: all, includePrivate: false });
    expect(Object.keys(records)).toEqual(['events']);
    expect(records.events.map((e) => (e as TimelineEvent).name)).toEqual(['Le siège de Ærøskøbing', 'Ωμέγα: the last war']);
    // Every field, as kept: the event's own ids, and its date.
    expect(records.events[0]).toMatchObject({ id: 'e1', characters: [{ id: 'mira', age: null }], locationId: 'tokyo', nodeIds: ['c1'], when: { precision: 'unknown' } });
    expect(names).toMatchObject({ mira: 'Mira Ångström', tokyo: '東京', c1: 'Глава первая', e1: 'Le siège de Ærøskøbing' });
    expect(count).toBe(2);
  });

  it('keeps to the page’s filters: what they leave out is not in the file', () => {
    const { records } = viewRecords(world(), 'timeline', { keep: (id) => id === 'e2', includePrivate: false });
    expect(records.events.map((e) => (e as TimelineEvent).id)).toEqual(['e2']);
  });

  it('leaves out private notes unless they are asked for', () => {
    const model = world();
    const graph = viewRecords(model, 'graph', { keep: all, includePrivate: false });
    expect(JSON.stringify(graph.records)).not.toContain('She is the traitor.');
    expect(JSON.stringify(graph.records)).not.toContain('Cut this chapter?');
    expect((graph.records.entries[0] as object)).not.toHaveProperty('notes');
    const asked = viewRecords(model, 'graph', { keep: all, includePrivate: true });
    expect(JSON.stringify(asked.records)).toContain('She is the traitor.');
    expect(JSON.stringify(asked.records)).toContain('Cut this chapter?');
  });

  it('includes secrets only when given them, and the connections that touch what it exports', () => {
    const model = world();
    expect(viewRecords(model, 'knowledge', { keep: all, includePrivate: false }).records.secrets).toBeUndefined();
    const secret = { id: 's1', projectId: 'p', entryId: 'mira', title: 'The traitor' } as never;
    expect(viewRecords(model, 'knowledge', { keep: all, includePrivate: false, secrets: [secret] }).records.secrets).toEqual([secret]);
    const factions = viewRecords(model, 'factions', { keep: all, includePrivate: false });
    expect(factions.records.factions.map((f) => (f as LoreEntry).name)).toEqual(['The Guild of the Very Long Name That Goes On and On Beyond Any Reasonable Width For a Label', 'Корона']);
    expect(factions.records.links.map((l) => (l as LoreLink).id)).toEqual(['l1', 'l2']);
  });

  it('an empty view exports an empty, still readable file', () => {
    const { records, count } = viewRecords(world([]), 'timeline', { keep: all, includePrivate: false });
    expect(records).toEqual({ events: [] });
    expect(count).toBe(0);
  });

  it('a large view exports whole, and quickly', () => {
    const many = Array.from({ length: 5000 }, (_, i) => event(`e${i}`, `Event ${String(i).padStart(4, '0')} — 事件`, { characters: [{ id: 'mira', age: null }] }));
    const started = performance.now();
    const { records, names } = viewRecords(world(many), 'timeline', { keep: all, includePrivate: false });
    expect(records.events.length).toBe(5000);
    expect(names.mira).toBe('Mira Ångström');
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('says the filters and settings in words, naming what ids stand for', () => {
    const model = world();
    const words = filterWords(new URLSearchParams({ q: 'siège', chars: 'mira', from: 'c1', marks: '1', rfaction: 'guild', select: 'event:e1', as: 'list' }), model);
    expect(words).toEqual(['Name contains “siège”', 'Involving: Mira Ångström', 'Chapters: from Ch 1: Глава первая to the end', 'Canon and continuity markers: on', 'View setting rfaction: The Guild of the Very Long Name That Goes On and On Beyond Any Reasonable Width For a Label']);
    expect(filterWords(new URLSearchParams(), model)).toEqual([]);
    expect(NOT_A_BACKUP).toContain('not a backup');
  });

  it('names files in the novel’s own words, any script, dated, and not too long', () => {
    const at = new Date('2026-10-22T10:00:00Z');
    expect(exportFileName('Le Château — 東京', 'timeline', at, 'json')).toBe('Le-Château-東京-timeline-2026-10-22.json');
    expect(exportFileName('x'.repeat(200), 'graph', at, 'png')).toBe(`${'x'.repeat(60)}-graph-2026-10-22.png`);
    expect(exportFileName('!!!', 'charts', at, 'csv')).toBe('untitled-charts-2026-10-22.csv');
  });

  it('writes tables as one CSV with a byte-order mark, each table titled, quoting and guarding cells', () => {
    const csv = tablesCsv([
      { title: 'Ωμέγα', columns: ['Name', 'Words'], rows: [['Глава "первая", one', 1200], ['=HYPERLINK("x")', 3]] },
      { title: 'Second', columns: ['Item'], rows: [['東京']] },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1)).toBe('Ωμέγα\r\nName,Words\r\n"Глава ""первая"", one",1200\r\n"\'=HYPERLINK(""x"")",3\r\n\r\nSecond\r\nItem\r\n東京');
    expect(tablesCsv([{ title: 'One', columns: ['A'], rows: [] }])).toBe('﻿A');
  });
});
