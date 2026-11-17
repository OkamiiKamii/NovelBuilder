// The writing aids' domain, as the Flutter app's own tests check it: ports of flutter_app/test/shared/domain/
// this_or_that_test.dart, character_journal_test.dart, write_them_in_test.dart, dramatis_test.dart, name_forge_test.dart,
// looks_test.dart, likeness_test.dart and stakes_test.dart. (journal_test.dart is the writing journal of analytics,
// face_off_test.dart the systems' face-off, and cast_list_test.dart the cast's listing: none is a writing aid, and the
// listing is held to the Flutter app by ../castAgreement.test.ts.)

import { type Likeness, likenessOf, painted, unsaid, wordsFor } from '../../../src/domain/characters/aids/likeness';
import { CharacterNote } from '../../../src/domain/characters/characterRecords';
import { type DramatisPerson, aboutOf, composeDramatis } from '../../../src/domain/characters/dramatis';
import {
  journalPages,
  journalPrompts,
  journalTag,
  journalTitlePrefix,
  promptOf,
  wordsIn,
} from '../../../src/domain/characters/journal';
import {
  type LookSighting,
  checkLooks,
  colourFamily,
  looksIn,
  sameColour,
} from '../../../src/domain/characters/looks';
import { forgeNames, learnableNames, nameFlavours, sayable } from '../../../src/domain/characters/nameForge';
import { type Stake, type StakeHolder, askStake, collisions, stakesOf } from '../../../src/domain/characters/stakes';
import { askOf, sidesOf, traitAxes, traitsAfter, traitsIn } from '../../../src/domain/characters/thisOrThat';
import { type PlaceNode, placesFor, sparksFor } from '../../../src/domain/characters/writeThemIn';
import { textToDoc } from '../../../src/domain/prose';
import { buildBook, BookMatter, castLines } from '../../../src/domain/reader/book';
import { matterWithChanges } from '../../../src/domain/reader/matterChanges';
import { renderEpub } from '../../../src/domain/exchange/renderBook';
import { StoryNode } from '../../../src/domain/records/storyNode';
import { strFromU8, unzipSync } from 'fflate';

const obj = (m: ReadonlyMap<string, unknown>) => Object.fromEntries(m);

describe('this or that', () => {
  test('the sides a list of traits is on; an axis with both or neither is not chosen', () => {
    expect(obj(sidesOf(['Quiet', 'Stubborn', 'emotional']))).toEqual({ room: -1, head: 1 });
    expect(sidesOf(['Quiet', 'Loud']).size).toBe(0);
    expect(traitsIn('Quiet\nBrave, Kind\n')).toEqual(['Quiet', 'Brave', 'Kind']);
  });

  test('what an earlier deck kept (the words pressed) is still read as the choice', () => {
    expect(obj(sidesOf(['Heart', 'Lead', 'Break them', 'Fight']))).toEqual({ head: 1, lead: -1, rules: 1, fight: -1 });
    expect(sidesOf(['Heart', 'Rational']).size).toBe(0);
  });

  test('the deck written in: the trait chosen, the other side out, other traits kept first', () => {
    expect(traitsAfter('Stubborn\nQuiet\nKind', new Map([['room', 1], ['fight', -1]]))).toBe('Stubborn\nKind\nLoud\nCombative');
    expect(traitsAfter('Quiet', new Map([['room', null]]))).toBe('');
    expect(traitsAfter('', new Map())).toBe('');
    expect(traitsAfter('Brave\nHeart\nLead\nBreak them', sidesOf(['Heart', 'Lead', 'Break them']))).toBe(
      'Brave\nEmotional\nCommanding\nRebellious',
    );
  });

  test('every question names them; every side a word of its own and a trait of its own', () => {
    for (const a of traitAxes) {
      expect(askOf(a, 'Wren')).toContain('Wren');
      expect(askOf(a, 'Wren')).not.toContain('{name}');
    }
    const words = traitAxes.flatMap((a) => [a.left.toLowerCase(), a.right.toLowerCase()]);
    expect(new Set(words).size).toBe(words.length);
    const traits = traitAxes.flatMap((a) => [a.leftTrait.toLowerCase(), a.rightTrait.toLowerCase()]);
    expect(new Set(traits).size).toBe(traits.length);
    expect(askOf(traitAxes[0], 'Wren')).toBe('In a crowded room, Wren is…');
  });
});

describe('the journal', () => {
  test('prompts made of what is known of them first, then ones that fit anyone', () => {
    const p = journalPrompts('Mark', {
      others: [
        { name: 'Kai', tie: 'Rival' },
        { name: 'Ren', tie: '' },
      ],
      wants: 'To open the last door.',
    });
    expect(p[0].ask).toBe('The night before everything changes. Write it as Mark, tonight.');
    expect(p.map((x) => x.ask)).toEqual(
      expect.arrayContaining([
        'A letter Mark will never send, to Kai (Rival).',
        'Mark on what they want (“To open the last door”), and the real reason, last.',
        'Mark describes Ren to a stranger.',
      ]),
    );
    expect(new Set(p.map((x) => x.id)).size).toBe(p.length);
  });

  test('nothing known of them: the ones that fit anyone, a want asked for', () => {
    const p = journalPrompts('Mark');
    expect(p.some((x) => x.ask.includes('letter'))).toBe(false);
    expect(p.some((x) => x.ask === 'Everything Mark wants, in a list. The real reason goes last.')).toBe(true);
    expect(p.length).toBeGreaterThanOrEqual(10);
  });

  test('a long want is cut at a word', () => {
    const p = journalPrompts('Mark', { wants: `${'word '.repeat(30)}end.` });
    expect(p[1].ask).toBe(`Mark on what they want (“${'word '.repeat(11)}word…”), and the real reason, last.`);
  });

  test('the journal pages among the notes, the newest first; the prompt read back; words counted', () => {
    const note = (id: string, title: string, tags: string[], at: number) =>
      new CharacterNote({ id, title, content: 'x', tags, createdAt: at });
    const pages = journalPages([
      note('a', `${journalTitlePrefix}The night before.`, [journalTag], 1),
      note('b', 'A plain note', [], 3),
      note('c', `${journalTitlePrefix}What is in his pockets.`, [journalTag], 2),
    ]);
    expect(pages.map((p) => p.id)).toEqual(['c', 'a']);
    expect(promptOf(pages[0])).toBe('What is in his pockets.');
    expect(wordsIn('I never wanted the door. Not really — it’s Kai’s.')).toBe(9);
  });
});

describe('write them in', () => {
  test('the sparks: from what the author wrote about them, the strongest first, then the ones that fit anyone', () => {
    const sparks = sparksFor(
      'Mark',
      new Map<Stake, string>([
        ['wants', 'To open the last door.'],
        ['inTheWay', 'The Architect.'],
        ['atStake', 'His sister.'],
      ]),
      [
        { other: 'Kai', tie: 'Rival' },
        { other: 'Ren', tie: '' },
        { other: 'Tam', tie: 'Friend' },
      ],
    );
    expect(sparks.map((s) => s.text)).toEqual([
      'Mark goes after what they want: “To open the last door.”',
      'What stands in Mark’s way shows itself: “The Architect.”',
      'Mark comes close to losing it: “His sister.”',
      'Mark and Kai (Rival), in the same room, wanting different things.',
      'Mark and Ren, in the same room, wanting different things.',
      'Mark doing what they do best, and it goes wrong.',
      'Mark wants something small and urgent, right now.',
      'Someone sees Mark for the first time.',
    ]);
  });

  test('nothing written about them yet: the ones that fit anyone; a long answer cut at a word', () => {
    expect(sparksFor('Mark', new Map(), []).map((s) => s.from)).toEqual(['Anyone', 'Anyone', 'Anyone']);
    const long = sparksFor('Mark', new Map([['wants', 'word '.repeat(60)]]), [])[0].text;
    expect(long.length).toBeLessThan(200);
    expect(long.endsWith('…”')).toBe(true);
  });

  const node = (
    id: string,
    o: { kind?: string; parent?: string; words?: number; planned?: boolean } = {},
  ): PlaceNode => ({
    id,
    kind: o.kind ?? 'chapter',
    parentId: o.parent ?? null,
    title: `Chapter ${id}`,
    words: o.words ?? 0,
    planned: o.planned ?? false,
  });

  test('a book with only its blank first chapter starts there', () => {
    const places = placesFor([node('1')]);
    expect(places.map((p) => [p.kind, p.nodeId])).toEqual([
      ['blank', '1'],
      ['newChapter', '1'],
    ]);
    expect(places[0].label).toBe('In Chapter 1, still blank');
  });

  test('a book being written: a new chapter, or a scene in the latest; a planned or full chapter is not blank', () => {
    const places = placesFor([node('1', { words: 900 }), node('2', { planned: true }), node('s', { kind: 'scene', parent: '2' })]);
    expect(places.map((p) => [p.kind, p.nodeId])).toEqual([
      ['newChapter', '2'],
      ['newScene', '2'],
    ]);
    expect(places[places.length - 1].label).toBe('A new scene in Chapter 2');
  });

  test('an empty book: a new chapter', () => {
    expect(placesFor([]).map((p) => [p.kind, p.nodeId])).toEqual([['newChapter', null]]);
  });
});

describe('the dramatis personae', () => {
  const people: DramatisPerson[] = [
    { id: 'wren', name: 'Wren Hollis', about: 'a mapmaker', factions: ['The Wardens'], roles: ['Protagonist'] },
    { id: 'tobiah', name: 'Tobiah Fenn', about: 'a fisherman', factions: [], roles: ['Supporting'] },
    { id: 'abbot', name: 'The Grey Abbot', about: '', factions: ['The Abbey'], roles: ['Antagonist'] },
    { id: 'ilse', name: 'Ilse Marrow', about: 'Wren’s grandmother', factions: ['The Wardens'], roles: ['Minor'] },
    { id: 'unmet', name: 'Sefa Quill', about: 'a smuggler', factions: [], roles: ['Supporting'] },
  ];
  const met = new Map([
    ['wren', 0],
    ['abbot', 1],
    ['ilse', 2],
    ['tobiah', 3],
  ]);

  test('by faction, in the order met, only those on the page; no faction last', () => {
    expect(composeDramatis(people, { by: 'faction', order: 'appearance', appearance: met })).toBe(
      'The Wardens:\nWren Hollis — a mapmaker\nIlse Marrow — Wren’s grandmother\n\nThe Abbey:\nThe Grey Abbot\n\nOthers:\nTobiah Fenn — a fisherman',
    );
  });

  test('by the part they play; by name; the whole cast', () => {
    expect(composeDramatis(people, { by: 'role', order: 'name', appearance: met, onlyOnPage: false })).toBe(
      'Principal characters:\nThe Grey Abbot\nWren Hollis — a mapmaker\n\nSupporting characters:\nSefa Quill — a smuggler\nTobiah Fenn — a fisherman\n\nAnd:\nIlse Marrow — Wren’s grandmother',
    );
  });

  test('one list; one group alone has no heading', () => {
    expect(composeDramatis(people, { by: 'none', order: 'appearance', appearance: met })).toBe(
      'Wren Hollis — a mapmaker\nThe Grey Abbot\nIlse Marrow — Wren’s grandmother\nTobiah Fenn — a fisherman',
    );
    expect(composeDramatis(people.slice(0, 1), { by: 'faction', order: 'name', onlyOnPage: false })).toBe(
      'Wren Hollis — a mapmaker',
    );
  });

  test('who they are: the title they go by, the first line of their summary, their trade', () => {
    expect(aboutOf({ epithet: 'The Oathbreaker', summary: 'Long story.', occupation: 'Smith' })).toBe('The Oathbreaker');
    expect(
      aboutOf({ epithet: '', summary: 'A mapmaker who never leaves the shop. She dies in book two.', occupation: '' }),
    ).toBe('A mapmaker who never leaves the shop');
    expect(aboutOf({ epithet: '', summary: '', occupation: 'Ferryman' })).toBe('Ferryman');
    expect(aboutOf({ epithet: '', summary: 'word '.repeat(40), occupation: '' }).length).toBeLessThanOrEqual(91);
  });

  test('a cast list read back: groups, names and who they are, any dash', () => {
    expect(castLines('The Wardens:\nWren Hollis — a mapmaker\n\nTobiah Fenn - a fisherman\nThe Grey Abbot')).toEqual([
      { group: true, name: 'The Wardens', about: '' },
      { group: false, name: 'Wren Hollis', about: 'a mapmaker' },
      { group: false, name: 'Tobiah Fenn', about: 'a fisherman' },
      { group: false, name: 'The Grey Abbot', about: '' },
    ]);
  });

  const book = (format: 'novel' | 'ebook' | 'serial', matter: Record<string, string>) =>
    buildBook(
      {
        project: { title: 'The Drowned Road', author: 'A. Writer' },
        nodes: [new StoryNode({ id: 'c1', kind: 'chapter', title: 'The Bell', order: 0 })],
        docs: new Map([['c1', textToDoc('The bell rang.')]]),
        matter: new BookMatter({ sceneBreak: '* * *', ...matter }),
      },
      format,
    );

  test('printed before the story, after the contents of an ebook; its own title; none, no page', () => {
    const ebook = book('ebook', { castList: 'Wren Hollis — a mapmaker' });
    const kinds = ebook.sections.map((s) => s.kind);
    expect(kinds.indexOf('cast')).toBe(kinds.indexOf('contents') + 1);
    expect(kinds.indexOf('cast')).toBe(kinds.indexOf('chapter') - 1);
    expect(ebook.sections.find((s) => s.kind === 'cast')!.title).toBe('Dramatis Personae');
    expect(ebook.words).toBe(3);
    const named = book('novel', { castList: 'Wren Hollis', castTitle: 'The Players' });
    expect(named.sections.find((s) => s.kind === 'cast')!.title).toBe('The Players');
    expect(book('novel', {}).sections.some((s) => s.kind === 'cast')).toBe(false);
    expect(book('serial', { castList: 'Wren' }).sections.some((s) => s.kind === 'cast')).toBe(false);
  });

  test('in the ebook: its own page in the contents, the names in bold, the groups as headings', () => {
    const result = renderEpub(book('ebook', { castList: 'The Wardens:\nWren Hollis — a mapmaker & guide' }), {
      identifier: 'urn:uuid:b0000000-0000-4000-8000-000000000000',
      language: 'en',
      modified: new Date(Date.UTC(2026, 10, 14)),
    });
    const pages = Object.entries(unzipSync(result.bytes))
      .filter(([name]) => name.endsWith('.xhtml'))
      .map(([, bytes]) => strFromU8(bytes));
    const cast = pages.filter((p) => p.includes('dramatis-personae'));
    expect(cast).toHaveLength(1);
    const inner = (tag: string) =>
      [...cast[0].matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>(.*?)</${tag}>`, 'gs'))].map((m) => m[1].replace(/<[^>]+>/g, ''));
    expect(inner('h3')).toEqual(['The Wardens']);
    expect(inner('b')).toEqual(['Wren Hollis']);
    expect(inner('p')).toEqual(['Wren Hollis — a mapmaker &amp; guide']);
    expect(pages.find((p) => p.includes('epub:type="toc"'))).toContain('Dramatis Personae');
  });

  test('kept with the book’s matter, its title too', () => {
    const next = matterWithChanges(null, {
      projectId: 'n1',
      changes: { castList: 'Wren Hollis', castTitle: 'The Players' },
      now: 1,
      newId: () => 'm1',
    });
    expect([next['castList'], next['castTitle']]).toEqual(['Wren Hollis', 'The Players']);
  });
});

describe('the name forge', () => {
  const norse = nameFlavours.find((f) => f.key === 'norse')!;

  test('new names in the shape of the old: none learned, none twice, all sayable, the same for the same seed', () => {
    const names = forgeNames({ source: norse.people, seed: 7 });
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
    const learned = new Set(norse.people.map((n) => n.toLowerCase()));
    for (const n of names) {
      expect(learned.has(n.toLowerCase())).toBe(false);
      expect(sayable(n)).toBe(true);
      expect(n[0]).toBe(n[0].toUpperCase());
    }
    expect(forgeNames({ source: norse.people, seed: 7 })).toEqual(names);
    expect(forgeNames({ source: norse.people, seed: 8 })).not.toEqual(names);
    // As the Flutter app forges them (dart run, Flutter 3.38.9).
    expect(names).toEqual(['Njald', 'Astrik', 'Gunnbogi', 'Finnhild', 'Inar', 'Ivald', 'Rand', 'Orrim', 'Snorn', 'Thorm', 'Inarn', 'Thoralf']);
  });

  test('every tradition forges people and places; places end as the tradition’s places do', () => {
    for (const f of nameFlavours) {
      expect(forgeNames({ source: f.people, seed: 1 })).toHaveLength(12);
      const places = forgeNames({ source: f.people, seed: 1, place: true, placeEndings: f.placeEndings });
      expect(places.length).toBeGreaterThan(0);
      for (const p of places) expect(f.placeEndings.some((e) => p.toLowerCase().endsWith(e))).toBe(true);
    }
  });

  test('begins with the letters asked for, even where the tradition rarely does', () => {
    const names = forgeNames({ source: norse.people, seed: 3, start: 'K' });
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n.startsWith('K'))).toBe(true);
  });

  test('the book’s names to learn from: names, not ordinary words or small ones', () => {
    expect(learnableNames(['Wren Hollis', 'Lantern Street', 'The Drowned Road', 'Old Merrow', 'of', 'KAI', 'Jo'])).toEqual([
      'Wren',
      'Hollis',
      'Merrow',
    ]);
  });

  test('nothing to learn from, nothing forged; nothing unsayable or rude', () => {
    expect(forgeNames({ source: [] })).toEqual([]);
    expect(sayable('Strrk')).toBe(false);
    expect(sayable('Aaaron')).toBe(false);
    expect(sayable('Shitesh')).toBe(false);
    expect(sayable('Halvard')).toBe(true);
  });
});

describe('looks against the pages', () => {
  const read = (paragraphs: string[], others = ['Ilse', 'Kai']) =>
    looksIn(new Map([['c1', paragraphs]]), ['c1'], ['Wren Hollis', 'Wren'], { others });

  test('colour families: the last colour word, and colours that can be the same', () => {
    expect(colourFamily('Steel grey')).toBe('grey');
    expect(colourFamily('pale blue')).toBe('blue');
    expect(colourFamily('Raven-black')).toBe('black');
    expect(colourFamily('like her mother’s')).toBeNull();
    expect(sameColour('dark', 'black')).toBe(true);
    expect(sameColour('silver', 'white')).toBe(true);
    expect(sameColour('blue', 'brown')).toBe(false);
  });

  test('her own: by her name’s possessive, or her name the subject and “her” after it', () => {
    const seen = read([
      'Wren’s grey eyes narrowed.',
      'Wren pushed back her black hair and laughed.',
      'Then Wren closed her eyes.',
    ]);
    expect(seen.map((s) => [s.feature, s.family, s.said])).toEqual([
      ['eyes', 'grey', 'grey eyes'],
      ['hair', 'black', 'her black hair'],
    ]);
  });

  test('not hers: someone else’s eyes, a pronoun before her name, another person between', () => {
    expect(read(['She looked at Wren for a long time with eyes like wet black stones.'])).toEqual([]);
    expect(read(['Wren looked into Ilse’s blue eyes.'])).toEqual([]);
    expect(read(['Wren watched Kai push back his red hair.'])).toEqual([]);
  });

  test('a colour after the word, as in “her eyes were green”; but red eyes are tears', () => {
    const seen = read(['Wren turned, and her eyes were a hard bright green.']);
    expect(seen).toHaveLength(1);
    expect(seen[0].family).toBe('green');
    expect(read(['Wren had cried until her eyes were red.'])).toEqual([]);
  });

  const grey: LookSighting = { feature: 'eyes', family: 'grey', said: 'grey eyes', nodeId: 'c1', block: 0, sentence: '' };
  const blue: LookSighting = { feature: 'eyes', family: 'blue', said: 'blue eyes', nodeId: 'c7', block: 3, sentence: '' };
  const black: LookSighting = { feature: 'hair', family: 'black', said: 'black hair', nodeId: 'c2', block: 1, sentence: '' };

  test('the page against the profile: agreeing, at odds, and said only on the page', () => {
    const checks = checkLooks([grey, blue, black], new Map([['eyes', 'Grey']]));
    const eyes = checks.find((c) => c.feature === 'eyes')!;
    expect(eyes.verdict).toBe('differs');
    expect(eyes.family).toBe('blue');
    expect(eyes.sightings.map((s) => s.nodeId)).toEqual(['c7']);
    const hair = checks.find((c) => c.feature === 'hair')!;
    expect([hair.verdict, hair.family]).toEqual(['unrecorded', 'black']);
    const agree = checkLooks([grey], new Map([['eyes', 'storm grey']]));
    expect(agree.map((c) => c.verdict)).toEqual(['agrees']);
  });

  test('a recorded value it cannot read is left be', () => {
    expect(checkLooks([grey], new Map([['eyes', 'like her mother’s']]))).toEqual([]);
  });
});

describe('a likeness', () => {
  const of = (fields: Record<string, string>) =>
    likenessOf(new Map(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v])));

  test('hair: its colour, how it is worn, curls', () => {
    const l = of({ Hair: 'Long, curly black' });
    expect([l.hair, l.cut, l.curly]).toEqual(['black', 'long', true]);
    expect(of({ Hair: 'cropped silver' }).cut).toBe('cropped');
    const bald = of({ Hair: 'Bald' });
    expect([bald.cut, bald.hair]).toEqual(['bald', null]);
    const braids = of({ Hair: 'two auburn braids' });
    expect([braids.cut, braids.hair]).toEqual(['braid', 'red']);
    expect(of({ Hair: 'brown' }).cut).toBeNull();
  });

  test('eyes and skin; a creature’s skin by its colour; nothing said is nothing', () => {
    expect(of({ Eyes: 'Storm-grey' }).eyes).toBe('grey');
    expect(of({ Skin: 'Olive, sun-browned' }).skin).toBe('olive');
    expect(['brown', 'deep']).toContain(of({ Skin: 'deep brown' }).skin);
    const lizard = of({ Skin: 'pale green scales' });
    expect([lizard.skin, lizard.skinFamily]).toEqual([null, 'green']);
    expect(of({ Skin: 'None', Eyes: 'n/a', Hair: '-' })).toEqual(unsaid);
    expect(of({})).toEqual(unsaid);
    expect(painted(unsaid)).toBe(false);
  });

  test('marks: from the features, the clothing and the scars; "no beard" is no beard', () => {
    const l = of({
      'Distinguishing Features': 'Wire spectacles, freckles, no beard',
      Clothing: 'A hooded grey cloak and a circlet',
      Scars: 'A line through the left brow',
      Build: 'Slight',
    });
    expect([l.glasses, l.freckles, l.beard, l.hood, l.crown, l.scar, l.slight, l.broad]).toEqual([
      true, true, false, true, true, true, true, false,
    ]);
    expect(of({ 'Distinguishing Features': 'A grey moustache and an eyepatch' }).moustache).toBe(true);
    expect(of({ 'Distinguishing Features': 'An eye-patch' }).eyepatch).toBe(true);
  });

  test('written as words and read back: the same face', () => {
    const face: Likeness = {
      ...unsaid,
      hair: 'red',
      cut: 'long',
      curly: true,
      eyes: 'green',
      skin: 'olive',
      glasses: true,
      scar: true,
      freckles: true,
    };
    const w = wordsFor(face);
    expect([w.hair, w.eyes, w.skin]).toEqual(['Long, curly red', 'Green', 'Olive']);
    const back = of({ Hair: w.hair!, Eyes: w.eyes!, Skin: w.skin!, 'Distinguishing Features': w.marks.join(', ') });
    expect(back).toEqual(face);
  });

  test('a paragraph of their looks: hair and eyes from it when they have no field of their own, marks too', () => {
    const l = of({ 'Physical Appearance': 'Tall, with dark curly hair, sharp grey eyes and a thin scar.' });
    expect([l.hair, l.curly, l.eyes, l.scar]).toEqual(['dark', true, 'grey', true]);
    expect(of({ Hair: 'Red', 'Physical Appearance': 'Long black hair.' }).hair).toBe('red');
  });
});

describe('stakes', () => {
  test('each stake from whichever field answers it, the first written; Motivations when nothing says what they want', () => {
    const s = (fields: Record<string, string>) => stakesOf(new Map(Object.entries(fields)));
    expect(s({ 'what they want': 'The chart', 'initial goals': 'Other' }).get('wants')).toBe('The chart');
    expect(s({ 'what they want': '  ', 'initial goals': 'To be a master' }).get('wants')).toBe('To be a master');
    expect(s({ motivations: 'Her father' }).get('wants')).toBe('Her father');
    expect(s({ 'external conflict': 'The Wardens' }).get('inTheWay')).toBe('The Wardens');
    expect(s({ 'how they change, if they do': 'He stays' }).get('ends')).toBe('He stays');
    expect(s({ 'what they stand to lose': 'Everything' }).get('atStake')).toBe('Everything');
    expect(s({}).size).toBe(0);
    expect(askStake('wants', 'Wren')).toBe('What does Wren want?');
  });

  const who = (id: string, name: string, stakes: [Stake, string][]): StakeHolder => ({
    id,
    name,
    names: [name, name.split(' ')[0]],
    stakes: new Map(stakes),
  });

  test('where wants collide: one names the other, or stands in their way; or both want the same thing', () => {
    const cast = [
      who('w', 'Wren Hollis', [['wants', 'To finish the chart of the drowned road']]),
      who('c', 'Aldous Crane', [
        ['wants', 'That nobody ever walks the road again'],
        ['inTheWay', 'Wren and her pencil'],
      ]),
      who('s', 'Sefa Quill', [['wants', 'A chart for the guild, and a safe road to the warehouses']]),
      who('k', 'Kit Marrow', [['wants', 'To come home']]),
    ];
    const found = collisions(cast);
    expect(found[0]).toEqual({ a: 'c', b: 'w', why: 'Wren Hollis stands in Aldous Crane’s way' });
    expect(found.some((c) => new Set([c.a, c.b]).has('w') && new Set([c.a, c.b]).has('s'))).toBe(true);
    expect(found.filter((c) => c.a === 'k' || c.b === 'k')).toEqual([]);
    expect(found.filter((c) => [c.a, c.b].includes('w') && [c.a, c.b].includes('c'))).toHaveLength(1);
  });

  test('common words are not a collision; a short cast collides at most four times', () => {
    const cast = [
      who('a', 'Ann', [['wants', 'Something about their other place, and the lantern']]),
      who('b', 'Bea', [['wants', 'Something about their other place; the lanterns']]),
    ];
    expect(collisions(cast)).toEqual([{ a: 'a', b: 'b', why: 'Both want “lanterns”' }]);
    const quiet = [who('a', 'Ann', [['wants', 'They would never come back']]), who('b', 'Bea', [['wants', 'They would never come back']])];
    expect(collisions(quiet)).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => who(`${i}`, `P${i}`, [['wants', 'The crown']]));
    expect(collisions(many)).toHaveLength(4);
  });
});

