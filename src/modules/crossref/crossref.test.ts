import { getSchema } from '@tiptap/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createExtensions } from '@/modules/manuscript/editor/extensions';
import { findSuggestions, firstLinkTo, mentionsIn, remapLinks } from '@/modules/manuscript/editor/references';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { chaptersReferencing, entriesReferencedBy } from './graph';

const schema = getSchema(createExtensions());
const t = (text: string, entryId?: string, ...marks: string[]) => ({ type: 'text', text, marks: [...marks.map((type) => ({ type })), ...(entryId ? [{ type: 'entityLink', attrs: { entryId } }] : [])] });
const p = (...content: object[]) => ({ type: 'paragraph', content });
const doc = (...content: object[]) => ({ type: 'doc', content });
const pm = (json: object) => schema.nodeFromJSON(json);

describe('links inside the text', () => {
  it('are part of the document format and survive a round trip', () => {
    const json = doc(p(t('She reached the '), t('Royal Academy', 'loc-1'), t(' at dusk with '), t('Mira', 'char-1', 'bold'), t('.')));
    const node = pm(json);
    expect(node.textContent).toBe('She reached the Royal Academy at dusk with Mira.');
    expect(mentionsIn(node.toJSON()).sort()).toEqual(['char-1', 'loc-1']);
    expect(mentionsIn(doc(p(t('No links here.'))))).toEqual([]);
    expect(mentionsIn(null)).toEqual([]);
    expect(firstLinkTo(node, 'loc-1', schema.marks.entityLink)).toEqual({ from: 17, to: 30 });
    expect(firstLinkTo(node, 'nobody', schema.marks.entityLink)).toBeNull();
  });

  it('are re-pointed, text untouched, when a project is copied', () => {
    const json = doc(p(t('To the '), t('Academy', 'old-loc'), t('.')), { type: 'blockquote', content: [p(t('Mira', 'old-char', 'italic'))] });
    const copy = remapLinks(json, (id) => ({ 'old-loc': 'new-loc', 'old-char': 'new-char' })[id] ?? id);
    expect(mentionsIn(copy).sort()).toEqual(['new-char', 'new-loc']);
    expect(pm(copy).textContent).toBe(pm(json).textContent);
    expect(JSON.stringify(copy).replaceAll('new-', 'old-')).toBe(JSON.stringify(json));
    expect(mentionsIn(json).sort()).toEqual(['old-char', 'old-loc']); // the original is not modified
  });
});

describe('suggesting links (opt-in detection)', () => {
  const entities = [{ id: 'will', name: 'Will' }, { id: 'academy', name: 'Royal Academy' }, { id: 'royal', name: 'Royal' }, { id: 'mira', name: 'Mira' }, { id: 'x', name: 'X' }];
  const found = (json: object) => findSuggestions(pm(json), entities, schema.marks.entityLink).map((s) => `${s.text}→${s.entryId}`);

  it('finds exact, whole-word, case-sensitive names and prefers the longest', () => {
    expect(found(doc(p(t('Will said he will go to the Royal Academy. "Mira!" Miranda called. A Royal decree. willing Will\'s'))))).toEqual(['Will→will', 'Royal Academy→academy', 'Mira→mira', 'Royal→royal', 'Will→will']);
  });

  it('skips text that is already linked, and names split by formatting still match', () => {
    expect(found(doc(p(t('Mira', 'mira'), t(' met Mi'), t('ra', undefined, 'bold'), t(' and Will.'))))).toEqual(['Mira→mira', 'Will→will']);
  });

  it('gives positions that cover exactly the name', () => {
    const node = pm(doc(p(t('Hello Mira.')), p(t('And Will.'))));
    const suggestions = findSuggestions(node, entities, schema.marks.entityLink);
    expect(suggestions.map((s) => node.textBetween(s.from, s.to))).toEqual(['Mira', 'Will']);
  });

  it('suggests nothing without entries, and ignores one-letter names', () => {
    expect(findSuggestions(pm(doc(p(t('Will X Mira')))), [], schema.marks.entityLink)).toEqual([]);
    expect(found(doc(p(t('Plan X.'))))).toEqual([]);
  });
});

describe('backlinks across the project', () => {
  let db: NovelDB;
  let projects: ProjectService;
  let manuscript: ManuscriptService;
  let codex: CodexService;
  let n = 0;

  beforeEach(() => {
    db = new NovelDB(`crossref-${++n}`);
    const registry = createProjectRegistry();
    projects = createProjectService(db, registry);
    registerManuscript(registry);
    registerCodex(registry);
    manuscript = createManuscriptService(db, projects.contentChanged);
    codex = createCodexService(db, projects.contentChanged);
  });

  async function world() {
    const project = await projects.create({ title: 'P' });
    const m = manuscript.forProject(project.id);
    const c = codex.forProject(project.id);
    const mira = await c.create('character', 'Mira');
    const academy = await c.create('location', 'Royal Academy');
    const guild = await c.create('faction', 'Ash Guild');
    const ch1 = await m.create('chapter');
    const scene = await m.create('scene', ch1.id);
    const ch2 = await m.create('chapter');
    await m.saveDoc(ch1.id, doc(p(t('To the '), t('Royal Academy', academy.id), t(' went '), t('Mira', mira.id), t('.'))), { words: 6, characters: 30 });
    await m.saveDoc(scene.id, doc(p(t('Mira', mira.id), t(' again.'))), { words: 2, characters: 11 });
    await m.updatePlan(ch2.id, { entityIds: [mira.id, guild.id] });
    await m.updatePlan(ch1.id, { entityIds: [mira.id] });
    return { project, m, c, mira, academy, guild, ch1, scene, ch2 };
  }
  const backlinks = async (m: ReturnType<ManuscriptService['forProject']>, entryId: string) =>
    chaptersReferencing(entryId, await m.list(), await m.plans()).map((r) => `${r.node.title}${r.inText ? ' [text]' : ''}${r.inPlan ? ' [plan]' : ''}`);

  it('every save records which entries the text links to', async () => {
    const { m, ch1, scene, ch2, mira, academy } = await world();
    expect((await m.get(ch1.id))!.mentions!.sort()).toEqual([academy.id, mira.id].sort());
    expect((await m.get(scene.id))!.mentions).toEqual([mira.id]);
    expect((await m.get(ch2.id))!.mentions ?? []).toEqual([]);
    await m.saveDoc(ch1.id, doc(p(t('Links removed.'))), { words: 2, characters: 14 });
    expect((await m.get(ch1.id))!.mentions).toEqual([]);
  });

  it('lists every chapter and scene that refers to an entry, in reading order, saying how', async () => {
    const { m, mira, academy, guild } = await world();
    expect(await backlinks(m, mira.id)).toEqual(['Chapter 1 [text] [plan]', 'Scene 1 [text]', 'Chapter 2 [plan]']);
    expect(await backlinks(m, academy.id)).toEqual(['Chapter 1 [text]']);
    expect(await backlinks(m, guild.id)).toEqual(['Chapter 2 [plan]']);
  });

  it('lists what a chapter refers to', async () => {
    const { m, c, ch1, ch2 } = await world();
    const refs = async (id: string) => entriesReferencedBy((await m.get(id))!, (await m.plans()).find((x) => x.id === id), await c.list()).map((r) => `${r.entry.name}${r.inText ? ' [text]' : ''}${r.inPlan ? ' [plan]' : ''}`);
    expect(await refs(ch1.id)).toEqual(['Mira [text] [plan]', 'Royal Academy [text]']);
    expect(await refs(ch2.id)).toEqual(['Ash Guild [plan]', 'Mira [plan]']);
  });

  it('INTEGRITY: renaming keeps links; deleting an entry or a chapter leaves nothing broken', async () => {
    const { m, c, mira, academy, ch1, scene, ch2 } = await world();
    const textBefore = JSON.stringify(await m.loadDoc(ch1.id));

    await c.update(mira.id, { name: 'Mira Ashborne' });
    expect(await backlinks(m, mira.id)).toEqual(['Chapter 1 [text] [plan]', 'Scene 1 [text]', 'Chapter 2 [plan]']);
    expect(JSON.stringify(await m.loadDoc(ch1.id))).toBe(textBefore); // the author's words are not rewritten

    await c.remove(academy.id);
    expect(JSON.stringify(await m.loadDoc(ch1.id))).toBe(textBefore); // text and its formatting untouched…
    const refs = entriesReferencedBy((await m.get(ch1.id))!, (await m.plans()).find((x) => x.id === ch1.id), await c.list());
    expect(refs.map((r) => r.entry.name)).toEqual(['Mira Ashborne']); // …and the dead link is simply not a link any more
    expect((await m.openDoc(ch1.id)).rev).toBe(1);

    await m.remove(ch1.id); // takes its scene with it
    expect(await backlinks(m, mira.id)).toEqual(['Chapter 2 [plan]']);
    expect(await m.get(scene.id)).toBeUndefined();
    await m.move(ch2.id, null, null);
    expect(await backlinks(m, mira.id)).toEqual(['Chapter 2 [plan]']);
  });

  it('a copied or imported project links to its own entries', async () => {
    const { project, m, ch1, mira } = await world();
    await m.saveVersion(ch1.id, 'v');
    await m.createBranch(ch1.id, 'Alt');
    for (const projectId of [(await projects.duplicate(project.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(project.id, { everything: true }))))).id]) {
      const cm = manuscript.forProject(projectId);
      const entries = await codex.forProject(projectId).list();
      const ids = new Set(entries.map((e) => e.id));
      const copiedMira = entries.find((e) => e.name === 'Mira')!;
      const chapter = (await cm.list()).find((x) => x.title === 'Chapter 1')!;
      expect(copiedMira.id).not.toBe(mira.id);
      expect(mentionsIn(await cm.loadDoc(chapter.id)).every((id) => ids.has(id))).toBe(true);
      expect(chapter.mentions!.every((id) => ids.has(id))).toBe(true);
      expect(mentionsIn((await cm.getBranch((await cm.branches(chapter.id))[0].id))!.doc).every((id) => ids.has(id))).toBe(true);
      expect((await backlinks(cm, copiedMira.id))[0]).toBe('Chapter 1 [text] [plan]');
    }
  });
});
