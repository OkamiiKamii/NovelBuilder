// A system turned Off shows nothing to the author outside the Systems page, and nothing is lost or flagged broken.

import { abilityTree } from '../../src/domain/abilities/paths';
import { CastData } from '../../src/domain/characters/castData';
import { connectionsPanel } from '../../src/domain/codex/screens/connections';
import { knowledgeGraph } from '../../src/domain/graph/knowledge';
import { mergePlan } from '../../src/domain/integrity/fixes';
import { brokenReferences } from '../../src/domain/integrity/rules';
import { str } from '../../src/domain/json';
import { EntityRef, abilityId } from '../../src/domain/model/entityRef';
import { StoryModel } from '../../src/domain/model/storyModel';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { allSystemPresets } from '../../src/domain/systems/systemPresets';
import { addSheet, removeSystem, turnSystemOff, turnSystemOn } from '../../src/domain/systems/screens/systemsPage';
import { lifeHistory } from '../../src/domain/timeline/lifeHistory';
import { graphSummary, progressionRows } from '../../src/domain/visualize/summaries';
import { readJson, samplePath } from '../fixtures';

let ids = 0;
const preset = allSystemPresets[0].content;

function setup() {
  const c = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1700000000000, createId: () => `lk${ids++}` });
  const off = c.createSystem(preset);
  const on = c.createSystem(preset);
  const hero = str(c.snapshot.rows('loreEntries')[0]['id']);
  const sheet = addSheet(off.id, hero)(c);
  c.updateSheet(sheet.id, () => ({ itemIds: [off.items[0].id] }));
  const ability = abilityId(off.id, off.items[0].id);
  const other = abilityId(on.id, on.items[0].id);
  // The author recorded a path from the ability of the system to be turned off, to one of the system staying on.
  const linkRow = { id: 'lk-link', fromId: ability, fromType: 'ability', toId: other, toType: 'ability', type: 'prerequisite-for', createdAt: 1, updatedAt: 1 };
  const heroLink = { id: 'lk-hero', fromId: hero, fromType: 'entry', toId: ability, toType: 'ability', createdAt: 1, updatedAt: 1 };
  c.snapshot = c.snapshot.putRow('loreLinks', linkRow).putRow('loreLinks', heroLink);
  return { c, off, on, hero, ability, other };
}
const model = (c: SystemChanges) => StoryModel.fromSnapshot(c.snapshot);

describe('a system turned off leaves no trace outside the Systems page', () => {
  test('on: the system shows; off: nothing of it shows; on again: it all returns', () => {
    const { c, off, hero, ability } = setup();
    const see = () => {
      const m = model(c);
      const cast = new CastData('n', c.snapshot);
      return {
        panel: connectionsPanel(cast, new EntityRef('entry', hero)).lines.length,
        history: lifeHistory(m, hero)!.throughout.some((i) => i.title.startsWith('Holds ')),
        graph: knowledgeGraph(m).nodes.some((n) => n.key.includes(ability)),
        rows: progressionRows(m, []).find((r) => r.id === hero)?.abilities ?? 0,
        records: graphSummary(m).records,
        tree: abilityTree(m).nodes.some((n) => n.ref.id === ability),
      };
    };
    const before = see();
    expect(before).toMatchObject({ history: true, graph: true, tree: true });
    expect(before.rows).toBeGreaterThan(0);

    expect(turnSystemOff(off.id)(c)).toBe(true);
    const m = model(c);
    const hidden = see();
    expect(hidden).toMatchObject({ history: false, graph: false, tree: false, rows: 0 });
    expect(hidden.panel).toBeLessThan(before.panel);
    expect(hidden.records).toBeLessThan(before.records);
    expect(before.panel - hidden.panel).toBe(2); // the sheet's hold and the recorded link
    // The link is kept and still resolves: never flagged as broken, never counted as dangling.
    expect(c.snapshot.rows('loreLinks').map((r) => r['id'])).toEqual(expect.arrayContaining(['lk-link', 'lk-hero']));
    expect(m.abilities.has(ability)).toBe(true);
    expect(m.exists(new EntityRef('ability', ability))).toBe(true);
    expect(brokenReferences(m)).toEqual([]);
    expect(knowledgeGraph(m).dangling).toBe(0);

    expect(turnSystemOn(off.id)(c)).toBe(true);
    expect(see()).toEqual(before);
  });

  test('a path touching an off ability is skipped, not listed under Not drawn', () => {
    const { c, off, on, other } = setup();
    expect(abilityTree(model(c)).edges.some((e) => e.from.includes(off.id))).toBe(true);
    c.setSystemOff(off.id, true);
    const tree = abilityTree(model(c));
    expect(tree.notDrawn).toEqual([]);
    expect(tree.edges.some((e) => e.from.includes(off.id) || e.to.includes(off.id))).toBe(false);
    expect(tree.nodes.some((n) => n.ref.id === other)).toBe(true);
    expect(on.id).toBeDefined();
  });

  test('turning one system off does not recolour the others', () => {
    const { c, off, other } = setup();
    const colour = () => abilityTree(model(c)).nodes.find((n) => n.ref.id === other)!.color;
    const before = colour();
    c.setSystemOff(off.id, true);
    expect(colour()).toBe(before);
  });

  test('the Systems count on a character counts only systems that are on', () => {
    const { c, off, hero } = setup();
    const cast = () => new CastData('n', c.snapshot);
    const count = () => model(c).sheets.filter((s) => s.entryId === hero && model(c).systems.has(s.systemId)).length;
    expect(count()).toBe(1);
    c.setSystemOff(off.id, true);
    expect(count()).toBe(0);
    expect(cast().model.systems.has(off.id)).toBe(false);
  });

  test('removeSystem returns true', () => {
    const { c, off } = setup();
    expect(removeSystem(off.id)(c)).toBe(true);
  });

  test('a merge plan says the doubled sheets on a turned-off system are kept', () => {
    const { c, off, hero } = setup();
    const twin = str(c.snapshot.rows('loreEntries').find((r) => r['id'] !== hero && r['category'] === c.snapshot.rows('loreEntries').find((x) => x['id'] === hero)!['category'])!['id']);
    addSheet(off.id, twin)(c);
    c.setSystemOff(off.id, true);
    const plan = mergePlan(c.snapshot, hero, twin);
    expect(plan.combined.join(' ')).toContain('on a turned-off system is kept; turn it on to choose one');
    expect(plan.dropped.join(' ')).not.toContain('already has a sheet');
  });
});
