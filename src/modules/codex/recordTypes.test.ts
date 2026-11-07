import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createConnectionService } from '@/modules/connections/service';
import { PRESETS as EXPORT_PRESETS } from '@/modules/exchange/compile';
import { renderText } from '@/modules/exchange/render/text';
import { createExchangeService } from '@/modules/exchange/service';
import { knowledgeGraph } from '@/modules/graph/knowledge';
import { unfitEntries } from '@/modules/integrity/rules';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { deriveConnections } from '@/modules/model/connections';
import { loadModel } from '@/modules/model/model';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createSearchService } from '@/modules/search/service';
import { createCodexService, registerCodex } from './service';
import { TYPE_PRESETS } from './typePresets';
import { FIELD_LIMITS, type Category, type FieldDef } from './types';
import { checkValue, entryIssues } from './validation';

let n = 0;
let db: NovelDB;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`record-types-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
});

async function novel(title = 'Types') {
  const p = await projects.create({ title });
  const codexService = createCodexService(db, projects.contentChanged);
  return { p, codex: codexService.forProject(p.id), connections: createConnectionService(db, projects.contentChanged).forProject(p.id) };
}
const def = (type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({ id: 'd', name: 'Field', type, options: [], ...extra });
const entries = new Map([
  ['mira', { name: 'Mira', category: 'character' }],
  ['keep', { name: 'The Keep', category: 'location' }],
]);

describe('what fits a field', () => {
  it('required, and every type: numbers in range, real dates, yes or no, choices, links of the right kind', () => {
    const problem = (d: FieldDef, value: string) => checkValue(d, value, entries, (k) => (k === 'character' ? 'Characters' : k))?.problem ?? null;
    expect([problem(def('text', { required: true }), ' '), problem(def('text'), ''), problem(def('text', { required: true }), 'x')]).toEqual(['required', null, null]);
    expect([problem(def('number'), 'ten'), problem(def('number', { min: 0, max: 10 }), '-1'), problem(def('number', { min: 0, max: 10 }), '11'), problem(def('number', { min: 0, max: 10 }), '10')]).toEqual(['not-a-number', 'too-small', 'too-large', null]);
    expect([problem(def('date'), '2024-02-30'), problem(def('date'), 'spring'), problem(def('date'), '2024-02-29')]).toEqual(['not-a-date', 'not-a-date', null]);
    expect([problem(def('toggle'), 'maybe'), problem(def('toggle'), 'yes')]).toEqual(['not-yes-no', null]);
    expect([problem(def('select', { options: ['Fire', 'Water'] }), 'Ash'), problem(def('select', { options: ['Fire', 'Water'] }), 'Fire'), problem(def('multiselect', { options: ['Fire', 'Water'] }), 'Fire\nAsh')]).toEqual(['not-a-choice', null, 'not-a-choice']);
    expect([problem(def('reference'), 'nobody'), problem(def('reference', { target: 'character' }), 'keep'), problem(def('references', { target: 'character' }), 'mira\nkeep'), problem(def('reference', { target: 'character' }), 'mira')]).toEqual(['not-an-entry', 'wrong-kind', 'wrong-kind', null]);
    expect(checkValue(def('reference', { target: 'character', name: 'Owner' }), 'keep', entries, () => 'Characters')!.message).toBe('Owner should link to Characters; The Keep is not.');
  });

  it('an entry is checked against its category’s live fields only; nothing is changed by checking', () => {
    const category = { fields: [def('number', { id: 'a', name: 'Rank', max: 3 }), def('text', { id: 'b', name: 'Old', required: true, archived: true }), def('text', { id: 'c', name: 'Name of power', required: true })] } as Category;
    const entry = { fields: [{ id: 'f', key: 'Rank', value: '5', defId: 'a' }] };
    const before = JSON.stringify(entry);
    expect(entryIssues(entry, category, entries).map((i) => [i.field, i.problem])).toEqual([['Rank', 'too-large'], ['Name of power', 'required']]);
    expect(JSON.stringify(entry)).toBe(before);
  });
});

describe('defining a kind of record', () => {
  it('a field’s rules are kept only where they fit its type; a link may only be limited to a category that exists', async () => {
    const { codex } = await novel();
    const made = await codex.saveCategory(null, { name: 'Spells' });
    const saved = await codex.saveCategory(made.key, {
      fields: [
        { id: 'a', name: 'Rank', type: 'number', options: [], min: 0, max: 10, required: true, help: '  How strong  ' },
        { id: 'b', name: 'School', type: 'text', options: [], min: 3 } as FieldDef,
        { id: 'c', name: 'Known by', type: 'references', options: [], target: 'character' },
        { id: 'd', name: 'Ghost link', type: 'reference', options: [], target: 'nowhere' },
        { id: 'e', name: 'Backwards', type: 'number', options: [], min: 5, max: 1 },
      ],
    });
    expect(saved.fields.map(({ id, required, help, min, max, target }) => ({ id, required, help, min, max, target }))).toEqual([
      { id: 'a', required: true, help: 'How strong', min: 0, max: 10, target: undefined },
      { id: 'b', required: undefined, help: undefined, min: undefined, max: undefined, target: undefined },
      { id: 'c', required: undefined, help: undefined, min: undefined, max: undefined, target: 'character' },
      { id: 'd', required: undefined, help: undefined, min: undefined, max: undefined, target: undefined },
      { id: 'e', required: undefined, help: undefined, min: 5, max: undefined, target: undefined },
    ]);
  });

  it('custom fields cannot grow past the limits that keep the app sound', async () => {
    const { codex } = await novel();
    const made = await codex.saveCategory(null, { name: 'Planets' });
    const many = Array.from({ length: FIELD_LIMITS.fields + 1 }, (_, i) => ({ id: `f${i}`, name: `F${i}`, type: 'text' as const, options: [] }));
    await expect(codex.saveCategory(made.key, { fields: many })).rejects.toThrow(`at most ${FIELD_LIMITS.fields} fields`);
    const saved = await codex.saveCategory(made.key, { fields: [{ id: 'x', name: 'N'.repeat(200), type: 'select', options: Array.from({ length: 150 }, (_, i) => `o${i}`) }] });
    expect([saved.fields[0].name.length, saved.fields[0].options.length]).toEqual([FIELD_LIMITS.name, FIELD_LIMITS.options]);
    // An unknown type becomes plain text; the record stays a normal entry with string values.
    expect((await codex.saveCategory(made.key, { fields: [{ id: 'y', name: 'Odd', type: 'spreadsheet' as never, options: [] }] })).fields.find((f) => f.id === 'y')!.type).toBe('text');
  });

  it('presets: each a starting point that only adds; a second time adds nothing', async () => {
    const { codex } = await novel();
    const spells = TYPE_PRESETS.find((t) => t.id === 'spells')!;
    const after = await codex.applyTemplate(spells);
    const made = after.find((c) => c.name === 'Spells')!;
    expect(made.fields.map((f) => [f.name, f.type, f.required ?? false, f.target ?? null])).toEqual([
      ['Effect', 'longtext', true, null],
      ['School', 'select', false, null],
      ['Rank', 'number', false, null],
      ['Cost', 'text', false, null],
      ['Known by', 'references', false, 'character'],
    ]);
    expect(made.key.startsWith('custom-')).toBe(true);
    const again = await codex.applyTemplate(spells);
    expect(JSON.stringify(again.find((c) => c.name === 'Spells'))).toBe(JSON.stringify(made));
    expect(TYPE_PRESETS.map((t) => t.name)).toEqual(['Spells', 'Planets', 'Investigations', 'Techniques', 'Organizations', 'Species', 'Technologies', 'Relics']);
  });

  it('a kind saved as a template carries its links between its own categories into another novel', async () => {
    const { codex } = await novel('Source');
    const agents = await codex.saveCategory(null, { name: 'Agents' });
    const cells = await codex.saveCategory(null, { name: 'Cells', fields: [{ id: 'm', name: 'Members', type: 'references', options: [], target: agents.key, required: true }] });
    const template = { categories: [cells, agents].map(({ key, name, singular, color, builtin, fields }) => ({ key, name, singular, color, builtin, fields })) };
    const other = await novel('Target');
    const after = await other.codex.applyTemplate(template);
    const [newCells, newAgents] = [after.find((c) => c.name === 'Cells')!, after.find((c) => c.name === 'Agents')!];
    expect(newAgents.key).not.toBe(agents.key);
    expect(newCells.fields[0]).toMatchObject({ name: 'Members', required: true, target: newAgents.key });
  });
});

describe('custom records are records like any other', () => {
  async function relics() {
    const w = await novel();
    const after = await w.codex.applyTemplate(TYPE_PRESETS.find((t) => t.id === 'relics')!);
    const relicsType = after.find((c) => c.name === 'Relics')!;
    const mira = await w.codex.create('character', 'Mira');
    const relic = await w.codex.create(relicsType.key, 'The Ember Crown');
    const field = (name: string) => relicsType.fields.find((f) => f.name === name)!.id;
    await w.codex.setFieldValue(relic.id, field('Powers'), 'Burns the unworthy');
    await w.codex.setFieldValue(relic.id, field('Current holder'), mira.id);
    await w.codex.setFieldValue(relic.id, field('Age in years'), '-4');
    return { ...w, relicsType, mira, relic };
  }

  it('linked: by its fields and by connections, read by the shared model', async () => {
    const w = await relics();
    await w.connections.create({ from: { type: 'entry', id: w.mira.id }, to: { type: 'entry', id: w.relic.id }, type: 'owns' });
    const kinds = deriveConnections((await loadModel(db, w.p.id))!).connections.filter((c) => c.from.id === w.relic.id || c.to.id === w.relic.id).map((c) => `${c.kind}:${c.label}`).sort();
    expect(kinds).toEqual(['field:Current holder', 'link:Owns']);
  });

  it('checked: a value out of range is listed, and kept as written', async () => {
    const w = await relics();
    const unfit = unfitEntries((await loadModel(db, w.p.id))!);
    expect(unfit.map((u) => [u.entry.name, u.issues.map((i) => i.message)])).toEqual([['The Ember Crown', ['Age in years should be at least 0; it is -4.']]]);
    expect((await db.loreEntries.get(w.relic.id))!.fields.some((f) => f.value === '-4')).toBe(true);
  });

  it('searched, by its fields as well as its name', async () => {
    const w = await relics();
    const search = createSearchService(db).forProject(w.p.id);
    await search.sync();
    const found = (await search.open()).search('unworthy', 'all');
    expect(found.flatMap((g) => g.items.map((i) => i.title))).toEqual(['The Ember Crown']);
  });

  it('exported: the codex in the story bible names the kind, its fields and their values', async () => {
    const w = await relics();
    const exchange = createExchangeService(db, createManuscriptService(db, projects.contentChanged));
    const text = renderText(await exchange.forProject(w.p.id).compile(EXPORT_PRESETS.bible));
    expect(text).toContain('RELICS');
    expect(text).toContain('Current holder: Mira');
    expect(text).toContain('The Ember Crown');
    expect(text).toContain('Burns the unworthy');
  });

  it('shown in the graph unless its kind is set not to be, which is counted', async () => {
    const w = await relics();
    expect(knowledgeGraph((await loadModel(db, w.p.id))!).nodes.some((nd) => nd.label === 'The Ember Crown')).toBe(true);
    await w.codex.saveCategory(w.relicsType.key, { graph: false });
    const graph = knowledgeGraph((await loadModel(db, w.p.id))!);
    expect(graph.nodes.some((nd) => nd.label === 'The Ember Crown')).toBe(false);
    expect(graph.excluded).toEqual([{ category: w.relicsType.key, count: 1 }]);
    await w.codex.saveCategory(w.relicsType.key, { graph: true });
    expect(knowledgeGraph((await loadModel(db, w.p.id))!).nodes.some((nd) => nd.label === 'The Ember Crown')).toBe(true);
  });

  it('copied and re-imported with the novel, its kind and rules included', async () => {
    const w = await relics();
    const copy = await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(w.p.id, { everything: true }))));
    const kind = (await createCodexService(db, projects.contentChanged).forProject(copy.id).categories()).find((c) => c.name === 'Relics')!;
    expect(kind.fields.find((f) => f.name === 'Powers')).toMatchObject({ required: true });
    expect(kind.fields.find((f) => f.name === 'Current holder')).toMatchObject({ target: 'character' });
    const copiedRelic = (await db.loreEntries.where('projectId').equals(copy.id).toArray()).find((e) => e.name === 'The Ember Crown')!;
    expect(copiedRelic.category).toBe(kind.key);
  });

  it('a file with a malformed kind of record comes in cleaned, its entries kept', async () => {
    const w = await relics();
    await w.codex.saveCategory(w.relicsType.key, { graph: false });
    const snapshot = JSON.parse(JSON.stringify(await projects.exportSnapshot(w.p.id, { everything: true })));
    const row = snapshot.collections.loreSchemas.find((r: { name: string }) => r.name === 'Relics');
    row.fields.push(null, { name: 7, type: 'spreadsheet', options: 'Fire', min: 'abc', required: 'yes' });
    row.order = 'first';
    const copy = await projects.importSnapshot(snapshot);
    const kind = (await createCodexService(db, projects.contentChanged).forProject(copy.id).categories()).find((c) => c.name === 'Relics')!;
    expect(kind.fields.slice(-2).map(({ name, type, options, min, required }) => ({ name, type, options, min, required }))).toEqual([
      { name: 'Untitled field', type: 'text', options: [], min: undefined, required: undefined },
      { name: 'Untitled field', type: 'text', options: [], min: undefined, required: undefined },
    ]);
    expect([kind.order, kind.graph, kind.fields.find((f) => f.name === 'Powers')?.required]).toEqual([9999, false, true]);
    expect((await db.loreEntries.where('projectId').equals(copy.id).toArray()).some((e) => e.name === 'The Ember Crown' && e.category === kind.key)).toBe(true);
  });
});
