import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import type { StoryNode } from '@/modules/manuscript/types';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createContinuityService, registerContinuity, type ContinuityService } from './service';
import { ageOf, colourOf, durationsIn, find, fingerprint, isActing, isUsed, paragraphsOf, toNumber } from './text';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;
let continuity: ContinuityService;

beforeEach(() => {
  db = new NovelDB(`continuity-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerContinuity(registry);
  manuscript = createManuscriptService(db, projects.contentChanged);
  codex = createCodexService(db, projects.contentChanged);
  continuity = createContinuityService(db, projects.contentChanged);
});

type Inline = string | { link: string; text: string };
const para = (...parts: Inline[]) => ({
  type: 'paragraph',
  content: parts.filter((p) => (typeof p === 'string' ? p : p.text)).map((p) => (typeof p === 'string' ? { type: 'text', text: p } : { type: 'text', text: p.text, marks: [{ type: 'entityLink', attrs: { entryId: p.link } }] })),
});

async function world() {
  const p = await projects.create({ title: 'P' });
  const m = manuscript.forProject(p.id);
  const c = codex.forProject(p.id);
  const k = continuity.forProject(p.id);
  const chapters: StoryNode[] = [];
  for (let i = 1; i <= 6; i++) chapters.push(await m.create('chapter', null, `Chapter ${i}`));
  /** Saves text for a chapter (1-based), one paragraph per argument. */
  const write = (chapter: number | StoryNode, ...paragraphs: (Inline | Inline[])[]) => {
    const node = typeof chapter === 'number' ? chapters[chapter - 1] : chapter;
    return db.chapterContents.put({ id: node.id, projectId: p.id, doc: { type: 'doc', content: paragraphs.map((x) => (Array.isArray(x) ? para(...x) : para(x))) } });
  };
  const mira = await c.create('character', 'Mira');
  const bren = await c.create('character', 'Bren');
  const sword = await c.create('item', 'Sunblade');
  const capital = await c.create('location', 'Capital');
  const academy = await c.create('location', 'Academy');
  const solar = await c.create('power', 'Solar Absorption');
  const found = async () => (await k.run()).open.map((i) => `${i.severity}: ${i.message}`);
  return { p, m, c, k, chapters, write, mira, bren, sword, capital, academy, solar, found };
}

describe('reading the text', () => {
  it('reads paragraphs with the same numbering as the editor, and the links inside them', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'One' }] }, para(''), { type: 'blockquote', content: [para('He saw ', { link: 'e1', text: 'the ' }, { link: 'e1', text: 'heir' }, '.')] }] };
    expect(paragraphsOf(doc)).toEqual([{ index: 0, text: 'One', links: [] }, { index: 1, text: '', links: [] }, { index: 2, text: 'He saw the heir.', links: [{ entryId: 'e1', text: 'the heir' }] }]);
    expect(paragraphsOf(null)).toEqual([]);
  });

  it('finds names as whole words, as written', () => {
    expect(find('Ash fell. Ashes and ash. Ash!', ['Ash']).map((f) => f.index)).toEqual([0, 25]);
    expect(find('Under the Ground, underground.', ['underground'], true).map((f) => f.text)).toEqual(['underground']);
    expect(find('x', ['', '  '])).toEqual([]);
  });

  it('tells acting from being remembered', () => {
    const acting = (text: string) => find(text, ['Mira']).some((at) => isActing(text, at));
    for (const text of ['Mira smiled.', '"No," said Mira.', 'Mira quietly asked why.', 'Then Mira, laughed.']) expect(acting(text), text).toBe(true);
    for (const text of ['They spoke of Mira often.', 'Mira had said as much, once.', "Mira's grave was bare.", 'He missed Mira.']) expect(acting(text), text).toBe(false);
  });

  it('tells handling an item from talking about it', () => {
    const used = (text: string) => find(text, ['Sunblade']).some((at) => isUsed(text, at));
    for (const text of ['He drew the Sunblade.', 'Drawing his old Sunblade, he ran.', 'The Sunblade in her hand hummed.', 'She raised Sunblade high.']) expect(used(text), text).toBe(true);
    for (const text of ['Where was the Sunblade now?', 'They mourned the Sunblade.', 'He drew a breath and thought of the long road to the Sunblade.']) expect(used(text), text).toBe(false);
  });

  it('reads numbers, lengths of time, ages and colours', () => {
    expect(['19', 'nineteen', 'twenty-two', 'a', 'many'].map(toNumber)).toEqual([19, 19, 22, 1, null]);
    expect(durationsIn('Two hours later, after 3 days and half an hour, a week passed. Several days. One of them.').map((d) => `${d.amount} ${d.unit}`)).toEqual(['2 hours', '3 days', '0.5 hours', '1 weeks']);
    expect(ageOf('Mira was nineteen years old.', ['Mira'])?.age).toBe(19);
    expect(ageOf('A nineteen-year-old Mira would not have.', ['Mira'])?.age).toBe(19);
    expect(ageOf('Mira, 19, laughed.', ['Mira'])?.age).toBe(19);
    expect(ageOf('Mira was 19.', ['Mira'])?.age).toBe(19);
    expect(ageOf('Mira was one of them. Mira was 3 miles away.', ['Mira'])).toBeNull();
    expect(colourOf("Mira's cold blue eyes narrowed.", 'eyes', ['Mira'])?.text).toBe("Mira's cold blue eyes");
    expect(colourOf('Mira shook out her hair. Her hair was black.', 'hair', ['Mira'])?.text).toBe('Her hair was black');
    expect(colourOf('Mira watched the blue sea with tired eyes.', 'eyes', ['Mira'])).toBeNull();
    expect(fingerprint('  The   SAME words ')).toBe(fingerprint('the same words'));
  });
});

describe('continuity checks', () => {
  it('raises a critical alert when a deceased character speaks or acts later', async () => {
    const { k, write, mira, chapters, found } = await world();
    await write(2, 'Mira smiled.', 'Mira fell and did not rise.');
    await write(3, 'They buried her at dawn.');
    await write(5, 'The hall was quiet.', '"You came," said Mira.', 'Mira laughed.');
    const rule = await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[1].id });
    expect(await found()).toEqual([
      'critical: Mira is recorded as deceased from Chapter 2, and appears to speak or act in Chapter 5.',
      'critical: Mira is recorded as deceased from Chapter 2, and appears to speak or act in Chapter 5.',
    ]);
    const [issue] = (await k.run()).open;
    expect(issue).toMatchObject({ category: 'status', nodeId: chapters[4].id, nodeTitle: 'Chapter 5', block: 1, excerpt: '"You came," said Mira.', match: 'Mira', entryIds: [mira.id], ruleId: rule.id });
  });

  it('only notes, once a chapter, when the dead are talked about', async () => {
    const { k, write, mira, chapters, found } = await world();
    await write(4, 'They spoke of Mira often.', 'He missed Mira.', 'Mira had said as much.');
    await write(5, 'Nobody mentioned her.');
    await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[1].id });
    expect(await found()).toEqual(['info: Mira is recorded as deceased from Chapter 2, and is mentioned in Chapter 4. Nothing to do if they are being remembered.']);
  });

  it('applies a state only between where it starts and where it ends, and to scenes too', async () => {
    const { k, m, write, mira, chapters, found } = await world();
    const scene = await m.create('scene', chapters[1].id, 'The fall');
    const later = await m.create('scene', chapters[3].id, 'The wake');
    await write(1, 'Mira smiled.');
    await write(scene, 'Mira smiled.');
    await write(later, 'Mira smiled.');
    await write(6, 'Mira smiled.');
    const rule = await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[1].id });
    expect(await found()).toEqual([
      'critical: Mira is recorded as deceased from Chapter 2, and appears to speak or act in The wake.',
      'critical: Mira is recorded as deceased from Chapter 2, and appears to speak or act in Chapter 6.',
    ]);
    // She is brought back in chapter 6.
    await k.updateRule(rule.id, { untilNodeId: chapters[5].id });
    expect(await found()).toHaveLength(1);
    // With no starting point, the state holds from the first page.
    await k.updateRule(rule.id, { fromNodeId: null, untilNodeId: null });
    expect(await found()).toHaveLength(4);
    expect((await found())[0]).toContain('from the start of the story');
  });

  it('follows a character through other names and linked words', async () => {
    const { k, write, mira, chapters, found } = await world();
    await write(3, [{ link: mira.id, text: 'The heir' }, ' nodded.'], 'The Grey Lady whispered a name.');
    const rule = await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[0].id });
    expect(await found()).toHaveLength(1);
    await k.updateRule(rule.id, { aliases: ['the Grey Lady', 'The Grey Lady'] });
    expect(await found()).toHaveLength(2);
  });

  it('warns when someone away acts, or when a recorded change does not fit the words', async () => {
    const { k, write, mira, bren, chapters, found } = await world();
    await write(4, 'Mira walked into the hall.', 'Bren clapped with both hands.', 'Bren waited.');
    await k.createRule('status', { entryId: mira.id, state: 'absent', label: 'imprisoned in the Keep', fromNodeId: chapters[0].id });
    await k.createRule('status', { entryId: bren.id, state: 'condition', label: 'lost his right hand', words: ['both hands', 'right hand'], fromNodeId: chapters[0].id });
    expect(await found()).toEqual([
      'warning: Mira is recorded as imprisoned in the Keep from Chapter 1, and appears to speak or act in Chapter 4.',
      'warning: Bren is recorded as “lost his right hand” from Chapter 1; “both hands” in Chapter 4 may not fit.',
    ]);
  });

  it('warns when a lost item is used, and when a held item is used by someone else', async () => {
    const { k, c, write, mira, sword, chapters, found } = await world();
    const ring = await c.create('item', 'Ember Ring');
    await write(2, 'The Sunblade sank into the lake.');
    await write(4, 'Bren drew the Sunblade.', 'Where was the Sunblade now?', 'Bren wore the Ember Ring openly.', 'Mira raised the Ember Ring.', 'Mira let Bren hold the Ember Ring.');
    await k.createRule('possession', { entryId: sword.id, state: 'lost', fromNodeId: chapters[1].id });
    await k.createRule('possession', { entryId: ring.id, state: 'held', holderId: mira.id, fromNodeId: chapters[0].id });
    expect(await found()).toEqual([
      'warning: Sunblade is recorded as lost from Chapter 2, and appears to be used in Chapter 4.',
      'warning: Ember Ring is recorded as held by Mira from Chapter 1; in Chapter 4 it appears to be used in a passage that names Bren and not Mira.',
    ]);
  });

  it('compares travel times in the text with the recorded one', async () => {
    const { k, write, capital, academy, found } = await world();
    await write(1, 'They left the Capital at noon.', 'Two hours later the Academy gates rose ahead.');
    await write(2, 'From the Capital the road to the Academy took three days, as it always did.');
    await write(3, 'The Capital slept. The ride to the Academy took the caravan two weeks.');
    await write(4, 'Two hours later she was still in the Capital.');
    await k.createRule('travel', { entryId: capital.id, toEntryId: academy.id, amount: 3, unit: 'days' });
    expect(await found()).toEqual([
      'warning: Travel between Capital and Academy is recorded as 3 days; Chapter 1 appears to cover it in 2 hours.',
      'info: Travel between Capital and Academy is recorded as 3 days; Chapter 3 mentions 2 weeks.',
    ]);
    expect((await k.run()).open[0]).toMatchObject({ block: 1, match: 'Two hours', fix: { type: 'travel', amount: 2, unit: 'hours' } });
  });

  it('checks an ability against the conditions that block it', async () => {
    const { k, m, write, solar, chapters, found } = await world();
    const scene = await m.create('scene', chapters[2].id, 'Scene 2');
    await write(scene, 'The lab was sealed, far underground.', 'She waited.', 'Then she called on Solar Absorption.');
    await write(4, 'On the roof at noon she used Solar Absorption.');
    const rule = await k.createRule('power', { entryId: solar.id, label: 'Needs direct sunlight', words: 'underground, night, sealed room' });
    expect(await found()).toEqual(['warning: Solar Absorption has the rule “Needs direct sunlight”. It appears to be used in Scene 2, where “underground” is mentioned (paragraph 1).']);
    expect((await k.run()).open[0]).toMatchObject({ block: 2, fix: { type: 'unblock', word: 'underground' } });
    await k.updateRule(rule.id, { scope: 'paragraph' });
    expect(await found()).toEqual([]);
  });

  it('compares ages and colours in the text with the character profile', async () => {
    const { c, write, mira, bren, found } = await world();
    await c.update(mira.id, { fields: [{ id: 'a', key: 'Age', value: '17' }, { id: 'e', key: 'Eyes', value: 'Grey' }, { id: 'h', key: 'Hair', value: 'Black, cropped' }] });
    await c.update(bren.id, { fields: [{ id: 'e', key: 'Eye colour', value: 'brown' }] });
    await write(1, 'Mira was seventeen years old. Her gray eyes were tired, and her black hair was wet.');
    await write(2, 'Mira was eighteen years old that spring.', 'Mira laughed. Her blue eyes shone.', "Mira's hair was red in the firelight.");
    await write(3, 'Mira, 40, said nothing.', 'Mira looked at Bren and his green eyes.');
    expect(await found()).toEqual([
      "warning: Mira's eyes are “Grey” on their profile; Chapter 2 describes them as blue.",
      "warning: Mira's hair is “Black, cropped” on their profile; Chapter 2 describes it as red.",
      "warning: Mira's age is 17 on their profile; Chapter 3 gives it as 40.",
      "info: Mira's age is 17 on their profile; Chapter 2 gives it as 18.",
    ]);
  });

  it('ranks findings by severity, then by where they are in the book', async () => {
    const { k, write, mira, sword, chapters } = await world();
    await write(5, 'Mira drew the Sunblade.', 'Mira smiled.');
    await write(3, 'Mira smiled.');
    await write(4, 'He missed Mira.');
    await k.createRule('possession', { entryId: sword.id, state: 'destroyed', fromNodeId: chapters[0].id });
    await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[0].id });
    const result = await k.run();
    expect(result.open.map((i) => `${i.severity} ${i.nodeTitle} ¶${i.block + 1}`)).toEqual(['critical Chapter 3 ¶1', 'critical Chapter 5 ¶1', 'critical Chapter 5 ¶2', 'warning Chapter 5 ¶1', 'info Chapter 4 ¶1']);
    expect(result.scanned).toEqual({ documents: 6, paragraphs: 4, rules: 2 });
  });
});

describe('resolving findings', () => {
  it('keeps intentional and dismissed findings out of later checks, and brings them back on request', async () => {
    const { k, write, mira, chapters } = await world();
    await write(3, 'Mira smiled.', 'Mira nodded.', 'He missed Mira.');
    await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[0].id });
    const first = await k.run();
    expect(first.open).toHaveLength(2);
    const flashback = await k.resolve(first.open[0], 'intentional', ' Flashback sequence ');
    await k.resolve(first.open[1], 'dismissed');
    expect(flashback).toMatchObject({ kind: 'intentional', note: 'Flashback sequence', nodeId: chapters[2].id, message: first.open[0].message });

    const second = await k.run();
    expect(second.open).toEqual([]);
    expect(second.resolved.map((r) => `${r.resolution.kind}:${r.resolution.note}`)).toEqual(['intentional:Flashback sequence', 'dismissed:']);
    // Deciding again replaces the decision instead of piling up.
    await k.resolve(first.open[0], 'dismissed');
    expect(await k.resolutions()).toHaveLength(2);

    await k.reopen(flashback.id);
    expect((await k.run()).open.map((i) => i.key)).toEqual([first.open[0].key]);
  });

  it('holds a decision when other text moves, and asks again when the passage itself changes', async () => {
    const { k, write, mira, chapters } = await world();
    await write(3, 'Mira smiled.');
    await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[0].id });
    await k.resolve((await k.run()).open[0], 'intentional', 'Dream');
    await write(3, 'A new opening line.', 'And another.', 'Mira smiled.');
    expect((await k.run()).open).toEqual([]);
    await write(3, 'A new opening line.', 'Mira smiled and drew a knife.');
    const result = await k.run();
    expect(result.open).toHaveLength(1);
    expect(result.stale.map((r) => r.note)).toEqual(['Dream']);
  });

  it('updates canon only as the confirmed fix says', async () => {
    const { k, c, write, mira, sword, capital, academy, solar, chapters } = await world();
    await c.update(mira.id, { fields: [{ id: 'a', key: 'Age', value: '17 (at the start)' }, { id: 'e', key: 'Eyes', value: 'Grey' }] });
    await write(1, 'They left the Capital. Two hours later the Academy rose ahead.');
    await write(4, 'Mira smiled. Mira was nineteen years old.', 'Bren drew the Sunblade underground, calling on Solar Absorption.');
    const death = await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[1].id });
    const lost = await k.createRule('possession', { entryId: sword.id, state: 'lost', fromNodeId: chapters[1].id });
    const road = await k.createRule('travel', { entryId: capital.id, toEntryId: academy.id, amount: 3, unit: 'days' });
    const sun = await k.createRule('power', { entryId: solar.id, words: ['Underground', 'night'] });
    const before = await k.run();
    expect(before.open.map((i) => i.category).sort()).toEqual(['possession', 'power', 'status', 'trait', 'travel']);
    for (const issue of before.open) {
      expect(issue.fixSummary).not.toBe('');
      await k.applyFix(issue.fix!);
    }
    const rules = new Map((await k.rules()).map((r) => [r.id, r]));
    expect(rules.get(death.id)!.untilNodeId).toBe(chapters[3].id);
    expect(rules.get(lost.id)!.untilNodeId).toBe(chapters[3].id);
    expect(rules.get(road.id)).toMatchObject({ amount: 2, unit: 'hours' });
    expect(rules.get(sun.id)!.words).toEqual(['night']);
    expect((await c.get(mira.id))!.fields).toEqual([{ id: 'a', key: 'Age', value: '19 (at the start)' }, { id: 'e', key: 'Eyes', value: 'Grey' }]);
    expect((await k.run()).open).toEqual([]);
    await expect(k.applyFix({ type: 'field', entryId: mira.id, fieldId: 'nope', value: 'x' })).rejects.toThrow('no longer exists');
  });

  it('never changes the manuscript, the codex, a rule or a decision by running a check', async () => {
    const { k, c, write, mira, sword, capital, academy, solar, chapters } = await world();
    await c.update(mira.id, { fields: [{ id: 'a', key: 'Age', value: '17' }] });
    await write(1, 'They left the Capital. Two hours later the Academy rose ahead.');
    await write(4, 'Mira smiled. Mira was nineteen years old.', 'Bren drew the Sunblade underground, calling on Solar Absorption.');
    await k.createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: chapters[1].id });
    await k.createRule('possession', { entryId: sword.id, state: 'lost', fromNodeId: chapters[1].id });
    await k.createRule('travel', { entryId: capital.id, toEntryId: academy.id, amount: 3, unit: 'days' });
    await k.createRule('power', { entryId: solar.id, words: ['underground'] });
    await k.resolve((await k.run()).open[0], 'dismissed');
    const dump = async () => JSON.stringify(await Promise.all(db.tables.map((table) => table.toArray())));
    const before = await dump();
    for (let i = 0; i < 3; i++) expect((await k.run()).open).toHaveLength(4);
    expect(await dump()).toBe(before);
  });
});

describe('continuity and projects', () => {
  it('validates rules, keeps them in their project, and carries rules and decisions through copies and backups', async () => {
    const { p, k, write, mira, sword, capital, academy, chapters } = await world();
    await write(3, 'Mira smiled.', 'Mira nodded.');
    const death = await k.createRule('status', { entryId: mira.id, state: 'lost' as 'deceased', fromNodeId: chapters[0].id, aliases: 'the heir, , the heir', amount: 5, toEntryId: academy.id });
    expect(death).toMatchObject({ state: 'deceased', aliases: ['the heir'], amount: null, toEntryId: null, holderId: null, scope: 'scene' });
    expect(await k.createRule('travel', { entryId: capital.id, toEntryId: 'nope', amount: -2, unit: 'years' as 'days', fromNodeId: chapters[0].id })).toMatchObject({ toEntryId: null, amount: null, unit: 'days', fromNodeId: null, state: null });
    await k.createRule('possession', { entryId: sword.id, state: 'held', holderId: mira.id });
    const [flag, second] = (await k.run()).open;
    await k.resolve(flag, 'intentional', 'Disguise');

    const other = continuity.forProject((await projects.create({ title: 'Other' })).id);
    expect([await other.rules(), await other.resolutions(), (await other.run()).open]).toEqual([[], [], []]);
    await expect(other.updateRule(death.id, { label: 'x' })).rejects.toThrow('not found');
    await expect(other.removeRule(death.id)).rejects.toThrow('not found');
    await expect(other.applyFix({ type: 'end-rule', ruleId: death.id, nodeId: chapters[2].id })).rejects.toThrow('not found');
    expect(await other.createRule('status', { entryId: mira.id, fromNodeId: chapters[0].id })).toMatchObject({ entryId: null, fromNodeId: null });

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const copy = continuity.forProject(projectId);
      const entries = await codex.forProject(projectId).list();
      const rules = await copy.rules();
      const held = rules.find((r) => r.kind === 'possession')!;
      expect(rules).toHaveLength(3);
      expect(rules.every((r) => r.id !== death.id && r.projectId === projectId)).toBe(true);
      expect([entries.find((e) => e.id === held.entryId)?.name, entries.find((e) => e.id === held.holderId)?.name]).toEqual(['Sunblade', 'Mira']);
      // The decision still answers the same finding in the copy; the other finding is still open.
      const result = await copy.run();
      expect(result.resolved.map((r) => r.resolution.note)).toEqual(['Disguise']);
      expect(result.open.map((i) => i.block)).toEqual([second.block]);
      expect(result.stale).toEqual([]);
    }
    await k.removeRule(death.id);
    expect((await k.run()).stale.map((r) => r.note)).toEqual(['Disguise']);
    await projects.remove(p.id);
    expect([await k.rules(), await k.resolutions()]).toEqual([[], []]);
  });
});
