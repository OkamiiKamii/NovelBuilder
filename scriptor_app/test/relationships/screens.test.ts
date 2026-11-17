// The relationship screens' logic: ports of flutter_app/test/features/relationships/relationships_screens_test.dart
// and first_tie_test.dart without the widgets (what is shown and what a press changes), and the words, order and
// presses of each screen as the Flutter screens have them.
//
// Left out, being about widgets only: the contrast guideline, the InteractiveViewer's own matrix after a frame (the fit
// itself is checked), the router's location (the paths are), and "works on a phone at 200% text size".

import { type JsonMap } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { CharacterRelation } from '../../src/domain/records/relation';
import { Entry } from '../../src/domain/records/entry';
import { layoutNetwork, relationNetwork } from '../../src/domain/relationships/network';
import { RelationChanges } from '../../src/domain/relationships/relationChanges';
import { RelationSettings, relationSettingsOf } from '../../src/domain/relationships/relationTypes';
import { documentChooser, goneChoice } from '../../src/domain/relationships/screens/cast';
import {
  drawFirstTie,
  firstTieTypes,
  firstTieView,
  initialFirstTie,
} from '../../src/domain/relationships/screens/firstTie';
import {
  addRelationshipDialog,
  attributeChosen,
  feelingChosen,
  offeredTypes,
  relationshipNotFound,
  relationshipPageView,
  relationshipPath,
  startChosen,
  storyDateEdited,
  storyEventChosen,
  storyTimeChosen,
  unknownStart,
  whereChosen,
} from '../../src/domain/relationships/screens/relationshipPage';
import {
  applyMapConfig,
  arrowHead,
  clearedMapState,
  dashSegments,
  distanceToSegment,
  edgeLabelShown,
  edgeTapped,
  filtersShown,
  filtersToggleLabel,
  fitTransform,
  hitTest,
  initialMapState,
  initialOf,
  layerToggled,
  mapBody,
  mapConfig,
  mapCount,
  mapDrawing,
  mapFiltered,
  mapFiltersView,
  mapKey,
  mapLegend,
  mapList,
  mapSemantics,
  networkFilterOf,
  nodeLit,
  selectionView,
} from '../../src/domain/relationships/screens/relationshipMap';
import {
  ownAttributeGiven,
  relationSettingsView,
  saveTypeDraft,
  suggestedToggled,
  typeDialogView,
  typeDraftOf,
} from '../../src/domain/relationships/screens/relationSettings';
import { relationshipsTabView } from '../../src/domain/relationships/screens/relationshipsTab';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';

/** A novel being changed as the screens change it: each press one RelationChanges, saved before the next. */
class Novel {
  s = new NovelSnapshot({ project: { id: 'novel', title: 'Ashfall' }, collections: {} });
  private clock = 1000;
  private ids = 0;

  relate<T>(change: (c: RelationChanges) => T): T {
    const c = new RelationChanges(this.s, { now: ++this.clock, createId: () => `id${++this.ids}` });
    const out = change(c);
    this.s = c.snapshot;
    return out;
  }

  character(name: string): string {
    return this.relate((c) => c.createEntry('character', name)).id;
  }

  put(collection: string, row: JsonMap): void {
    this.s = this.s.putRow(collection, { projectId: 'novel', ...row });
  }

  get model(): StoryModel {
    return StoryModel.fromSnapshot(this.s);
  }

  get settings(): RelationSettings {
    return relationSettingsOf(this.s.rows('relationSettings'));
  }

  relations(): CharacterRelation[] {
    return this.s.rows('characterRelations').map((r) => new CharacterRelation(r));
  }

  page(id: string) {
    return relationshipPageView(this.model, this.settings, id)!;
  }
}

function pair(): { w: Novel; kael: string; mira: string } {
  const w = new Novel();
  return { w, kael: w.character('Kael'), mira: w.character('Mira') };
}

describe('the relationship screens (relationships_screens_test.dart)', () => {
  test('a relationship is added from a profile, a change is recorded as a new stage, and history is kept', () => {
    const { w, kael, mira } = pair();
    const kaelEntry = w.model.entries.get(kael)!;
    expect(relationshipsTabView(w.model, kaelEntry).none).toBe('Kael has no relationships recorded yet.');
    const dialog = addRelationshipDialog(w.model, w.settings, kael);
    if (!('with' in dialog)) throw new Error('the dialog opens');
    expect(dialog.with.choices).toEqual([{ value: mira, label: 'Mira' }]);
    const rel = w.relate((c) => c.createRelation(kael, mira, dialog.type.value));
    expect(relationshipPath(rel.id)).toBe(`/organize/relationship/${rel.id}`);
    expect(w.relations()[0].stages[0].label).toBe('Friends');

    // "Record a change…", then "Add the stage" with the start of the story.
    const where = whereChosen('');
    w.relate((c) => c.addStage(rel.id, where.nodeId, { unknown: where.unknown }));
    expect(w.relations()[0].stages).toHaveLength(2);
    // Change the new stage's feeling: the first stage is untouched.
    const firstBefore = w.relations()[0].stages[0].raw;
    const cards = w.page(rel.id).stages;
    w.relate((c) => c.updateStage(rel.id, cards[cards.length - 1].stageId, feelingChosen('hostile')));
    const after = w.relations()[0].stages;
    expect([after[0].raw, after[1].affinity]).toEqual([firstBefore, 'hostile']);
    expect(w.page(rel.id).evolution.some((l) => l.includes('changed feeling: Neutral → Hostile'))).toBe(true);
  });

  test('a stage is placed on a date in story time, checked against the novel’s calendar', () => {
    const { w, kael, mira } = pair();
    const rel = w.relate((c) => c.createRelation(kael, mira));
    const stage = () => w.relations()[0].stages[0];
    const chosen = storyTimeChosen(w.model, stage(), 'date');
    if (chosen === null || !('input' in chosen)) throw new Error('a date is given');
    w.relate((c) => c.updateStage(rel.id, stage().id, chosen.input));
    expect(w.page(rel.id).stages[0].storyDate?.legend).toBe('On a date in story time');
    // The date editor's year, typed: 1020.
    w.relate((c) =>
      c.updateStage(
        rel.id,
        stage().id,
        storyDateEdited(stage(), (when) => ({ ...when, year: 1020 })),
      ),
    );
    const stored = stage().storyAt!;
    expect(stored['kind']).toBe('date');
    expect((stored['when'] as JsonMap)['year']).toBe(1020);
    expect(w.page(rel.id).evolution[0]).toContain('in story time Year 1020');
  });

  test('tracked attributes appear on each stage, each way, only once chosen', () => {
    const { w, kael, mira } = pair();
    const rel = w.relate((c) => c.createRelation(kael, mira));
    expect(w.page(rel.id).stages[0].attributes).toEqual([]);
    w.relate((c) => suggestedToggled(c, 'trust', true));
    const [trust] = w.page(rel.id).stages[0].attributes;
    expect(trust.heading).toBe('Trust, from 0 to 10 (empty: not said)');
    expect(trust.sides.map((s) => s.chooser.label)).toEqual(['Kael toward Mira', 'Mira toward Kael']);
    expect(trust.sides[0].chooser.choices.map((c) => c.label)).toEqual([
      'Not said',
      ...Array.from({ length: 11 }, (_, i) => `${i}`),
    ]);
    w.relate((c) => c.updateStage(rel.id, w.relations()[0].stages[0].id, attributeChosen('trust', 'from', 7)));
    expect(w.relations()[0].stages[0].attribute('trust')).toEqual({ from: 7, to: null });
  });

  test('the map draws the shared records, filters them, opens what is selected, and lists them', () => {
    const { w, kael, mira } = pair();
    const orrin = w.character('Orrin');
    const one = w.relate((c) => c.createRelation(kael, mira, 'rivals'));
    w.relate((c) => c.createRelation(orrin, kael, 'mentor-student'));
    let state = initialMapState;
    const net = () => relationNetwork(w.model, networkFilterOf(state));
    expect(mapCount(net())).toBe('Showing 3 characters and 2 of 2 relationships.');
    const mentorship = mapFiltersView(w.model, w.settings, state).layers.find((l) => l.label === 'Mentorship')!;
    expect(mentorship.selected).toBe(true);
    state = layerToggled(state, mentorship.layer, false);
    expect(mapCount(net())).toBe('Showing 2 characters and 1 of 2 relationships.');
    state = { ...state, list: true };
    expect(mapBody(net(), state)).toBe('list');
    const row = mapList(w.model, net()).find((r) => r.title === 'Kael · Rivals · Mira')!;
    expect(row.opens).toBe(`/organize/relationship/${one.id}`);
  });

  test('on a phone the map’s filters fold away, and the map fits itself to its box', () => {
    const { w, kael, mira } = pair();
    w.relate((c) => c.createRelation(kael, mira, 'rivals'));
    expect(filtersShown(null, true)).toBe(false);
    const drawing = mapDrawing(relationNetwork(w.model));
    const box = { width: 360, height: 460 };
    const fitted = fitTransform(box, drawing);
    expect(fitted).not.toEqual({ scale: 1, x: 0, y: 0 }); // centred in the box
    expect(fitTransform(box, drawing)).toEqual(fitted);
    expect(filtersToggleLabel(false, mapFiltered(initialMapState))).toBe('Filters');
    const state = layerToggled(initialMapState, 'family', false);
    expect(filtersToggleLabel(true, mapFiltered(state))).toBe('Hide filters');
    expect(filtersToggleLabel(false, mapFiltered(state))).toBe('Filters (some on)');
  });
});

describe('the first tie (first_tie_test.dart)', () => {
  test('an empty map is where the first line is drawn: two names and what they are, in one press', () => {
    const w = new Novel();
    expect(mapBody(relationNetwork(w.model), initialMapState)).toBe('first-tie');
    const empty = firstTieView([], initialFirstTie);
    if (empty.kind !== 'sentence') throw new Error('the sentence');
    expect([empty.heading, empty.draw.label, empty.draw.enabled]).toEqual([
      'Draw the first lines',
      'Draw it on the map',
      false,
    ]);
    expect(firstTieTypes.find((t) => t.value === 'rivals')?.label).toBe('Rivals');
    const draft = { first: 'Ilse', second: 'Brannoc', preset: 'rivals' };
    const ready = firstTieView([], draft);
    expect(ready.kind === 'sentence' && ready.draw.enabled).toBe(true);
    const told = w.relate((r) => drawFirstTie(r, [], draft, (name) => r.createEntry('character', name).id));
    expect(told).toBe('Ilse and Brannoc are on the map.');
    const names = new Map(w.s.rows('loreEntries').map((r) => [new Entry(r).id, new Entry(r).name]));
    expect(new Set(names.values())).toEqual(new Set(['Ilse', 'Brannoc']));
    expect(w.relations().map((t) => [names.get(t.fromId), names.get(t.toId), t.stages[0].preset])).toEqual([
      ['Ilse', 'Brannoc', 'rivals'],
    ]);
    expect(mapBody(relationNetwork(w.model), initialMapState)).toBe('map'); // the map takes its place
  });

  test('with one character, they are named, and only the other is asked for', () => {
    const w = new Novel();
    const mira = w.character('Mira');
    const people = [{ id: mira, name: 'Mira' }];
    const view = firstTieView(people, initialFirstTie);
    if (view.kind !== 'sentence') throw new Error('the sentence');
    expect([view.known, view.firstField]).toEqual([people[0], null]);
    const draft = { ...initialFirstTie, second: 'Kai' };
    w.relate((r) => drawFirstTie(r, people, draft, (name) => r.createEntry('character', name).id));
    expect(w.relations()[0].fromId).toBe(mira);
    expect(w.s.rows('loreEntries')).toHaveLength(2);
  });

  test('two characters or more: the table of pairs; a one-way type says who is which', () => {
    expect(
      firstTieView(
        [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
        initialFirstTie,
      ),
    ).toEqual({
      kind: 'pairs',
      heading: 'Draw the first lines',
      text: 'Who is each of your characters to the others? Press a “+” to say, and the map draws it.',
    });
    const roles = (first: string, second: string) => {
      const v = firstTieView([], { first, second, preset: 'mentor-student' });
      return v.kind === 'sentence' ? v.roles : null;
    };
    expect(roles('', '')).toBe('The first is the mentor, the second the student.');
    expect(roles(' Ilse ', 'Kai')).toBe('Ilse is the mentor, Kai the student.');
    expect(firstTieView([], initialFirstTie).kind === 'sentence' && firstTieView([], initialFirstTie)).toMatchObject({
      roles: null,
    });
  });
});

describe('the relationship page', () => {
  function court() {
    const { w, kael, mira } = pair();
    ['c1', 'c2', 'c3'].forEach((id, i) =>
      w.put('chapters', { id, parentId: null, kind: 'chapter', title: id === 'c2' ? 'The Keep' : id, order: i }),
    );
    w.put('chapters', { id: 's1', parentId: 'c2', kind: 'scene', title: 'At the gate', order: 0 });
    w.put('timelineEvents', { id: 'duel', name: 'The duel' });
    w.put('loreLinks', {
      id: 'l1',
      fromId: mira,
      toId: kael,
      fromType: 'entry',
      toType: 'entry',
      type: 'distrusts',
      fromLabel: '',
    });
    const rel = w.relate((c) => c.createRelation(kael, mira, 'mentor-student'));
    return { w, kael, mira, rel: rel.id };
  }

  test('who is who, how it evolved, and what else is between them', () => {
    const { w, rel } = court();
    w.relate((c) =>
      c.recordChange(rel, {
        nodeId: 'c2',
        changes: {
          preset: 'rivals',
          affinity: 'hostile',
          title: 'The feud',
          causeEventId: { value: 'duel' },
          causeNodeId: { value: 's1' },
          event: ' A broken promise ',
        },
      }),
    );
    const page = w.page(rel);
    expect([page.title, page.subtitle, page.whoIsWho]).toEqual([
      'Kael and Mira',
      'Rivals · Hostile',
      'Kael and Mira: the same both ways now.',
    ]);
    expect(page.evolution).toEqual([
      'Chapter 1 · Mentor / Student · Neutral · No cause recorded. None is assumed from when it happened.',
      'Chapters 2+ · Rivals · Hostile · “The feud” · changed type: Mentor / Student → Rivals; feeling: Neutral → Hostile; ' +
        'now called “The feud” · brought about by “The duel”, shown in At the gate, origin: A broken promise',
    ]);
    expect(page.between).toEqual(['Mira distrusts Kael']);
    expect(page.deleteConfirm.message).toBe(
      'Its whole history goes, with the connections recorded on it. Kael and Mira are not changed.',
    );
    expect(page.stages.map((s) => s.header)).toEqual(['Stage 1 · Chapter 1', 'Stage 2 · Chapters 2+']);
    expect(page.stages[0].roles).toBe('Kael is the Mentor; Mira is the Student.');
    expect(page.stages[0].remove?.confirm.title).toBe('Remove stage 1?');
    w.relate((c) => c.removeStage(rel, page.stages[1].stageId));
    expect(w.page(rel).whoIsWho).toBe('Kael (Mentor) → Mira (Student)');
    expect(w.page(rel).stages[0].remove).toBeNull();
    expect(relationshipPageView(w.model, w.settings, 'gone')).toBeNull();
    expect(relationshipNotFound(true).message).toBe('It may have been deleted.');
    expect(relationshipNotFound(false).action).toEqual({ label: 'Go to Library', to: 'library' });
  });

  test('the stage editor: where it starts, its type, its wording, its story time', () => {
    const { w, rel } = court();
    const card = () => w.page(rel).stages[0];
    expect(card().start.choices.map((c) => c.label)).toEqual([
      'From the start of the story',
      'Not said',
      'Ch 1: c1',
      'Ch 2: The Keep',
      '    At the gate',
      'Ch 3: c3',
    ]);
    expect(startChosen(unknownStart)).toEqual({ startUnknown: true });
    expect(startChosen('')).toEqual({ start: { value: null } });
    expect(card().type.choices[0]).toEqual({ value: 'parent-child', label: 'Parent / Child · Family' });
    w.relate((c) => c.updateStage(rel, card().stageId, startChosen(unknownStart)));
    expect(card().movable).toBe(true);
    expect(card().start.value).toBe(unknownStart);
    w.relate((c) => c.updateStage(rel, card().stageId, { preset: 'custom' }));
    expect(card().custom).toMatchObject({
      name: { label: 'Its name', value: 'Mentor / Student' },
      fromRole: { label: 'Kael is…', value: 'Mentor' },
      toRole: { label: 'Mira is…', value: 'Student' },
      group: { value: 'custom' }, // choosing Custom sets the group to Custom; the wording stays to edit
    });
    expect(card().roles).toBeNull();
    // Story time at an event: the first event of the novel; with none, a message.
    const event = storyTimeChosen(w.model, w.relations()[0].stages[0], 'event');
    expect(event).toEqual({ input: { storyEventId: { value: 'duel' } } });
    w.relate((c) => c.updateStage(rel, card().stageId, (event as { input: object }).input));
    expect(card().storyEvent?.value).toBe('duel');
    expect(storyTimeChosen(w.model, w.relations()[0].stages[0], 'event')).toBeNull();
    expect(storyTimeChosen(new Novel().model, w.relations()[0].stages[0], 'date')).not.toBeNull();
    const none = new Novel();
    expect(storyTimeChosen(none.model, w.relations()[0].stages[0], '')).toEqual({
      input: { storyEventId: { value: null } },
    });
    // An event since deleted shows as such and is not chosen.
    w.s = w.s.withRows('timelineEvents', []);
    expect(card().storyEvent?.value).toBe(goneChoice);
    expect(card().storyEvent?.choices[1]).toEqual({ value: goneChoice, label: 'An event since deleted' });
    expect(storyEventChosen(goneChoice)).toBeNull();
    expect(w.page(rel).evolution[0]).toContain('in story time at “an event since deleted”');
    expect(documentChooser(w.model, 'Shown in', 'gone').value).toBe(goneChoice);
  });

  test('types offered: the novel’s own after the built-ins, hidden ones only where they are in use', () => {
    const { w } = court();
    w.relate((c) => c.offerBuiltIn('friends', { offered: false }));
    const own = w.relate((c) => c.saveType({ label: 'Oath' }));
    const keys = (current: string | null) => offeredTypes(w.settings, current).map((t) => t.key);
    expect(keys(null)).not.toContain('friends');
    expect(keys('friends')).toContain('friends');
    expect(keys(null).slice(-2)).toEqual(['custom', own.key]);
  });

  test('adding a relationship when everyone is already tied', () => {
    const { w, kael } = court();
    expect(addRelationshipDialog(w.model, w.settings, kael)).toEqual({
      tell: 'Every other character already has a relationship with this one. Record a change on it instead.',
    });
  });
});

describe('the profile’s relationships tab', () => {
  test('each relationship by the other’s name, how it stands now, and its stages', () => {
    const { w, kael, mira } = pair();
    const ash = w.character('Ash');
    const r1 = w.relate((c) => c.createRelation(kael, mira, 'mentor-student'));
    w.relate((c) => c.recordChange(r1.id, { changes: { title: 'Apprenticeship', affinity: 'trusting' } }));
    w.relate((c) => c.createRelation(ash, kael, 'rivals'));
    const tab = relationshipsTabView(w.model, w.model.entries.get(kael)!);
    expect(tab.title).toBe('Relationships (2)');
    expect(tab.rows.map((r) => [r.title, r.subtitle])).toEqual([
      ['Ash', 'Rival · Social · Neutral'],
      ['Mira', 'Student · Apprenticeship · Mentorship · Trusting · 2 stages over the story'],
    ]);
  });
});

describe('the types and attributes page', () => {
  test('own types, built-ins offered and in use, attributes suggested and own', () => {
    const { w, kael, mira } = pair();
    w.relate((c) => c.createRelation(kael, mira, 'rivals'));
    const draft = {
      ...typeDraftOf(null),
      label: 'Oath',
      oneWay: true,
      fromRole: 'Liege',
      toRole: 'Sworn',
      category: 'hierarchy' as const,
    };
    expect(typeDialogView(null, draft)).toMatchObject({
      title: 'New relationship type',
      fromLabel: 'The first is the…',
      toLabel: 'The second is the…',
    });
    const made = w.relate((c) => saveTypeDraft(c, null, draft));
    expect(typeDialogView(made, typeDraftOf(made)).title).toBe('Change the type');
    w.relate((c) => saveTypeDraft(c, null, { ...typeDraftOf(null), label: 'Kin' }));
    w.relate((c) => ownAttributeGiven(c, '  '));
    w.relate((c) => ownAttributeGiven(c, 'Debt'));
    w.relate((c) => suggestedToggled(c, 'fear', true));
    const view = relationSettingsView(w.model, w.settings, 'Ashfall');
    expect(view.own.map((t) => t.subtitle)).toEqual(['Hierarchy · Liege → Sworn', 'Custom · the same both ways']);
    expect(view.own[0].deleteConfirm.title).toBe('Delete the type “Oath”?');
    expect(view.builtIn.find((b) => b.key === 'rivals')?.subtitle).toBe('Social · in use');
    expect(view.builtIn).toHaveLength(16);
    expect(view.suggested.filter((s) => s.selected).map((s) => s.attribute.key)).toEqual(['fear']);
    expect(view.ownAttributes.map((a) => a.deleteTooltip)).toEqual(['Stop tracking Debt']);
  });
});

describe('the map', () => {
  function cast() {
    const { w, kael, mira } = pair();
    const orrin = w.character('Orrin');
    w.put('loreEntries', { id: 'guild', category: 'faction', name: 'The Guild', fields: [], tags: [] });
    w.put('loreLinks', {
      id: 'l1',
      fromId: orrin,
      toId: 'guild',
      fromType: 'entry',
      toType: 'entry',
      type: 'member-of',
      fromLabel: '',
    });
    w.put('loreLinks', {
      id: 'l2',
      fromId: mira,
      toId: orrin,
      fromType: 'entry',
      toType: 'entry',
      type: 'distrusts',
      fromLabel: '',
    });
    const r1 = w.relate((c) => c.createRelation(kael, mira, 'rivals'));
    const r2 = w.relate((c) => c.createRelation(orrin, kael, 'mentor-student'));
    return { w, kael, mira, orrin, r1: r1.id, r2: r2.id };
  }

  test('the count, the list and the legend', () => {
    const { w } = cast();
    const net = relationNetwork(w.model);
    expect(mapCount(net)).toBe('Showing 3 characters and 2 of 2 relationships, with 1 other connection.');
    expect(mapList(w.model, net).map((r) => [r.title, r.subtitle])).toEqual([
      ['Kael · Rivals · Mira', 'Neutral · Whole story · Social'],
      ['Orrin (Mentor) · Mentor / Student · Kael (Student)', 'Neutral · Whole story · Mentorship'],
      ['Mira · Distrusts · Orrin', 'a connection you recorded'],
    ]);
    expect(mapLegend().map((l) => l.label)).toEqual([
      'Family (solid, heavier)',
      'Social (long dashes)',
      'Mentorship (dotted)',
      'Romance (dash-dot)',
      'Hierarchy (short dashes)',
      'Custom (thin)',
      'Other connections (thin, grey)',
    ]);
  });

  test('the filters offered, and a saved view of them', () => {
    const { w, kael } = cast();
    const view = mapFiltersView(w.model, w.settings, initialMapState);
    expect(view.type.choices.map((c) => c.label)).toEqual(['Any type', 'Mentor / Student', 'Rivals']);
    expect(view.faction?.choices.map((c) => c.label)).toEqual(['Any faction', 'The Guild']);
    expect(view.focus.choices.map((c) => c.label)).toEqual(['Everyone', 'Kael', 'Mira', 'Orrin']);
    expect([view.depth, view.clear, view.at, view.across]).toEqual([null, null, null, null]);
    expect(view.layers.map((l) => l.label)).toEqual([
      'Family',
      'Social',
      'Mentorship',
      'Romance',
      'Hierarchy',
      'Custom',
      'Other connections',
      'Labels on lines',
    ]);
    let state = { ...initialMapState, when: 'across' as const, from: null, to: 'x', focus: kael, depth: 2 as const };
    state = layerToggled(layerToggled(state, 'labels', false), 'family', false);
    const config = mapConfig(state);
    expect(config).toEqual({
      mode: 'visual',
      layers: ['labels', 'family'],
      layout: { when: 'across', to: 'x', focus: kael, depth: 2, isolated: false },
    });
    expect(applyMapConfig(config)).toEqual(state);
    expect(applyMapConfig({ layers: ['nope', 'social'], layout: { when: 'soon', depth: 3 } })).toEqual({
      ...initialMapState,
      hidden: new Set(['social']),
    });
    const filtered = mapFiltersView(w.model, w.settings, state);
    expect([filtered.depth, filtered.clear]).toEqual([
      { label: 'and their ties’ ties', selected: true },
      'Clear filters',
    ]);
    expect(clearedMapState(state)).toEqual({ ...initialMapState, to: 'x', depth: 2 });
    expect(networkFilterOf({ ...initialMapState, when: 'at' }).when?.kind).toBe('now');
  });

  test('selecting, lighting up, the keyboard and the words under the map', () => {
    const { w, kael, mira, orrin, r1 } = cast();
    const net = relationNetwork(w.model);
    expect(edgeTapped(w.model, r1)).toEqual({ select: { type: 'relation', id: r1 }, selectedLink: null });
    const link = net.edges.find((e) => e.kind === 'connection')!.id;
    expect(edgeTapped(w.model, link)).toEqual({ select: null, selectedLink: link });
    expect(selectionView(w.model, net, { node: kael, edge: null })).toEqual({
      kind: 'node',
      text: 'Kael: 2 ties shown on the map.',
      focus: { label: 'Focus the map on Kael', id: kael },
    });
    expect(selectionView(w.model, net, { node: null, edge: r1 })).toEqual({
      kind: 'relationship',
      text: 'Shown as “Rivals”, which applies Whole story.',
    });
    expect(selectionView(w.model, net, { node: null, edge: link })).toEqual({
      kind: 'connection',
      title: 'Distrusts',
      // A one-way connection has no roles: Dart writes them empty.
      lines: ['Direction: Mira () → Orrin ()', 'A connection you recorded; it has no history of its own.'],
      open: [
        { label: 'Open Mira', characterId: mira },
        { label: 'Open Orrin', characterId: orrin },
      ],
    });
    const sel = { node: kael, edge: null };
    expect(net.nodes.map((n) => nodeLit(net, n, sel))).toEqual([true, true, true]);
    expect(net.nodes.map((n) => nodeLit(net, n, { node: null, edge: link }))).toEqual(
      net.nodes.map((n) => n.id !== kael),
    );
    expect(net.edges.every((e) => edgeLabelShown(net, e, { node: null, edge: null }))).toBe(true);
    // The arrows go by name: Kael, Mira, Orrin.
    expect(mapKey(net, { node: null, edge: null }, 'ArrowRight')).toEqual({ select: kael });
    expect(mapKey(net, { node: null, edge: null }, 'ArrowLeft')).toEqual({ select: orrin });
    expect(mapKey(net, { node: orrin, edge: null }, 'ArrowDown')).toEqual({ select: orrin });
    expect(mapKey(net, { node: mira, edge: null }, 'Home')).toEqual({ select: kael });
    expect(mapKey(net, { node: mira, edge: null }, 'Escape')).toEqual({ select: null });
    expect(mapKey(net, { node: null, edge: null }, 'Escape')).toBeNull();
    expect(mapKey(net, { node: null, edge: null }, 'a')).toBeNull();
    expect(mapSemantics(net, sel).value).toBe('Selected: Kael, 2 ties');
    expect(mapSemantics(net, sel).label).toMatch(/^Relationship map\. Kael Rivals Mira; .*\. Use the arrow keys/);
    expect(selectionView(w.model, net, { node: null, edge: null }).kind).toBe('none');
  });

  test('where everything is drawn, and what a tap hits', () => {
    const { w, kael } = cast();
    const net = relationNetwork(w.model);
    const drawing = mapDrawing(net);
    const placed = layoutNetwork(net.nodes, net.edges);
    const minX = Math.min(...[...placed.values()].map((p) => p.x)) - 90;
    expect(drawing.at.get(kael)!.x).toBe(placed.get(kael)!.x - minX);
    expect(hitTest(net, drawing.at, drawing.at.get(kael)!)).toEqual({ node: kael });
    expect(hitTest(net, drawing.at, { x: -500, y: -500 })).toBeNull();
    expect(distanceToSegment({ x: 0, y: 5 }, { x: -10, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 13, y: 4 }, { x: -10, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 14)).toEqual([
      { x: 83, y: 0 },
      { x: 73, y: 5 },
      { x: 73, y: -5 },
    ]);
    expect(dashSegments({ x: 0, y: 0 }, { x: 20, y: 0 }, [12, 6])).toEqual([
      [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
      ],
      [
        { x: 18, y: 0 },
        { x: 20, y: 0 },
      ],
    ]);
    expect(fitTransform({ width: 1000, height: 1000 }, { width: 500, height: 400 })).toEqual({
      scale: 1,
      x: 250,
      y: 300,
    });
    expect(fitTransform({ width: 100, height: 100 }, { width: 1000, height: 1000 })).toEqual({
      scale: 0.2,
      x: -50,
      y: -50,
    });
    expect([initialOf('  élan'), initialOf(''), initialOf('ßeta')]).toEqual(['É', '?', 'ß']); // ß as Dart's toUpperCase leaves it
  });
});
