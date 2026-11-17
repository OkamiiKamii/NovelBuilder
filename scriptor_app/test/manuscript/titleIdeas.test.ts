// A port of flutter_app/test/shared/domain/title_ideas_test.dart.

import { placeholderTitle, titleIdeas } from '../../src/domain/manuscript/titleIdeas';

test('stand-in titles: nothing, Untitled, a kind and a number', () => {
  for (const t of ['', 'Untitled chapter', 'Chapter 1', 'chapter 12', 'Ch. 3', 'Scene iv', 'Chapter One', 'Part 2:']) {
    expect([t, placeholderTitle(t)]).toEqual([t, true]);
  }
  for (const t of ['The Bell', 'Chapter of Ashes', 'One Last Night', '1984']) {
    expect([t, placeholderTitle(t)]).toEqual([t, false]);
  }
});

test('ideas: who is most present, the thing only this chapter has, the phrase it ends on', () => {
  const ideas = titleIdeas({
    paragraphs: [
      'Mira lit the lamp. She held the lamp over the map and the lamp shook.',
      'She could not stop it. She walked towards the Inn.',
    ],
    others: ['Mira read the map by the fire.', 'The fire burned all night. The map was gone.'],
    present: ['Mira Vance'],
  });
  expect(ideas).toEqual(['Mira Vance', 'The Lamp', 'Towards the Inn']);
});

test('never a verb, a contraction, an adjective or a name as a thing', () => {
  const ideas = titleIdeas({
    paragraphs: [
      'They had to wipe it. They had to wipe it again. The can’t was there; the can’t again.',
      'The sixth day came. The sixth hour. James waited. Then James left with the James.',
    ],
    others: [],
  });
  expect(
    ideas.filter((i) => i.includes('Wipe') || i.includes('Can') || i.includes('Sixth') || i.includes('James')),
  ).toEqual([]);
});

test('a closing phrase must name a place or a thing', () => {
  expect(titleIdeas({ paragraphs: ['He wanted to go now.'], others: [] })).toEqual([]);
  expect(titleIdeas({ paragraphs: ['They rode into the dark woods.'], others: [] })).toEqual(['Into the Dark Woods']);
  // "for" leads no title.
  expect(titleIdeas({ paragraphs: ['She sailed for Old Merrow.'], others: [] })).toEqual([]);
  expect(titleIdeas({ paragraphs: ['She came at last to Old Merrow.'], others: [] })).toEqual(['To Old Merrow']);
});
