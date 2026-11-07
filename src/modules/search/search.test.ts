import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { docBlocks } from './extract';
import { buildIndex } from './query';
import { createSearchService, registerSearch, type SearchService } from './service';
import type { GroupResult, SearchBlock } from './types';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;
let search: SearchService;

const p = (text: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined });
const doc = (...content: object[]) => ({ type: 'doc', content });
const flat = (groups: GroupResult[]) => groups.map((g) => `${g.group}: ${g.items.map((i) => `${i.title}×${i.matchCount}`).join(', ')}`);
const text = (parts: { text: string; hit: boolean }[]) => parts.map((part) => (part.hit ? `[${part.text}]` : part.text)).join('');

beforeEach(() => {
  db = new NovelDB(`search-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerSearch(registry);
  manuscript = createManuscriptService(db, projects.contentChanged);
  codex = createCodexService(db, projects.contentChanged);
  search = createSearchService(db);
});

async function world() {
  const project = await projects.create({ title: 'Ashfall' });
  const m = manuscript.forProject(project.id);
  const c = codex.forProject(project.id);
  const gate = await m.create('chapter', null, 'The Black Gate');
  const scene = await m.create('scene', gate.id, 'Arrival');
  const volume = await m.create('volume', null, 'Book One');
  await m.saveDoc(gate.id, doc(
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Before the Storm' }] },
    p('The road ended at a wall of black stone.'),
    p(''),
    { type: 'blockquote', content: [p('Mira touched the gate, and the Emberfang grew warm at her hip.')] },
    p('Nobody answered. The wind carried ash.'),
  ), { words: 30, characters: 150 });
  await m.saveDoc(scene.id, doc(p('Rain. Then '), { type: 'paragraph', content: [{ type: 'text', text: 'Mi' }, { type: 'text', marks: [{ type: 'bold' }], text: 'ra' }, { type: 'text', text: ' laughed.' }] }), { words: 4, characters: 22 });
  await m.update(gate.id, { summary: 'Mira reaches the gate.', notes: 'Foreshadow the Emberfang betrayal.\nCheck the timeline.' });
  await m.update(volume.id, { notes: 'Emberfang arc starts here.' });

  const mira = await c.create('character', 'Mira Vale');
  const blade = await c.create('item', 'Emberfang');
  const city = await c.create('location', 'Cinderhold');
  await c.update(mira.id, { summary: 'A runaway fire-mage.', tags: ['protagonist', 'mage'], fields: [{ id: 'a', key: 'Power Rank', value: 'B+' }, { id: 'b', key: 'Weapon', value: 'Emberfang' }], notes: 'Secretly the heir of Cinderhold.' });
  await c.update(blade.id, { description: 'A short blade that drinks heat.\nForged in Cinderhold.' });
  await c.update(city.id, { summary: 'City of smiths.' });
  return { project, m, c, gate, scene, volume, mira, blade, city };
}

describe('indexing', () => {
  it('reads paragraphs and headings in editor order, across formatting', () => {
    expect(docBlocks(doc(p('one'), { type: 'blockquote', content: [p('two'), p('')] }, { type: 'heading', content: [{ type: 'text', text: 'H' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }))).toEqual([
      { heading: false, text: 'one' },
      { heading: false, text: 'two' },
      { heading: false, text: '' },
      { heading: true, text: 'H' },
      { heading: false, text: 'a\nb' },
    ]);
    expect(docBlocks(null)).toEqual([]);
  });

  it('indexes every kind of content as addressed blocks', async () => {
    const { project, gate, mira } = await world();
    const s = search.forProject(project.id);
    expect(await s.sync()).toBe(6);
    const blocks = await s.blocks();
    const of = (id: string) => blocks.filter((b) => b.entityId === id).map((b) => `${b.group}/${b.field}/${b.index}${b.label ? `/${b.label}` : ''}`);
    expect(of(gate.id)).toEqual(expect.arrayContaining(['manuscript/title/0', 'manuscript/heading/0', 'manuscript/body/1', 'manuscript/body/3', 'manuscript/body/4', 'notes/summary/0', 'notes/notes/0', 'notes/notes/1']));
    expect(of(gate.id)).not.toContain('manuscript/body/2'); // empty paragraph: skipped, but numbering is kept
    expect(of(mira.id)).toEqual(expect.arrayContaining(['character/name/0', 'character/summary/0', 'character/tags/0', 'character/attribute/0/Power Rank', 'character/attribute/1/Weapon', 'notes/notes/0']));
    expect(blocks.every((b) => b.projectId === project.id && b.id === `${b.entityId}:${b.field}:${b.index}`)).toBe(true);
  });

  it('re-indexes only what changed, and forgets what was deleted', async () => {
    const { project, m, c, gate, scene, blade } = await world();
    const s = search.forProject(project.id);
    await s.sync();
    expect(await s.sync()).toBe(0);

    await new Promise((r) => setTimeout(r, 2));
    await m.saveDoc(gate.id, doc(p('Entirely new opening about a lighthouse.')), { words: 6, characters: 40 });
    expect(await s.sync()).toBe(1);
    let engine = await s.open();
    expect(flat(engine.search('lighthouse', 'all'))).toEqual(['manuscript: The Black Gate×1']);
    expect(engine.search('black stone', 'manuscript')).toEqual([]);

    await m.remove(scene.id);
    await c.remove(blade.id);
    expect(await s.sync()).toBe(2);
    engine = await s.open();
    expect(engine.search('laughed', 'all')).toEqual([]);
    expect(flat(engine.search('emberfang', 'codex'))).toEqual(['character: Mira Vale×1']);
    expect((await s.blocks()).some((b) => b.entityId === scene.id || b.entityId === blade.id)).toBe(false);
  });

  it('picks up restores, imports and duplicates without being told', async () => {
    const { project, m, gate } = await world();
    await m.saveVersion(gate.id, 'v1');
    await new Promise((r) => setTimeout(r, 2));
    await m.saveDoc(gate.id, doc(p('Rewritten.')), { words: 1, characters: 10 });
    const s = search.forProject(project.id);
    expect((await s.open()).search('black stone', 'all')).toEqual([]);
    await new Promise((r) => setTimeout(r, 2));
    await m.restoreRevision(gate.id, (await m.revisions(gate.id))[0].id);
    expect(flat((await s.open()).search('black stone', 'all'))).toEqual(['manuscript: The Black Gate×2']); // title + paragraph

    const copy = await projects.duplicate(project.id);
    expect(await db.searchBlocks.where('projectId').equals(copy.id).count()).toBe(0); // index is not copied…
    expect(flat((await search.forProject(copy.id).open()).search('black stone', 'all'))).toEqual(['manuscript: The Black Gate×2']); // …it is rebuilt
  });
});

describe('searching', () => {
  it('finds a term everywhere at once, grouped by category', async () => {
    const { project } = await world();
    const engine = await search.forProject(project.id).open();
    expect(flat(engine.search('emberfang', 'all'))).toEqual([
      'manuscript: The Black Gate×1',
      'character: Mira Vale×1',
      'item: Emberfang×1',
      'notes: Book One×1, The Black Gate×1',
    ]);
    expect(flat(engine.search('CINDERHOLD', 'all'))).toEqual(['location: Cinderhold×1', 'item: Emberfang×1', 'notes: Mira Vale×1']);
  });

  it('narrows by scope', async () => {
    const { project } = await world();
    const engine = await search.forProject(project.id).open();
    expect(flat(engine.search('emberfang', 'manuscript'))).toEqual(['manuscript: The Black Gate×1']);
    expect(flat(engine.search('emberfang', 'codex'))).toEqual(['character: Mira Vale×1', 'item: Emberfang×1']);
    expect(flat(engine.search('emberfang', 'notes'))).toEqual(['notes: Book One×1, The Black Gate×1']);
  });

  it('highlights the term inside its surrounding text', async () => {
    const { project } = await world();
    const [group] = (await search.forProject(project.id).open()).search('gate', 'manuscript');
    const [chapter] = group.items;
    expect(chapter.title).toBe('The Black Gate');
    expect(chapter.snippets.map((s) => `${s.field}#${s.index}: ${text(s.parts)}`)).toEqual([
      'title#0: The Black [Gate]',
      'body#3: Mira touched the [gate], and the Emberfang grew warm at her hip.',
    ]);
    const body = chapter.snippets[1];
    expect(body.before).toBe('The road ended at a wall of black stone.');
    expect(body.after).toBe('Nobody answered. The wind carried ash.');
    expect(body.term).toBe('gate');
  });

  it('trims long paragraphs around the match', async () => {
    const project = await projects.create({ title: 'P' });
    const m = manuscript.forProject(project.id);
    const ch = await m.create('chapter');
    const long = `${'Lorem ipsum dolor sit amet. '.repeat(30)}The needle is here. ${'Consectetur adipiscing elit. '.repeat(30)}`;
    await m.saveDoc(ch.id, doc(p(long)), { words: 200, characters: long.length });
    const [snippet] = (await search.forProject(project.id).open()).search('needle', 'all')[0].items[0].snippets;
    const shown = text(snippet.parts);
    expect(shown.length).toBeLessThan(340);
    expect(shown.startsWith('…') && shown.endsWith('…')).toBe(true);
    expect(shown).toContain('The [needle] is here.');
  });

  it('matches all words anywhere in the same chapter or entry, and words split by formatting', async () => {
    const { project } = await world();
    const engine = await search.forProject(project.id).open();
    expect(flat(engine.search('wind stone', 'manuscript'))).toEqual(['manuscript: The Black Gate×2']); // different paragraphs
    expect(engine.search('wind lighthouse', 'manuscript')).toEqual([]);
    expect(flat(engine.search('mira laughed', 'manuscript'))).toEqual(['manuscript: Arrival×1']); // "Mi" + bold "ra"
    expect(flat(engine.search('power rank', 'codex'))).toEqual(['character: Mira Vale×1']); // custom field name
    expect(flat(engine.search('b+', 'codex'))).toEqual(['character: Mira Vale×1']); // custom field value
    expect(flat(engine.search('protagonist', 'all'))).toEqual(['character: Mira Vale×1']); // tag
    expect(flat(engine.search('storm', 'all'))).toEqual(['manuscript: The Black Gate×1']); // heading
  });

  it('ranks title and name matches first and ignores too-short or symbol-only input safely', async () => {
    const { project } = await world();
    const engine = await search.forProject(project.id).open();
    expect(engine.search('mira', 'codex')[0].items[0].title).toBe('Mira Vale');
    expect(engine.search('a', 'all')).toEqual([]);
    expect(engine.search('   ', 'all')).toEqual([]);
    expect(engine.search('.*(', 'all')).toEqual([]);
  });

  it('finds planning text under Notes, labelled by field', async () => {
    const { project, m, gate } = await world();
    await new Promise((r) => setTimeout(r, 2));
    await m.updatePlan(gate.id, { objective: 'Get through the obsidian door.', beats: [{ id: 'b', text: 'Arrive' }, { id: 'c', text: 'The obsidian door hums' }] });
    const groups = (await search.forProject(project.id).open()).search('obsidian', 'all');
    expect(flat(groups)).toEqual(['notes: The Black Gate×2']);
    expect(groups[0].items[0].snippets.map((s) => `${s.label}: ${text(s.parts)}`)).toEqual(['Objective: Objective: Get through the [obsidian] door.', 'Beat 2: Beat 2: The [obsidian] door hums']);
    expect((await search.forProject(project.id).open()).search('obsidian', 'manuscript')).toEqual([]);
  });

  it('never returns another project\'s text', async () => {
    const { project } = await world();
    const other = await projects.create({ title: 'Other' });
    const om = manuscript.forProject(other.id);
    const ch = await om.create('chapter', null, 'Elsewhere');
    await om.saveDoc(ch.id, doc(p('An Emberfang of a different world.')), { words: 6, characters: 34 });

    expect(flat((await search.forProject(other.id).open()).search('emberfang', 'all'))).toEqual(['manuscript: Elsewhere×1']);
    const mine = (await search.forProject(project.id).open()).search('emberfang', 'all');
    expect(mine.flatMap((g) => g.items.map((i) => i.title))).not.toContain('Elsewhere');

    await projects.remove(other.id);
    expect(await db.searchBlocks.where('projectId').equals(other.id).count()).toBe(0);
    expect(Object.keys((await projects.exportSnapshot(project.id)).collections)).not.toContain('searchBlocks');
  });
});

describe('performance', () => {
  it('searches a 300,000-word project in a few milliseconds', () => {
    const vocabulary = 'the of and a to in is that it was for on with as his her they at be this from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part'.split(' ');
    let seed = 1;
    const word = () => vocabulary[(seed = (seed * 1103515245 + 12345) % 2147483648) % vocabulary.length];
    const blocks: SearchBlock[] = [];
    for (let chapter = 0; chapter < 300; chapter++) {
      for (let paragraph = 0; paragraph < 10; paragraph++) {
        const words = Array.from({ length: 100 }, word);
        if (chapter === 217 && paragraph === 6) words[50] = 'Emberfang';
        blocks.push({ id: `c${chapter}:body:${paragraph}`, projectId: 'p', entityType: 'node', entityId: `c${chapter}`, entityTitle: `Chapter ${chapter + 1}`, entityKind: 'chapter', group: 'manuscript', field: 'body', label: '', index: paragraph, text: words.join(' ') });
      }
    }
    expect(blocks.length * 100).toBe(300_000);

    const built = performance.now();
    const engine = buildIndex(blocks);
    const buildMs = performance.now() - built;

    const time = (query: string) => {
      const start = performance.now();
      const results = engine.search(query, 'all');
      return { ms: performance.now() - start, results };
    };
    const rare = time('emberfang');
    const common = time('water'); // appears in nearly every chapter
    const phrase = time('people water time');
    console.log(`index build ${buildMs.toFixed(1)}ms · rare ${rare.ms.toFixed(1)}ms · common ${common.ms.toFixed(1)}ms · 3 words ${phrase.ms.toFixed(1)}ms`);

    expect(flat(rare.results)).toEqual(['manuscript: Chapter 218×1']);
    expect(rare.results[0].items[0].snippets[0].index).toBe(6);
    expect(common.results[0].items.length).toBeGreaterThan(250);
    // Generous ceilings (a frame is 16ms); typical numbers are printed above.
    expect(buildMs).toBeLessThan(500);
    expect(rare.ms).toBeLessThan(100);
    expect(common.ms).toBeLessThan(400);
  });
});
