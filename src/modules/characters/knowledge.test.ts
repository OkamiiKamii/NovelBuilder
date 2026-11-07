import { describe, expect, it } from 'vitest';
import type { LoreEntry } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { buildModel } from '@/modules/model/model';
import { timeContext } from '@/modules/model/validity';
import { withDecisions } from '@/modules/timeline/review';
import type { EventDate, TimelineEvent } from '@/modules/timeline/types';
import { KNOWLEDGE_RULE_TEXT, checkKnowledge, currentOf, knowledgeSpread, peopleOf, recordWords, recordsOf, standingAt, whoKnowsWhat, type Axis } from './knowledge';
import type { Awareness, CharacterSecret, KnowledgeNeed, KnowledgeRecord } from './types';

const entry = (id: string, name: string): LoreEntry => ({ id, projectId: 'p', category: 'character', name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 0, updatedAt: 0 }) as LoreEntry;
const chapter = (id: string, order: number): StoryNode => ({ id, projectId: 'p', parentId: null, kind: 'chapter', title: `Title ${order}`, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: 0, updatedAt: 0 });
const day = (d: number): EventDate => ({ precision: 'exact', year: 10, month: 3, day: d, hour: null, minute: null });
const event = (id: string, when: EventDate): TimelineEvent => ({ id, projectId: 'p', name: id, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0 });
const rec = (id: string, characterId: string, state: Awareness, more: Partial<KnowledgeRecord> = {}): KnowledgeRecord => ({ id, characterId, state, belief: '', nodeId: null, eventId: null, how: '', fromId: null, ...more });
const need = (id: string, characterId: string, more: Partial<KnowledgeNeed> = {}): KnowledgeNeed => ({ id, characterId, nodeId: null, eventId: null, note: '', ...more });
const secret = (more: Partial<CharacterSecret> = {}): CharacterSecret => ({ id: 's1', projectId: 'p', entryId: 'kael', title: 'True heir', description: 'Kael is the old king’s son.', status: 'Hidden', self: 'unaware', knows: [], suspects: [], unaware: [], reader: 'unaware', readerNodeId: null, firstNodeId: null, revealNodeId: null, revealEventId: null, nodeIds: [], threadIds: [], notes: '', records: [], needs: [], createdAt: 0, updatedAt: 0, ...more });

const people = [entry('kael', 'Kael'), entry('mira', 'Mira'), entry('tam', 'Tam'), entry('oren', 'Oren'), entry('bren', 'Bren'), entry('ash', 'Ash')];
const chapters = [1, 2, 3, 4, 5, 6].map((n) => chapter(`c${n}`, n));
const events = [event('feast', day(1)), event('duel', day(4)), event('council', day(4)), event('coronation', day(9))];
const model = buildModel({ project: { id: 'p' } as never, nodes: chapters, plans: [], entries: people, schemas: [], links: [], relations: [], events, threads: [], systems: [], sheets: [] });
const context = timeContext(model);
const at = (s: CharacterSecret, who: string, point: string, axis: Axis = 'reading') => standingAt(recordsOf(s, who), point, axis, context);
const stateAt = (s: CharacterSecret, who: string, point: string, axis: Axis = 'reading') => at(s, who, point, axis).record?.state ?? 'not recorded';

/**
 * The true heir: Kael is the old king's son, and does not know it.
 *  Tam      knows from the start (Chapter 1), and tells Mira in Chapter 5
 *  Mira     unaware (Ch 1) → suspects (Ch 3) → knows (Ch 5, told by Tam)
 *  Oren     knows part of it from Chapter 2: that Kael is noble-born
 *  Bren     believes something false from Chapter 2: that Kael is a foundling from the docks
 *  Ash      named nowhere: nothing recorded
 */
const heir = secret({
  records: [
    rec('t1', 'tam', 'knows', { nodeId: 'c1', how: 'was at the birth' }),
    rec('m1', 'mira', 'unaware', { nodeId: 'c1' }),
    rec('m2', 'mira', 'suspects', { nodeId: 'c3', belief: 'Kael is someone’s bastard', how: 'sees the signet ring' }),
    rec('m3', 'mira', 'knows', { nodeId: 'c5', how: 'a confession by the well', fromId: 'tam' }),
    rec('o1', 'oren', 'partial', { nodeId: 'c2', belief: 'Kael is noble-born' }),
    rec('b1', 'bren', 'false', { nodeId: 'c2', belief: 'Kael is a foundling from the docks' }),
  ],
});

describe('what is true is kept apart from what each character holds', () => {
  it('unknown: a character with no record is not recorded, never assumed unaware', () => {
    expect(currentOf(heir, 'ash')).toEqual({ state: null, record: null, source: null });
    // Before Mira's first record, she is not recorded either: not "unaware".
    expect(stateAt(secret({ records: [rec('m', 'mira', 'knows', { nodeId: 'c4' })] }), 'mira', 'c2')).toBe('not recorded');
    // A record with no chapter is in her history but not assumed to be in force at any chapter.
    const unplaced = secret({ records: [rec('m', 'mira', 'unaware')] });
    expect(stateAt(unplaced, 'mira', 'c6')).toBe('not recorded');
    expect(currentOf(unplaced, 'mira').state).toBe('unaware');
    // Who knows what lists the named, with those not recorded apart; the truth itself is untouched.
    expect(whoKnowsWhat(heir).map((g) => [g.state, g.ids])).toEqual([['knows', ['tam', 'mira']], ['partial', ['oren']], ['false', ['bren']], ['unaware', ['kael']]]);
    expect(whoKnowsWhat(heir, [...peopleOf(heir), 'ash']).at(-1)).toEqual({ state: null, ids: ['ash'] });
    expect(heir.description).toBe('Kael is the old king’s son.');
  });

  it('partial: knowing part of it, with the part they know', () => {
    expect(at(heir, 'oren', 'c4').record).toMatchObject({ state: 'partial', belief: 'Kael is noble-born' });
    expect(stateAt(heir, 'oren', 'c1')).toBe('not recorded');
    expect(recordWords(heir.records![4], model)).toBe('Oren knows part of it (“Kael is noble-born”) in Ch 2: Title 2');
  });

  it('false: believing something else instead, kept apart from the truth', () => {
    const bren = at(heir, 'bren', 'c6').record!;
    expect([bren.state, bren.belief]).toEqual(['false', 'Kael is a foundling from the docks']);
    expect(bren.belief).not.toBe(heir.description);
    expect(recordWords(bren, model)).toBe('Bren believes something false (“Kael is a foundling from the docks”) in Ch 2: Title 2');
  });

  it('changed: each state holds from its own chapter, and the earlier ones are kept', () => {
    expect(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((c) => stateAt(heir, 'mira', c))).toEqual(['unaware', 'unaware', 'suspects', 'suspects', 'knows', 'knows']);
    expect(recordsOf(heir, 'mira').map((r) => r.state)).toEqual(['unaware', 'suspects', 'knows']);
    expect(currentOf(heir, 'mira')).toMatchObject({ state: 'knows', source: 'records' });
    expect(recordWords(recordsOf(heir, 'mira')[2], model)).toBe('Mira knows in Ch 5: Title 5: a confession by the well, from Tam');
  });

  it('the simple lists still say where someone stands when they have no records', () => {
    const simple = secret({ self: 'suspects', knows: ['tam'], unaware: ['mira'] });
    expect([currentOf(simple, 'kael'), currentOf(simple, 'tam'), currentOf(simple, 'mira')].map((c) => [c.state, c.source])).toEqual([['suspects', 'summary'], ['knows', 'summary'], ['unaware', 'summary']]);
    // …and a character's records outrank the old "Does Kael know?" answer.
    expect(currentOf(secret({ self: 'knows', records: [rec('k', 'kael', 'unaware', { nodeId: 'c1' })] }), 'kael').state).toBe('unaware');
  });

  it('in story time: before only when the dates say so for certain', () => {
    const s = secret({ records: [rec('m1', 'mira', 'unaware', { eventId: 'feast' }), rec('m2', 'mira', 'knows', { eventId: 'duel' })] });
    expect(stateAt(s, 'mira', 'coronation', 'story')).toBe('knows');
    expect(stateAt(s, 'mira', 'duel', 'story')).toBe('knows');
    // The council is on the same day as the duel: which came first is not known, so the duel's record is not counted, and the standing is not settled.
    expect(at(s, 'mira', 'council', 'story')).toMatchObject({ record: { id: 'm1' }, settled: false });
    // Reading order and story time are apart: these records have no chapter.
    expect(stateAt(s, 'mira', 'c6')).toBe('not recorded');
  });
});

describe('how it spreads', () => {
  it('a column for each chapter used, a row for everyone named, who told whom where', () => {
    const s = { ...heir, firstNodeId: 'c1', revealNodeId: 'c6' };
    const spread = knowledgeSpread(s, model, 'reading');
    expect(spread.points.map((p) => [p.label, p.marks])).toEqual([['Ch 1: Title 1', ['first']], ['Ch 2: Title 2', []], ['Ch 3: Title 3', []], ['Ch 5: Title 5', []], ['Ch 6: Title 6', ['reveal']]]);
    expect(spread.rows.map((r) => r.name)).toEqual(['Kael', 'Tam', 'Mira', 'Oren', 'Bren']);
    const mira = spread.rows.find((r) => r.characterId === 'mira')!;
    expect(mira.cells.map((c) => c.record?.state ?? null)).toEqual(['unaware', 'unaware', 'suspects', 'knows', 'knows']);
    expect(mira.cells.map((c) => c.here.length)).toEqual([1, 0, 1, 1, 0]);
    // Kael has no records: nothing at any chapter, and "unaware" now, from the simple answer.
    expect(spread.rows[0].cells.every((c) => c.record === null)).toBe(true);
    expect(spread.rows[0].now).toMatchObject({ state: 'unaware', source: 'summary' });
    expect(spread.tellings).toEqual([{ recordId: 'm3', fromId: 'tam', toId: 'mira', point: 3 }]);
  });

  it('in story time, in the order events happen; records with no event are listed apart', () => {
    const s = secret({ revealEventId: 'coronation', records: [rec('m1', 'mira', 'suspects', { eventId: 'duel' }), rec('t1', 'tam', 'knows', { eventId: 'feast' }), rec('o1', 'oren', 'partial', { nodeId: 'c2' })] });
    const spread = knowledgeSpread(s, model, 'story');
    expect(spread.points.map((p) => [p.id, p.marks])).toEqual([['feast', []], ['duel', []], ['coronation', ['reveal']]]);
    expect(spread.rows.find((r) => r.characterId === 'oren')!.unplaced.map((r) => r.id)).toEqual(['o1']);
  });

  it('no records: no columns, and nothing invented', () => {
    const spread = knowledgeSpread(secret({ knows: ['tam'] }), model, 'reading');
    expect(spread.points).toEqual([]);
    expect(spread.rows.map((r) => [r.name, r.now.state])).toEqual([['Kael', 'unaware'], ['Tam', 'knows']]);
  });
});

describe('checks: only from a stated rule and the records it needs', () => {
  it('every rule says what it is and what it needs', () => {
    for (const text of Object.values(KNOWLEDGE_RULE_TEXT)) expect(text.rule.length * text.needs.length * text.title.length).toBeGreaterThan(0);
  });

  it('finds nothing without the author’s marks, however the records look', () => {
    expect(checkKnowledge([heir], model)).toEqual([]);
  });

  it('acting on it while recorded as unaware, or believing something false', () => {
    const s = { ...heir, needs: [need('n1', 'mira', { nodeId: 'c2', note: 'blackmails the steward' }), need('n2', 'bren', { nodeId: 'c4' }), need('n3', 'mira', { nodeId: 'c6' }), need('n4', 'oren', { nodeId: 'c4' })] };
    const found = checkKnowledge([s], model);
    expect(found.map((f) => [f.rule, f.message])).toEqual([
      ['needs', 'Mira acts on “True heir” in Ch 2: Title 2, but is recorded as unaware of it there.'],
      ['needs', 'Bren acts on “True heir” in Ch 4: Title 4, but is recorded as believing something false there.'],
    ]);
    expect(found[0].because).toBe('Your mark: “blackmails the steward”, in Ch 2: Title 2. Their record: Mira is unaware in Ch 1: Title 1. No later record of theirs is placed at or before it.');
    // Knowing part of it (Oren) or knowing it (Mira by Ch 6) is not flagged.
  });

  it('no finding when the records cannot say: nothing recorded, nothing yet, or a later record not placed', () => {
    const marks = [need('n1', 'ash', { nodeId: 'c3' }), need('n2', 'oren', { nodeId: 'c1' })];
    expect(checkKnowledge([{ ...heir, needs: marks }], model)).toEqual([]);
    // Mira unaware in Ch 1, then learns it with no chapter given: whether she knew by Ch 2 is not known.
    const unsure = secret({ records: [rec('m1', 'mira', 'unaware', { nodeId: 'c1' }), rec('m2', 'mira', 'knows', { how: 'overhears it' })], needs: [need('n', 'mira', { nodeId: 'c2' })] });
    expect(checkKnowledge([unsure], model)).toEqual([]);
    // Learning it later does not say she did not know before.
    const later = secret({ records: [rec('m1', 'mira', 'knows', { nodeId: 'c5' })], needs: [need('n', 'mira', { nodeId: 'c2' })] });
    expect(checkKnowledge([later], model)).toEqual([]);
  });

  it('in story time, only when the dates are certain', () => {
    const records = [rec('m1', 'mira', 'unaware', { eventId: 'feast' }), rec('m2', 'mira', 'knows', { eventId: 'duel' })];
    expect(checkKnowledge([secret({ records, needs: [need('n', 'mira', { eventId: 'council' })] })], model)).toEqual([]);
    const certain = checkKnowledge([secret({ records: records.slice(0, 1), needs: [need('n', 'mira', { eventId: 'council' })] })], model);
    expect(certain.map((f) => f.message)).toEqual(['Mira acts on “True heir” at “council”, but is recorded as unaware of it there.']);
  });

  it('learning it from someone recorded as unaware of it then', () => {
    const s = secret({ records: [rec('t1', 'tam', 'unaware', { nodeId: 'c1' }), rec('t2', 'tam', 'knows', { nodeId: 'c4' }), rec('m1', 'mira', 'knows', { nodeId: 'c2', fromId: 'tam' }), rec('o1', 'oren', 'knows', { nodeId: 'c5', fromId: 'tam' }), rec('b1', 'bren', 'knows', { nodeId: 'c3', fromId: 'ash' })] });
    expect(checkKnowledge([s], model).map((f) => [f.rule, f.message, f.characterIds])).toEqual([['told', 'Mira learns “True heir” from Tam in Ch 2: Title 2, but Tam is recorded as unaware of it there.', ['mira', 'tam']]]);
  });

  it('the same finding has the same key every run; a decision holds and is kept apart from the timeline’s', () => {
    const s = { ...heir, needs: [need('n1', 'mira', { nodeId: 'c2' })] };
    const [a, b] = [checkKnowledge([s], model), checkKnowledge([s], model)];
    expect(a[0].key).toBe('knowledge|needs|s1|n1|reading');
    expect(b[0].key).toBe(a[0].key);
    const decision = { id: 'd', projectId: 'p', key: a[0].key, kind: 'intentional' as const, note: 'She is bluffing', message: a[0].message, nodeId: null, createdAt: 0 };
    expect(withDecisions(a, [decision], 'knowledge|')).toMatchObject({ open: [], decided: [{ decision: { note: 'She is bluffing' } }], gone: [] });
    expect(withDecisions(a, [decision]).open.length).toBe(1);
  });

  it('checking changes nothing', () => {
    const s = { ...heir, needs: [need('n1', 'mira', { nodeId: 'c2' })] };
    const before = JSON.stringify(s);
    checkKnowledge([s], model);
    knowledgeSpread(s, model, 'reading');
    expect(JSON.stringify(s)).toBe(before);
  });
});
