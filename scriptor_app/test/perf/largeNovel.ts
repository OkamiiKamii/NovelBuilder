// A large novel for measuring Scriptor at a realistic size: a port of flutter_app/test/helpers/large_novel.dart (its
// defaults: 10 volumes of 30 chapters of 2 scenes of 500 words, 400 characters, 300 places, 100 factions, 200 items,
// 4,000 connections, 600 relationships, 800 events, 40 plot threads and a year of writing sessions), drawn with Dart's
// Random(24) in the same order, so it is the same novel the Flutter app's performance tests read. Test content only:
// built in memory, never put in a real library.

import type { JsonMap } from '../../src/domain/json';
import { DartRandom } from '../../src/domain/characters/views/common';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';

export const largeNovelId = 'a1a1a1a1-0000-4000-8000-000000000000';

export type LargeNovelOptions = {
  volumes?: number;
  chaptersPerVolume?: number;
  scenesPerChapter?: number;
  wordsPerScene?: number;
  characters?: number;
  places?: number;
  factions?: number;
  items?: number;
  links?: number;
  relations?: number;
  events?: number;
  threads?: number;
  sessionDays?: number;
  seed?: number;
};

export function largeNovel(options: LargeNovelOptions = {}): NovelSnapshot {
  return NovelSnapshot.fromJson(largeNovelJson(options));
}

export function largeNovelJson(o: LargeNovelOptions = {}): JsonMap {
  const volumes = o.volumes ?? 10;
  const chaptersPerVolume = o.chaptersPerVolume ?? 30;
  const scenesPerChapter = o.scenesPerChapter ?? 2;
  const wordsPerScene = o.wordsPerScene ?? 500;
  const characters = o.characters ?? 400;
  const places = o.places ?? 300;
  const factions = o.factions ?? 100;
  const items = o.items ?? 200;
  const links = o.links ?? 4000;
  const relations = o.relations ?? 600;
  const events = o.events ?? 800;
  const threads = o.threads ?? 40;
  const sessionDays = o.sessionDays ?? 365;
  const random = new DartRandom(o.seed ?? 24);
  const p = largeNovelId;
  const now = 1792710000000;
  const pick = <T>(list: readonly T[]): T => list[random.nextInt(list.length)];

  const first = ['Mira', 'Kai', 'Ren', 'Tamsin', 'Oren', 'Lise', 'Bram', 'Ysolde', 'Corin', 'Ada', 'Hale', 'Nadia'];
  const last = ['Vane', 'Ashford', 'Marr', 'Quill', 'Hollow', 'Brand', 'Seward', 'Doyle', 'Rook', 'Fenn'];
  const placeWords = ['Mill', 'Ford', 'Tower', 'Gate', 'Harbour', 'Vale', 'Cross', 'Hold', 'Well', 'Reach'];
  const placeFirst = ['North', 'Glass', 'Salt', 'Iron', 'Ember', 'Grey', 'Willow', 'Stone', 'Raven', 'Amber'];
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

  const entry = (id: string, category: string, name: string): JsonMap => ({
    id,
    projectId: p,
    category,
    name,
    summary: '',
    description: '',
    image: null,
    notes: '',
    tags: [],
    fields: [],
    createdAt: now,
    updatedAt: now,
  });

  const cast = Array.from({ length: characters }, (_, i) =>
    entry(`${p}-ch${i}`, 'character', `${first[i % first.length]} ${last[Math.trunc(i / first.length) % last.length]} ${i}`),
  );
  const placeList = Array.from({ length: places }, (_, i) =>
    entry(`${p}-pl${i}`, 'location', `${placeFirst[i % placeFirst.length]} ${placeWords[Math.trunc(i / 10) % 10]} ${i}`),
  );
  const factionList = Array.from({ length: factions }, (_, i) => entry(`${p}-fa${i}`, 'faction', `The Order of ${nouns[i % nouns.length]} ${i}`));
  const itemList = Array.from({ length: items }, (_, i) => entry(`${p}-it${i}`, 'item', `The ${nouns[i % nouns.length]} of ${placeFirst[i % 10]} ${i}`));
  const entries = [...cast, ...placeList, ...factionList, ...itemList];

  const sentence = (): string => {
    const who = cast[random.nextInt(Math.min(cast.length, 60))]['name'] as string;
    return `${who.split(' ')[0]} ${pick(verbs)} by the ${pick(nouns)} ${pick(tails)}.`;
  };

  const docOf = (words: number): JsonMap => {
    const paragraphs: JsonMap[] = [];
    let count = 0;
    // Counted: each paragraph adds words, so `words` is reached long before the bound.
    for (let guard = 0; count < words && guard < 100000; guard++) {
      const text = [sentence(), sentence(), sentence(), sentence()].join(' ');
      count += text.split(' ').length;
      paragraphs.push({ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text }] });
    }
    return { type: 'doc', content: paragraphs };
  };

  const nodes: JsonMap[] = [];
  const contents: JsonMap[] = [];
  const node = (id: string, parent: string | null, kind: string, title: string, order: number, words: number): JsonMap => ({
    id,
    projectId: p,
    parentId: parent,
    kind,
    title,
    order,
    summary: '',
    notes: '',
    status: 'drafting',
    wordCount: words,
    charCount: words * 6,
    createdAt: now,
    updatedAt: now,
    mentions: [],
  });
  let chapterNumber = 0;
  for (let v = 0; v < volumes; v++) {
    const volumeId = `${p}-v${v}`;
    nodes.push(node(volumeId, null, 'volume', `Book ${v + 1}`, v, 0));
    for (let c = 0; c < chaptersPerVolume; c++) {
      chapterNumber++;
      const chapterId = `${p}-c${chapterNumber}`;
      nodes.push(node(chapterId, volumeId, 'chapter', `Chapter ${chapterNumber}`, c, 0));
      for (let s = 0; s < scenesPerChapter; s++) {
        const sceneId = `${chapterId}-s${s}`;
        const doc = docOf(wordsPerScene);
        let words = 0;
        for (const para of doc['content'] as JsonMap[]) words += ((para['content'] as JsonMap[])[0]['text'] as string).split(' ').length;
        nodes.push(node(sceneId, chapterId, 'scene', `Scene ${s + 1}`, s, words));
        contents.push({ id: sceneId, projectId: p, doc, rev: 1, savedAt: now, by: { id: 'owner', name: 'The owner' } });
      }
    }
  }
  const chapterIds = nodes.filter((n) => n['kind'] === 'chapter').map((n) => n['id'] as string);

  const linkTypes = ['allied-with', 'at-war-with', 'distrusts', 'located-in', 'owns', 'leads'];
  const loreLinks: JsonMap[] = [];
  for (let i = 0; i < links; i++) {
    const from = pick(entries)['id'] as string;
    let to = pick(entries)['id'] as string;
    if (to === from) to = entries[(entries.findIndex((e) => e['id'] === from) + 1) % entries.length]['id'] as string;
    loreLinks.push({
      id: `${p}-l${i}`,
      projectId: p,
      fromId: from,
      toId: to,
      fromType: 'entry',
      toType: 'entry',
      fromLabel: '',
      toLabel: '',
      type: pick(linkTypes),
      createdAt: now,
    });
  }

  const presets: [string, string, string, string, string, boolean][] = [
    ['friends', 'friendship', 'Friends', 'Friend', 'Friend', false],
    ['rivals', 'conflict', 'Rivals', 'Rival', 'Rival', false],
    ['parent-child', 'family', 'Parent / Child', 'Parent', 'Child', true],
    ['mentor-student', 'professional', 'Mentor / Student', 'Mentor', 'Student', true],
  ];
  const relationList: JsonMap[] = [];
  for (let i = 0; i < relations; i++) {
    const a = i % cast.length;
    const b = (a + 1 + random.nextInt(cast.length - 1)) % cast.length;
    const [preset, category, label, fromRole, toRole, directional] = pick(presets);
    const stages: JsonMap[] = [
      { id: `${p}-r${i}-s0`, startNodeId: null, preset, category, label, fromRole, toRole, directional, title: '', affinity: 'neutral', event: '', notes: '' },
    ];
    if (i % 2 === 0) {
      stages.push({
        id: `${p}-r${i}-s1`,
        startNodeId: pick(chapterIds),
        preset: 'rivals',
        category: 'conflict',
        label: 'Rivals',
        fromRole: 'Rival',
        toRole: 'Rival',
        directional: false,
        title: '',
        affinity: 'hostile',
        event: '',
        notes: '',
      });
    }
    relationList.push({ id: `${p}-r${i}`, projectId: p, fromId: cast[a]['id'], toId: cast[b]['id'], stages, createdAt: now, updatedAt: now });
  }

  const threadList: JsonMap[] = [];
  for (let i = 0; i < threads; i++) {
    threadList.push({
      id: `${p}-t${i}`,
      projectId: p,
      title: `Thread ${i + 1}: the ${nouns[i % nouns.length]}`,
      premise: '',
      category: i < 5 ? 'main' : 'subplot',
      customCategory: '',
      status: 'active',
      characterIds: [pick(cast)['id'], pick(cast)['id'], pick(cast)['id']],
      locationIds: [pick(placeList)['id']],
      targetNodeId: null,
      targetNote: '',
      beats: [],
      notes: '',
      muted: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  const eventList: JsonMap[] = [];
  for (let i = 0; i < events; i++) {
    const name = `Event ${i + 1}: ${sentence()}`;
    const locationId = pick(placeList)['id'];
    const people = [pick(cast)['id'], pick(cast)['id'], pick(cast)['id']];
    const nodeIds = [pick(chapterIds)];
    const threadIds = [pick(threadList)['id']];
    eventList.push({
      id: `${p}-e${i}`,
      projectId: p,
      name,
      description: '',
      when: { precision: 'exact', year: 1 + Math.trunc(i / 40), month: 1 + (i % 12), day: 1 + (i % 28), hour: null, minute: null },
      duration: null,
      importance: i % 10 === 0 ? 'major' : 'minor',
      locationId,
      characters: people,
      entryIds: [],
      nodeIds,
      afterId: null,
      threadIds,
      createdAt: now,
      updatedAt: now,
    });
  }

  const two = (n: number) => String(n).padStart(2, '0');
  const sessions: JsonMap[] = [];
  for (let d = 0; d < sessionDays; d++) {
    const day = new Date(Date.UTC(2025, 9, 27) + d * 86400000);
    const stamp = day.getTime() + 9 * 3600000;
    const added = 200 + random.nextInt(1800);
    sessions.push({
      id: `${p}-w${d}`,
      projectId: p,
      day: `${day.getUTCFullYear()}-${two(day.getUTCMonth() + 1)}-${two(day.getUTCDate())}`,
      startedAt: stamp,
      lastActiveAt: stamp + 3600000,
      netWords: added - 50,
      added,
      removed: 50,
      saves: 10,
    });
  }

  return {
    format: 'novel-builder/project',
    version: 4,
    exportedAt: now,
    project: {
      title: 'Large Test Novel',
      subtitle: '',
      author: 'Test Author',
      primaryGenre: 'Fantasy',
      secondaryGenres: [],
      cover: null,
      tags: ['test data'],
      synopsis: 'Generated test content for measuring the app at a realistic size.',
      status: 'drafting',
      targetWordCount: 400000,
      deadline: null,
      language: 'en',
      accent: '#b4532a',
      id: p,
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    },
    collections: {
      chapters: nodes,
      chapterContents: contents,
      loreEntries: entries,
      loreLinks,
      characterRelations: relationList,
      timelineEvents: eventList,
      plotThreads: threadList,
      writingSessions: sessions,
    },
  };
}
