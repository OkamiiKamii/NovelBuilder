// The cast and the chapters of flutter_app/test/helpers/large_novel.dart's large novel (its defaults: 400 characters,
// 600 scenes of 500 words), drawn with the same seeded random numbers in the same order, so the text is the same as the
// Flutter app's tests read. Only what the readings of the cast need: the characters' names and the scenes' paragraphs.

import { DartRandom } from '../../../src/domain/characters/views/common';

const p = 'a1a1a1a1-0000-4000-8000-000000000000';
const first = ['Mira', 'Kai', 'Ren', 'Tamsin', 'Oren', 'Lise', 'Bram', 'Ysolde', 'Corin', 'Ada', 'Hale', 'Nadia'];
const last = ['Vane', 'Ashford', 'Marr', 'Quill', 'Hollow', 'Brand', 'Seward', 'Doyle', 'Rook', 'Fenn'];
const verbs = ['walked', 'waited', 'listened', 'turned', 'remembered', 'laughed', 'argued', 'climbed', 'searched'];
const nouns = ['road', 'river', 'letter', 'lantern', 'door', 'bell', 'map', 'key', 'storm', 'market', 'bridge'];
const tails = [
  'without counting the miles',
  'as the light went out of the sky',
  'while the others slept',
  'before anyone could stop them',
  'and nobody answered',
  'for the third time that week',
];

export function largeNovelText(): { cast: { id: string; name: string }[]; scenes: { id: string; paragraphs: string[] }[] } {
  const random = new DartRandom(24);
  const pick = <T>(list: readonly T[]) => list[random.nextInt(list.length)];
  const cast = Array.from({ length: 400 }, (_, i) => ({
    id: `${p}-ch${i}`,
    name: `${first[i % first.length]} ${last[Math.trunc(i / first.length) % last.length]} ${i}`,
  }));
  const sentence = () => {
    const who = cast[random.nextInt(Math.min(cast.length, 60))].name;
    return `${who.split(' ')[0]} ${pick(verbs)} by the ${pick(nouns)} ${pick(tails)}.`;
  };
  const scenes: { id: string; paragraphs: string[] }[] = [];
  let chapter = 0;
  for (let v = 0; v < 10; v++) {
    for (let c = 0; c < 30; c++) {
      chapter++;
      for (let s = 0; s < 2; s++) {
        const paragraphs: string[] = [];
        let count = 0;
        while (count < 500) {
          const text = [0, 1, 2, 3].map(sentence).join(' ');
          count += text.split(' ').length;
          paragraphs.push(text);
        }
        scenes.push({ id: `${p}-c${chapter}-s${s}`, paragraphs });
      }
    }
  }
  return { cast, scenes };
}
