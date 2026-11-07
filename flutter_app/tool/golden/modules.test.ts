// Writes reference outputs of the original app's genre modules service (turning modules on and off, starter systems,
// arrangement, records and where each module stands) for the Flutter rebuild's agreement test. Each scenario is a list
// of steps; the state after every step is written by name, so ids and clocks do not matter.
// Run as the golden scripts: GOLDEN_OUT=<dir> npx vitest run golden/modules.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createProjectService } from '@/modules/projects/service';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { BUILTIN_MODULES } from '@/modules/extensions/builtin';
import { createExtensionService, parseDefinition, registerExtensions } from '@/modules/extensions/service';

type Step = Record<string, any>;

const RITES = {
  id: 'custom-rites', name: 'Rites',
  schema: { categories: [{ name: 'Spells & Techniques', fields: [{ name: 'Rite', type: 'text' }] }] },
  tools: [{ id: 'rites', type: 'registry', title: 'Rites', category: 'Spells & Techniques' }],
};

const own = (id: string) => BUILTIN_MODULES.find((m) => m.id === id)!.schema.categories.filter((c) => !c.builtin).map((c) => c.name);
const firstLog = (id: string) => BUILTIN_MODULES.find((m) => m.id === id)!.tools.find((t) => t.type === 'log')?.id;
const ids = BUILTIN_MODULES.map((m) => m.id);

const SCENARIOS: Record<string, Step[]> = {
  progression: [
    { op: 'enable', module: 'progression' }, { op: 'starter', module: 'progression' }, { op: 'starter', module: 'progression' },
    { op: 'enable', module: 'progression' }, { op: 'disable', module: 'progression' }, { op: 'enable', module: 'progression' },
  ],
  mystery: [
    { op: 'enable', module: 'mystery' },
    { op: 'entry', category: 'Suspects', name: 'The Butler' }, { op: 'entry', category: 'Clues & Evidence', name: 'A torn glove' },
    { op: 'entry', category: 'character', name: 'Not a module record' },
    { op: 'cell', module: 'mystery', tool: 'evidence', row: 'A torn glove', col: 'The Butler', value: ' Implicates ' },
    { op: 'record', module: 'mystery', tool: 'herrings', title: 'The gardener’s boots', state: 'Planted' },
    { op: 'record', module: 'mystery', tool: 'reveals', title: '  ' },
    { op: 'disable', module: 'mystery' }, { op: 'disable', module: 'nope' }, { op: 'enable', module: 'mystery' },
    { op: 'cell', module: 'mystery', tool: 'evidence', row: 'A torn glove', col: 'The Butler', value: 'Clears' },
    { op: 'downgrade', module: 'mystery' }, { op: 'enable', module: 'mystery' },
    { op: 'dropCategory', name: 'Alibis' }, { op: 'enable', module: 'mystery' },
    { op: 'cell', module: 'mystery', tool: 'evidence', row: 'A torn glove', col: 'The Butler', value: '' },
  ],
  cycles: [
    ...ids.map((module, i) => ({ op: 'enable', module, quiet: i < ids.length - 1 })),
    ...ids.flatMap((module) => [
      ...own(module).map((category) => ({ op: 'entry', category, name: `${category}: one of mine`, quiet: true })),
      ...(firstLog(module) ? [{ op: 'record', module, tool: firstLog(module), title: `${module}: a line of mine`, quiet: true }] : []),
    ]),
    ...ids.flatMap((module, i) => [{ op: 'disable', module, quiet: true }, { op: 'enable', module, quiet: i < ids.length - 1 }]),
    ...ids.map((module, i) => ({ op: 'disable', module, quiet: i < ids.length - 1 })),
    ...ids.map((module, i) => ({ op: 'enable', module, quiet: i < ids.length - 1 })),
  ],
  kept: [
    { op: 'template', categories: [{ key: '', name: 'Spells & Techniques', singular: 'Spell', color: '#7a4fa3', builtin: false, fields: [{ id: 'x', name: 'Incantation', type: 'text', options: [] }] }] },
    { op: 'enable', module: 'high-fantasy' }, { op: 'disable', module: 'high-fantasy' }, { op: 'enable', module: 'high-fantasy' },
  ],
  together: [
    ...['high-fantasy', 'progression', 'mystery', 'romance', 'politics', 'superhero', 'contemporary'].map((module) => ({ op: 'enable', module })),
    { op: 'disable', module: 'mystery' }, { op: 'disable', module: 'politics' },
  ],
  shared: [{ op: 'enable', module: 'high-fantasy' }, { op: 'enable', custom: RITES }, { op: 'disable', module: 'high-fantasy' }, { op: 'disable', module: 'custom-rites' }],
  arranged: [
    { op: 'enable', module: 'romance' },
    { op: 'renameCategory', name: 'Romantic Arcs', to: 'Love Stories', field: 'Stage', fieldTo: 'Where they stand', options: ['Rivals', 'Reluctant allies', 'Trust', 'Partnership'] },
    { op: 'disable', module: 'romance' }, { op: 'enable', module: 'romance' },
    { op: 'configure', module: 'romance', settings: { hidden: ['meters', 'no-such-tool'], order: ['milestones', 'arcs', 'nope'], titles: { arcs: ' Love stories ', milestones: '  ' }, states: { transitions: ['Rivals', 'Reluctant allies', 'Trust', 'Rivals'], arcs: [] }, nav: ' Hearts ' } },
    { op: 'disable', module: 'romance' }, { op: 'enable', module: 'romance' },
    { op: 'configure', module: 'romance', settings: { titles: { arcs: 'x'.repeat(70) }, nav: 'y'.repeat(50) } },
    { op: 'enable', module: 'horror' },
  ],
};

test('modules', async () => {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    const db = new NovelDB(`modules-golden-${++n}`);
    const registry = createProjectRegistry();
    const projects = createProjectService(db, registry);
    registerManuscript(registry);
    registerCodex(registry);
    registerSystems(registry);
    registerExtensions(registry);
    createManuscriptService(db, projects.contentChanged);
    const codex = createCodexService(db, projects.contentChanged);
    const systems = createSystemsService(db, projects.contentChanged);
    const extensions = createExtensionService(db, codex, systems, projects.contentChanged);
    const p = await projects.create({ title: name });
    const x = extensions.forProject(p.id);
    const c = codex.forProject(p.id);
    const keyOf = async (category: string) => (await c.categories()).find((k) => k.key === category || k.name === category)!.key;
    const entryId = async (entry: string) => (await c.list()).find((e) => e.name === entry)!.id;

    const state = async () => {
      const categories = await c.categories();
      const catName = (key: string) => categories.find((k) => k.key === key)?.name ?? '?';
      const entries = await c.list();
      const records = await x.records();
      const rows = [...(await x.installed())].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
      return {
        categories: categories.map((k) => ({
          key: k.builtin ? k.key : '', name: k.name, archived: Boolean(k.archived),
          fields: k.fields.map((f) => [f.name, f.type, f.options ?? [], Boolean(f.archived)]),
        })),
        modules: rows.map((r) => ({
          moduleId: r.moduleId, enabled: r.enabled, version: r.definition.version, tools: r.definition.tools.length,
          created: r.createdCategories.map(catName), system: r.systemId ? 'yes' : null, settings: r.settings ?? null,
          bindings: {
            categories: Object.fromEntries(Object.entries(r.bindings?.categories ?? {}).map(([k, v]) => [k, catName(v)])),
            fields: Object.fromEntries(Object.entries(r.bindings?.fields ?? {}).map(([k, v]) => [k, categories.flatMap((cat) => cat.fields).find((f) => f.id === v)?.name ?? '?'])),
          },
        })),
        status: (await x.status()).map((s) => ({
          id: s.module.id, state: s.state, reasons: s.reasons, installed: s.installed, updatable: s.updatable, usage: s.usage,
          shares: s.shares.map((sh) => ({ moduleId: sh.moduleId, name: sh.name, enabled: sh.enabled, categories: sh.categories })),
        })),
        entries: entries.map((e) => [e.name, catName(e.category)]).sort(),
        records: records
          .map((r) => [r.moduleId, r.toolId, r.kind, r.title, r.state, r.rowId ? entries.find((e) => e.id === r.rowId)?.name : null, r.colId ? entries.find((e) => e.id === r.colId)?.name : null])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        systems: (await systems.forProject(p.id).list()).map((s) => s.name),
      };
    };

    const results: unknown[] = [];
    for (const step of steps) {
      let error: string | null = null;
      try {
        switch (step.op) {
          case 'enable': await x.enable(step.custom ? parseDefinition(step.custom) : step.module); break;
          case 'disable': await x.disable(step.module); break;
          case 'starter': await x.addStarterSystem(step.module); break;
          case 'entry': await c.create(await keyOf(step.category), step.name); break;
          case 'record': await x.addRecord(step.module, step.tool, { title: step.title, state: step.state }); break;
          case 'cell': await x.setCell(step.module, step.tool, await entryId(step.row), await entryId(step.col), step.value); break;
          case 'configure': await x.configure(step.module, () => step.settings); break;
          case 'template': await c.applyTemplate({ categories: step.categories }); break;
          case 'downgrade': {
            const row = (await x.installed()).find((r) => r.moduleId === step.module)!;
            await db.projectModules.update(row.id, { definition: { ...row.definition, version: 1, tools: row.definition.tools.slice(0, 2) } });
            break;
          }
          case 'dropCategory':
            await db.loreSchemas.where('projectId').equals(p.id).filter((k) => k.name === step.name).delete();
            break;
          case 'renameCategory': {
            const key = await keyOf(step.name);
            await c.saveCategory(key, (stored) => ({ name: step.to, fields: stored.fields.map((f) => (f.name === step.field ? { ...f, name: step.fieldTo, options: step.options } : f)) }));
            break;
          }
          default: throw new Error(`unknown step ${step.op}`);
        }
      } catch (e) {
        error = (e as Error).message;
      }
      // Quiet steps are listed without the state after them, so the whole sequence can be replayed.
      results.push(!step.quiet || error ? { step, error, state: await state() } : { step, error });
    }
    out[name] = results;
    db.close();
  }
  mkdirSync(process.env.GOLDEN_OUT!, { recursive: true });
  writeFileSync(join(process.env.GOLDEN_OUT!, 'modules.golden.json'), JSON.stringify(out));
});
