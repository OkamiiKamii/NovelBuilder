// The logic of the writing aids' screen tests (flutter_app/test/features/characters/): interview_test.dart,
// interview_conversation_test.dart, acquaintance_test.dart, this_or_that_test.dart, journal_page_test.dart,
// write_them_in_test.dart, name_forge_test.dart, empty_chairs_test.dart, playbill_test.dart, cameo_test.dart,
// cast_photo_test.dart, draw_their_face_test.dart, character_card_test.dart and dramatis_page_test.dart. What those
// check of the widgets themselves (taps and drags, routes and the editor opening, a full-screen dialog on a phone,
// contrast and tap-target guidelines, fitting on a phone, the PNG's pixels, toasts, the clipboard) belongs to the
// screens and is not here; what a press changes and what is shown is.

import { join } from 'node:path';

import { cameoDrawing, cameoLookOf } from '../../../src/domain/characters/aids/cameo';
import { castPhotoCaption, castPhotoRows, castPhotoStage, figureLabel } from '../../../src/domain/characters/aids/castPhoto';
import {
  cardFileName,
  cardLine,
  characterCardLayout,
  characterCardOf,
  characterCardPixelRatio,
  characterCardSize,
  quoted,
  stampPerforations,
} from '../../../src/domain/characters/aids/characterCard';
import {
  appearanceFrom,
  asksToReplace,
  bookMatterOf,
  castListMatter,
  castListPage,
  dramatisPeople,
  dramatisStart,
  dramatisView,
} from '../../../src/domain/characters/aids/dramatisPage';
import { chairsFor, chairsStage, emptyChairsKey } from '../../../src/domain/characters/aids/emptyChairsStage';
import { FaceSketchState } from '../../../src/domain/characters/aids/faceSketch';
import { InterviewTalk, acquaintance, interviewFor, saveInterviewAnswer } from '../../../src/domain/characters/aids/interview';
import { JournalState, journalPromptsFor } from '../../../src/domain/characters/aids/journalPage';
import { painted } from '../../../src/domain/characters/aids/likeness';
import { NameForgeState } from '../../../src/domain/characters/aids/nameForgeSheet';
import { PlaybillState, curtainMessage, raiseTheCurtain } from '../../../src/domain/characters/aids/playbill';
import { ThisOrThatDeck, swipeSide } from '../../../src/domain/characters/aids/thisOrThatDeck';
import {
  typedControl,
  linkChosen,
  segmentPressed,
  severalToggled,
  tagAdded,
  goneLink,
} from '../../../src/domain/characters/aids/typedInput';
import {
  WriteThemInState,
  updatePlan,
  writeThemInDocuments,
  writeThemInView,
} from '../../../src/domain/characters/aids/writeThemInPage';
import { fieldNamed } from '../../../src/domain/characters/cast';
import { CastData } from '../../../src/domain/characters/castData';
import { CharacterProfile } from '../../../src/domain/characters/characterRecords';
import { chairsLead, emptyChairs } from '../../../src/domain/characters/emptyChairs';
import { journalTag, journalTitlePrefix } from '../../../src/domain/characters/journal';
import { recordStake } from '../../../src/domain/characters/recordLook';
import { CastingCall, makeNewCharacter } from '../../../src/domain/characters/screens/create';
import { traitAxes } from '../../../src/domain/characters/thisOrThat';
import { nameFlavours } from '../../../src/domain/characters/nameForge';
import { type JsonMap, str } from '../../../src/domain/json';
import { createNode } from '../../../src/domain/outline';
import { buildBook, bookSourceFromSnapshot } from '../../../src/domain/reader/book';
import { Entry } from '../../../src/domain/records/entry';
import { strings } from '../../../src/domain/records/jsonRecord';
import { CharacterRelation } from '../../../src/domain/records/relation';
import { RecordChanges } from '../../../src/domain/codex/codexChanges';
import { RelationChanges } from '../../../src/domain/relationships/relationChanges';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { readJson, samplePath } from '../../fixtures';
import { World } from '../world';

const castOf = (w: World) => new CastData('novel', w.snapshot);
const sample = () => NovelSnapshot.fromJson(readJson(samplePath));
const sampleIds = new Map<string, string>(
  sample()
    .rows('loreEntries')
    .map((r) => [str(r['name']), str(r['id'])]),
);
const golden = readJson(join(__dirname, 'golden', 'aids.golden.json')) as Record<
  string,
  { inputs: { appearance: Record<string, number>; lines: Record<string, string[]> } }
>;

describe('the interview', () => {
  test('fills an empty profile one question at a time, each into its field (interview_test.dart)', () => {
    const w = new World();
    const mira = w.createCharacter('Mira');
    const cast = castOf(w);
    const asked = interviewFor(w.entry(mira), cast.listed(mira)!.profile, cast.templates);
    expect(asked.length).toBeGreaterThan(4);
    expect(asked[0].ask).toBe('What does Mira want more than anything?');

    const talk = InterviewTalk.open(w.entry(mira), cast.listed(mira)!.profile, cast.templates);
    const save = (step: (typeof asked)[number], value: string) => w.act((c) => saveInterviewAnswer(c, mira, step, value));
    expect(talk.step!.ask).toBe('What does Mira want more than anything?');
    talk.next(true, 'To bring her brother home.', save);
    expect(talk.step!.ask).toBe('What is Mira afraid of?');
    talk.next(true, 'deep water, the dark', save);
    expect(talk.savedNote).toBe('2 answers saved to the profile.');
    talk.next(false, '', save);

    const fields = Object.fromEntries(w.entry(mira).fields.map((f) => [f.key, f.value]));
    expect(fields[asked[0].fieldName]).toBe('To bring her brother home.');
    expect(fields['Fears']).toBe('deep water\nthe dark');
    const now = castOf(w);
    expect(interviewFor(w.entry(mira), now.listed(mira)!.profile, now.templates)).toHaveLength(asked.length - 2);
  });

  test('a conversation: the questions asked, the replies, where each went (interview_conversation_test.dart)', () => {
    const w = new World();
    const james = w.createCharacter('James', { roles: ['Protagonist'] });
    const cast = castOf(w);
    const listed = cast.listed(james)!;
    const before = acquaintance(listed.entry, listed.profile, cast.templates);
    const talk = InterviewTalk.open(listed.entry, listed.profile, cast.templates);
    const asked = talk.steps;
    expect(talk.gauge).toBe(`Known ${before.known} of ${before.of}`);
    expect(talk.hint).toBe('In James’s own words');
    expect(talk.title).toBe('Interview with James');

    talk.next(true, 'To find out who he was before.', (step, value) => w.act((c) => saveInterviewAnswer(c, james, step, value)));
    expect(talk.said).toEqual([{ ask: asked[0].ask, fieldName: asked[0].fieldName, reply: 'To find out who he was before.' }]);
    expect(talk.gauge).toBe(`Known ${before.known + 1} of ${before.of}`);
    expect(talk.step!.ask).toBe(asked[1].ask);
    talk.next(false, 'typed but skipped', () => {
      throw new Error('Skip saves nothing');
    });
    expect(talk.said[1].reply).toBeNull();
    expect(talk.savedNote).toBe('One answer saved to the profile.');
    const after = castOf(w).listed(james)!;
    expect(acquaintance(after.entry, after.profile, cast.templates).known).toBe(before.known + 1);
  });

  test('how well each is known, and a question asked from the card (acquaintance_test.dart)', () => {
    const w = new World();
    const mira = w.createCharacter('Mira');
    const cast = castOf(w);
    const talk = InterviewTalk.open(w.entry(mira), cast.listed(mira)!.profile, cast.templates);
    expect(talk.gauge.startsWith('Known 0 of')).toBe(true);
    expect(talk.step!.ask).toContain('What does Mira want');
    expect(talk.nextButton('').enabled).toBe(false);
    talk.next(true, 'To be free of the Guild', (step, value) => w.act((c) => saveInterviewAnswer(c, mira, step, value)));
    const now = castOf(w);
    expect(acquaintance(w.entry(mira), now.listed(mira)!.profile, now.templates).known).toBe(1);
  });
});

describe('this or that (this_or_that_test.dart)', () => {
  test('a card at a time, pressed or swiped, skipped, back; the compass; kept in Core Traits', () => {
    const w = new World();
    const mira = w.createCharacter('Mira');
    let deck = ThisOrThatDeck.of(w.entry(mira));
    expect(deck.question).toBe('In a crowded room, Mira is…');
    expect(deck.count).toBe(`1 of ${traitAxes.length}`);
    deck.choose(deck.halves.find((h) => h.label === 'Mira is: Quiet')!.side);
    expect(deck.count).toBe(`2 of ${traitAxes.length}`);
    // Swiped towards the right, on a phone 390 wide.
    deck.choose(swipeSide(300, 0, 390)!);
    expect(deck.question).toBe('When it matters, Mira follows their…');
    deck.back();
    expect(deck.halves.find((h) => h.label === 'Mira is: An improviser')!.on).toBe(true);
    for (let i = 1; i < traitAxes.length; i++) {
      expect(deck.passLabel).toBe(i === 1 ? 'Next' : 'Skip');
      deck.skip();
    }
    expect(deck.compassTitle).toBe('Mira’s compass');
    expect(deck.changed).toBe(true);
    w.act((c) => deck.keep(c));
    expect(fieldNamed(w.entry(mira), 'Core Traits')).toBe('Quiet\nSpontaneous');
    expect(deck.keptMessage).toBe('Mira’s traits are in their profile, under Core Traits.');

    // Again: what is there is chosen when the card comes up; a choice changed takes the other word's place.
    deck = ThisOrThatDeck.of(w.entry(mira));
    expect(deck.halves.find((h) => h.label === 'Mira is: Quiet')!.on).toBe(true);
    expect(deck.changed).toBe(false);
    deck.choose(1);
    for (let i = 1; i < traitAxes.length; i++) deck.skip();
    w.act((c) => deck.keep(c));
    expect(fieldNamed(w.entry(mira), 'Core Traits')).toBe('Loud\nSpontaneous');
  });

  test('a drag let go: far enough or fast enough goes that way; else back', () => {
    expect(swipeSide(-120, 0, 390)).toBe(-1);
    expect(swipeSide(50, 0, 390)).toBeNull();
    expect(swipeSide(2, -900, 390)).toBe(-1);
    expect(swipeSide(10, -900, 390)).toBe(1);
  });
});

describe('their journal (journal_page_test.dart)', () => {
  test('a page written as them is kept as it is written, in their notes, and can be gone on with', () => {
    const w = new World();
    const mark = w.createCharacter('Mark');
    const prompts = journalPromptsFor(castOf(w), mark)!;
    const page = new JournalState(mark);
    expect(page.promptNow(prompts)).toBe('The night before everything changes. Write it as Mark, tonight.');
    expect(page.footer('Mark')).toBe('Begin anywhere.');
    const pages = () => castOf(w).notes(mark).map((n) => ({ title: n.title, content: n.content, tags: n.tags }));
    expect(pages()).toEqual([]);

    const first = page.typed('I could not sleep. The door hums.', prompts)!;
    expect(first.kind).toBe('make');
    page.kept(w.act((c) => first.apply(c)).id);
    expect(pages()).toEqual([
      {
        title: `${journalTitlePrefix}The night before everything changes. Write it as Mark, tonight.`,
        content: 'I could not sleep. The door hums.',
        tags: [journalTag],
      },
    ]);
    expect(page.footer('Mark')).toBe('7 words · kept in Mark’s notes');
    expect(page.turnLabel).toBe('A new page');

    const more = page.typed('I could not sleep. The door hums. It knows me.', prompts)!;
    expect(more.kind === 'save' && more.key).toBe(`journal:${page.noteId}`);
    w.act((c) => more.apply(c));
    expect(pages().map((p) => p.content)).toEqual(['I could not sleep. The door hums. It knows me.']);

    page.turn(prompts.length);
    expect(page.promptNow(prompts)).not.toBe('The night before everything changes. Write it as Mark, tonight.');
    const earlier = page.earlier(castOf(w).notes(mark));
    expect(earlier).toHaveLength(1);
    const second = page.typed('A list. One: the door.', prompts)!;
    page.kept(w.act((c) => second.apply(c)).id);
    expect(pages()).toHaveLength(2);

    page.open(earlier[0]);
    expect(page.promptNow(prompts)).toBe('The night before everything changes. Write it as Mark, tonight.');
    expect(page.text).toBe('I could not sleep. The door hums. It knows me.');
  });

  test('another prompt deals the next; a blank page keeps nothing', () => {
    const w = new World();
    const mark = w.createCharacter('Mark');
    const prompts = journalPromptsFor(castOf(w), mark)!;
    const page = new JournalState(mark);
    const first = page.promptNow(prompts);
    expect(page.typed('   ', prompts)).toBeNull();
    expect(page.turnLabel).toBe('Another prompt');
    page.turn(prompts.length);
    expect(page.promptNow(prompts)).not.toBe(first);
    expect(castOf(w).notes(mark)).toEqual([]);
  });
});

describe('write them in (write_them_in_test.dart)', () => {
  /** A book with one chapter (with words in it, or blank), Mark (who wants to open the last door) and Kai. */
  function book(written: boolean) {
    const w = new World();
    const mark = w.createCharacter('Mark');
    const kai = w.createCharacter('Kai');
    w.act((c) => recordStake(c, mark, 'wants', 'To open the last door.'));
    const made = createNode(w.snapshot, 'chapter', { title: 'Chapter 1', now: 1, createId: () => 'ch1' });
    w.snapshot = made.snapshot;
    if (written) w.snapshot = w.snapshot.putRow('chapters', { ...made.node.raw, wordCount: 5 });
    return { w, mark, kai, chapter: 'ch1' };
  }
  const plan = (w: World, id: string): JsonMap | null => w.rows('chapterPlans').find((p) => p['id'] === id) ?? null;
  const start = (w: World, state: WriteThemInState, mark: string) => {
    const cast = castOf(w);
    const s = state.start(writeThemInView(cast, mark)!, writeThemInDocuments(cast));
    let id = s.nodeId;
    if (s.create !== null) {
      const r = createNode(w.snapshot, s.create.kind, { parentId: s.create.parentId, now: 2, createId: () => 'new' });
      w.snapshot = r.snapshot;
      id = r.node.id;
    }
    const c = new RecordChanges(w.snapshot, { now: 3, createId: () => 'x' });
    updatePlan(c, id!, s.edit);
    w.snapshot = c.snapshot;
    return id!;
  };

  test('a blank first chapter: Mark is written into it, from what he wants', () => {
    const b = book(false);
    const view = writeThemInView(castOf(b.w), b.mark)!;
    expect(view.places[0].label).toBe('In Chapter 1, still blank');
    expect(view.sparks[0].text).toBe('Mark goes after what they want: “To open the last door.”');
    expect(view.others.map((o) => o.label)).toEqual(['Kai']);
    const id = start(b.w, new WriteThemInState(), b.mark);
    expect(id).toBe(b.chapter);
    expect(b.w.rows('chapters')).toHaveLength(1);
    const p = plan(b.w, b.chapter)!;
    expect(p['objective']).toBe('Mark goes after what they want: “To open the last door.”');
    expect(strings(p['appearIds'])).toEqual([b.mark]);
    expect(strings(p['povIds'])).toEqual([b.mark]);
    expect(b.w.rows('chapterContents')).toEqual([]);
  });

  test('a chapter being written: a new scene in it, with Kai, from the author’s own spark', () => {
    const b = book(true);
    const view = writeThemInView(castOf(b.w), b.mark)!;
    expect(view.places.map((p) => p.label)).not.toContain('In Chapter 1, still blank');
    const state = new WriteThemInState();
    state.place = view.places.findIndex((p) => p.label === 'A new scene in Chapter 1');
    state.toggle(b.kai, true);
    state.eyes = false;
    state.typeOwn('Kai lies to Mark about the key.', view.sparks.length);
    expect(state.ready(view.sparks.length)).toBe(true);
    const scene = start(b.w, state, b.mark);
    const node = b.w.rows('chapters').find((r) => r['id'] === scene)!;
    expect([node['kind'], node['parentId']]).toEqual(['scene', b.chapter]);
    const p = plan(b.w, scene)!;
    expect(p['objective']).toBe('Kai lies to Mark about the key.');
    expect(new Set(strings(p['appearIds']))).toEqual(new Set([b.mark, b.kai]));
    expect(strings(p['povIds'])).toEqual([]);
  });

  test('a new chapter at the end; your own spark left empty cannot start', () => {
    const b = book(true);
    const view = writeThemInView(castOf(b.w), b.mark)!;
    const state = new WriteThemInState();
    state.place = view.places.findIndex((p) => p.label === 'A new chapter at the end of the book');
    state.typeOwn('  ', view.sparks.length);
    expect(state.ready(view.sparks.length)).toBe(false);
    state.spark = 0;
    const id = start(b.w, state, b.mark);
    expect(id).not.toBe(b.chapter);
    expect(b.w.rows('chapters').find((r) => r['id'] === id)!['kind']).toBe('chapter');
  });
});

describe('the name forge (name_forge_test.dart)', () => {
  test('one character is too few to learn from: a tradition; More names forges another dozen', () => {
    const forge = new NameForgeState({ people: ['Kai Doyle'], nowMs: 1794787200000 });
    expect(forge.chips()[0]).toMatchObject({ label: 'Like your book', enabled: false });
    expect(forge.chips()[0].tooltip).toBe('Needs 6 people in your book to learn from');
    forge.chooseFlavour('norse');
    const names = forge.names();
    expect(names).toHaveLength(12);
    forge.more();
    expect(forge.names()).not.toEqual(names);
  });

  test('a place: in a tradition, with its endings', () => {
    const forge = new NameForgeState({ place: true, nowMs: 5 });
    forge.chooseFlavour('saxon');
    const places = forge.names();
    expect(places.length).toBeGreaterThan(0);
    const saxon = nameFlavours.find((f) => f.key === 'saxon')!;
    for (const p of places) expect(saxon.placeEndings.some((e) => p.toLowerCase().endsWith(e))).toBe(true);
  });

  test('a book with enough names starts in its own shape', () => {
    const forge = new NameForgeState({ people: ['Wren Hollis', 'Ilse Marrow', 'Tobiah Fenn', 'Sefa Quill'], nowMs: 0 });
    expect(forge.flavour).toBe('book');
    expect(forge.chips()[0].tooltip).toBe('In the shape of the people in your book');
    forge.choosePlace(true);
    forge.names();
    expect(forge.flavour).toBe('saxon');
  });
});

describe('the empty chairs (empty_chairs_test.dart)', () => {
  const relations = (w: World) => w.rows('characterRelations').map((r) => new CharacterRelation(r));
  const active = (w: World) => castOf(w).list.filter((l) => !l.profile.archived);

  test('round a lone lead: each a question, filled with one name and tied to them', () => {
    const w = new World();
    const james = w.createCharacter('James', { roles: ['Protagonist'] });
    const set = chairsFor(active(w), relations(w), undefined)!;
    expect(set.lead.entry.id).toBe(james);
    expect(set.chairs.map((c) => c.question)).toEqual([
      'Who stands against James?',
      'Who taught James?',
      'Who is James’s rival?',
      'Who stands with James?',
      'Who does James love?',
      'Who is James’s family?',
    ]);
    // A chair opens the card with the line begun; only the name is written.
    const rival = set.chairs.find((c) => c.key === 'rival')!;
    const cast = castOf(w);
    let call = new CastingCall(cast.templates, cast.characters().map((e) => ({ id: e.id, name: e.name })), { line: rival.line });
    expect(call.line).toBe(', James’s rival');
    expect(call.name).toBe('');
    call.lineChanged('Kai, James’s rival');
    const kai = w.act((c) => makeNewCharacter(c, call.submit()!)).id;
    const tie = relations(w)[0];
    expect(new Set([tie.fromId, tie.toId])).toEqual(new Set([kai, james]));
    expect(tie.stages.map((s) => s.preset)).toEqual(['rivals']);
    const now = chairsFor(active(w), relations(w), undefined)!;
    expect(now.chairs.map((c) => c.question)).not.toContain('Who is James’s rival?');
    expect(now.chairs.map((c) => c.question)).toContain('Who taught James?');

    // A name written in the Name field alone, the line left as begun: still tied, and as the villain.
    const against = now.chairs.find((c) => c.key === 'against')!;
    const cast2 = castOf(w);
    call = new CastingCall(cast2.templates, cast2.characters().map((e) => ({ id: e.id, name: e.name })), { line: against.line });
    call.name = 'Mordren';
    const mordren = w.act((c) => makeNewCharacter(c, call.submit()!)).id;
    expect(castOf(w).listed(mordren)!.profile.roles).toEqual(['Antagonist']);
    const enemy = relations(w).find((r) => r.fromId === mordren || r.toId === mordren)!;
    expect(new Set([enemy.fromId, enemy.toId])).toEqual(new Set([mordren, james]));
    expect(enemy.stages.map((s) => s.preset)).toEqual(['enemies']);
  });

  test('a tie of a kind fills its chair; an antagonist in the cast fills the first', () => {
    const w = new World();
    const wren = w.createCharacter('Wren Hollis', { roles: ['Protagonist'] });
    const nan = w.createCharacter('Nan');
    w.createCharacter('Crane', { roles: ['Antagonist'] });
    w.act((x) => {
      const r = new RelationChanges(x.snapshot, { now: x.now, createId: () => x.newId() });
      r.createRelation(nan, wren, 'mentor-student');
      x.snapshot = r.snapshot;
    });
    const cast = castOf(w);
    const lead = chairsLead(cast.list)!;
    expect(lead.entry.name).toBe('Wren Hollis');
    const chairs = emptyChairs(lead, cast.list, relations(w));
    expect(chairs.map((c) => c.key)).toEqual(['rival', 'friend', 'love', 'family']);
    expect(chairs[0].question).toBe('Who is Wren’s rival?');
    expect(chairs[0].line).toBe(', Wren Hollis’s rival');
  });

  test('Not now puts the chairs away for the novel; a cast past three has none', () => {
    const w = new World();
    w.createCharacter('Wren', { roles: ['Protagonist'] });
    expect(chairsFor(active(w), relations(w), true)).toBeNull();
    expect(emptyChairsKey('n1')).toBe('cast.emptyChairs.hidden.n1');
    const big = new World();
    for (const n of ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo']) big.createCharacter(n, { roles: n === 'Ada' ? ['Protagonist'] : [] });
    expect(chairsFor(active(big), relations(big), undefined)).toBeNull();
  });

  test('the stage: wide, the chairs round the lead; narrow, the lead above them', () => {
    const w = new World();
    w.createCharacter('James', { roles: ['Protagonist'] });
    const chairs = chairsFor(active(w), relations(w), undefined)!.chairs;
    const wide = chairsStage(1000, chairs);
    expect([wide.wide, wide.left.length, wide.right.length, wide.chairWidth]).toEqual([true, 3, 3, 104]);
    const narrow = chairsStage(390, chairs);
    expect([narrow.wide, narrow.right.length, narrow.chairWidth]).toEqual([false, 6, 104]);
  });
});

describe('the playbill (playbill_test.dart)', () => {
  test('the names written become the cast, with roles and the hero’s ties', () => {
    const w = new World();
    const bill = new PlaybillState();
    expect(bill.any).toBe(false);
    bill.type(0, 'Ilse');
    bill.type(1, 'Corvan');
    bill.type(2, 'Tamsin');
    bill.add();
    expect(bill.line(3)).toEqual({ part: 'And', hint: 'Orrin', helper: 'Supporting', label: 'And, Supporting 2' });
    bill.type(3, 'Brannoc');
    expect(bill.any).toBe(true);
    const made = w.act((c) => raiseTheCurtain(c, bill.lines));
    const names = new Map(w.rows('loreEntries').map((r) => [str(r['id']), str(r['name'])]));
    const roles = Object.fromEntries(
      w.rows('characterProfiles').map((p) => [names.get(str(p['entryId'])), (p['roles'] as string[])[0]]),
    );
    expect(roles).toEqual({ Ilse: 'Protagonist', Corvan: 'Antagonist', Tamsin: 'Supporting', Brannoc: 'Supporting' });
    const ties = w.rows('characterRelations').map((row) => {
      const r = new CharacterRelation(row);
      return [names.get(r.fromId), names.get(r.toId), r.stages[0].preset];
    });
    expect(ties).toEqual([
      ['Ilse', 'Corvan', 'enemies'],
      ['Ilse', 'Tamsin', 'friends'],
    ]);
    expect(curtainMessage(made)).toBe('Your cast of 4 is ready.');
  });

  test('without a hero, the cast is still made, with no ties; at most 8 lines', () => {
    const w = new World();
    const bill = new PlaybillState();
    bill.type(2, 'Tamsin');
    expect(w.act((c) => raiseTheCurtain(c, bill.lines))).toBe(1);
    expect(w.rows('loreEntries')).toHaveLength(1);
    expect(w.rows('characterRelations')).toEqual([]);
    expect(curtainMessage(1)).toBe('Your first character is in the cast.');
    for (let i = 0; i < 10; i++) bill.add();
    expect([bill.lines.length, bill.canAdd]).toEqual([8, false]);
  });
});

describe('the cameo (cameo_test.dart)', () => {
  const entry = (fields: Record<string, string>, id = 'c1') =>
    new Entry({
      id,
      name: 'Someone',
      category: 'character',
      fields: Object.entries(fields).map(([key, value]) => ({ id: key, key, value })),
    });

  test('the cameo reads its look from what is recorded, and draws plainly what is not', () => {
    expect(cameoLookOf(entry({ Gender: 'Female' }), null).hair).toBe('long');
    expect(cameoLookOf(entry({ Gender: 'Male' }), null).hair).toBe('short');
    expect(cameoLookOf(entry({ Gender: 'non-binary' }), null).hair).toBe('shoulder');
    expect(cameoLookOf(entry({}), null).hair).toBe('shoulder');
    expect(cameoLookOf(entry({ Age: '64' }), null).silver).toBe(true);
    expect(cameoLookOf(entry({ Age: 'very old' }), null).silver).toBe(true);
    expect(cameoLookOf(entry({ Age: '20' }), null).silver).toBe(false);
    expect(cameoLookOf(entry({ Species: 'High Elf' }), null).pointedEars).toBe(true);
    expect(cameoLookOf(entry({ Species: 'Human' }), null).pointedEars).toBe(false);
    const dead = new CharacterProfile({ id: 'p', entryId: 'c1', status: 'Deceased' });
    expect(cameoLookOf(entry({}), dead).gone).toBe(true);
    expect(cameoLookOf(entry({}), new CharacterProfile({ id: 'p', status: 'Alive' })).gone).toBe(false);
    expect(cameoLookOf(entry({}, 'a'), null).seed).not.toBe(cameoLookOf(entry({}, 'b'), null).seed);
  });

  test('the drawing: plain when nothing is described, painted when it is; the departed in grey', () => {
    const plain = cameoDrawing(cameoLookOf(entry({}), null), { width: 104, height: 131, ground: ['#171b27', '#07080b'], ink: '#f8fafc', bare: true });
    expect(plain.ops.map((o) => o.part)).toEqual(['oval', 'hair behind', 'shoulders', 'head', 'hair', 'ring', 'inner ring']);
    expect(plain.grey).toBe(false);
    const look = cameoLookOf(
      entry({ Hair: 'Long, curly black', Eyes: 'green', Skin: 'olive', 'Distinguishing Features': 'glasses, a scar, a beard' }),
      new CharacterProfile({ id: 'p', entryId: 'c1', status: 'Deceased' }),
    );
    const drawn = cameoDrawing(look, { width: 48, height: 58, ground: ['#33302a', '#07080b'], ink: '#f8fafc' });
    const parts = drawn.ops.map((o) => o.part);
    expect(parts[0]).toBe('ground');
    for (const p of ['curl', 'neck', 'eye', 'iris', 'brow', 'nose', 'mouth', 'beard', 'moustache', 'glasses', 'scar']) {
      expect(parts).toContain(p);
    }
    expect(drawn.ops.filter((o) => !o.clipped).map((o) => o.part)).toEqual(['ground', 'oval', 'ring', 'inner ring']);
    expect(drawn.grey).toBe(true);
    expect(drawn.ops.find((o) => o.part === 'iris')!.fill).toEqual({ kind: 'color', color: '#3d8a57' });
  });
});

describe('the cast photograph (cast_photo_test.dart)', () => {
  test('who stands where: the principals in front, the most important in the middle; the minor cast behind', () => {
    const cast = new CastData('x', sample());
    const rows = castPhotoRows(cast.list);
    const front = rows.front.map((l) => l.entry.name);
    expect(front).toHaveLength(5);
    expect(front[2]).toBe('Wren Hollis');
    expect(new Set(front)).toEqual(new Set(['Wren Hollis', 'Aldous Crane', 'Ilse Marrow', 'Tobiah Fenn', 'Sefa Quill']));
    expect(new Set(rows.back.map((l) => l.entry.name))).toEqual(new Set(['Nan Ottilie', 'Kit Marrow', 'Jory']));
    expect(rows.more).toBe(0);
    const caption = castPhotoCaption(cast.list)!;
    expect(caption).toContain('Front, from the left:');
    expect(caption).toContain('Behind:');
    const wren = cast.list.find((l) => l.entry.name === 'Wren Hollis')!;
    expect(figureLabel(wren)).toBe('Wren Hollis, Protagonist');
    const stage = castPhotoStage(rows, 390);
    expect(stage.figures.slice(0, 3).every((f) => f.row === 'back')).toBe(true);
    expect(stage.figures).toHaveLength(8);
  });

  test('a cast of one has no photograph', () => {
    const w = new World();
    w.createCharacter('James');
    expect(castPhotoCaption(castOf(w).list)).toBeNull();
  });
});

describe('draw their face (draw_their_face_test.dart)', () => {
  test('chosen in presses, kept as words in their profile, and their cameo painted', () => {
    const w = new World();
    w.snapshot = sample();
    const wren = sampleIds.get('Wren Hollis')!;
    expect(painted(cameoLookOf(w.entry(wren), null).likeness)).toBe(false);
    let face = FaceSketchState.of(w.entry(wren), null);
    expect(face.changed).toBe(false);
    face.pressHair('red');
    face.pressCut('braid');
    face.pressEyes('green');
    face.pressSkin('olive');
    face.setMark('freckles', true);
    const drawn = face.look.likeness;
    expect([drawn.hair, drawn.cut, drawn.freckles]).toEqual(['red', 'braid', true]);
    expect(face.changed).toBe(true);
    w.act((c) => face.keep(c));
    expect(face.keptMessage).toBe('Wren Hollis’s face is in their profile, under Appearance.');
    expect(fieldNamed(w.entry(wren), 'Hair')).toBe('Braided red');
    expect(fieldNamed(w.entry(wren), 'Eyes')).toBe('Green');
    expect(fieldNamed(w.entry(wren), 'Skin')).toBe('Olive');
    expect(fieldNamed(w.entry(wren), 'Distinguishing Features')).toBe('Freckles.');
    const look = cameoLookOf(w.entry(wren), null).likeness;
    expect([look.hair, look.cut, look.eyes, look.skin, look.freckles]).toEqual(['red', 'braid', 'green', 'olive', true]);

    // Again: what is written stays; a new mark is added after it, only what changed rewritten.
    face = FaceSketchState.of(w.entry(wren), null);
    const freckles = face.marks().find((m) => m.key === 'freckles')!;
    expect([freckles.on, freckles.written, freckles.tooltip]).toEqual([true, true, 'Written in their profile']);
    face.setMark('freckles', false);
    expect(face.now.freckles).toBe(true);
    face.setMark('glasses', true);
    w.act((c) => face.keep(c));
    expect(fieldNamed(w.entry(wren), 'Distinguishing Features')).toBe('Freckles; glasses.');
    expect(fieldNamed(w.entry(wren), 'Hair')).toBe('Braided red');
    expect(w.rows('loreEntries').length).toBeGreaterThan(1);
  });

  test('bald takes the hair’s colour and curls; a colour on a bald head leaves the cut unsaid', () => {
    const w = new World();
    const mark = w.createCharacter('Mark');
    const face = FaceSketchState.of(w.entry(mark), null);
    face.pressHair('black');
    face.setCurly(true);
    face.pressCut('bald');
    expect([face.now.cut, face.now.hair, face.now.curly]).toEqual(['bald', null, false]);
    expect(face.hairSwatches().some((s) => s.on)).toBe(false);
    face.pressHair('grey');
    expect([face.now.cut, face.now.hair]).toEqual([null, 'grey']);
    face.pressCreatureSkin('green');
    face.pressSkin('fair');
    expect([face.now.skin, face.now.skinFamily]).toEqual(['fair', null]);
  });
});

describe('their card (character_card_test.dart)', () => {
  test('a line out of its sentence ends as an excerpt does', () => {
    expect(quoted('You want to go out there,')).toBe('You want to go out there.');
    expect(quoted('Master, it’s the tide bell.')).toBe('Master, it’s the tide bell.');
    expect(quoted('Who is there?')).toBe('Who is there?');
    expect(quoted('  ')).toBe('');
  });

  test('their facts and ties, a line they say or their summary, a post-sized picture', () => {
    const cast = new CastData('novel', sample());
    const wren = sampleIds.get('Wren Hollis')!;
    const of = characterCardOf(cast, wren)!;
    const line = cardLine(golden['the-drowned-road'].inputs.lines[wren].map((words) => ({ words })));
    const card = characterCardLayout({ ...of, line });
    expect(card.name.text).toBe('Wren Hollis');
    expect(card.epithet!.text).toBe('the apprentice');
    expect(card.what!.text).toBe('PROTAGONIST');
    expect(card.book.text).toBe('THE DROWNED ROAD');
    expect(card.ties!.text).toContain('Ilse Marrow’s');
    expect(card.words!.text).toBe('“Master, it’s the tide bell.”');
    expect(card.words!.italic).toBe(true);
    const plain = characterCardLayout({ ...of, line, withLine: false });
    expect(plain.words!.text).toBe('Apprentice cartographer, nineteen.');
    expect(cardFileName('Wren Hollis')).toBe('wren-hollis-card.png');
    expect(cardFileName('—')).toBe('character-card.png');
    expect([characterCardSize.width * characterCardPixelRatio, characterCardSize.height * characterCardPixelRatio]).toEqual([1080, 1350]);
    expect(stampPerforations().holes).toHaveLength(4 * 12);
  });
});

describe('the cast list for the book (dramatis_page_test.dart)', () => {
  test('made from the cast, shown as printed, put in the book on a press', () => {
    let s = sample();
    const cast = new CastData('novel', s);
    const appearance = appearanceFrom(
      Object.entries(golden['the-drowned-road'].inputs.appearance)
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => ({ id, onStage: true })),
    );
    const people = dramatisPeople(cast);
    let view = dramatisView(people, dramatisStart, appearance, bookMatterOf(s.rows('bookMatter')));
    const page = castListPage(view.title, view.text);
    expect(page.title).toBe('DRAMATIS PERSONAE');
    const groups = page.lines.filter((l) => l.kind === 'group').map((l) => (l.kind === 'group' ? l.text : ''));
    expect(groups).toContain('THE FERRYMEN’S COMPANY');
    expect(groups).toContain('OTHERS');
    const persons = page.lines.flatMap((l) => (l.kind === 'person' ? [`${l.name}${l.about ?? ''}`] : []));
    expect(persons).toContain('Tobiah Fenn — A ferryman’s son who knows how the water moves in the bay');
    expect(persons).toContain('Wren Hollis — the apprentice');
    expect(view.inBook).toBe('');
    expect(view.put).toBe('Put it in the book');

    const put = (text: string) => {
      const stored = s.rows('bookMatter')[0] ?? null;
      s = s.putRow('bookMatter', castListMatter(stored, { projectId: s.projectId, text, now: 1, newId: () => 'm1' }));
    };
    put(view.text);
    view = dramatisView(people, dramatisStart, appearance, bookMatterOf(s.rows('bookMatter')));
    expect(view.inBook.startsWith('The Ferrymen’s Company:\nTobiah Fenn — ')).toBe(true);
    expect([view.same, view.put]).toEqual([true, null]);

    const kept = view.inBook;
    view = dramatisView(people, { ...dramatisStart, by: 'none' }, appearance, bookMatterOf(s.rows('bookMatter')));
    expect(view.lines.some((l) => l.group)).toBe(false);
    expect(view.put).toBe('Put this one in the book');
    expect(asksToReplace(bookMatterOf(s.rows('bookMatter')), view.text)).toBe(true);
    expect(bookMatterOf(s.rows('bookMatter')).castList).toBe(kept);
    put(view.text);
    expect(bookMatterOf(s.rows('bookMatter')).castList.startsWith('Wren Hollis — the apprentice\n')).toBe(true);

    const book = buildBook(bookSourceFromSnapshot(s), 'ebook');
    const castSection = book.sections.find((x) => x.kind === 'cast')!;
    expect(castSection.title).toBe('Dramatis Personae');
    expect(book.sections.indexOf(castSection)).toBeLessThan(book.sections.findIndex((x) => x.kind === 'chapter'));
  });

  test('a cast no page has met yet: the whole cast by name, with no order of appearance to choose', () => {
    const w = new World();
    w.createCharacter('Mark');
    const view = dramatisView(dramatisPeople(castOf(w)), dramatisStart, new Map(), bookMatterOf([]));
    expect([view.onPage, view.showOrder, view.text]).toEqual([0, false, 'Mark']);
    expect(dramatisView(dramatisPeople(castOf(w)), dramatisStart, null, bookMatterOf([])).text).toBe('');
  });
});

describe('a field’s input (typed_input.dart)', () => {
  test('each type its control; each press the value it keeps', () => {
    expect(typedControl('longtext', '')).toEqual({ kind: 'text', multiline: true, number: false });
    expect(typedControl('toggle', 'maybe')).toMatchObject({ selected: '', segments: [{ label: 'Yes' }, { label: 'No' }, { label: 'maybe' }] });
    expect(typedControl('select', 'Male', { options: ['Male', 'Female'] })).toEqual({ kind: 'segments', choices: ['Male', 'Female'], selected: 'Male' });
    expect(segmentPressed('Male', 'Male')).toBe('');
    const many = typedControl('select', 'Old', { options: ['A very long choice indeed', 'B'] });
    expect(many.kind === 'dropdown' && many.items.map((i) => i.value)).toEqual(['', 'A very long choice indeed', 'B', 'Old']);
    expect(typedControl('select', '', {}).kind).toBe('dropdown');
    expect(severalToggled('Fire\nAsh', 'Ash', false)).toBe('Fire');
    expect(tagAdded('brave', ' brave ')).toBeNull();
    expect(tagAdded('brave', 'kind')).toBe('brave\nkind');
    const gone = typedControl('reference', 'x', { entries: [new Entry({ id: 'a', name: 'Ash' })] });
    expect(gone.kind === 'link' && gone.selected).toBe(goneLink);
    expect(linkChosen(goneLink)).toBeNull();
    const links = typedControl('references', 'a\nzz', { entries: [new Entry({ id: 'a', name: 'Ash' }), new Entry({ id: 'b', name: 'Bo' })] });
    expect(links.kind === 'links' && links.chips.map((c) => c.label)).toEqual(['Ash', 'A deleted entry']);
    expect(links.kind === 'links' && links.menu.map((m) => m.label)).toEqual(['Bo']);
  });
});
