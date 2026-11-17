// The logic of the cast views' and found-in-your-pages panels' tests (flutter_app/test/features/characters/):
// page_notes_test, view_chooser_test, together_test, cast_check_test, waiting_for_a_name_test, manuscript_names_test,
// cast_ties_test, roll_call_test, name_board_test, cast_stakes_test, cast_compass_test, cast_orbit_test,
// whose_eyes_test, entrances_view_test, table_read_test, cast_arcs_test, their_voice_test, in_their_words_test and
// against_your_pages_test. What those check of the widgets themselves (taps reaching the right widget, scrolling a
// panel into view, layouts at phone width and twice the text size, tap-target and contrast guidelines, the device's
// voice actually speaking, the editor taking the find) belongs to the screens and is not here; the presses are run as
// the changes they make, on the records, as CharacterService.change runs them.

import { fieldNamed } from '../../../src/domain/characters/cast';
import { CastData, castViews } from '../../../src/domain/characters/castData';
import { CharacterProfile } from '../../../src/domain/characters/characterRecords';
import { type EyesPerson } from '../../../src/domain/characters/castNames';
import { entrancesJob } from '../../../src/domain/characters/entrances';
import { feelingArcsJob } from '../../../src/domain/characters/feelingArcs';
import { looksJob } from '../../../src/domain/characters/looks';
import { namedInJob } from '../../../src/domain/characters/namedIn';
import { chapterEyesJob } from '../../../src/domain/characters/pov';
import { recordIn, recordLook, recordStake, recordTraits } from '../../../src/domain/characters/recordLook';
import { tableReadJob } from '../../../src/domain/characters/tableRead';
import { pairKey, togetherAtLeast } from '../../../src/domain/characters/together';
import { unnamedRolesJob } from '../../../src/domain/characters/unnamedRoles';
import { spokenJob } from '../../../src/domain/characters/voice';
import { voicePrintsJob } from '../../../src/domain/characters/voicePrint';
import { againstYourPages, looksInputs, recordPageLook } from '../../../src/domain/characters/views/againstYourPages';
import { arcLine, arcX, castArcs, nearestChapter, arcsReading } from '../../../src/domain/characters/views/castArcs';
import { castCheckAfter, castCheckKey, castCheckPanel, noteKey } from '../../../src/domain/characters/views/castCheck';
import { castCompass } from '../../../src/domain/characters/views/castCompass';
import { nextToKnow, orbitLegend, orbitPlan, orbitSky } from '../../../src/domain/characters/views/castOrbit';
import { castStakes, stakeAnswered, stakePrompt } from '../../../src/domain/characters/views/castStakes';
import { addTie, castTies } from '../../../src/domain/characters/views/castTies';
import { DartRandom, inkOn, luminance, mix } from '../../../src/domain/characters/views/common';
import { castEntrances, doorPicked, entrancesReading } from '../../../src/domain/characters/views/entrancesView';
import { findable, inTheirWords, wordsInputs } from '../../../src/domain/characters/views/inTheirWords';
import { KeptReadings, firstReading, readingKey } from '../../../src/domain/characters/views/keptReadings';
import {
  addFromManuscript,
  manuscriptNamesPanel,
  namesInManuscript,
  namesShown,
  notCharacterAfter,
} from '../../../src/domain/characters/views/manuscriptNames';
import { nameBoard } from '../../../src/domain/characters/views/nameBoard';
import { anyPageNotes, counted, notesStrip, pageNoteSaid } from '../../../src/domain/characters/views/pageNotes';
import { rollCall, rollColumns, rollWrite } from '../../../src/domain/characters/views/rollCall';
import { TableReadPlayer, castTableRead, nudgedAfter, partVoices, tableReadReading } from '../../../src/domain/characters/views/tableReadView';
import { theirVoice, voiceInputs } from '../../../src/domain/characters/views/theirVoice';
import { notTiedAfter, tiePair, togetherOnPage, togetherPairs } from '../../../src/domain/characters/views/togetherOnPage';
import { castViewButton, castViewInfos, castViewPicked, castViewSheet } from '../../../src/domain/characters/views/viewChooser';
import {
  nameRole,
  unnamedAsideAfter,
  waitingForAName,
  waitingInputs,
  writeNamePrompt,
} from '../../../src/domain/characters/views/waitingForAName';
import { eyesPicked, eyesReading, whoseEyes } from '../../../src/domain/characters/views/whoseEyes';
import { str } from '../../../src/domain/json';
import { textToDoc } from '../../../src/domain/prose';
import { CharacterRelation } from '../../../src/domain/records/relation';
import { Entry } from '../../../src/domain/records/entry';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { readJson, samplePath } from '../../fixtures';
import { World } from '../world';

/** The sample novel's cast, with where names are on the page, as the app reads it; and its chapters as stored. */
function sample(): { cast: CastData; stored: string[]; id: (name: string) => string } {
  const s = NovelSnapshot.fromJson(readJson(samplePath));
  const stored = s.rows('chapterContents').map((r) => JSON.stringify(r));
  const named = namedInJob(stored, new CastData('novel', s).findNames)();
  const cast = new CastData('novel', s, { named });
  return { cast, stored, id: (name) => cast.entries.find((e) => e.name === name)!.id };
}

/** A chapter with `text` (paragraphs by blank lines), stored as the editor stores it. */
function write(w: World, id: string, text: string, order = 0): void {
  w.chapter(id, { order });
  w.snapshot = w.snapshot.putRow('chapters', { ...w.snapshot.rows('chapters').find((r) => r['id'] === id)!, wordCount: text.split(/\s+/).length });
  w.snapshot = w.snapshot.putRow('chapterContents', { id, projectId: 'novel', doc: textToDoc(text.split('\n\n').join('\n')) });
}

function storedOf(w: World): string[] {
  return w.snapshot.rows('chapterContents').map((r) => JSON.stringify(r));
}

function castOf(w: World): CastData {
  const stored = storedOf(w);
  return new CastData('novel', w.snapshot, { named: namedInJob(stored, new CastData('novel', w.snapshot).findNames)() });
}

// ---------------------------------------------------------------------------------------------------- the page

describe('from your pages: the strip of notes', () => {
  test('the sample novel: each kind with its count, and the panels counted', () => {
    const { cast, stored } = sample();
    const pairs = togetherPairs(cast, null);
    const check = castCheckPanel(cast, null)!;
    const w = waitingInputs(cast, null, 0);
    const roles = unnamedRolesJob(stored, w.order, { taken: w.taken, setAside: w.setAside })();
    const waiting = waitingForAName(roles, new Set())!;
    const names = namesShown(namesInManuscript(cast, cast.snapshot.rows('chapterContents')), null);
    const counts = new Map([
      ['together', pairs.length],
      ['check', check.count],
      ['waiting', waiting.count],
      ['names', names.length],
    ] as const);
    const strip = notesStrip(counts)!;
    expect(strip.heading).toBe('FROM YOUR PAGES');
    expect(strip.chips.map((c) => c.label)).toEqual([
      '15 pairs often together',
      '1 note on the cast',
      '1 waiting for a name',
      '2 names in your pages',
    ]);
    expect(strip.chips.map((c) => c.key)).toEqual(['note-together', 'note-check', 'note-waiting', 'note-names']);
    expect(waiting.cards[0].title).toBe('The clerk');
    // A note dealt with is counted off the strip.
    const after = namesShown(names, notCharacterAfter(null, names[0]));
    expect(notesStrip(counted(counts, 'names', after.length))!.chips[3].label).toBe('1 name in your pages');
    expect(pageNoteSaid('names', 1)).toBe('1 name in your pages');
    expect(anyPageNotes(new Map([['names', 0]]))).toBe(false);
    expect(notesStrip(new Map())).toBeNull();
    expect(counted(counts, 'names', names.length)).toBe(counts);
  });
});

describe('the view chooser', () => {
  test('every way to see the cast, by name and what it shows, in its group; the one in use marked', () => {
    expect(castViewButton('cards')).toEqual({
      icon: 'grid_view',
      label: 'Cards',
      semanticsLabel: 'Seeing the cast as Cards. Ways to see your cast',
    });
    const sheet = castViewSheet('cards');
    expect(sheet.title).toBe('Ways to see your cast');
    expect(sheet.groups.map((g) => g.heading)).toEqual(['THE CAST', 'BETWEEN THEM', 'IN YOUR PAGES']);
    expect(new Set(castViewInfos.map((v) => v.view))).toEqual(new Set(castViews));
    expect(sheet.groups.flatMap((g) => g.views).filter((v) => v.chosen).map((v) => v.view)).toEqual(['cards']);
    expect(castViewPicked('cards', 'compass')).toBe('compass');
    expect(castViewPicked('cards', 'cards')).toBeNull();
    expect(castViewPicked('cards', null)).toBeNull();
  });
});

describe('together on the page', () => {
  test('the sample novel’s untied pairs, most together first; recorded ties and set-aside pairs are left out', () => {
    const { cast } = sample();
    const pairs = togetherPairs(cast, null);
    expect(pairs.length).toBeGreaterThan(0);
    const related = new Set(cast.snapshot.rows('characterRelations').map((r) => pairKey(str(r['fromId']), str(r['toId']))));
    for (const p of pairs) {
      expect(related.has(pairKey(p.a, p.b))).toBe(false);
      expect(p.chapters.length).toBeGreaterThanOrEqual(togetherAtLeast);
    }
    for (let i = 1; i < pairs.length; i++) expect(pairs[i].chapters.length).toBeLessThanOrEqual(pairs[i - 1].chapters.length);
    const first = pairs[0];
    expect(togetherPairs(cast, [pairKey(first.b, first.a)])).not.toContainEqual(first);
  });

  test('How are they tied? records the tie in a press; Not tied sets the pair aside', () => {
    const { cast } = sample();
    const panel = togetherOnPage(cast, null, false)!;
    expect(panel.title).toBe('Together on the page');
    expect(panel.cards).toHaveLength(3);
    expect(panel.toggle).toBe(`Show all ${panel.count}`);
    const card = panel.cards[0];
    expect(card.said).toMatch(/^Together in \d+ chapters · \d+–\d+$/);
    expect(card.tie.choices.map((c) => c.label)).toContain('Friends');
    const w = new World();
    w.snapshot = cast.snapshot;
    const made = w.act((c) => tiePair(c, card.pair, 'friends', { a: card.a.name, b: card.b.name }));
    expect(made.tell).toBe(`${card.a.name} and ${card.b.name}: Friends.`);
    expect(made.action.path).toBe(`/organize/relationship/${made.relation.id}`);
    expect(w.rows('characterRelations')).toHaveLength(cast.snapshot.rows('characterRelations').length + 1);
    const tied = new CastData('novel', w.snapshot, { named: cast.named });
    expect(togetherOnPage(tied, null, false)!.cards.map((c) => c.title)).not.toContain(card.title);
    const next = togetherOnPage(tied, null, false)!.cards[0];
    const stored = notTiedAfter(null, next.pair);
    expect(stored).toHaveLength(1);
    expect(togetherOnPage(tied, stored, false)!.cards.map((c) => c.title)).not.toContain(next.title);
  });
});

describe('the cast, checked', () => {
  test('a note with the face it is about; Not now is remembered', () => {
    const { cast, id } = sample();
    const panel = castCheckPanel(cast, null)!;
    expect(panel.heading).toBe('THE CAST, CHECKED');
    expect(panel.notes.map((n) => [n.heading, n.says])).toEqual([
      ['GONE QUIET', 'Nan Ottilie is in chapters 3 to 8, then gone: 7 chapters without them. A thread left hanging?'],
    ]);
    expect(panel.notes[0].who.map((x) => x.label)).toEqual(['Open Nan Ottilie']);
    const stored = castCheckAfter(null, panel.notes[0].note);
    expect(stored).toEqual([`quiet:${id('Nan Ottilie')}`]);
    expect(noteKey(panel.notes[0].note)).toBe(stored[0]);
    expect(castCheckPanel(cast, stored)).toBeNull();
    expect(castCheckKey('n')).toBe('characters.checkSetAside.n');
  });
});

describe('waiting for a name', () => {
  test('the unnamed people of the pages, named in a press, their mentions theirs', () => {
    const w = new World();
    w.createCharacter('James');
    write(
      w,
      'one',
      'James sat down. The waitress came over.\n\n"One Elegant Cat," he said. The waitress nodded. A guard watched.\n\n' +
        'The guard yawned. With that the waitress left.',
    );
    const cast = castOf(w);
    const inputs = waitingInputs(cast, null, 0);
    const panel = waitingForAName(unnamedRolesJob(storedOf(w), inputs.order, inputs)(), new Set())!;
    expect(panel.heading).toBe('WAITING FOR A NAME');
    expect(panel.cards.map((c) => [c.title, c.where])).toEqual([
      ['The waitress', '3 times, in chapter 1'],
      ['The guard', '2 times, in chapter 1'],
    ]);
    const waitress = panel.cards[0].role;
    expect(writeNamePrompt(waitress)).toEqual({ title: 'Who is the waitress?', label: 'Their name', confirmLabel: 'Add to the cast' });
    const made = w.act((c) => nameRole(c, waitress, 'Mira'));
    const profile = w.profile(made.made.id);
    expect(profile.epithet).toBe('the waitress');
    expect(profile.aliases).toEqual(['the waitress', 'The waitress']);
    expect(fieldNamed(w.entry(made.made.id), 'Occupation')).toBe('Waitress');
    expect(made.tell).toBe('Mira is the waitress now: all 3 mentions are theirs.');
    const done = new Set([waitress.role]);
    expect(waitingForAName(panel.cards.map((c) => c.role), done)!.cards.map((c) => c.title)).toEqual(['The guard']);
    const stored = unnamedAsideAfter(null, panel.cards[1].role);
    expect(stored).toEqual(['guard']);
    expect(waitingForAName(panel.cards.map((c) => c.role), new Set([...done, 'guard']))).toBeNull();
    // Their title taken now: not offered again when the book is read again.
    const again = waitingInputs(castOf(w), stored, 1);
    expect(unnamedRolesJob(storedOf(w), again.order, again)()).toEqual([]);
  });
});

describe('in your manuscript', () => {
  test('names written in the manuscript are offered to the cast: added in one press, or set aside', () => {
    const w = new World();
    write(w, 'gate', 'Then Mira looked at Kai. Later Mira turned, and Kai waited. So Mira went, and Kai followed.');
    const before = JSON.stringify(w.rows('chapterContents'));
    const cast = castOf(w);
    const panel = manuscriptNamesPanel(namesShown(namesInManuscript(cast, w.rows('chapterContents')), null), false)!;
    expect(panel.title).toBe('In your manuscript');
    expect(panel.cards.map((c) => c.said)).toEqual(['3 times · in chapter 1', '3 times · in chapter 1']);
    expect(panel.cards.map((c) => c.add)).toContain('Add Mira');
    const added = w.act((c) => addFromManuscript(c, 'Mira'));
    expect(added.tell).toBe('Mira is in the cast.');
    expect(w.rows('loreEntries').map((r) => r['name'])).toEqual(['Mira']);
    const now = namesShown(namesInManuscript(castOf(w), w.rows('chapterContents')), null);
    expect(now.map((n) => n.name)).toEqual(['Kai']);
    const stored = notCharacterAfter(null, now[0]);
    expect(stored).toEqual(['kai']);
    expect(manuscriptNamesPanel(namesShown(now, stored), false)).toBeNull();
    expect(JSON.stringify(w.rows('chapterContents'))).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------- the views

describe('ties', () => {
  test('every pair of the cast, a tie recorded in one press, a pair with one opens it', () => {
    const w = new World();
    const mira = w.createCharacter('Mira');
    const kai = w.createCharacter('Kai');
    const orrin = w.createCharacter('Orrin');
    const table = (narrow = false) => {
      const cast = castOf(w);
      const t = castTies(cast, cast.list, narrow);
      if ('empty' in t) throw new Error('no table');
      return t;
    };
    const cellLabel = (rowName: string, colName: string) => {
      const t = table();
      const i = t.people.findIndex((p) => p.name === rowName);
      const j = t.people.findIndex((p) => p.name === colName);
      return t.rows[i][j];
    };
    const empty = cellLabel('Kai', 'Mira');
    expect(empty.kind === 'none' && [empty.semanticsLabel, empty.tooltip]).toEqual([
      'Kai and Mira: no tie yet. Add one',
      'Who is Kai to Mira?',
    ]);
    w.act((c) => addTie(c, kai, mira, 'rivals'));
    const relations = () => w.rows('characterRelations').map((r) => new CharacterRelation(r));
    expect(relations().map((r) => [r.fromId, r.toId])).toEqual([[kai, mira]]);
    const a = cellLabel('Kai', 'Mira');
    const b = cellLabel('Mira', 'Kai');
    expect(a.kind === 'tie' && a.semanticsLabel).toBe('Kai and Mira: Rivals');
    expect(b.kind === 'tie' && b.semanticsLabel).toBe('Mira and Kai: Rivals');
    expect(a.kind === 'tie' && a.colour).toBe('#B4532A');
    const offered = cellLabel('Orrin', 'Kai');
    expect(offered.kind === 'none' && offered.choices.find((c) => c.value === 'mentor-student')!.label).toBe(
      'Mentor / Student (Orrin the mentor)',
    );
    w.act((c) => addTie(c, orrin, kai, 'mentor-student'));
    const mentor = relations().find((r) => r.fromId === orrin)!;
    expect([mentor.toId, mentor.stages[0].fromRole, mentor.stages[0].toRole, mentor.stages.length]).toEqual([kai, 'Mentor', 'Student', 1]);
    expect(a.kind === 'tie' && a.path).toBe(`/organize/relationship/${relations().find((r) => r.fromId === kai)!.id}`);
    expect(table(true).cell).toEqual({ width: 92, height: 58 });
    const one = new World();
    one.createCharacter('Solo');
    const cast = castOf(one);
    expect(castTies(cast, cast.list, true)).toEqual({ empty: 'Ties need at least two characters.' });
  });
});

describe('the roll call', () => {
  test('the cast’s basics in one table, written in place and kept in their profiles', () => {
    const w = new World();
    const mira = w.createCharacter('Mira');
    const kai = w.createCharacter('Kai');
    w.act((c) => recordStake(c, kai, 'wants', 'The crown'));
    const roll = () => rollCall(castOf(w).list);
    expect(roll().said).toBe('1 of 10 filled. Write in a blank and it is kept in their profile.');
    const kaiRow = roll().rows.find((r) => r.name === 'Kai')!;
    expect(kaiRow.cells[4].value).toBe('The crown');
    const gender = roll().rows.find((r) => r.name === 'Mira')!.cells[1];
    expect(gender.semanticsLabel).toBe('Mira, Gender');
    expect(gender.input).toEqual({ kind: 'choice', value: null, choices: ['Male', 'Female'] });
    expect(roll().rows[0].cells[0].input).toEqual({ kind: 'text', number: true, blank: true });
    w.act((c) => rollWrite(c, mira, rollColumns[0], '34'));
    w.act((c) => rollWrite(c, mira, rollColumns[1], 'Female'));
    expect(fieldNamed(w.entry(mira), 'Age')).toBe('34');
    expect(fieldNamed(w.entry(mira), 'Gender')).toBe('Female');
    expect(w.entry(mira).fields.find((f) => f.key === 'Gender')!.type).toBe('select');
    expect(w.entry(mira).fields.find((f) => f.key === 'Age')!.type).toBe('number');
    expect(roll().said).toBe('3 of 10 filled. Write in a blank and it is kept in their profile.');
    w.act((c) => rollWrite(c, mira, rollColumns[0], '35'));
    expect(w.entry(mira).fields.filter((f) => f.key === 'Age')).toHaveLength(1);
    expect(fieldNamed(w.entry(mira), 'Age')).toBe('35');
    w.act((c) => rollWrite(c, kai, rollColumns[0], '  '));
    expect(w.entry(kai).fields.filter((f) => f.key === 'Age')).toEqual([]);
  });
});

describe('the name board', () => {
  test('the alphabet board, a letter pressed for its names, the look-alikes, the free letters', () => {
    const { cast } = sample();
    const before = JSON.stringify(cast.snapshot.rows('loreEntries'));
    const board = nameBoard(cast, null);
    expect(board.tiles.map((t) => t.key).slice(0, 26)).toEqual('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `letter-${l}`));
    const said = (l: string) => board.tiles.find((t) => t.letter === l)!.semanticsLabel;
    expect(said('W')).toBe('W: The Wardens’ Tower, Wren Hollis');
    expect(said('S').endsWith(', crowded')).toBe(true);
    expect(said('C')).toBe('C: no names');
    const picked = nameBoard(cast, 'W').picked!;
    expect(picked.heading).toBe('2 names under W');
    expect(picked.names.map((n) => n.name.name)).toContain('Wren Hollis');
    expect(picked.names.find((n) => n.name.name === 'Wren Hollis')!.path).toMatch(/^\/organize\/character\//);
    expect(board.lookAlikes.shown.some((a) => a.why.includes('one letter apart'))).toBe(true);
    expect(board.lookAlikes.shown.map((a) => a.names)).toContain('Ilse Marrow, Kit Marrow  and  Old Merrow, Merrow’s Bell Tower');
    expect(board.lookAlikes.shown.map((a) => a.words)).not.toContain('Ferry  ·  Ferrymen');
    expect(board.free.line.startsWith('No name begins with these 10 yet')).toBe(true);
    expect(board.free.forge).toBe('Forge a name');
    expect(JSON.stringify(cast.snapshot.rows('loreEntries'))).toBe(before);
  });
});

describe('the stakes board', () => {
  test('what drives each of them, a question answered in a press, and where they collide', () => {
    const w = new World();
    const mira = w.createCharacter('Mira Vale');
    const kai = w.createCharacter('Kai');
    w.act((c) => recordStake(c, kai, 'wants', 'To see Mira hanged for the fire'));
    const board = () => castStakes(castOf(w).list);
    expect(board().said).toContain('You know what 1 of 2 characters want');
    expect(board().collide!.heading).toBe('WHERE THEY COLLIDE');
    expect(board().collide!.clashes.map((c) => c.why)).toEqual(['Kai’s want names Mira Vale']);
    const miraCard = board().cards.find((c) => c.name === 'Mira Vale')!;
    expect(miraCard.lines[0].semanticsLabel).toBe('What does Mira Vale want?');
    const answer = stakeAnswered(mira, 'wants', '', 'To prove the fire was not hers')!;
    w.act(answer);
    expect(fieldNamed(w.entry(mira), 'What they want')).toBe('To prove the fire was not hers');
    expect(board().said).toBe('You know what every one of them wants.');
    expect(board().cards.find((c) => c.name === 'Mira Vale')!.lines[0].semanticsLabel).toBe(
      'Wants: To prove the fire was not hers. Press to change it.',
    );
    w.act(stakeAnswered(mira, 'wants', 'To prove the fire was not hers', 'To prove the fire was Kai’s')!);
    expect(fieldNamed(w.entry(mira), 'What they want')).toBe('To prove the fire was Kai’s');
    expect(w.entry(mira).fields.filter((f) => f.key === 'What they want')).toHaveLength(1);
    expect(board().collide!.clashes).toHaveLength(1);
    expect(stakeAnswered(mira, 'wants', 'Same', ' Same ')).toBeNull();
    expect(stakePrompt(board().cards[0].listed, 'wants', '').confirmLabel).toBe('Keep');
  });

  test('no one’s wants written: said so, not “0 of 1”', () => {
    const w = new World();
    w.createCharacter('James');
    const board = castStakes(castOf(w).list);
    expect(board.said.startsWith('No one’s wants are written yet.')).toBe(true);
    expect(board.cards[0].lines[0].ask).toBe('What does James want?');
  });
});

describe('the compass', () => {
  test('the board, the foils and where they differ, the twins, what all share, who is not on it', () => {
    const w = new World();
    const make = (name: string, sides: Record<string, number>) => {
      const id = w.createCharacter(name);
      if (Object.keys(sides).length > 0) w.act((c) => recordTraits(c, id, new Map(Object.entries(sides))));
    };
    make('Mark', { head: -1, risk: 1, truth: -1, lead: -1, room: 1, grudge: -1 });
    make('Kai', { head: 1, risk: -1, truth: 1, lead: 1, room: -1, grudge: -1 });
    make('Ilse', { head: -1, risk: -1, truth: -1, lead: 1, grudge: -1 });
    make('Nan', { head: -1, risk: -1, truth: -1, lead: 1, grudge: -1 });
    make('Wren', {});
    const found = castOf(w).list;
    const compass = castCompass(found, { x: null, y: null });
    const foils = compass.foils!;
    expect(foils.pairs.map((p) => `${p.a.entry.name} & ${p.b.entry.name}`).some((s) => /Mark & Kai|Kai & Mark/.test(s))).toBe(true);
    const markKai = foils.pairs.find((p) => new Set([p.a.entry.name, p.b.entry.name]).has('Mark') && new Set([p.a.entry.name, p.b.entry.name]).has('Kai'))!;
    expect(markKai.said).toBe('Opposite on 5 of 6');
    expect(markKai.chips.some((c) => /^(Rational · Emotional|Emotional · Rational)$/.test(c))).toBe(true);
    expect(markKai.chips.some((c) => /^(Commanding · Deferential|Deferential · Commanding)$/.test(c))).toBe(true);
    expect(compass.twins!.heading).toBe('TOO ALIKE');
    expect(compass.twins!.pairs.map((p) => p.said)).toContain('Alike on 5 of 5');
    expect(compass.shared).toEqual(['Everyone who answered is Forgiving (4 of 4). No one in the cast to break it.']);
    const chosen = castCompass(found, { x: 'head', y: null });
    expect(chosen.board.semanticsLabel.startsWith('The compass: Rational to Emotional across')).toBe(true);
    expect(chosen.board.semanticsLabel).toContain('Kai: Emotional');
    expect(chosen.across.choices.map((c) => c.value)).not.toContain(chosen.axes.y);
    expect(compass.unasked!.heading).toBe('NOT ON THE COMPASS YET');
    expect(compass.unasked!.people.map((p) => p.listed.entry.name)).toEqual(['Wren']);
  });

  test('no one answered yet: said so', () => {
    const w = new World();
    w.createCharacter('Wren');
    const compass = castCompass(castOf(w).list, { x: null, y: null });
    expect(compass.none).toContain('No one has answered This or that yet.');
    expect(compass.axes).toEqual({ x: 'room', y: 'plan' });
  });
});

describe('the orbit', () => {
  test('who goes where: the protagonist at the heart, the principals close in, those not on the page in the wings', () => {
    const { cast } = sample();
    const plan = orbitPlan(cast.list, { hasChapters: cast.model.order.chapters.length > 0 });
    expect(plan.heart.map((l) => l.entry.name)).toEqual(['Wren Hollis']);
    const everyone = [...plan.heart, ...[...plan.rings.values()].flat()];
    expect(everyone).toHaveLength(cast.list.length);
    expect(new Set(everyone).size).toBe(cast.list.length);
    for (const l of plan.rings.get('wings') ?? []) expect(l.seenIn).toEqual([]);
    for (const people of plan.rings.values()) {
      const firsts = people.map((l) => (l.first < 0 ? 1 << 30 : l.first));
      expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    }
  });

  test('with no protagonist, the one most in the book is at the heart; without chapters, no one waits in the wings', () => {
    const { cast } = sample();
    const noLead = cast.list.filter((l) => !l.profile.roles.includes('Protagonist'));
    const plan = orbitPlan(noLead, { hasChapters: false });
    const most = Math.max(...noLead.map((l) => l.seenIn.length));
    expect(plan.heart).toHaveLength(1);
    expect(plan.heart[0].seenIn.length).toBe(most);
    expect(plan.rings.has('wings')).toBe(false);
  });

  test('the heart said and its caption; the one to know next, with Interview', () => {
    const { cast } = sample();
    const known = (l: { entry: Entry }) => ({ known: Math.min(l.entry.fields.length, 3), of: 12 });
    const sky = orbitSky(cast.list, cast.model.order, 900, 1, { known });
    expect(sky.hearts[0].semanticsLabel.startsWith('Wren Hollis, Protagonist, at the heart')).toBe(true);
    expect(sky.bodies.every((b) => b.hit >= 48)).toBe(true);
    const legend = orbitLegend(cast.list, cast.model.order, { known, canInterview: true });
    expect(legend.caption.startsWith('At the heart, Wren Hollis')).toBe(true);
    const next = nextToKnow(orbitPlan(cast.list, { hasChapters: true }), known)!;
    expect(legend.next!.listed).toBe(next);
    expect(legend.next!.button).toBe(`Interview ${next.entry.name.split(' ')[0]}`);
    expect(orbitLegend(cast.list, cast.model.order, { known: null }).next).toBeNull();
    // On a phone, the sky is as tall as 1.2 of its width.
    expect(orbitSky(cast.list, cast.model.order, 390, 1).height).toBeCloseTo(468, 9);
  });
});

describe('whose eyes', () => {
  test('the book as a ribbon of whose eyes, a chapter pressed for why, each one’s share, what it means, and read there', () => {
    const { cast, stored } = sample();
    const r = eyesReading(cast);
    const eyes = chapterEyesJob(stored, r.order, r.titles, r.people)();
    const view = whoseEyes(cast, eyes, null);
    if ('empty' in view) throw new Error('no chapters');
    expect(view.ribbon.map((b) => b.key)).toEqual(Array.from({ length: 15 }, (_, i) => `eyes-${i + 1}`));
    expect(view.hint).toBe('Press a chapter to see why.');
    expect(view.rows.map((x) => x.said)).toContain('8 chapters · 54% of the book');
    expect(view.rows.map((x) => x.said)).toContain('1 chapter · 5% of the book');
    expect(view.rows.map((x) => x.name)).toContain('In the first person');
    expect(view.rows.find((x) => x.kind === 'firstPerson')!.said).toBe('Chapter 13');
    expect(view.rows.find((x) => x.kind === 'unclear')!.said).toContain('Chapters 5, 7, 10, 12, 14');
    expect(view.notes).toContain('Chapters 1 to 3 are all through Wren Hollis: 3 in a row.');
    expect(view.notes).toContain('Tobiah Fenn has not been seen through for 11 chapters, since chapter 4.');
    const picked = whoseEyes(cast, eyes, eyesPicked(null, 4));
    if ('empty' in picked) throw new Error('no chapters');
    expect(picked.picked!.heading).toContain('through Tobiah Fenn');
    expect(picked.picked!.quote).toBe('“Tobiah saw it first.”');
    expect(picked.picked!.read.path).toBe('/write');
    expect(eyesPicked(4, 4)).toBeNull();
    expect(whoseEyes(cast, [], null)).toEqual({
      empty: 'No chapter has words yet. Once there are, each is read for whose eyes it is told through.',
    });
  });
});

describe('entrances', () => {
  test('the doors, each entrance and what it gives, what an editor would say, and read there', () => {
    const { cast, stored } = sample();
    const r = entrancesReading(cast);
    const read = entrancesJob(stored, r.order, r.people)();
    const view = castEntrances(cast, read, null);
    if ('empty' in view) throw new Error('no entrances');
    expect(view.heading).toBe('IN ORDER OF APPEARANCE');
    expect(view.doors.doors.map((d) => d.key)).toEqual(Array.from({ length: 15 }, (_, i) => `door-${i + 1}`));
    expect(view.billing.map((b) => b.name)).toEqual([
      'WREN HOLLIS', 'ILSE MARROW', 'KIT MARROW', 'TOBIAH FENN', 'NAN OTTILIE', 'ALDOUS CRANE', 'SEFA QUILL', 'JORY',
    ]);
    expect(view.billing[0].number).toBe('1.');
    expect(view.billing[7].number).toBe('8.');
    const chips = view.billing.flatMap((b) => b.chips.map((c) => c.label));
    expect(chips.filter((c) => c === 'Only named')).toHaveLength(2);
    expect(chips.filter((c) => c === 'Seen')).toHaveLength(2);
    expect(view.billing.map((b) => b.sentence)).toContain('Enters: “It was signed in a sharp black hand: Aldous Crane.”');
    expect(view.billing.map((b) => b.talkedFirst)).toContain('Talked of first in chapter 2.');
    expect(view.editor).toBe('WHAT AN EDITOR WOULD SAY');
    expect(view.notes.map((n) => n.text)).toContain(
      'Kit Marrow and Aldous Crane enter with nothing but a name. A look, a line or something done gives the reader ' +
        'someone to hold.',
    );
    expect(view.notes.some((n) => n.text.includes('Talked of before they appear: Aldous Crane (chapter 2, on the page in 4)'))).toBe(true);
    const three = castEntrances(cast, read, doorPicked(null, 3));
    if ('empty' in three) throw new Error('no entrances');
    expect(three.hint).toBe('Chapter 3: 2 entrances. Press it again for the whole cast.');
    expect(three.billing.map((b) => b.name)).toEqual(['TOBIAH FENN', 'NAN OTTILIE']);
    expect(doorPicked(3, 3)).toBeNull();
    expect(view.billing[0].read.path).toBe('/write');
  });
});

describe('the table read', () => {
  class Voice {
    said: { text: string; pitch: number }[] = [];
    constructor(private readonly there = true) {}
    say(text: string, o: { pitch?: number } = {}) {
      this.said.push({ text, pitch: o.pitch ?? 1 });
      return Promise.resolve(this.there);
    }
    stop() {
      return Promise.resolve();
    }
  }

  test('the first chapter as a script, each line under who says it, and read aloud in the cast’s voices', async () => {
    const { cast, stored, id } = sample();
    const first = castTableRead(cast, { chosen: null, parts: null, stored: null, at: 0, playing: false, voiced: null });
    if ('empty' in first) throw new Error('no chapters');
    expect(first.script).toBeNull();
    const reading = tableReadReading(cast, first.chapter);
    const parts = tableReadJob(stored, first.chapter, reading.people, { genders: reading.genders })();
    const view = castTableRead(cast, { chosen: null, parts, stored: null, at: 0, playing: false, voiced: true });
    if ('empty' in view) throw new Error('no chapters');
    const script = view.script!;
    expect(script.voicesHeading).toBe('THE CAST’S VOICES');
    expect(script.voices.map((v) => v.key)).toEqual(expect.arrayContaining([`voice-${id('Wren Hollis')}`, `voice-${id('Ilse Marrow')}`]));
    const who = script.parts.map((p) => p.who);
    expect(who).toContain('WREN HOLLIS');
    expect(who).toContain('ILSE MARROW (likely)');
    expect(who).toContain('WHO SAYS THIS?');
    expect(script.said).toContain('cannot be told whose they are');
    expect(view.play!.label).toBe('Read it aloud');

    const voice = new Voice();
    const player = new TableReadPlayer(voice, () => undefined);
    let voices = partVoices(cast, parts, null);
    await player.play(parts, voices);
    expect(voice.said[0].text.startsWith('The bell in the Wardens’ tower')).toBe(true);
    expect(voice.said[0].pitch).toBe(1);
    const wrens = voice.said.find((s) => s.text === 'The tide bell,')!;
    const ilses = voice.said.find((s) => s.text === 'So soon,')!;
    expect(wrens.pitch).not.toBe(ilses.pitch);
    expect(voice.said.length).toBeGreaterThan(20);
    expect(player.at).toBe(0);
    // Wren's voice raised: kept for the novel, and the next reading higher.
    const stored2 = nudgedAfter(null, id('Wren Hollis'), 1);
    expect(stored2).toEqual({ [id('Wren Hollis')]: 1 });
    voices = partVoices(cast, parts, stored2);
    voice.said = [];
    await player.play(parts, voices);
    expect(voice.said.find((s) => s.text === 'The tide bell,')!.pitch).toBeGreaterThan(wrens.pitch);
  });

  test('a press on a part reads from there; no voice on the device: said so, the script still there', async () => {
    const { cast, stored } = sample();
    const first = castTableRead(cast, { chosen: null, parts: null, stored: null, at: 0, playing: false, voiced: null });
    if ('empty' in first) throw new Error('no chapters');
    const reading = tableReadReading(cast, first.chapter);
    const parts = tableReadJob(stored, first.chapter, reading.people, { genders: reading.genders })();
    const voice = new Voice();
    const player = new TableReadPlayer(voice, () => undefined);
    const at = parts.findIndex((p) => p.text === 'Master, it’s the tide bell.');
    player.from(at, parts, partVoices(cast, parts, null));
    const view = castTableRead(cast, { chosen: null, parts, stored: null, at: player.at, playing: false, voiced: true });
    if ('empty' in view) throw new Error('no chapters');
    expect(view.play!.label).toBe('Go on');
    await player.play(parts, partVoices(cast, parts, null));
    expect(voice.said[0].text).toBe('Master, it’s the tide bell.');

    const silent = new TableReadPlayer(new Voice(false), () => undefined);
    await silent.play(parts, new Map());
    expect(silent.voiced).toBe(false);
    const none = castTableRead(cast, { chosen: null, parts, stored: null, at: 0, playing: false, voiced: false });
    if ('empty' in none) throw new Error('no chapters');
    expect(none.noVoice).toBe('This device has no voice to read with. The script is here to read all the same.');
    expect(none.play).toBeNull();
    expect(none.script!.parts.map((p) => p.who)).toContain('WREN HOLLIS');
  });
});

describe('arcs', () => {
  test('each one’s line through the book: its shape, a chapter pressed for the words, read there', () => {
    const { cast, stored, id } = sample();
    const r = arcsReading(cast);
    const arcs = feelingArcsJob(stored, r.order, r.people)();
    const view = castArcs(cast, arcs, new Map());
    if ('empty' in view) throw new Error('no arcs');
    const names = view.cards.map((c) => c.name);
    expect(names.indexOf('Wren Hollis')).toBeLessThan(names.indexOf('Tobiah Fenn'));
    expect(view.cards.map((c) => c.shape)).toContain('Rises: rags to riches');
    expect(view.cards.map((c) => c.shape)).toContain('Falls, then rises: a man in a hole');
    expect(view.cards.map((c) => c.said)).toContain('Named in 15 of 15 chapters · brightest in chapter 14 · darkest in chapter 12');
    expect(view.thin).toBe('Too little on the page to draw yet: Aldous Crane, Ilse Marrow, Jory, Kit Marrow.');
    expect(view.cards.some((c) => 'plan' in c.planned && c.planned.plan === 'Plan their arc')).toBe(true);
    // Wren's darkest chapter (12) pressed: what it reads, and the lines that put it there.
    const wren = view.cards.find((c) => c.arc.id === id('Wren Hollis'))!;
    const width = 600;
    const chapter = nearestChapter(wren.arc, arcs.chapters, width, 8 + (11 * (width - 16)) / 14)!;
    expect(chapter).toBe(12);
    const pressed = castArcs(cast, arcs, new Map([[wren.arc.id, chapter]]));
    if ('empty' in pressed) throw new Error('no arcs');
    const p = pressed.cards.find((c) => c.arc.id === wren.arc.id)!.picked;
    expect('heading' in p && p.heading.startsWith('Chapter 12: dark')).toBe(true);
    expect('lines' in p && p.lines[0].tooltip).toBe('Read it there');
    const line = arcLine(wren.arc, arcs.chapters, view.scale, width, chapter);
    expect(line.points.find((x) => x.chapter === 12)!.radius).toBe(6);
    expect(line.points.find((x) => x.chapter === 12)!.x).toBeCloseTo(arcX(12, 15, width), 9);
    expect(line.path!.startsWith('M')).toBe(true);
  });

  test('the arc planned in the profile, beside the one on the page', () => {
    const { cast, stored, id } = sample();
    const w = new World();
    w.snapshot = cast.snapshot;
    const wren = id('Wren Hollis');
    w.act((x) => {
      recordIn(x, wren, 'Starting Point', ['starting point'], 'A mapmaker who never leaves the shop.', { sections: ['arc'], newSection: 'Character Arc' });
      recordIn(x, wren, 'Intended Resolution', ['intended resolution'], 'Walks the drowned road herself.', { sections: ['arc'], newSection: 'Character Arc' });
    });
    const planned = new CastData('novel', w.snapshot, { named: cast.named });
    const r = arcsReading(planned);
    const view = castArcs(planned, feelingArcsJob(stored, r.order, r.people)(), new Map());
    if ('empty' in view) throw new Error('no arcs');
    const card = view.cards.find((c) => c.arc.id === wren)!.planned;
    expect('heading' in card && card.heading).toBe('THE ARC YOU PLANNED');
    expect('lines' in card && card.lines).toEqual([
      { label: 'From', text: 'A mapmaker who never leaves the shop.' },
      { label: 'To', text: 'Walks the drowned road herself.' },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------- the profile

describe('their voice', () => {
  test('measured from their lines against the cast; their words; whom they sound like', () => {
    const { cast, stored, id } = sample();
    const wren = id('Wren Hollis');
    const { people, inputs } = voiceInputs(cast, wren);
    expect(inputs).not.toBeNull();
    const prints = voicePrintsJob(stored, cast.documentIds, people)();
    const box = theirVoice(cast, wren, prints)!;
    expect(box.title).toBe('Their voice');
    expect(box.caption).toBe('How Wren Hollis talks, from 36 lines, against the rest of the cast.');
    expect(box.meters[0].semanticsLabel.startsWith('Words a line: 6.6; the cast')).toBe(true);
    expect(box.signature!.heading).toBe('WORDS THAT ARE THEIRS');
    for (const word of ['master', 'bell', 'tide']) expect(box.signature!.words).toContain(`“${word}”`);
    expect(box.soundsLike!.text).toBe('Sounds most like Tobiah Fenn.');
    expect(theirVoice(cast, id('Jory'), prints)).toBeNull();
    expect(theirVoice(cast, wren, null)).toBeNull();
  });

  test('the only one who speaks enough: measured, with no cast to mark against', () => {
    const w = new World();
    const mira = w.createCharacter('Mira');
    write(w, 'one', [0, 1, 2, 3, 4, 5].map((i) => `“Line ${i}, and on we go,” Mira said.`).join('\n\n'));
    const cast = castOf(w);
    const { people } = voiceInputs(cast, mira);
    const box = theirVoice(cast, mira, voicePrintsJob(storedOf(w), cast.documentIds, people)())!;
    expect(box.caption).toContain('(no one else speaks enough yet)');
    expect(box.key).toBeNull();
    expect(box.meters[0].semanticsLabel).toBe('Words a line: 5.0');
  });
});

describe('in their own words', () => {
  test('a character’s page quotes their lines; a press opens the chapter at the line', () => {
    const { cast, stored, id } = sample();
    const { names, inputs } = wordsInputs(cast, id('Wren Hollis'));
    expect(inputs).not.toBeNull();
    const box = inTheirWords(cast, spokenJob(stored, cast.documentIds, names)(), false)!;
    expect(box.title).toBe('In their own words');
    const line = box.lines.find((l) => l.text === 'Master, it’s the tide bell.”')!;
    expect(line.read.term).toBe('Master, it’s the tide bell');
    expect(box.toggle!.startsWith('Show all')).toBe(true);
    expect(findable('One two three four five six.')).toBe('One two three four five');
    expect(inTheirWords(cast, [], false)).toBeNull();
  });
});

describe('checked against your pages', () => {
  test('a slip shown and put right, a look recorded, the chapter a press away', () => {
    const w = new World();
    const wren = w.act((x) => {
      const e = x.create({ name: 'Wren Hollis' });
      recordLook(x, e.id, 'eyes', 'Grey');
      return e.id;
    });
    w.createCharacter('Kai Doyle');
    write(
      w,
      'bell',
      'Wren’s blue eyes narrowed at the window.\n\nWren pushed back her black hair and went down.\n\nWren watched Kai push back his red hair.',
    );
    w.snapshot = w.snapshot.putRow('chapters', { ...w.rows('chapters')[0], title: 'The Bell' });
    const box = () => {
      const cast = castOf(w);
      const { names, others } = looksInputs(cast, wren);
      return againstYourPages(cast, wren, looksJob(storedOf(w), cast.documentIds, names, others)())!;
    };
    expect(box().caption).toContain('One look in your chapters does not match');
    expect(box().rows.map((r) => r.line)).toEqual([
      'Eyes: the profile says Grey; The Bell says “blue eyes”.',
      'Hair: The Bell says “her black hair”. Not in the profile yet.',
    ]);
    expect(box().rows[0].presses!.read.label).toBe('Read it in The Bell');
    expect(box().rows[0].presses!.record.label).toBe('Make it blue');
    w.act((x) => recordPageLook(x, wren, box().rows[0].check));
    expect(new Entry(w.rows('loreEntries').find((r) => r['id'] === wren)!).fields.find((f) => f.key === 'Eyes')!.value).toBe('Blue');
    expect(box().rows[0].line).toBe('Eyes: Blue, as your pages have it.');
    expect(box().rows[1].presses!.record.label).toBe('Record black');
    w.act((x) => recordPageLook(x, wren, box().rows[1].check));
    expect(box().rows[1].line).toBe('Hair: Black, as your pages have it.');
  });
});

// ---------------------------------------------------------------------------------------------------- the parts

describe('what the views share', () => {
  test('readings kept by what they are made of: read once, shared while being read, the least used going first', async () => {
    const keep = new KeptReadings();
    expect(readingKey(null, 3)).toBeNull();
    const key = readingKey('voices', 3)!;
    expect(firstReading(keep, null, 'nothing')).toBe('nothing');
    expect(firstReading(keep, key, 'nothing')).toBeUndefined();
    let runs = 0;
    const run = () => Promise.resolve(++runs);
    const [a, b] = await Promise.all([keep.read(key, run), keep.read(key, run)]);
    expect([a, b, runs, keep.runs]).toEqual([1, 1, 1, 1]);
    expect(firstReading(keep, key, 0)).toBe(1);
    for (let i = 0; i < KeptReadings.capacity; i++) await keep.read(`k${i}`, run);
    expect(keep.has(key)).toBe(false);
    await expect(keep.read('fails', () => Promise.reject(new Error('no')))).rejects.toThrow('no');
    expect(keep.has('fails')).toBe(false);
  });

  test('the ink on a character’s colour, a colour mixed, Dart’s random numbers', () => {
    expect(inkOn('#000000')).toBe('#FFF8EC');
    expect(inkOn('#FFFFFF')).toBe('#1B140E');
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 9);
    expect(mix('#000000', '#FFFFFF', 0.5, 0.3)).toBe('rgba(128, 128, 128, 0.3)');
    expect(new DartRandom(7).nextDouble()).toBe(0.11040538936331912);
  });

  test('nothing is read where there is nothing to read', () => {
    const w = new World();
    const mira = w.createCharacter('Mira');
    const cast = castOf(w);
    expect(voiceInputs(cast, mira).inputs).toBeNull();
    expect(wordsInputs(cast, mira).inputs).toBeNull();
    expect(looksInputs(cast, mira).inputs).toBeNull();
    expect(castTableRead(cast, { chosen: null, parts: null, stored: null, at: 0, playing: false, voiced: null })).toEqual({
      empty: 'No chapter has words yet. Once one has, its dialogue can be read here by the cast, each in a voice of their own.',
    });
    const people: EyesPerson[] = [];
    const read = entrancesJob(storedOf(w), [], people)();
    expect(castEntrances(cast, read, null)).toEqual({
      empty: 'No chapter has words yet. Once there are, the cast is read in the order a reader meets them.',
    });
    expect(new CharacterProfile({}).aliases).toEqual([]);
  });
});
