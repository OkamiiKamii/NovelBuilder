import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { builtinCategory } from '@/modules/codex/schema';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline, type TimelineService } from '@/modules/timeline/service';
import { describeSource, reviewCanon } from './review';
import { createCanonService, registerCanon, type CanonService } from './service';
import type { CanonStatus } from './types';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;
let timeline: TimelineService;
let canon: CanonService;

beforeEach(() => {
  db = new NovelDB(`canon-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerCanon(registry);
  manuscript = createManuscriptService(db, projects.contentChanged);
  codex = createCodexService(db, projects.contentChanged);
  timeline = createTimelineService(db, projects.contentChanged);
  canon = createCanonService(db, projects.contentChanged);
});

const para = (text: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });

async function world() {
  const p = await projects.create({ title: 'P' });
  const m = manuscript.forProject(p.id);
  const c = codex.forProject(p.id);
  const k = canon.forProject(p.id);
  const ch4 = await m.create('chapter', null, 'Chapter 4');
  const ch14 = await m.create('chapter', null, 'Chapter 14');
  await db.chapterContents.put({ id: ch14.id, projectId: p.id, doc: { type: 'doc', content: [para('The sun rose.'), para(''), para('Alex drank the light; the Solar Absorption woke in him.')] } });
  const alex = await c.create('character', 'Alex');
  const solar = await c.create('power', 'Solar Absorption');
  const academy = await c.create('location', 'Royal Academy');
  const siege = await timeline.forProject(p.id).create('The Siege');
  /** A fact with a subject, a statement and a status. */
  const fact = async (subject: string, statement: string, status: CanonStatus = 'canon', entryIds: string[] = []) => k.create({ subject, statement, status, entryIds });
  const review = async () => reviewCanon(await k.list(), await c.list(), await m.list(), builtinCategory);
  const flagsOf = async (id: string) => (await review()).reviews.find((r) => r.fact.id === id)!.flags;
  return { p, m, c, k, ch4, ch14, alex, solar, academy, siege, fact, review, flagsOf };
}

describe('canon facts', () => {
  it('records a fact as provisional unless told otherwise, and classifies it', async () => {
    const { k, alex, academy } = await world();
    const blank = await k.create();
    expect(blank).toMatchObject({ subject: 'New fact', statement: '', status: 'provisional', kind: 'lore', sources: [], history: [{ kind: 'created', toStatus: 'provisional' }] });

    const made = await k.create({ subject: ' Founding ', statement: ' 500 years ago ', status: 'canon', kind: 'rule', entryIds: [academy.id, 'nope'] });
    expect(made).toMatchObject({ subject: 'Founding', statement: '500 years ago', status: 'canon', kind: 'rule', entryIds: [academy.id] });

    await k.update(made.id, { subject: 'Royal Academy foundation', kind: 'attribute', notes: 'check', entryIds: [academy.id, alex.id] });
    expect(await k.get(made.id)).toMatchObject({ subject: 'Royal Academy foundation', kind: 'attribute', notes: 'check', entryIds: [academy.id, alex.id], statement: '500 years ago' });
    await k.update(made.id, { kind: 'x' as 'lore', subject: '  ' });
    expect(await k.get(made.id)).toMatchObject({ kind: 'attribute', subject: 'Untitled fact' });
  });

  it('moves a fact through every status only when asked, and logs each move', async () => {
    const { k, fact } = await world();
    const f = await fact('Magic', 'Costs memory', 'provisional');
    for (const status of ['canon', 'conflicting', 'retconned', 'non-canon', 'provisional'] as const) await k.setStatus(f.id, status, status === 'retconned' ? 'Replaced by the blood price' : '');
    await k.setStatus(f.id, 'provisional');
    await k.setStatus(f.id, 'official' as CanonStatus);
    const stored = (await k.get(f.id))!;
    expect(stored.status).toBe('provisional');
    expect(stored.history.map((c) => `${c.kind}:${c.fromStatus ?? ''}>${c.toStatus ?? ''}`)).toEqual(['created:>provisional', 'status:provisional>canon', 'status:canon>conflicting', 'status:conflicting>retconned', 'status:retconned>non-canon', 'status:non-canon>provisional']);
    expect(stored.history[3].reason).toBe('Replaced by the blood price');
  });

  it('archives the earlier statement as retconned when a canon fact is revised', async () => {
    const { k, fact } = await world();
    const f = await fact('Royal Academy foundation', 'Founded 500 years ago');
    const before = Date.now();
    await k.revise(f.id, { statement: ' Founded 1,000 years ago ', reason: 'Needs to predate the First Empire' });
    await k.revise(f.id, { statement: 'Founded 1,200 years ago' });
    const stored = (await k.get(f.id))!;
    expect(stored).toMatchObject({ statement: 'Founded 1,200 years ago', status: 'canon' });
    expect(stored.history.slice(1)).toMatchObject([
      { kind: 'retcon', statement: 'Founded 500 years ago', newStatement: 'Founded 1,000 years ago', reason: 'Needs to predate the First Empire', fromStatus: 'canon' },
      { kind: 'retcon', statement: 'Founded 1,000 years ago', newStatement: 'Founded 1,200 years ago', reason: '' },
    ]);
    expect(stored.history[1].at).toBeGreaterThanOrEqual(before);

    // Saying the same thing again, or nothing, is not a revision.
    await k.revise(f.id, { statement: 'Founded 1,200 years ago' });
    await k.revise(f.id, { statement: '   ' });
    expect((await k.get(f.id))!.history).toHaveLength(3);
  });

  it('refuses to overwrite an established statement in place', async () => {
    const { k, fact } = await world();
    const settled = await fact('Founding', '500 years ago', 'canon');
    await expect(k.update(settled.id, { statement: '900 years ago' })).rejects.toThrow('on the record');
    expect(await k.get(settled.id)).toMatchObject({ statement: '500 years ago', history: [{ kind: 'created' }] });
    await k.setStatus(settled.id, 'conflicting');
    await expect(k.update(settled.id, { statement: '900 years ago' })).rejects.toThrow('on the record');

    // A draft idea is still just a draft: it can be rewritten freely.
    const draft = await fact('Idea', 'Maybe dragons', 'provisional');
    await k.update(draft.id, { statement: 'Maybe wyverns' });
    expect(await k.get(draft.id)).toMatchObject({ statement: 'Maybe wyverns', history: [{ kind: 'created' }] });
  });

  it('keeps a correction of wording apart from a retcon, and still keeps the old wording', async () => {
    const { k, fact } = await world();
    const f = await fact('Founding', 'Fownded 500 years ago');
    await k.revise(f.id, { statement: 'Founded 500 years ago', minor: true, reason: 'typo' });
    expect((await k.get(f.id))!.history[1]).toMatchObject({ kind: 'reworded', statement: 'Fownded 500 years ago', newStatement: 'Founded 500 years ago', reason: 'typo' });
  });

  it('lets a reason be added later without touching what was recorded', async () => {
    const { k, fact } = await world();
    const f = await fact('Founding', '500 years ago');
    await k.revise(f.id, { statement: '1,000 years ago' });
    const [, retcon] = (await k.get(f.id))!.history;
    await k.annotate(f.id, retcon.id, 'Decided during the second draft');
    await k.annotate(f.id, 'nope', 'x');
    expect((await k.get(f.id))!.history[1]).toEqual({ ...retcon, reason: 'Decided during the second draft' });
  });

  it('links a retconned fact to the one that replaced it', async () => {
    const { k, fact } = await world();
    const old = await fact('Magic price', 'Costs memory', 'retconned');
    const now = await fact('Magic price', 'Costs blood');
    await k.update(old.id, { replacedById: now.id });
    expect((await k.get(old.id))!.replacedById).toBe(now.id);
    await k.update(old.id, { replacedById: old.id });
    expect((await k.get(old.id))!.replacedById).toBeNull();
  });
});

describe('sources', () => {
  it('pins a manuscript source to the paragraph that contains the quote', async () => {
    const { k, m, c, fact, ch14, ch4, alex, solar, siege } = await world();
    const f = await fact('Alex possesses Solar Absorption', 'Alex can absorb sunlight');
    const quoted = await k.addSource(f.id, { type: 'chapter', refId: ch14.id, quote: 'the solar absorption woke in him' });
    expect(quoted).toMatchObject({ type: 'chapter', refId: ch14.id, block: 2 });
    expect(await k.locate(ch14.id, 'THE SUN ROSE')).toBe(0);
    expect(await k.locate(ch14.id, 'never written')).toBeNull();
    const missed = await k.addSource(f.id, { type: 'chapter', refId: ch4.id, quote: 'not in this chapter' });
    expect(missed).toMatchObject({ refId: ch4.id, block: null, quote: 'not in this chapter' });
    await k.addSource(f.id, { type: 'entry', refId: alex.id });
    await k.addSource(f.id, { type: 'entry', refId: solar.id });
    await k.addSource(f.id, { type: 'event', refId: siege.id });
    await k.addSource(f.id, { type: 'note', note: 'Series bible, p. 12' });
    // A source that points at nothing real is kept as a note rather than a dead link.
    expect(await k.addSource(f.id, { type: 'entry', refId: 'nope', note: 'old wiki' })).toMatchObject({ type: 'note', refId: null, note: 'old wiki' });

    const lookup = async () => {
      const [nodes, entries, events] = [await m.list(), await c.list(), await timeline.forProject(f.projectId).list()];
      return { node: (id: string) => nodes.find((x) => x.id === id), entry: (id: string) => entries.find((x) => x.id === id), event: (id: string) => events.find((x) => x.id === id), category: builtinCategory };
    };
    const labels = async () => (await k.get(f.id))!.sources.map(async (s) => describeSource(s, await lookup()).label);
    expect(await Promise.all(await labels())).toEqual(['Chapter 14 (paragraph 3)', 'Chapter 4', 'Alex (Character profile)', 'Solar Absorption (Power System / Rule profile)', 'The Siege (Timeline event)', 'Series bible, p. 12', 'old wiki']);

    // Deleting what a source points at keeps the source, marked as gone.
    await m.remove(ch14.id);
    const [first] = (await k.get(f.id))!.sources;
    expect(describeSource(first, await lookup())).toMatchObject({ missing: true, label: 'A chapter or scene that was removed' });
    await k.removeSource(f.id, first.id);
    expect((await k.get(f.id))!.sources).toHaveLength(6);
  });
});

describe('reviewing canon for contradictions', () => {
  it('points out two established statements about the same thing that differ', async () => {
    const { k, fact, review, ch4, academy } = await world();
    const a = await fact('Royal Academy foundation', 'Founded 500 years ago', 'canon', [academy.id]);
    const b = await fact('royal academy  FOUNDATION!', 'Founded 1,000 years ago', 'canon', [academy.id]);
    await k.addSource(a.id, { type: 'chapter', refId: ch4.id });
    const { reviews, pairs } = await review();
    expect(pairs).toHaveLength(1);
    expect(reviews.find((r) => r.fact.id === b.id)!.flags.map((f) => f.message)).toEqual(['This statement appears to conflict with established canon in Chapter 4: “Founded 500 years ago”.']);
    expect(reviews.find((r) => r.fact.id === a.id)!.flags.map((f) => f.message)).toEqual(['This statement appears to conflict with another statement marked Canon: “Founded 1,000 years ago”.']);
  });

  it('does not treat the same words, different subjects or different entries as a contradiction', async () => {
    const { fact, review, alex, solar } = await world();
    await fact('Founding', 'Founded 500 years ago.');
    await fact('Founding', 'founded 500 years ago');
    await fact('Age', '17', 'canon', [alex.id]);
    await fact('Age', '3000', 'canon', [solar.id]);
    await fact('Colours', 'Blue and gold');
    expect((await review()).pairs).toEqual([]);
  });

  it('compares provisional ideas with canon, and leaves discarded and retconned ones out of it', async () => {
    const { fact, flagsOf, review } = await world();
    const settled = await fact('Founding', '500 years ago', 'canon');
    const idea = await fact('Founding', '900 years ago', 'provisional');
    await fact('Founding', '100 years ago', 'retconned');
    await fact('Founding', 'Never founded', 'non-canon');
    await fact('Founding', '50 years ago', 'provisional');
    // Two drafts that differ from each other are just drafts.
    expect((await review()).pairs).toHaveLength(2);
    expect((await flagsOf(idea.id)).map((f) => f.message)).toEqual(['This statement appears to conflict with another statement marked Canon: “500 years ago”.']);
    expect((await flagsOf(settled.id)).map((f) => f.message).sort()).toEqual(['A provisional statement appears to differ from this one: “50 years ago”.', 'A provisional statement appears to differ from this one: “900 years ago”.']);
  });

  it('compares a fact with the field of the same name on the entry it is about', async () => {
    const { c, fact, flagsOf, alex } = await world();
    await c.update(alex.id, { fields: [{ id: 'f1', key: 'Age', value: '17' }, { id: 'f2', key: 'Eyes', value: 'Grey' }] });
    const differs = await fact('age', 'Nineteen', 'canon', [alex.id]);
    const agrees = await fact('Age', 'Alex is 17 at the start', 'canon', [alex.id]);
    const other = await fact('Eyes', 'Grey', 'canon', [alex.id]);
    expect((await flagsOf(differs.id)).map((f) => f.message)).toContain("This statement appears to differ from Alex's codex profile, which gives Age as “17”.");
    expect((await flagsOf(agrees.id)).filter((f) => f.kind === 'field')).toEqual([]);
    expect(await flagsOf(other.id)).toEqual([]);
  });

  it('lets the author link a contradiction, set one aside, and bring it back', async () => {
    const { k, fact, flagsOf, review } = await world();
    const a = await fact('Founding', '500 years ago');
    const b = await fact('Founding', '1,000 years ago');
    const c = await fact('The First Empire', 'Fell 800 years ago');
    await k.linkConflict(c.id, a.id);
    await k.linkConflict(c.id, c.id);
    await k.linkConflict(c.id, 'nope');
    expect((await review()).pairs.map((p) => p.stated).sort()).toEqual([false, true]);
    expect(new Set((await flagsOf(a.id)).map((f) => `${f.otherId}:${Boolean(f.dismiss)}`))).toEqual(new Set([`${b.id}:true`, `${c.id}:false`]));

    await k.dismiss(b.id, { factId: a.id });
    await k.dismiss(b.id, { factId: a.id });
    expect((await k.get(b.id))!.dismissed).toEqual([{ factId: a.id }]);
    expect((await flagsOf(a.id)).map((f) => f.otherId)).toEqual([c.id]);
    expect(await flagsOf(b.id)).toEqual([]);
    await k.undismiss(a.id);
    expect((await flagsOf(b.id)).map((f) => f.otherId)).toEqual([a.id]);

    await k.unlinkConflict(a.id, c.id);
    expect((await k.get(c.id))!.conflictsWith).toEqual([]);
    expect((await review()).pairs).toHaveLength(1);
  });

  it('notes a fact marked Conflicting that has nothing to conflict with', async () => {
    const { fact, flagsOf } = await world();
    const lonely = await fact('Moons', 'Two', 'conflicting');
    expect((await flagsOf(lonely.id)).map((f) => f.kind)).toEqual(['unpaired']);
  });

  it('never changes a status, a statement or anything else it reviews', async () => {
    const { k, c, m, fact, alex } = await world();
    await c.update(alex.id, { fields: [{ id: 'f1', key: 'Age', value: '17' }] });
    const a = await fact('Founding', '500 years ago');
    const b = await fact('Founding', '1,000 years ago', 'provisional');
    await fact('Age', '19', 'canon', [alex.id]);
    await fact('Moons', 'Two', 'conflicting');
    await k.linkConflict(a.id, b.id);
    const dump = async () => JSON.stringify(await Promise.all(db.tables.map((table) => table.toArray())));
    const before = await dump();
    const [facts, entries, nodes] = [await k.list(), await c.list(), await m.list()];
    const frozen = JSON.stringify([facts, entries, nodes]);
    const { reviews } = reviewCanon(facts, entries, nodes, builtinCategory);
    expect(reviews.flatMap((r) => r.flags).length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify([facts, entries, nodes])).toBe(frozen);
    expect(await dump()).toBe(before);
    expect((await k.list()).map((f) => f.status).sort()).toEqual(['canon', 'canon', 'conflicting', 'provisional']);
  });
});

describe('canon and projects', () => {
  it('keeps facts inside their project, and carries them with their history through copies and backups', async () => {
    const { p, k, fact, alex, ch14 } = await world();
    const old = await fact('Magic price', 'Costs memory', 'retconned');
    const now = await fact('Magic price', 'Costs blood', 'canon', [alex.id]);
    const rival = await fact('Magic price', 'Costs years', 'canon', [alex.id]);
    await k.update(old.id, { replacedById: now.id });
    await k.revise(now.id, { statement: 'Costs blood, drop for drop', reason: 'Sharper rule' });
    await k.addSource(now.id, { type: 'chapter', refId: ch14.id, quote: 'drank the light' });
    await k.addSource(now.id, { type: 'entry', refId: alex.id });
    await k.linkConflict(now.id, old.id);
    await k.dismiss(now.id, { factId: rival.id });
    await k.dismiss(now.id, { entryId: alex.id, field: 'Price' });

    const other = canon.forProject((await projects.create({ title: 'Other' })).id);
    expect(await other.list()).toEqual([]);
    expect(await other.get(now.id)).toBeUndefined();
    for (const attempt of [other.update(now.id, { subject: 'x' }), other.setStatus(now.id, 'non-canon'), other.revise(now.id, { statement: 'x' }), other.addSource(now.id, { type: 'note', note: 'x' }), other.remove(now.id)]) {
      await expect(attempt).rejects.toThrow('not found');
    }
    const theirs = await other.create({ subject: 'Theirs', entryIds: [alex.id] });
    await other.update(theirs.id, { replacedById: now.id });
    await other.linkConflict(theirs.id, now.id);
    expect(await other.addSource(theirs.id, { type: 'chapter', refId: ch14.id, quote: 'drank the light' })).toMatchObject({ type: 'note', refId: null, block: null });
    expect(await other.get(theirs.id)).toMatchObject({ entryIds: [], replacedById: null, conflictsWith: [] });
    expect(await other.locate(ch14.id, 'drank the light')).toBeNull();

    const original = (await k.get(now.id))!;
    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const facts = await canon.forProject(projectId).list();
      const entries = await codex.forProject(projectId).list();
      const nodes = await manuscript.forProject(projectId).list();
      const copy = facts.find((f) => f.statement === 'Costs blood, drop for drop')!;
      const oldCopy = facts.find((f) => f.status === 'retconned')!;
      const rivalCopy = facts.find((f) => f.statement === 'Costs years')!;
      const alexCopy = entries.find((e) => e.name === 'Alex')!;
      expect(copy.id).not.toBe(now.id);
      expect(copy.entryIds).toEqual([alexCopy.id]);
      expect(copy.conflictsWith).toEqual([oldCopy.id]);
      expect(oldCopy.replacedById).toBe(copy.id);
      expect(copy.dismissed).toEqual([{ factId: rivalCopy.id }, { entryId: alexCopy.id, field: 'Price' }]);
      expect(copy.sources.map((s) => [s.type, nodes.find((x) => x.id === s.refId)?.title ?? entries.find((e) => e.id === s.refId)?.name, s.block])).toEqual([['chapter', 'Chapter 14', 2], ['entry', 'Alex', null]]);
      // The history arrives exactly as it was recorded, dates and all.
      expect(copy.history).toEqual(original.history);
    }
    await projects.remove(p.id);
    expect(await k.list()).toEqual([]);
    expect(await other.list()).toHaveLength(1);
  });
});
