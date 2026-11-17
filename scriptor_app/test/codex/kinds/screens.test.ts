// What Categories & fields, the views' settings, templates and the connections panel show and change (kinds_page.dart,
// kind_uses_editor.dart, template_store.dart, connections_panel.dart), run as the changes they make on the records. The
// Flutter app has no widget tests of these; what is checked here is what those pages promise: nothing an author wrote
// is lost, a field removed is archived and restored, a setting that no longer suits says so, a template only adds, and
// a connection reads correctly from each end.

import { CastData } from '../../../src/domain/characters/castData';
import { ChangeRefused, CodexChanges } from '../../../src/domain/codex/codexChanges';
import {
  connectableRecords,
  connectionDialog,
  connectionForm,
  connectionReads,
  connectionsPanel,
  openRecord,
  ownKind,
  removeConnection,
  saveConnection,
  statusOf,
} from '../../../src/domain/codex/screens/connections';
import { graphLinkTicked, holdingMenu, kindUses, saveUses, setUseIn, slotMenu, treeTicked, viewState } from '../../../src/domain/codex/screens/kindUses';
import {
  addCategory,
  addField,
  addPreset,
  allAsTemplate,
  chosenKind,
  editField,
  fieldPatch,
  fieldRow,
  fieldsChange,
  kindAsTemplate,
  kindChoiceLabel,
  kindEditor,
  kindPatch,
  kindsInOrder,
  moveField,
  plainNumber,
  presetAdded,
  saveKind,
  savedTemplateRow,
  templateAdded,
  templateMenu,
} from '../../../src/domain/codex/screens/kinds';
import { SavedTemplate, TemplateStore, templatesKey } from '../../../src/domain/codex/templates';
import { typePresets } from '../../../src/domain/codex/typePresets';
import { worldPresets } from '../../../src/domain/codex/worldPresets';
import type { JsonMap } from '../../../src/domain/json';
import { EntityRef } from '../../../src/domain/model/entityRef';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { readJson, samplePath } from '../../fixtures';

class World {
  snapshot = new NovelSnapshot({ project: { id: 'novel', title: 'World' }, collections: {} });
  clock = 1000;
  private ids = 0;
  act<T>(change: (c: CodexChanges) => T): T {
    const c = new CodexChanges(this.snapshot, { now: ++this.clock, createId: () => `id${++this.ids}` });
    const result = change(c);
    this.snapshot = c.snapshot;
    return result;
  }
  get cast(): CastData {
    return new CastData('novel', this.snapshot);
  }
}

const def = (id: string, name: string, type: string, extra: JsonMap = {}): JsonMap => ({ id, name, type, options: [], ...extra });

describe('categories and fields', () => {
  test('the chooser: by order then name, each with its count; the first shown is not Characters', () => {
    const w = new World();
    w.act((c) => addCategory('Kingdoms')!(c));
    w.act((c) => c.createEntry('location', 'Glass River'));
    const kinds = kindsInOrder(w.cast.model.categories.values());
    expect(kinds.map((k) => k.key).slice(0, 6)).toEqual(['character', 'location', 'faction', 'item', 'power', 'lore']);
    expect(kinds[6].name).toBe('Kingdoms');
    expect(chosenKind(kinds, null).key).toBe('location');
    expect(chosenKind(kinds, kinds[6].key).name).toBe('Kingdoms');
    expect(kindChoiceLabel(kinds[1], 1)).toBe('Locations · 1 entry');
    expect(kindChoiceLabel(kinds[6], 0)).toBe('Kingdoms · 0 entries');
    expect(addCategory('   ')).toBeNull();
  });

  test('a preset chosen: the category made is shown, and what is said', () => {
    const w = new World();
    const p = typePresets.find((t) => t.id === 'spells')!;
    const after = w.act(addPreset(p));
    const said = presetAdded(after, p);
    expect(said.show).toBe(after.find((c) => c.name === 'Spells')!.key);
    expect(said.tell).toBe('Added “Spells” with its fields. Rename, retype or remove any of them.');
  });

  test('NON-DESTRUCTIVE: moving, adding, editing, archiving and restoring fields keep every value', () => {
    const w = new World();
    const kind = w.act(addCategory('Ships')!);
    w.act(fieldsChange(kind.key, () => [def('a', 'Class', 'text'), def('b', 'Crew', 'number'), def('c', 'Captain', 'reference')]));
    const ship = w.act((c) => c.createEntry(kind.key, 'Gull'));
    w.act((c) => c.setFieldValue(ship.id, 'a', 'Cutter'));
    // Move Class down: Crew, Class, Captain.
    w.act(fieldsChange(kind.key, (s) => moveField(s, 'a', 1)));
    expect(w.act((c) => c.category(kind.key)).fields.map((f) => f.id)).toEqual(['b', 'a', 'c']);
    // Out of range: as stored.
    expect(moveField([def('a', 'A', 'text')], 'a', -1).map((f) => f['id'])).toEqual(['a']);
    // Archive Class: kept, after the live ones, its value too.
    w.act(fieldsChange(kind.key, (s) => editField(s, 'a', fieldPatch.archive())));
    let now = w.act((c) => c.category(kind.key));
    expect(now.fields.map((f) => [f.id, f.archived])).toEqual([
      ['b', false],
      ['a', true],
      ['c', false],
    ]);
    const editor = kindEditor(now, w.cast.entries, 1);
    expect(editor.active.map((f) => f.id)).toEqual(['b', 'c']);
    expect(editor.archived.map((a) => a.subtitle)).toEqual(['Short text · still filled in on 1 entry']);
    expect(w.act((c) => c.owned(ship.id)).fields.find((f) => f.defId === 'a')!.value).toBe('Cutter');
    // Add a field: after the live ones, before the archived.
    w.act(fieldsChange(kind.key, (s) => addField(s, 'n')));
    now = w.act((c) => c.category(kind.key));
    expect(now.fields.map((f) => f.id)).toEqual(['b', 'c', 'n', 'a']);
    expect(now.fields[2].name).toBe('New field');
    // Restore.
    w.act(fieldsChange(kind.key, (s) => editField(s, 'a', fieldPatch.restore())));
    expect(w.act((c) => c.category(kind.key)).fields.find((f) => f.id === 'a')!.archived).toBe(false);
  });

  test('a field’s row: its type’s parts, its rules as typed back', () => {
    const w = new World();
    const kind = w.act(addCategory('Spells')!);
    w.act(
      fieldsChange(kind.key, () => [
        def('r', 'Rank', 'number', { min: 0, max: 10.5 }),
        def('s', 'School', 'select', { options: ['Fire', 'Water'] }),
        def('k', 'Known by', 'references', { target: 'character' }),
        def('g', 'Gone link', 'reference'),
      ]),
    );
    const now = w.act((c) => c.category(kind.key));
    const kinds = [...w.cast.model.categories.values()];
    const rows = now.fields.map((d, i) => fieldRow(d, { first: i === 0, last: i === now.fields.length - 1, kinds }));
    expect(rows[0].numbers).toEqual({ min: '0', max: '10.5' });
    expect(rows[0].up.enabled).toBe(false);
    expect(rows[3].down.enabled).toBe(false);
    expect(rows[1].choices).toBe('Fire, Water');
    expect(rows[2].linksTo!.value).toBe('character');
    expect(rows[3].linksTo!.value).toBe('');
    expect(rows[2].linksTo!.choices[0]).toEqual({ value: '', label: 'Any kind of entry' });
    expect(rows[0].archiveTooltip).toBe('Remove Rank (archived: values already written are kept)');
    // Typed rules.
    expect(fieldPatch.options(' Fire,, Water ,  ')).toEqual({ options: ['Fire', 'Water'] });
    expect(fieldPatch.min(' 3.5 ')).toEqual({ min: 3.5 });
    expect(fieldPatch.min('abc')).toEqual({ min: null });
    expect(fieldPatch.name('  ')).toBeNull();
    expect(fieldPatch.required(false)).toEqual({ required: null });
    expect(fieldPatch.help('   ')).toEqual({ help: null });
    // A rule removed (null) is taken off the field.
    expect(editField([def('x', 'X', 'number', { min: 1 })], 'x', { min: null })).toEqual([def('x', 'X', 'number')]);
    expect([0, 3, -4, 2.5, 10, -0.125].map(plainNumber)).toEqual(['0', '3', '-4', '2.5', '10', '-0.125']);
  });

  test('the head: Characters has no graph switch, template button or archiving; custom categories archive', () => {
    const w = new World();
    const character = kindEditor(w.act((c) => c.category('character')), [], 0);
    expect([character.graph, character.saveTemplate, character.archive]).toEqual([null, null, null]);
    expect(character.caption).toContain('Fields for one character alone');
    const kind = w.act(addCategory('Kingdoms')!);
    let editor = kindEditor(kind, [], 2);
    expect(editor.graph).toEqual({ on: true });
    expect(editor.saveTemplate).toBe('Save Kingdoms as a template');
    expect(editor.fieldsTitle).toBe('Fields every kingdoms has');
    expect(editor.archive).toEqual({
      said: 'Archiving hides this category from “New entry”. Its 2 entries are kept.',
      button: 'Archive category',
    });
    expect(editor.colours.filter((c) => c.chosen).map((c) => c.label)).toEqual([`Colour ${kind.color}, chosen`]);
    w.act(saveKind(kind.key, kindPatch.graph(false)));
    w.act(saveKind(kind.key, kindPatch.archived(kind)));
    editor = kindEditor(w.act((c) => c.category(kind.key)), [], 2);
    expect(editor.graph).toEqual({ on: false });
    expect(editor.archive!.button).toBe('Restore category');
    expect(kindEditor(w.act((c) => c.category('location')), [], 0).archive).toBeNull();
    expect(kindPatch.singular('  ')).toBeNull();
  });
});

describe('the views’ settings', () => {
  test('menus offer only fitting fields, and show a stale choice for what it is', () => {
    const w = new World();
    const kind = w.act(addCategory('Spells')!);
    w.act(fieldsChange(kind.key, () => [def('r', 'Rank', 'number'), def('n', 'Notes', 'longtext')]));
    w.act(saveUses(kind.key, (s) => ({ ...s, rank: 'r' })));
    let now = w.act((c) => c.category(kind.key));
    expect(slotMenu(now, 'rank', 'Rank', now.uses['rank'], 'Not ranked').choices).toEqual([
      { value: '', label: 'Not ranked' },
      { value: 'r', label: 'Rank (Number)' },
    ]);
    expect(viewState(now, 'rank', true, 'rank')).toEqual({ kind: 'note', text: 'Set up: shown under Visualize → Records by kind.' });
    // Rank retyped to long text: still shown, and why.
    w.act(fieldsChange(kind.key, (s) => editField(s, 'r', fieldPatch.type('longtext'))));
    now = w.act((c) => c.category(kind.key));
    const menu = slotMenu(now, 'rank', 'Rank', now.uses['rank'], 'Not ranked');
    expect(menu.choices.at(-1)).toEqual({ value: 'r', label: 'Rank (does not suit now)' });
    const state = viewState(now, 'rank', true, 'rank');
    expect(state.kind).toBe('issues');
    // Not set: what to add first.
    expect(viewState(now, 'map', false, 'map.x')).toEqual({ kind: 'note', text: 'Add a Number field to set this up.' });
    expect(slotMenu(now, 'rank', 'Rank', 'gone', 'Not ranked').choices.at(-1)).toEqual({ value: 'gone', label: 'A field that is gone' });
  });

  test('a part set and cleared; the tree ticked; holding offers the author’s own kinds', () => {
    const w = new World();
    const kind = w.act(addCategory('Relics')!);
    w.act(fieldsChange(kind.key, () => [def('h', 'Holder', 'reference'), def('a', 'Allies', 'references')]));
    w.act(saveUses(kind.key, setUseIn('ownership', 'type', 'sworn to')));
    w.act(saveUses(kind.key, setUseIn('ownership', 'field', 'h')));
    w.act(saveUses(kind.key, treeTicked(true)));
    let now = w.act((c) => c.category(kind.key));
    expect(now.uses['ownership']).toEqual({ type: 'sworn to', field: 'h' });
    expect(now.uses['tree']).toBe(true);
    const holding = holdingMenu(now, []);
    expect(holding.value).toBe('sworn to');
    expect(holding.choices.at(-1)).toEqual({ value: 'sworn to', label: 'sworn to (your own)' });
    w.act(saveUses(kind.key, setUseIn('ownership', 'field', null)));
    w.act(saveUses(kind.key, treeTicked(false)));
    now = w.act((c) => c.category(kind.key));
    expect(now.uses['ownership']).toEqual({ type: 'sworn to' });
    expect(now.uses['tree']).toBeUndefined();
    // Link fields drawn: unticking one names the rest; ticking all again is "all" (none chosen).
    const off = graphLinkTicked(now, 'a', false)({ ...now.uses });
    expect(off['graphLinks']).toEqual(['h']);
    expect(graphLinkTicked(now, 'a', true)(off)['graphLinks']).toBeNull();
    const box = kindUses(now, []);
    expect(box.graph.links.map((l) => [l.name, l.on])).toEqual([
      ['Holder', true],
      ['Allies', true],
    ]);
    expect(box.caption).toContain('A view Relics is not set up for');
  });
});

describe('templates', () => {
  const store = () => {
    const settings = new Map<string, unknown>();
    let ids = 0;
    return {
      settings,
      t: new TemplateStore({ read: (k) => settings.get(k) ?? null, write: (k, v) => settings.set(k, v) }, { createId: () => `t${++ids}`, clock: () => 7 }),
    };
  };

  test('kept on the device by name, never in a novel; a template with no name is refused', () => {
    const { t, settings } = store();
    t.save(' Zeta ', ' d ', [{ key: 'x' }]);
    t.save('alpha', '', []);
    expect(t.list().map((x) => x.name)).toEqual(['alpha', 'Zeta']);
    expect(settings.get(templatesKey)).toHaveLength(2);
    expect(() => t.save('  ', '', [])).toThrow('Give the template a name.');
    t.remove('t1');
    expect(t.list().map((x) => x.name)).toEqual(['alpha']);
  });

  test('a whole novel saved and added to another only adds what was missing', () => {
    const { t } = store();
    const a = new World();
    const kind = a.act(addCategory('Ships')!);
    a.act(fieldsChange(kind.key, () => [def('c', 'Crew', 'number')]));
    const data = a.act((c) => c.schemaSnapshot());
    const saved = t.save('My world', allAsTemplate(data).description, data);
    expect(saved.description).toBe('7 categories');
    expect(allAsTemplate(data).tell('My world')).toBe('Saved “My world”. Pick it when you create a new novel, or add it to any novel here.');
    const b = new World();
    b.act(addCategory('Ships')!);
    const after = b.act((c) => c.addKinds(t.list()[0].categories));
    const ships = after.filter((c) => c.name === 'Ships');
    expect(ships).toHaveLength(1);
    expect(ships[0].fields.map((f) => f.name)).toEqual(['Crew']);
    expect(templateAdded('My world')).toBe('Added what was missing from “My world”. Nothing existing was changed.');
    const one = kindAsTemplate(kind, [CodexChanges.kindTemplate(kind)]);
    expect([one.name, one.description]).toEqual(['Ships', 'One kind of record: Ships']);
  });

  test('the menu: built in, then yours; one received as a file says whose, which version and its terms', () => {
    const shared = new SavedTemplate({
      id: 's',
      name: 'Shared',
      description: 'From a friend',
      categories: [],
      shared: { version: 3, author: '', license: 'ccBy' },
    });
    expect(templateMenu(worldPresets, []).map((g) => g.heading)).toEqual(['Built in']);
    expect(templateMenu(worldPresets, [shared]).map((g) => g.heading)).toEqual(['Built in', 'Yours']);
    expect(savedTemplateRow(shared).subtitle).toBe('From a friend\nVersion 3, made by someone unnamed · CC BY 4.0');
    expect(savedTemplateRow(new SavedTemplate({ id: 'x', name: 'X', shared: { license: 'odd' } })).subtitle).toBe(
      'Version 1, made by someone unnamed · Personal use only',
    );
  });
});

describe('connections', () => {
  const sample = () => NovelSnapshot.fromJson(readJson(samplePath));

  test('a connection reads from each end in its own words, with its status and where it is kept', () => {
    const w = new World();
    const a = w.act((c) => c.createEntry('character', 'Mira'));
    const b = w.act((c) => c.createEntry('location', 'The Keep'));
    const from = new EntityRef('entry', a.id);
    const form = { ...connectionForm(null), kind: 'located-in', to: new EntityRef('entry', b.id), canon: 'provisional' as const };
    const link = w.act(saveConnection(from, null, form));
    const mine = connectionsPanel(w.cast, from);
    expect(mine.title).toBe('Every connection (1)');
    expect(mine.lines[0].words).toBe('Located in');
    expect(mine.lines[0].status).toEqual({ status: 'provisional', label: 'Provisional', icon: 'pending_outlined' });
    expect(mine.lines[0].keptIn).toBe('· kept in a connection you recorded');
    expect(mine.lines[0].link!.id).toBe(link.id);
    // Change it: the author's own words for both sides, confirmed.
    w.act(saveConnection(from, link, { ...connectionForm(link), kind: ownKind, own: 'guards', label: 'Guards', reverse: 'Guarded by', canon: 'canon' }));
    const theirs = connectionsPanel(w.cast, new EntityRef('entry', b.id));
    expect(theirs.lines[0].outgoing).toBe(false);
    expect(theirs.lines[0].words).toBe('guards this');
    expect(theirs.lines[0].other.name).toBe('Mira');
    expect(theirs.lines[0].status!.label).toBe('Confirmed');
    expect(statusOf(theirs.lines[0].connection)).toBe('confirmed');
    w.act(removeConnection(link.id));
    expect(connectionsPanel(w.cast, from).empty).toBe('Nothing points here yet, and this points at nothing.');
  });

  test('the dialog: what each kind says of the other side, and when it can be saved', () => {
    expect(connectionReads('allied-with')).toBe('Reads the same from both ends.');
    expect(connectionReads('member-of')).toBe('From the other end it reads “Has member”.');
    expect(connectionReads('considers-rival')).toContain('One-sided');
    expect(connectionReads('sworn enemy of')).toContain('One-sided');
    const cast = new CastData('novel', sample());
    const from = new EntityRef('entry', cast.entries[0].id);
    const form = connectionForm(null);
    let dialog = connectionDialog(cast, from, null, form);
    expect(dialog.title).toBe('Add a connection');
    expect(dialog.ready).toBe(false);
    expect(dialog.kinds).toHaveLength(25);
    expect(dialog.kinds.at(-1)).toEqual({ value: ownKind, label: 'A kind of my own…' });
    expect(dialog.statuses.map((s) => s.label)).toEqual([
      'Confirmed',
      'Provisional',
      'Invalid: not canon',
      'Invalid: retconned',
      'Disputed',
    ]);
    dialog = connectionDialog(cast, from, null, { ...form, to: new EntityRef('entry', cast.entries[1].id) });
    expect(dialog.ready).toBe(true);
    dialog = connectionDialog(cast, from, null, { ...form, kind: ownKind, own: '  ', to: new EntityRef('entry', cast.entries[1].id) });
    expect(dialog.ready).toBe(false);
    // The other end: chapters in book order, the rest by name, never itself.
    const others = connectableRecords(cast, 'entry', from);
    expect(others.some((r) => r.ref.equals(from))).toBe(false);
    expect(others.map((r) => r.label)).toEqual([...others.map((r) => r.label)].sort((x, y) => x.localeCompare(y)));
    const chapters = connectableRecords(cast, 'node', from);
    expect(chapters[0].label.startsWith('Ch 1: ')).toBe(true);
  });

  test('a record opens where it lives', () => {
    const cast = new CastData('novel', sample());
    const character = cast.entries.find((e) => e.category === 'character')!;
    const place = cast.entries.find((e) => e.category === 'location')!;
    expect(openRecord(cast, new EntityRef('entry', character.id))).toEqual({ kind: 'path', path: `/organize/character/${character.id}` });
    expect(openRecord(cast, new EntityRef('entry', place.id))).toEqual({ kind: 'path', path: `/organize/world/entry/${place.id}` });
    expect(openRecord(cast, new EntityRef('node', 'n'))).toEqual({ kind: 'chapter', nodeId: 'n' });
    expect(openRecord(cast, new EntityRef('event', 'e'))).toEqual({ kind: 'path', path: '/plan/event/e' });
    expect(openRecord(cast, new EntityRef('thread', 't'))).toBeNull();
  });

  test('a record is not connected to itself', () => {
    const w = new World();
    const a = w.act((c) => c.createEntry('character', 'Mira'));
    const from = new EntityRef('entry', a.id);
    expect(() => w.act(saveConnection(from, null, { ...connectionForm(null), to: from }))).toThrow(ChangeRefused);
  });
});
