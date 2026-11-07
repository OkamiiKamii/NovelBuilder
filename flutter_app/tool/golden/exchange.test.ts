// Reference outputs of the original app's manuscript export and import, for the Flutter rebuild (Phase 19).
// Run as the other golden scripts: GOLDEN_OUT=<dir> FIXTURES=<flutter_app/test/fixtures> npx vitest run golden/exchange.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { test } from 'vitest';
import { resolveCategories } from '@/modules/codex/schema';
import { normalizeInput } from '@/modules/projects/service';
import { isEntryLink } from '@/modules/codex/types';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import { compile, PRESETS, type ExportData, type ExportOptions } from '@/modules/exchange/compile';
import { renderDocx } from '@/modules/exchange/render/docx';
import { renderHtml, renderMarkdown, renderText } from '@/modules/exchange/render/text';
import { parseFile } from '@/modules/exchange/service';
import { buildModel } from '@/modules/model/model';
import { VIEW_DATA, viewRecords } from '@/modules/visualize/exportView';
import { buildStructure, metricsOf, summarise, toDoc, type ImportNode } from '@/modules/exchange/import/structure';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES = process.env.FIXTURES!;
const NOVELS = ['qa-sample', 'made-in-the-app', 'saga'];

/** What the original's exchange service gathers, from a backup file instead of the database. */
function gather(file: { project: never; collections: Record<string, Record<string, unknown>[]> }): ExportData {
  // Some fixtures (saga) were written with fields left out. The original's exporter would stop on them (it calls
  // `.trim()` on a missing note); the Flutter app reads a missing text as empty. Filled in here, so both compare the same.
  const fill = (rows: Record<string, unknown>[] | undefined, text: string[], lists: string[]) =>
    (rows ?? []).map((r) => ({ ...Object.fromEntries(text.map((k) => [k, ''])), ...Object.fromEntries(lists.map((k) => [k, []])), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined)) }));
  const c = {
    ...file.collections,
    chapters: fill(file.collections.chapters, ['title', 'summary', 'notes'], []),
    loreEntries: fill(file.collections.loreEntries, ['name', 'summary', 'description', 'notes'], ['tags', 'fields']),
    chapterPlans: fill(file.collections.chapterPlans, ['objective', 'conflict', 'emotionalArc', 'dialogue', 'foreshadowing', 'reveals', 'openQuestions', 'ending'], ['beats', 'entityIds']),
  };
  // IndexedDB returns rows in key order: ids compared code unit by code unit.
  const byId = (name: string) => [...(c[name] ?? [])].sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  return {
    // As stored after the original's import, which fills in missing details (a null author becomes '').
    project: { ...(file.project as object), ...normalizeInput(file.project) } as never,
    nodes: byId('chapters') as never,
    docs: new Map(byId('chapterContents').map((r) => [r.id as string, r.doc as never])),
    plans: new Map(byId('chapterPlans').map((r) => [r.id as string, r as never])),
    entries: byId('loreEntries') as never,
    links: (byId('loreLinks') as never[]).filter(isEntryLink as never),
    revisions: byId('chapterRevisions').map(({ doc: _doc, ...info }) => info) as never,
    branches: byId('chapterBranches') as never,
    relations: byId('characterRelations') as never,
    categories: resolveCategories(byId('loreSchemas') as never),
  };
}

const zipParts = (bytes: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name, data]) => [name, strFromU8(data)]));

const node = (n: ImportNode): unknown => ({ kind: n.kind, title: n.title, words: metricsOf(n.blocks).words, doc: toDoc(n.blocks), children: n.children.map(node) });

/** A Word document written the way Word itself writes one: localised style ids, tracked changes, entities, breaks. */
function wordLikeDocx(): Uint8Array {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Titel"><w:name w:val="Title"/></w:style><w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="Standard"><w:name w:val="Normal"/></w:style></w:styles>`;
  const p = (props: string, runs: string) => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${runs}</w:p>`;
  const r = (props: string, body: string) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${body}</w:r>`;
  const t = (text: string) => `<w:t xml:space="preserve">${text}</w:t>`;
  const body = [
    p('<w:pStyle w:val="Titel"/>', r('', t('The Ember Crown'))),
    p('<w:pStyle w:val="berschrift1"/>', r('', t('Part One'))),
    p('<w:pStyle w:val="berschrift2"/>', r('', t('The Gate'))),
    p('', r('<w:b/>', t('Bold, ')) + r('<w:b w:val="0"/><w:i/>', t('italic, ')) + r('<w:u w:val="single"/>', t('underlined')) + r('<w:u w:val="none"/>', t(' and plain')) + r('<w:strike/>', t(' struck.'))),
    p('<w:jc w:val="center"/>', r('', t('Centred &amp; &lt;tagged&gt; &#x2014; dash &#8220;quoted&#8221;'))),
    p('<w:jc w:val="both"/>', r('', t('Tab') + '<w:tab/>' + t('then a break') + '<w:br/>' + t('then a page break') + '<w:br w:type="page"/>' + t('done.'))),
    p('', r('', t('Kept ')) + '<w:del w:id="1" w:author="Ed"><w:r><w:delText>deleted words </w:delText></w:r></w:del>' + r('', t('after a tracked deletion.'))),
    p('', ''),
    p('', r('', t('* * *'))),
    p('<w:jc w:val="end"/>', r('', t('A second scene, right-aligned.'))),
    p('<w:outlineLvl w:val="1"/>', r('', t('An outline-level heading'))),
    p('', r('', t('Chapter 2'))),
    p('', r('', t('Rain fell on the gate.'))),
  ].join('');
  const doc = `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
  return zipSync({ 'word/document.xml': strToU8(doc), 'word/styles.xml': strToU8(styles), '[Content_Types].xml': strToU8('<Types/>') });
}

test('exchange goldens', () => {
  mkdirSync(OUT, { recursive: true });
  const out: Record<string, unknown> = {};

  // ----- Export: every switch combination that matters, on real novels.
  for (const name of NOVELS) {
    const file = JSON.parse(readFileSync(join(FIXTURES, `${name}.novel.json`), 'utf8'));
    const data = gather(file);
    const tree = flatten(buildTree(data.nodes));
    const scope = tree.find((t) => t.node.kind !== 'scene' && t.children.length > 0) ?? tree[0];
    const variants: Record<string, ExportOptions> = {
      reader: PRESETS.reader,
      bible: PRESETS.bible,
      planningOnly: { manuscript: false, titles: false, notes: true, lore: false, planning: true, history: false },
      textOnly: { manuscript: true, titles: false, notes: false, lore: false, planning: false, history: false },
      scoped: { ...PRESETS.bible, scopeId: scope?.node.id ?? null },
    };
    const results: Record<string, unknown> = { scopeId: scope?.node.id ?? null };
    for (const [key, options] of Object.entries(variants)) {
      const compiled = compile(data, options);
      results[key] = {
        compiled,
        txt: renderText(compiled),
        md: renderMarkdown(compiled),
        html: renderHtml(compiled),
        docx: key === 'reader' || key === 'bible' ? zipParts(renderDocx(compiled)) : undefined,
      };
    }
    out[name] = results;
  }

  // ----- Import: each sample file, with every way of splitting it.
  const rendered = renderDocx(compile(gather(JSON.parse(readFileSync(join(FIXTURES, 'qa-sample.novel.json'), 'utf8'))), PRESETS.bible));
  writeFileSync(join(OUT, 'rendered.docx'), rendered);
  const wordLike = wordLikeDocx();
  writeFileSync(join(OUT, 'word-like.docx'), wordLike);
  const inputs: Record<string, Uint8Array> = {
    'novel.txt': readFileSync(join(FIXTURES, 'exchange', 'novel.txt')),
    'novel.md': readFileSync(join(FIXTURES, 'exchange', 'novel.md')),
    'novel.rtf': readFileSync(join(FIXTURES, 'exchange', 'novel.rtf')),
    'rendered.docx': rendered,
    'word-like.docx': wordLike,
  };
  const imports: Record<string, unknown> = {};
  for (const [fileName, bytes] of Object.entries(inputs)) {
    const blocks = parseFile(fileName, bytes);
    const fallbackTitle = fileName.replace(/\.[^.]+$/, '');
    const splits: Record<string, unknown> = {};
    for (const [key, splitChapters, splitScenes] of [['both', true, true], ['chapters', true, false], ['scenes', false, true], ['none', false, false]] as const) {
      const nodes = buildStructure(blocks, { splitChapters, splitScenes, fallbackTitle });
      splits[key] = { nodes: nodes.map(node), summary: summarise(nodes) };
    }
    imports[fileName] = { blocks, splits };
  }
  out.imports = imports;
  out.errors = Object.fromEntries(
    [['old.doc', 'x'], ['notes.pages', 'x'], ['broken.docx', 'not a zip'], ['fake.rtf', 'plain words']].map(([fileName, text]) => {
      try {
        parseFile(fileName, strToU8(text));
        return [fileName, null];
      } catch (e) {
        return [fileName, (e as Error).message];
      }
    }),
  );
  // ----- A view's records, as its export holds them: every view, all records or a filtered few, notes in or out.
  const views: Record<string, unknown> = {};
  for (const name of ['qa-sample', 'made-in-the-app', 'chronicle']) {
    const file = JSON.parse(readFileSync(join(FIXTURES, `${name}.novel.json`), 'utf8'));
    const rows = (k: string) => (file.collections[k] ?? []) as any[];
    const model = buildModel({ project: file.project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
    // A filter that keeps every other record (by id, in code-unit order), as a page's filters would keep some.
    const ids = [...model.entries.keys(), ...model.events.keys(), ...model.nodes.keys(), ...model.threads.keys(), ...model.relations.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const some = new Set(ids.filter((_, i) => i % 2 === 0));
    const result: Record<string, unknown> = { some: [...some] };
    for (const view of Object.keys(VIEW_DATA)) {
      if (view === 'knowledge' || view === 'charts') continue;
      result[view] = {
        all: viewRecords(model, view, { keep: () => true, includePrivate: false }),
        private: viewRecords(model, view, { keep: () => true, includePrivate: true }),
        some: viewRecords(model, view, { keep: (id) => some.has(id), includePrivate: false }),
      };
    }
    views[name] = result;
  }
  out.views = views;
  writeFileSync(join(OUT, 'exchange.golden.json'), JSON.stringify(out, null, 2));
});
