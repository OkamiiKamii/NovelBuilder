import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { connectionsOf, deriveConnections } from '@/modules/model/connections';
import { loadModel } from '@/modules/model/model';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from './service';
import { RELATION_PRESETS, TYPE_PREFIX } from './types';

async function novel() {
  const db = new NovelDB(`relations-manager-${crypto.randomUUID()}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerCodex(registry);
  registerRelationships(registry);
  const p = await projects.create({ title: 'Oaths' });
  const c = createCodexService(db, projects.contentChanged).forProject(p.id);
  const r = createRelationshipService(db, projects.contentChanged).forProject(p.id);
  const links = createConnectionService(db, projects.contentChanged).forProject(p.id);
  const [mira, bren, orrin] = await Promise.all(['Mira', 'Bren', 'Orrin'].map((name) => c.create('character', name)));
  const guild = await c.create('faction', 'Ash Guild');
  return { db, p, projects, c, r, links, mira, bren, orrin, guild };
}

describe('relationship types', () => {
  it('offers the built-in kinds the story needs', () => {
    const labels = RELATION_PRESETS.map((p) => p.label);
    for (const kind of ['Parent / Child', 'Friends', 'Romantic interest', 'Rivals', 'Enemies', 'Mentor / Student', 'Allies', 'Political tie', 'Employer / Employee', 'Custom']) expect(labels).toContain(kind);
  });

  it('can be the author’s own: named once, used like a built-in type, one-way with two roles or mutual with one', async () => {
    const s = await novel();
    const oath = await s.r.saveType({ label: 'Blood oath', category: 'custom', directional: true, fromRole: 'Oath-holder', toRole: 'Sworn' });
    const kin = await s.r.saveType({ label: 'Shield-kin', category: 'social', directional: false, fromRole: 'Shield-kin' });
    expect(kin).toMatchObject({ fromRole: 'Shield-kin', toRole: 'Shield-kin', directional: false });
    const relation = await s.r.create(s.mira.id, s.bren.id, `${TYPE_PREFIX}${oath.id}`);
    expect(relation.stages[0]).toMatchObject({ preset: `${TYPE_PREFIX}${oath.id}`, label: 'Blood oath', fromRole: 'Oath-holder', toRole: 'Sworn', directional: true });
    // The shared connection model reads it as any other relationship: between the actual character records, each side in its own role.
    const model = (await loadModel(s.db, s.p.id))!;
    const seen = connectionsOf(deriveConnections(model).connections, { type: 'entry', id: s.bren.id }).find((x) => x.connection.kind === 'relationship')!;
    expect([seen.other, seen.connection.label, seen.label]).toEqual([{ type: 'entry', id: s.mira.id }, 'Oath-holder', 'Sworn']);
  });

  it('are checked: a name, no duplicate of a built-in or another type, both roles when one-way', async () => {
    const s = await novel();
    await expect(s.r.saveType({ label: ' ' })).rejects.toThrow('Give the type a name.');
    await expect(s.r.saveType({ label: 'rivals' })).rejects.toThrow('There is already a type called “rivals”.');
    await s.r.saveType({ label: 'Blood oath' });
    await expect(s.r.saveType({ label: 'BLOOD OATH' })).rejects.toThrow('already a type called');
    await expect(s.r.saveType({ label: 'Debt', directional: true, fromRole: 'Creditor' })).rejects.toThrow('A one-way type needs both roles');
    await expect(s.r.create(s.mira.id, s.bren.id, `${TYPE_PREFIX}nope`)).rejects.toThrow('That relationship type no longer exists.');
    // Relationships still link only real characters, two different ones, once.
    await expect(s.r.create(s.mira.id, s.guild.id)).rejects.toThrow('Ash Guild is not a character.');
    await expect(s.r.create(s.mira.id, s.mira.id)).rejects.toThrow('Pick two different characters.');
  });

  it('changing a type changes every relationship using it; deleting it keeps their wording, as Custom', async () => {
    const s = await novel();
    const oath = await s.r.saveType({ label: 'Blood oath', directional: true, fromRole: 'Oath-holder', toRole: 'Sworn' });
    const relation = await s.r.create(s.mira.id, s.bren.id, `${TYPE_PREFIX}${oath.id}`);
    await s.r.saveType({ label: 'Life-debt', fromRole: 'Saviour', toRole: 'Debtor' }, oath.id);
    expect((await s.r.get(relation.id))!.stages[0]).toMatchObject({ label: 'Life-debt', fromRole: 'Saviour', toRole: 'Debtor' });
    await s.r.removeType(oath.id);
    expect((await s.r.get(relation.id))!.stages[0]).toMatchObject({ preset: 'custom', label: 'Life-debt', fromRole: 'Saviour', toRole: 'Debtor' });
    expect((await s.r.settings()).types).toEqual([]);
  });

  it('built-in types can be left out of the choices without touching relationships that use them', async () => {
    const s = await novel();
    const relation = await s.r.create(s.mira.id, s.bren.id, 'exes');
    await s.r.offerBuiltIn('exes', false);
    await s.r.offerBuiltIn('custom', false);
    expect((await s.r.settings()).hidden).toEqual(['exes']);
    expect((await s.r.get(relation.id))!.stages[0].label).toBe('Exes');
    await s.r.offerBuiltIn('exes', true);
    expect((await s.r.settings()).hidden).toEqual([]);
  });
});

describe('tracked attributes', () => {
  it('are none until the author chooses them, and are then given each way, from 0 to 10', async () => {
    const s = await novel();
    expect((await s.r.settings()).attributes).toEqual([]);
    const relation = await s.r.create(s.mira.id, s.orrin.id, 'mentor-student');
    const stage = relation.stages[0].id;
    await expect(s.r.updateStage(relation.id, stage, { attributes: { trust: { from: 5 } } })).rejects.toThrow('That attribute is not tracked.');
    await s.r.trackAttribute('trust');
    const debt = await s.r.trackAttribute('Debt');
    await expect(s.r.trackAttribute('debt')).rejects.toThrow('“Debt” is already tracked.');
    expect((await s.r.settings()).attributes.map((a) => a.label)).toEqual(['Trust', 'Debt']);
    // Mira trusts Orrin fully; he trusts her a little. Trust need not be returned.
    await s.r.updateStage(relation.id, stage, { attributes: { trust: { from: 10, to: 3 }, [debt.key]: { to: 7 } } });
    await s.r.updateStage(relation.id, stage, { attributes: { trust: { to: 4 } } });
    expect((await s.r.get(relation.id))!.stages[0].attributes).toEqual({ trust: { from: 10, to: 4 }, [debt.key]: { from: null, to: 7 } });
    for (const bad of [11, -1, 2.5]) await expect(s.r.updateStage(relation.id, stage, { attributes: { trust: { from: bad } } })).rejects.toThrow('Trust is given as a whole number from 0 to 10.');
    // Clearing both sides forgets it.
    await s.r.updateStage(relation.id, stage, { attributes: { [debt.key]: { to: null } } });
    expect(Object.keys((await s.r.get(relation.id))!.stages[0].attributes!)).toEqual(['trust']);
  });

  it('carry into a new stage as they stood, and are kept when tracking stops', async () => {
    const s = await novel();
    await s.r.trackAttribute('fear');
    const relation = await s.r.create(s.mira.id, s.orrin.id, 'rivals');
    await s.r.updateStage(relation.id, relation.stages[0].id, { attributes: { fear: { from: 2, to: 6 } } });
    const later = await s.r.addStage(relation.id, null);
    expect(later.attributes).toEqual({ fear: { from: 2, to: 6 } });
    await s.r.untrackAttribute('fear');
    expect((await s.r.settings()).attributes).toEqual([]);
    expect((await s.r.get(relation.id))!.stages[0].attributes).toEqual({ fear: { from: 2, to: 6 } });
    await s.r.trackAttribute('Fear');
    expect((await s.r.settings()).attributes).toEqual([{ key: 'fear', label: 'Fear' }]);
  });
});

describe('relationships as shared records', () => {
  it('sit beside the typed connections between the same characters, which stay their own records', async () => {
    const s = await novel();
    await s.r.create(s.mira.id, s.orrin.id, 'rivals');
    await s.links.create({ from: { type: 'entry', id: s.orrin.id }, to: { type: 'entry', id: s.mira.id }, type: 'distrusts' });
    const model = (await loadModel(s.db, s.p.id))!;
    const between = connectionsOf(deriveConnections(model).connections, { type: 'entry', id: s.mira.id }).filter((x) => x.other.id === s.orrin.id);
    expect(between.map((x) => [x.connection.kind, x.connection.label]).sort()).toEqual([['link', 'Distrusts'], ['relationship', 'Rivals']]);
  });

  it('travel with the novel, settings and all, and go when a character is deleted', async () => {
    const s = await novel();
    const oath = await s.r.saveType({ label: 'Blood oath' });
    await s.r.trackAttribute('loyalty');
    const relation = await s.r.create(s.mira.id, s.bren.id, `${TYPE_PREFIX}${oath.id}`);
    await s.r.updateStage(relation.id, relation.stages[0].id, { attributes: { loyalty: { from: 9 } } });
    const copy = await s.projects.duplicate(s.p.id);
    const r2 = createRelationshipService(s.db, s.projects.contentChanged).forProject(copy.id);
    const [copied] = await r2.list();
    expect([(await r2.settings()).types[0].label, (await r2.settings()).attributes[0].key, copied.stages[0].label, copied.stages[0].attributes]).toEqual(['Blood oath', 'loyalty', 'Blood oath', { loyalty: { from: 9, to: null } }]);
    expect([copied.fromId, copied.toId]).not.toContain(s.mira.id);
    await s.c.remove(s.bren.id);
    expect(await s.r.list()).toEqual([]);
  });
});
