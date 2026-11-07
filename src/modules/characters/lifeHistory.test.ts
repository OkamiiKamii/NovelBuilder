import { describe, expect, it } from 'vitest';
import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { buildModel, resolveRef } from '@/modules/model/model';
import type { CharacterRelation } from '@/modules/relationships/types';
import { ageLabel } from '@/modules/timeline/ages';
import type { EventDate, TimelineEvent } from '@/modules/timeline/types';
import { lifeHistory } from './lifeHistory';

const day = (year: number, month: number | null = null, d: number | null = null): EventDate => ({ precision: 'exact', year, month, day: d, hour: null, minute: null });
const entry = (id: string, name: string, category: string, fields: { key: string; value: string }[] = []): LoreEntry => ({ id, projectId: 'p', category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: fields.map((f, i) => ({ id: `f${i}`, ...f })), createdAt: 0, updatedAt: 0 }) as LoreEntry;
const node = (id: string, title: string, order: number, mentions: string[]): StoryNode => ({ id, projectId: 'p', parentId: null, kind: 'chapter', title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions, createdAt: 0, updatedAt: 0 });
const event = (id: string, name: string, when: EventDate, more: Partial<TimelineEvent> = {}): TimelineEvent => ({ id, projectId: 'p', name, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0, ...more });
const link = (id: string, fromId: string, toId: string, type: string, validity?: LoreLink['validity']): LoreLink => ({ id, projectId: 'p', fromId, toId, fromLabel: '', toLabel: '', type, validity, createdAt: 0 });

function story(birth: string | null = '1000-3-1', guildName = 'The Guild') {
  const entries = [
    entry('mira', 'Mira', 'character', birth ? [{ key: 'Date of Birth', value: birth }] : []),
    entry('bren', 'Bren', 'character'),
    entry('keep', 'The Keep', 'location'),
    entry('guild', guildName, 'faction'),
  ];
  const relation: CharacterRelation = {
    id: 'rel',
    projectId: 'p',
    fromId: 'mira',
    toId: 'bren',
    createdAt: 0,
    updatedAt: 0,
    stages: [
      { id: 's1', startNodeId: null, preset: 'custom', category: 'custom', label: '', fromRole: '', toRole: '', directional: false, title: 'Strangers', affinity: 'neutral', event: '', notes: '' },
      { id: 's2', startNodeId: 'ch2', preset: 'custom', category: 'custom', label: '', fromRole: '', toRole: '', directional: false, title: 'Allies', affinity: 'friendly', event: '', notes: '' },
    ] as CharacterRelation['stages'],
  };
  return buildModel({
    project: { id: 'p' } as never,
    nodes: [node('ch1', 'Arrival', 0, ['mira']), node('ch2', 'The Guild', 1, ['mira', 'bren'])],
    plans: [{ id: 'ch2', projectId: 'p', objective: '', beats: [], entityIds: ['mira'] } as never],
    entries,
    schemas: [],
    links: [link('l1', 'mira', 'guild', 'member-of', { from: { kind: 'event', eventId: 'siege' }, until: null }), link('l2', 'mira', 'keep', 'located-in', { from: { kind: 'node', nodeId: 'ch2' }, until: null }), link('l3', 'mira', 'bren', 'allied-with')],
    relations: [relation],
    events: [event('siege', 'The siege', day(1026, 10, 14), { characters: [{ id: 'mira', age: null }], locationId: 'keep' }), event('feast', 'The feast', day(1020, 1, 1), { entryIds: ['mira'] })],
    threads: [],
    systems: [{ id: 'sys', name: 'Magic', groups: [], items: [{ id: 'fire', name: 'Fire', groupId: '' }] } as never],
    sheets: [{ id: 'sheet', projectId: 'p', systemId: 'sys', entryId: 'mira', values: {}, progress: {}, itemIds: ['fire'] } as never],
  });
}
const extras = { snapshots: [{ id: 'snap', entryId: 'mira', nodeId: 'ch2', label: 'After the duel' } as never], milestones: [{ id: 'm1', entryId: 'mira', kind: 'story', text: 'Swore the oath', nodeId: 'ch1' } as never] };
const rows = (items: { kind: string; title: string; when: string; detail: string }[]) => items.map((i) => [i.kind, i.title, i.when, i.detail]);

describe('a character’s life history', () => {
  it('puts what happens to them in story time, with their age, where they were, and the ties dated by it', () => {
    const history = lifeHistory(story(), 'mira', extras)!;
    expect(history.born).toBe('Born on Year 1000, March 1, worked out from the date of birth on their profile (1000-3-1).');
    expect(rows(history.story)).toEqual([
      ['birth', 'Born', '1000-3-1', 'the date of birth on their profile'],
      ['event', 'The feast', 'Year 1020, January 1', 'involved'],
      ['event', 'The siege', 'Year 1026, October 14', 'takes part · at The Keep'],
      ['affiliation', 'Member of The Guild', '“The siege”', 'from “The siege”'],
    ]);
    expect(history.story.filter((i) => i.age).map((i) => ageLabel(i.age!))).toEqual(['Age 19', 'Age 26']);
  });

  it('and, apart from it, what happens as the reader meets them: appearances, relationship changes, progression, milestones', () => {
    const history = lifeHistory(story(), 'mira', extras)!;
    expect(rows(history.reading)).toEqual([
      ['relationship', 'Relationship with Bren: Strangers', 'Before the story', 'Neutral'],
      ['appearance', 'Appears in Ch 1: Arrival', 'Ch 1: Arrival', 'linked in the text'],
      ['milestone', 'Swore the oath', 'Ch 1: Arrival', 'milestone'],
      ['ability', 'After the duel', 'Ch 2: The Guild', 'progression snapshot'],
      ['appearance', 'Appears in Ch 2: The Guild', 'Ch 2: The Guild', 'linked in the text and in the chapter plan'],
      ['place', 'Located in The Keep', 'Ch 2: The Guild', 'from Ch 2: The Guild'],
      ['relationship', 'Relationship changes with Bren: Allies', 'Ch 2: The Guild', 'Friendly'],
    ]);
    expect(rows(history.throughout)).toEqual([
      ['relationship', 'Allied with Bren', 'No time given', ''],
      ['ability', 'Holds Fire', 'On their sheet', 'Magic'],
    ]);
  });

  it('is made of references to the shared records, so it follows them when they change', () => {
    const model = story();
    const history = lifeHistory(model, 'mira', extras)!;
    for (const item of [...history.story, ...history.reading, ...history.throughout]) {
      if (item.ref) expect(resolveRef(model, item.ref).found, item.title).toBe(true);
      else expect(item.to, item.title).toBeDefined();
    }
    expect(lifeHistory(story('1000-3-1', 'The Iron Guild'), 'mira', extras)!.story.at(-1)!.title).toBe('Member of The Iron Guild');
  });

  it('says plainly when no birth or age is recorded, and invents none', () => {
    const history = lifeHistory(story(null), 'mira')!;
    expect(history.born).toBe('When they were born is not recorded. Give a date of birth on their profile, or their age at any dated event (0 at their birth), and their ages are worked out from it.');
    expect(history.story.filter((i) => i.kind === 'event').map((i) => i.age)).toEqual([
      { kind: 'unknown', reason: 'no date of birth or age is given for them yet' },
      { kind: 'unknown', reason: 'no date of birth or age is given for them yet' },
    ]);
    expect(history.issues).toEqual([]);
  });

  it('a date of birth that cannot be read, or one only to the year, is said as it is', () => {
    expect(lifeHistory(story('the year of the comet'), 'mira')!.issues).toEqual(['The date of birth on Mira’s profile, “the year of the comet”, could not be read as a date, so ages are not counted from it. Write it as a year (1000), a year and month (1000-3), or a full date (1000-3-1).']);
    const yearOnly = lifeHistory(story('1000'), 'mira')!;
    expect(yearOnly.born).toBe('Born between Year 1000, January 1 and Year 1000, December 31, worked out from the date of birth on their profile (1000).');
    expect(yearOnly.story.filter((i) => i.age).map((i) => ageLabel(i.age!))).toEqual(['Age 19–20', 'Age 25–26']);
  });

  it('is nothing for a record that is not there', () => {
    expect(lifeHistory(story(), 'nobody')).toBeNull();
  });

  it('includes the author’s appearance records, said as the appearances matrix says them', () => {
    const base = story();
    // Ch 1: Mira is only mentioned, by her record, though linked in the text. Ch 2: on the page, and whose point of view.
    // Ch 3: Bren is on the page by his record alone, with nothing in the text.
    const model = buildModel({
      project: { id: 'p' } as never,
      nodes: [...base.nodes.values(), node('ch3', 'The Road', 2, [])],
      plans: [{ id: 'ch1', projectId: 'p', objective: '', beats: [], entityIds: [], mentionIds: ['mira'] } as never, { id: 'ch2', projectId: 'p', objective: '', beats: [], entityIds: ['mira'], appearIds: ['mira'], povIds: ['mira'] } as never, { id: 'ch3', projectId: 'p', objective: '', beats: [], entityIds: [], appearIds: ['bren'] } as never],
      entries: [...base.entries.values()],
      schemas: [],
      links: base.links,
      relations: [],
      events: [],
      threads: [],
      systems: [],
      sheets: [],
    });
    const appearances = (id: string) => rows(lifeHistory(model, id)!.reading.filter((i) => i.kind === 'appearance'));
    expect(appearances('mira')).toEqual([
      ['appearance', 'Mentioned in Ch 1: Arrival', 'Ch 1: Arrival', 'linked in the text and mentioned, not on the page (your appearance record)'],
      ['appearance', 'Appears in Ch 2: The Guild', 'Ch 2: The Guild', 'linked in the text, in the chapter plan, on the page (your appearance record) and their point of view'],
    ]);
    expect(appearances('bren')).toEqual([
      ['appearance', 'Appears in Ch 2: The Guild', 'Ch 2: The Guild', 'linked in the text'],
      ['appearance', 'Appears in Ch 3: The Road', 'Ch 3: The Road', 'on the page (your appearance record)'],
    ]);
  });
});
