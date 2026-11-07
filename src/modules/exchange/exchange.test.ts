import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { PRESETS, type Compiled, type ExportOptions } from './compile';
import { parseDocx } from './import/docx';
import { parseInline, parseMarkdown, parseRtf, parseText } from './import/parse';
import { buildStructure, summarise, type ImportNode } from './import/structure';
import { renderDocx } from './render/docx';
import { pdfCanDraw, renderPdf } from './render/pdf';
import { renderHtml, renderMarkdown, renderText } from './render/text';
import { createExchangeService, parseFile, type ExchangeService } from './service';

const outline = (nodes: ImportNode[], depth = 0): string[] =>
  nodes.flatMap((n) => [`${'  '.repeat(depth)}${n.kind}: ${n.title} (${n.blocks.map((b) => (b.type === 'paragraph' ? b.runs.map((r) => r.text).join('') : b.type === 'divider' ? '---' : `#${b.text}`)).join(' | ')})`, ...outline(n.children, depth + 1)]);
const structure = (blocks: ReturnType<typeof parseText>, overrides = {}) => buildStructure(blocks, { splitChapters: true, splitScenes: true, fallbackTitle: 'My Novel', ...overrides });
const encode = (text: string) => new TextEncoder().encode(text);

describe('reading files', () => {
  it('plain text: one paragraph per line, indents kept, blank lines dropped', () => {
    expect(parseText('﻿First line.\r\n\r\n\tIndented second.\n   \nThird.  ')).toEqual([
      { type: 'paragraph', runs: [{ text: 'First line.' }] },
      { type: 'paragraph', runs: [{ text: '\tIndented second.' }] },
      { type: 'paragraph', runs: [{ text: 'Third.' }] },
    ]);
  });

  it('plain text: re-joins hard-wrapped paragraphs', () => {
    const wrapped = ['The road ended at a wall of black stone that rose higher', 'than any tower Mira had seen, and for a long while she only', 'stood and looked at it.'].join('\n');
    const text = ['Chapter 1', wrapped, wrapped, wrapped].join('\n\n');
    const blocks = parseText(text);
    expect(blocks).toHaveLength(4);
    expect(blocks[1]).toEqual({ type: 'paragraph', runs: [{ text: 'The road ended at a wall of black stone that rose higher than any tower Mira had seen, and for a long while she only stood and looked at it.' }] });
  });

  it('markdown: headings, formatting, quotes, rules and line breaks', () => {
    expect(parseInline('a **bold _both_** and *it* ~~gone~~ <u>under</u> \\*literal\\*')).toEqual([
      { text: 'a ' }, { text: 'bold ', bold: true }, { text: 'both', bold: true, italic: true }, { text: ' and ' }, { text: 'it', italic: true }, { text: ' ' },
      { text: 'gone', strike: true }, { text: ' ' }, { text: 'under', underline: true }, { text: ' ' }, { text: '*' }, { text: 'literal' }, { text: '*' },
    ]);
    expect(parseMarkdown('# Title\n\nUnderlined\n===\n\nOne soft\nwrapped line.  \nHard break.\n\n> Quoted *text*\n\n* * *\n\n&nbsp;\n\n### Deep ###')).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'heading', level: 1, text: 'Underlined' },
      { type: 'paragraph', runs: [{ text: 'One soft wrapped line.\nHard break.' }] },
      { type: 'paragraph', runs: [{ text: 'Quoted ' }, { text: 'text', italic: true }], quote: true },
      { type: 'divider' },
      { type: 'paragraph', runs: [] },
      { type: 'heading', level: 3, text: 'Deep' },
    ]);
  });

  it('rtf: paragraphs, formatting, alignment and character escapes', () => {
    const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Times New Roman;}}{\colortbl;\red0\green0\blue0;}{\*\generator Word;}
\pard\qc\b Chapter 1\b0\par
\pard Mira said, \ldblquote Wait\rdblquote\emdash then {\i ran}.\par
caf\'e9 ${'\\u8212?'} ${'\\u1052?'}ira {\ul under}{\strike gone}\tab end\line next\par
{\pict\picw1 0123456789abcdef}\pard\qr Right\par}`;
    expect(parseRtf(rtf)).toEqual([
      { type: 'paragraph', runs: [{ text: 'Chapter 1', bold: true }], align: 'center' },
      { type: 'paragraph', runs: [{ text: 'Mira said, “Wait”—then ' }, { text: 'ran', italic: true }, { text: '.' }] },
      { type: 'paragraph', runs: [{ text: 'café — Мira ' }, { text: 'under', underline: true }, { text: 'gone', strike: true }, { text: '\tend\nnext' }] },
      { type: 'paragraph', runs: [{ text: 'Right' }], align: 'right' },
    ]);
    expect(() => parseRtf('just text')).toThrow('RTF');
  });

  it('chooses a parser by extension and explains what it cannot read', () => {
    expect(parseFile('a.TXT', encode('Hello'))).toEqual([{ type: 'paragraph', runs: [{ text: 'Hello' }] }]);
    expect(parseFile('a.markdown', encode('# H'))).toEqual([{ type: 'heading', level: 1, text: 'H' }]);
    expect(() => parseFile('a.doc', encode('x'))).toThrow('.docx');
    expect(() => parseFile('a.pages', encode('x'))).toThrow('cannot be imported');
    expect(() => parseFile('a.docx', encode('not a zip'))).toThrow('Word document');
  });
});

describe('detecting structure', () => {
  it('splits a plain manuscript at typed chapter lines and scene breaks', () => {
    const text = ['MY NOVEL', 'by A. Writer', '', 'PART ONE', 'Prologue', 'It began with rain.', 'Chapter 1', 'First scene.', '***', 'Second scene.', 'Still second.', '#', 'Third scene.', 'CHAPTER TWO: The Gate', 'No breaks here.', 'Chapter one was the hardest.', 'Part Two', 'Chapter 3', 'Later.', 'Epilogue', 'The end.'].join('\n');
    expect(outline(structure(parseText(text)))).toEqual([
      'chapter: Front matter (MY NOVEL | by A. Writer)',
      'volume: PART ONE ()',
      '  chapter: Prologue (It began with rain.)',
      '  chapter: Chapter 1 ()',
      '    scene: Scene 1 (First scene.)',
      '    scene: Scene 2 (Second scene. | Still second.)',
      '    scene: Scene 3 (Third scene.)',
      '  chapter: CHAPTER TWO: The Gate (No breaks here. | Chapter one was the hardest.)',
      'volume: Part Two ()',
      '  chapter: Chapter 3 (Later.)',
      '  chapter: Epilogue (The end.)',
    ]);
    expect(summarise(structure(parseText(text)))).toEqual({ volumes: 2, chapters: 6, scenes: 3, words: 28 });
  });

  it('uses heading levels: book title, parts, chapters, named scenes', () => {
    const md = '# The Ash Road\n\n## Book One\n\n### Arrival\n\nText one.\n\n#### At the gate\n\nScene text.\n\n### Departure\n\nText two.\n\n## Book Two\n\n### Return\n\nText three.';
    expect(outline(structure(parseMarkdown(md)))).toEqual([
      'volume: Book One ()',
      '  chapter: Arrival (Text one.)',
      '    scene: At the gate (Scene text.)',
      '  chapter: Departure (Text two.)',
      'volume: Book Two ()',
      '  chapter: Return (Text three.)',
    ]);
    // Only one level of headings: they are the chapters.
    expect(outline(structure(parseMarkdown('# One\n\na\n\n# Two\n\nb')))).toEqual(['chapter: One (a)', 'chapter: Two (b)']);
    // Volume › Act nesting by name.
    expect(outline(structure(parseText('Volume 1\nAct I\nChapter 1\nx\nAct II\nChapter 2\ny\nVolume 2\nChapter 3\nz')))).toEqual([
      'volume: Volume 1 ()', '  act: Act I ()', '    chapter: Chapter 1 (x)', '  act: Act II ()', '    chapter: Chapter 2 (y)', 'volume: Volume 2 ()', '  chapter: Chapter 3 (z)',
    ]);
  });

  it('falls back sensibly and honours the options', () => {
    expect(outline(structure(parseText('Just a story.\nNo headings at all.')))).toEqual(['chapter: My Novel (Just a story. | No headings at all.)']);
    expect(outline(structure(parseText('Chapter 1\na\n***\nb'), { splitScenes: false }))).toEqual(['chapter: Chapter 1 (a | --- | b)']);
    expect(outline(structure(parseText('Chapter 1\na\nChapter 2\nb'), { splitChapters: false }))).toEqual(['chapter: My Novel (Chapter 1 | a | Chapter 2 | b)']);
    expect(structure([])).toEqual([]);
  });
});

describe('exporting', () => {
  let db: NovelDB;
  let projects: ProjectService;
  let manuscript: ManuscriptService;
  let exchange: ExchangeService;
  let projectId: string;
  let n = 0;

  const p = (...content: object[]) => ({ type: 'paragraph', attrs: { textAlign: null }, content });
  const t = (text: string, ...marks: string[]) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
  const doc = (...content: object[]) => ({ type: 'doc', content });
  const SECRETS = { notes: 'PRIVATE-NOTE-ZETA', entryNotes: 'LORE-SECRET-OMEGA', planning: 'PLAN-OBJECTIVE-KAPPA', beat: 'PLAN-BEAT-SIGMA', summary: 'PLAN-SUMMARY-THETA', lore: 'LORE-PROFILE-LAMBDA', field: 'LORE-FIELD-RHO', draft: 'ALT-DRAFT-TAU', version: 'VERSION-LABEL-PHI', groupNotes: 'VOLUME-NOTE-PSI' };

  beforeEach(async () => {
    db = new NovelDB(`exchange-${++n}`);
    const registry = createProjectRegistry();
    projects = createProjectService(db, registry);
    registerManuscript(registry);
    registerCodex(registry);
    manuscript = createManuscriptService(db, projects.contentChanged);
    const codex = createCodexService(db, projects.contentChanged);
    exchange = createExchangeService(db, manuscript);

    const project = await projects.create({ title: 'The Ash Road', subtitle: 'A Novel', author: 'A. Writer' });
    projectId = project.id;
    const m = manuscript.forProject(projectId);
    const volume = await m.create('volume', null, 'Volume One');
    const c1 = await m.create('chapter', volume.id, 'The Gate');
    const s1 = await m.create('scene', c1.id, 'Arrival');
    const s2 = await m.create('scene', c1.id, 'Inside');
    const c2 = await m.create('chapter', null, 'Epilogue');
    await m.saveDoc(c1.id, doc(p(t('\t“Wait.”  She turned—'), t('slowly', 'italic'), t('.')), p(), { type: 'paragraph', attrs: { textAlign: 'center' }, content: [t('A sign.', 'bold')] }), { words: 6, characters: 30 });
    await m.saveDoc(s1.id, doc(p(t('Rain fell.'), { type: 'hardBreak' }, t('Then stopped.')), { type: 'blockquote', content: [p(t('Quoted line.'))] }), { words: 6, characters: 30 });
    await m.saveDoc(s2.id, doc(p(t('Dark. '), t('Very', 'underline'), t(' '), t('cut', 'strike'), t(' dark.')), { type: 'heading', attrs: { level: 2 }, content: [t('Later')] }, { type: 'horizontalRule' }, p(t('Light.'))), { words: 6, characters: 30 });
    await m.saveDoc(c2.id, doc(p(t('The end. 1 * 2 = 2 #tag'))), { words: 8, characters: 24 });

    const lore = await codex.forProject(projectId).create('character', 'Mira Vale');
    const guild = await codex.forProject(projectId).create('faction', 'Ash Guild');
    await codex.forProject(projectId).update(lore.id, { summary: SECRETS.lore, notes: SECRETS.entryNotes, tags: ['mage'], fields: [{ id: 'f', key: 'Rank', value: SECRETS.field }] });
    await codex.forProject(projectId).link(lore.id, guild.id, 'member');
    await m.update(c1.id, { notes: SECRETS.notes, summary: SECRETS.summary, status: 'drafting' });
    await m.update(volume.id, { notes: SECRETS.groupNotes });
    await m.updatePlan(c1.id, { objective: SECRETS.planning, beats: [{ id: 'b', text: SECRETS.beat }], entityIds: [lore.id] });
    await m.saveVersion(c2.id, SECRETS.version);
    await m.createBranch(c2.id, 'Alternate ending');
    await m.saveDoc(c2.id, doc(p(t('The end. 1 * 2 = 2 #tag'))), { words: 8, characters: 24 });
    const [aside] = await m.branches(c2.id);
    await db.chapterBranches.update(aside.id, { doc: doc(p(t(SECRETS.draft))) });
  });

  const build = (options: ExportOptions) => exchange.forProject(projectId).compile(options);
  const everything = async (compiled: Compiled) =>
    [renderText(compiled), renderMarkdown(compiled), renderHtml(compiled), strFromU8(unzipSync(renderDocx(compiled))['word/document.xml']), Buffer.from(await renderPdf(compiled)).toString('latin1')].join('\n');

  it('plain text keeps hierarchy, spacing and line breaks', async () => {
    expect(renderText(await build(PRESETS.reader))).toBe(
      [
        'THE ASH ROAD', '============', '', '', 'A Novel', '', 'A. Writer', '', '', '',
        'VOLUME ONE', '----------', '', '', '',
        'THE GATE', '', '\t“Wait.”  She turned—slowly.', '', '', '', 'A sign.', '',
        '* * *', '', 'Rain fell.\nThen stopped.', '', '    Quoted line.', '',
        '* * *', '', 'Dark. Very cut dark.', '', '', 'Later', '', '* * *', '', 'Light.', '', '', '',
        'EPILOGUE', '', 'The end. 1 * 2 = 2 #tag', '',
      ].join('\n'),
    );
  });

  it('markdown mirrors the hierarchy in heading levels and keeps formatting', async () => {
    const md = renderMarkdown(await build(PRESETS.reader));
    expect(md.split('\n').filter((line) => line.startsWith('#'))).toEqual(['# The Ash Road', '## Volume One', '### The Gate', '##### Later', '## Epilogue']);
    expect(md).toContain('\t“Wait.”  She turned—*slowly*.');
    expect(md).toContain('**A sign.**');
    expect(md).toContain('Rain fell.  \nThen stopped.');
    expect(md).toContain('> Quoted line.');
    expect(md).toContain('Dark. <u>Very</u> ~~cut~~ dark.');
    expect(md).toContain('The end. 1 \\* 2 = 2 \\#tag');
    expect(md.match(/^\* \* \*$/gm)).toHaveLength(3);
  });

  it('a Markdown export imports back into the same structure and text', async () => {
    const md = renderMarkdown(await build(PRESETS.reader));
    expect(md).toContain('*A Novel*');
    expect(outline(structure(parseMarkdown(md)))).toEqual([
      'chapter: Front matter (A Novel | A. Writer)',
      'volume: Volume One ()',
      '  chapter: The Gate ()',
      '    scene: Scene 1 (\t“Wait.”  She turned—slowly. |  | A sign.)',
      '    scene: Scene 2 (Rain fell.\nThen stopped. | Quoted line.)',
      '    scene: Scene 3 (Dark. Very cut dark.)',
      '    scene: Later (Light.)',
      'chapter: Epilogue (The end. 1 * 2 = 2 #tag)',
    ]);
  });

  it('Word export is a valid package with heading styles, page breaks and exact text', async () => {
    const files = unzipSync(renderDocx(await build(PRESETS.reader)));
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']);
    const xml = strFromU8(files['word/document.xml']);
    expect(xml).toContain('<w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">The Ash Road</w:t>');
    expect(xml).toContain('<w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r><w:t xml:space="preserve">Volume One</w:t>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/><w:pageBreakBefore/></w:pPr><w:r><w:t xml:space="preserve">The Gate</w:t>');
    expect(xml).toContain('<w:tab/><w:t xml:space="preserve">“Wait.”  She turned—</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">slowly</w:t>');
    expect(xml).toContain('<w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr>');
    expect(xml).toMatch(/Rain fell\.<\/w:t><\/w:r><w:r><w:br\/><\/w:r>/);
    expect(xml).toContain('<w:pStyle w:val="Quote"/>');
    expect(xml).toContain('<w:pStyle w:val="SceneBreak"/>');
    expect(strFromU8(files['docProps/core.xml'])).toContain('<dc:creator>A. Writer</dc:creator>');
  });

  it('a Word export imports back with headings and formatting intact', async () => {
    const blocks = parseDocx(renderDocx(await build(PRESETS.reader)));
    expect(blocks.slice(0, 5)).toEqual([
      { type: 'heading', level: 0, text: 'The Ash Road' },
      { type: 'paragraph', runs: [{ text: 'A Novel' }] },
      { type: 'paragraph', runs: [{ text: 'A. Writer' }], align: 'center' },
      { type: 'heading', level: 1, text: 'Volume One' },
      { type: 'heading', level: 2, text: 'The Gate' },
    ]);
    expect(blocks).toContainEqual({ type: 'paragraph', runs: [{ text: '\t“Wait.”  She turned—' }, { text: 'slowly', italic: true }, { text: '.' }] });
    expect(blocks).toContainEqual({ type: 'paragraph', runs: [{ text: 'A sign.', bold: true }], align: 'center' });
    expect(blocks).toContainEqual({ type: 'paragraph', runs: [{ text: 'Dark. ' }, { text: 'Very', underline: true }, { text: ' ' }, { text: 'cut', strike: true }, { text: ' dark.' }] });
    expect(blocks).toContainEqual({ type: 'paragraph', runs: [{ text: 'Rain fell.\nThen stopped.' }] });
    expect(outline(structure(blocks)).filter((line) => !line.includes('scene'))).toEqual(['chapter: Front matter (A Novel | A. Writer)', 'volume: Volume One ()', '  chapter: The Gate ()', 'chapter: Epilogue (The end. 1 * 2 = 2 #tag)']);
  });

  it('PDF is paginated, with each volume and chapter on a new page and special characters intact', async () => {
    const pdf = Buffer.from(await renderPdf(await build(PRESETS.reader))).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(Number(/\/Count (\d+)/.exec(pdf)![1])).toBe(4); // title, volume, chapter, epilogue
    expect(pdf).toContain('(The Ash Road) Tj');
    expect(pdf).toContain('\x93Wait.\x94'); // curly quotes in the PDF's own encoding
    expect(pdf).toContain('/Times-Italic');
    expect(pdfCanDraw('“Curly” — café… €5')).toBe(true);
    expect(pdfCanDraw('Мира')).toBe(false);
    expect(pdfCanDraw('日本語')).toBe(false);
  });

  it('long chapters flow across pages inside the margins', async () => {
    const m = manuscript.forProject(projectId);
    const long = await m.create('chapter', null, 'Long');
    const sentence = 'The road went on and on through the ash, and nobody she met along it could say where it ended. ';
    await m.saveDoc(long.id, doc(...Array.from({ length: 60 }, () => p(t(sentence.repeat(4))))), { words: 4800, characters: 24000 });
    const pdf = Buffer.from(await renderPdf(await build({ ...PRESETS.reader, scopeId: long.id }))).toString('latin1');
    const pages = Number(/\/Count (\d+)/.exec(pdf)![1]);
    expect(pages).toBeGreaterThanOrEqual(8);
    const xs = [...pdf.matchAll(/\n([\d.]+) ([\d.]+) Td/g)].map((match) => [Number(match[1]), Number(match[2])]);
    expect(xs.length).toBeGreaterThan(200);
    expect(Math.min(...xs.map(([x]) => x))).toBeGreaterThanOrEqual(72);
    expect(Math.min(...xs.map(([, y]) => y))).toBeGreaterThanOrEqual(30); // nothing below the page-number line
    expect(Math.max(...xs.map(([, y]) => y))).toBeLessThanOrEqual(792 - 72);
  });

  it('FILTERING: a clean manuscript contains no notes, planning, lore or history, in any format', async () => {
    const output = await everything(await build(PRESETS.reader));
    for (const [name, secret] of Object.entries(SECRETS)) expect(output.includes(secret), name).toBe(false);
    expect(output).not.toContain('Mira Vale');
    expect(output).toContain('Rain fell.');
  });

  it('FILTERING: each switch adds exactly its own content', async () => {
    const base: ExportOptions = { manuscript: false, titles: false, notes: false, lore: false, planning: false, history: false };
    const present = async (options: Partial<ExportOptions>) => {
      const output = await everything(await build({ ...base, ...options }));
      return Object.entries(SECRETS).filter(([, secret]) => output.includes(secret)).map(([name]) => name).sort();
    };
    expect(await present({})).toEqual([]);
    expect(await present({ manuscript: true })).toEqual([]);
    expect(await present({ notes: true })).toEqual(['groupNotes', 'notes']);
    expect(await present({ planning: true })).toEqual(['beat', 'planning', 'summary']);
    expect(await present({ lore: true })).toEqual(['field', 'lore']); // a profile without the author's private notes on it
    expect(await present({ lore: true, notes: true })).toEqual(['entryNotes', 'field', 'groupNotes', 'lore', 'notes']);
    expect(await present({ history: true })).toEqual(['draft', 'version']);
    expect(await present({ manuscript: true, titles: true, notes: true, lore: true, planning: true, history: true })).toEqual(Object.keys(SECRETS).sort());
  });

  it('the complete bible includes manuscript, planning sheets, notes and lore with relationships', async () => {
    const text = renderText(await build(PRESETS.bible));
    expect(text).toContain('Planning: The Gate');
    expect(text).toContain(`Objective: ${SECRETS.planning}`);
    expect(text).toContain(`1. ${SECRETS.beat}`);
    expect(text).toContain('Entities involved: Mira Vale');
    expect(text).toContain('Status: Drafting');
    expect(text).toContain('WORLDBUILDING');
    expect(text).toContain('Related entries: Ash Guild (member)');
    expect(text).toContain('Rain fell.');
    expect(text).not.toContain(SECRETS.version);
  });

  it('titles off gives bare text; a scope exports one part of the book', async () => {
    const bare = renderText(await build({ ...PRESETS.reader, titles: false }));
    expect(bare).not.toMatch(/THE ASH ROAD|VOLUME ONE|THE GATE|\* \* \*\n\nRain/);
    expect(bare).toContain('Rain fell.');
    const compiled = await build({ ...PRESETS.reader, scopeId: (await manuscript.forProject(projectId).list()).find((x) => x.title === 'Volume One')!.id });
    expect(compiled.chapterCount).toBe(1);
    expect(renderText(compiled)).toContain('THE ASH ROAD: VOLUME ONE');
    expect(renderText(compiled)).not.toContain('EPILOGUE');
  });

  it('the full archive holds everything, including version history, and restores it', async () => {
    const archive = JSON.parse(JSON.stringify(await projects.exportSnapshot(projectId, { everything: true })));
    expect(Object.keys(archive.collections)).toEqual(expect.arrayContaining(['chapters', 'chapterContents', 'chapterPlans', 'chapterBranches', 'chapterRevisions', 'loreEntries', 'loreLinks']));
    const json = JSON.stringify(archive);
    for (const secret of Object.values(SECRETS)) expect(json).toContain(secret);
    expect(Object.keys((await projects.exportSnapshot(projectId)).collections)).not.toContain('chapterRevisions'); // a plain copy leaves history out

    const restored = manuscript.forProject((await projects.importSnapshot(archive)).id);
    const epilogue = (await restored.list()).find((x) => x.title === 'Epilogue')!;
    expect((await restored.revisions(epilogue.id)).map((r) => r.label)).toEqual([SECRETS.version]);
    expect((await restored.branches(epilogue.id)).map((b) => b.name)).toEqual(['Main draft']);
  });

  it('imports a manuscript into the organizer in one step, without logging it as writing', async () => {
    const other = await projects.create({ title: 'Imported' });
    const nodes = structure(parseText('Part One\nChapter 1\nFirst  scene with\ttab.\n***\nSecond scene.\nChapter 2\nMore.'));
    const created = await exchange.forProject(other.id).importNodes(null, nodes);
    const m = manuscript.forProject(other.id);
    expect(created).toHaveLength(5);
    expect(flatten(buildTree(await m.list())).map((x) => `${'  '.repeat(x.depth)}${x.node.kind}: ${x.node.title} [${x.totalWords}] ${x.node.status}`)).toEqual([
      'volume: Part One [7] idea', '  chapter: Chapter 1 [6] idea', '    scene: Scene 1 [4] drafting', '    scene: Scene 2 [2] drafting', '  chapter: Chapter 2 [1] drafting',
    ]);
    const scene = (await m.list()).find((x) => x.title === 'Scene 1')!;
    expect(await m.loadDoc(scene.id)).toEqual({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'First  scene with\ttab.' }] }] });
    expect(await projects.getStats(other.id)).toMatchObject({ wordCount: 7, counts: { chapters: 2, scenes: 2 } });
    expect(await db.writingSessions.where('projectId').equals(other.id).count()).toBe(0);

    // Appending again goes after what is there; a volume cannot be imported inside a volume.
    const volume = (await m.list()).find((x) => x.kind === 'volume')!;
    await exchange.forProject(other.id).importNodes(volume.id, structure(parseText('Chapter 9\nz')));
    expect(flatten(buildTree(await m.list())).at(-1)!.node).toMatchObject({ title: 'Chapter 9', parentId: volume.id });
    await expect(exchange.forProject(other.id).importNodes(volume.id, nodes)).rejects.toThrow('cannot be placed inside');
    expect(await m.list()).toHaveLength(6); // the failed import added nothing
  });
});
