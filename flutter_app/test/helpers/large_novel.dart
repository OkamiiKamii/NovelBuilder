import 'dart:math';

import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

/// A large novel for measuring the app at a realistic size: volumes, chapters and scenes with prose, characters,
/// places, factions and items, connections, relationships, events, plot threads and a year of writing sessions, in
/// the record shapes the original app writes. Deterministic, built in memory, and test content only: it never goes
/// into a real library. Uses no files, so device tests can build it too.
NovelSnapshot largeNovel({
  int volumes = 10,
  int chaptersPerVolume = 30,
  int scenesPerChapter = 2,
  int wordsPerScene = 500,
  int characters = 400,
  int places = 300,
  int factions = 100,
  int items = 200,
  int links = 4000,
  int relations = 600,
  int events = 800,
  int threads = 40,
  int sessionDays = 365,
  int seed = 24,
}) => NovelSnapshot.fromJson(
  largeNovelJson(
    volumes: volumes,
    chaptersPerVolume: chaptersPerVolume,
    scenesPerChapter: scenesPerChapter,
    wordsPerScene: wordsPerScene,
    characters: characters,
    places: places,
    factions: factions,
    items: items,
    links: links,
    relations: relations,
    events: events,
    threads: threads,
    sessionDays: sessionDays,
    seed: seed,
  ),
);

const largeNovelId = 'a1a1a1a1-0000-4000-8000-000000000000';

JsonMap largeNovelJson({
  required int volumes,
  required int chaptersPerVolume,
  required int scenesPerChapter,
  required int wordsPerScene,
  required int characters,
  required int places,
  required int factions,
  required int items,
  required int links,
  required int relations,
  required int events,
  required int threads,
  required int sessionDays,
  required int seed,
}) {
  final random = Random(seed);
  const p = largeNovelId;
  const now = 1792710000000;
  T pick<T>(List<T> list) => list[random.nextInt(list.length)];

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

  JsonMap entry(String id, String category, String name) => {
    'id': id,
    'projectId': p,
    'category': category,
    'name': name,
    'summary': '',
    'description': '',
    'image': null,
    'notes': '',
    'tags': <Object?>[],
    'fields': <Object?>[],
    'createdAt': now,
    'updatedAt': now,
  };

  final cast = [
    for (var i = 0; i < characters; i++)
      entry('$p-ch$i', 'character', '${first[i % first.length]} ${last[(i ~/ first.length) % last.length]} $i'),
  ];
  final placeList = [
    for (var i = 0; i < places; i++)
      entry('$p-pl$i', 'location', '${placeFirst[i % placeFirst.length]} ${placeWords[(i ~/ 10) % 10]} $i'),
  ];
  final factionList = [
    for (var i = 0; i < factions; i++) entry('$p-fa$i', 'faction', 'The Order of ${nouns[i % nouns.length]} $i'),
  ];
  final itemList = [
    for (var i = 0; i < items; i++)
      entry('$p-it$i', 'item', 'The ${nouns[i % nouns.length]} of ${placeFirst[i % 10]} $i'),
  ];
  final entries = [...cast, ...placeList, ...factionList, ...itemList];

  String sentence() {
    final who = cast[random.nextInt(min(cast.length, 60))]['name']! as String;
    return '${who.split(' ').first} ${pick(verbs)} by the ${pick(nouns)} ${pick(tails)}.';
  }

  JsonMap docOf(int words) {
    final paragraphs = <JsonMap>[];
    var count = 0;
    while (count < words) {
      final text = [for (var s = 0; s < 4; s++) sentence()].join(' ');
      count += text.split(' ').length;
      paragraphs.add({
        'type': 'paragraph',
        'attrs': {'textAlign': null},
        'content': [
          {'type': 'text', 'text': text},
        ],
      });
    }
    return {'type': 'doc', 'content': paragraphs};
  }

  final nodes = <JsonMap>[];
  final contents = <JsonMap>[];
  JsonMap node(String id, String? parent, String kind, String title, int order, int words) => {
    'id': id,
    'projectId': p,
    'parentId': parent,
    'kind': kind,
    'title': title,
    'order': order,
    'summary': '',
    'notes': '',
    'status': 'drafting',
    'wordCount': words,
    'charCount': words * 6,
    'createdAt': now,
    'updatedAt': now,
    'mentions': <Object?>[],
  };
  var chapterNumber = 0;
  for (var v = 0; v < volumes; v++) {
    final volumeId = '$p-v$v';
    nodes.add(node(volumeId, null, 'volume', 'Book ${v + 1}', v, 0));
    for (var c = 0; c < chaptersPerVolume; c++) {
      chapterNumber++;
      final chapterId = '$p-c$chapterNumber';
      nodes.add(node(chapterId, volumeId, 'chapter', 'Chapter $chapterNumber', c, 0));
      for (var s = 0; s < scenesPerChapter; s++) {
        final sceneId = '$chapterId-s$s';
        final doc = docOf(wordsPerScene);
        var words = 0;
        for (final para in maps(doc['content'])) {
          words += (maps(para['content']).first['text']! as String).split(' ').length;
        }
        nodes.add(node(sceneId, chapterId, 'scene', 'Scene ${s + 1}', s, words));
        contents.add({
          'id': sceneId,
          'projectId': p,
          'doc': doc,
          'rev': 1,
          'savedAt': now,
          'by': {'id': 'owner', 'name': 'The owner'},
        });
      }
    }
  }
  final chapterIds = [
    for (final n in nodes)
      if (n['kind'] == 'chapter') n['id']! as String,
  ];

  const linkTypes = ['allied-with', 'at-war-with', 'distrusts', 'located-in', 'owns', 'leads'];
  final loreLinks = [
    for (var i = 0; i < links; i++)
      () {
        final from = pick(entries)['id']! as String;
        var to = pick(entries)['id']! as String;
        if (to == from) {
          to = entries[(entries.indexWhere((e) => e['id'] == from) + 1) % entries.length]['id']! as String;
        }
        return <String, Object?>{
          'id': '$p-l$i',
          'projectId': p,
          'fromId': from,
          'toId': to,
          'fromType': 'entry',
          'toType': 'entry',
          'fromLabel': '',
          'toLabel': '',
          'type': pick(linkTypes),
          'createdAt': now,
        };
      }(),
  ];

  const presets = [
    ('friends', 'friendship', 'Friends', 'Friend', 'Friend', false),
    ('rivals', 'conflict', 'Rivals', 'Rival', 'Rival', false),
    ('parent-child', 'family', 'Parent / Child', 'Parent', 'Child', true),
    ('mentor-student', 'professional', 'Mentor / Student', 'Mentor', 'Student', true),
  ];
  final relationList = [
    for (var i = 0; i < relations; i++)
      () {
        final a = i % cast.length;
        final b = (a + 1 + random.nextInt(cast.length - 1)) % cast.length;
        final (preset, category, label, fromRole, toRole, directional) = pick(presets);
        return <String, Object?>{
          'id': '$p-r$i',
          'projectId': p,
          'fromId': cast[a]['id'],
          'toId': cast[b]['id'],
          'stages': [
            {
              'id': '$p-r$i-s0',
              'startNodeId': null,
              'preset': preset,
              'category': category,
              'label': label,
              'fromRole': fromRole,
              'toRole': toRole,
              'directional': directional,
              'title': '',
              'affinity': 'neutral',
              'event': '',
              'notes': '',
            },
            if (i.isEven)
              {
                'id': '$p-r$i-s1',
                'startNodeId': pick(chapterIds),
                'preset': 'rivals',
                'category': 'conflict',
                'label': 'Rivals',
                'fromRole': 'Rival',
                'toRole': 'Rival',
                'directional': false,
                'title': '',
                'affinity': 'hostile',
                'event': '',
                'notes': '',
              },
          ],
          'createdAt': now,
          'updatedAt': now,
        };
      }(),
  ];

  final threadList = [
    for (var i = 0; i < threads; i++)
      {
        'id': '$p-t$i',
        'projectId': p,
        'title': 'Thread ${i + 1}: the ${nouns[i % nouns.length]}',
        'premise': '',
        'category': i < 5 ? 'main' : 'subplot',
        'customCategory': '',
        'status': 'active',
        'characterIds': [for (var k = 0; k < 3; k++) pick(cast)['id']],
        'locationIds': [pick(placeList)['id']],
        'targetNodeId': null,
        'targetNote': '',
        'beats': <Object?>[],
        'notes': '',
        'muted': false,
        'createdAt': now,
        'updatedAt': now,
      },
  ];

  final eventList = [
    for (var i = 0; i < events; i++)
      {
        'id': '$p-e$i',
        'projectId': p,
        'name': 'Event ${i + 1}: ${sentence()}',
        'description': '',
        'when': {
          'precision': 'exact',
          'year': 1 + i ~/ 40,
          'month': 1 + (i % 12),
          'day': 1 + (i % 28),
          'hour': null,
          'minute': null,
        },
        'duration': null,
        'importance': i % 10 == 0 ? 'major' : 'minor',
        'locationId': pick(placeList)['id'],
        'characters': [for (var k = 0; k < 3; k++) pick(cast)['id']],
        'entryIds': <Object?>[],
        'nodeIds': [pick(chapterIds)],
        'afterId': null,
        'threadIds': [pick(threadList)['id']],
        'createdAt': now,
        'updatedAt': now,
      },
  ];

  final sessions = [
    for (var d = 0; d < sessionDays; d++)
      () {
        final day = DateTime.utc(2025, 10, 27).add(Duration(days: d));
        final stamp = day.millisecondsSinceEpoch + 9 * 3600000;
        final added = 200 + random.nextInt(1800);
        String two(int n) => n.toString().padLeft(2, '0');
        return <String, Object?>{
          'id': '$p-w$d',
          'projectId': p,
          'day': '${day.year}-${two(day.month)}-${two(day.day)}',
          'startedAt': stamp,
          'lastActiveAt': stamp + 3600000,
          'netWords': added - 50,
          'added': added,
          'removed': 50,
          'saves': 10,
        };
      }(),
  ];

  return {
    'format': 'novel-builder/project',
    'version': 4,
    'exportedAt': now,
    'project': {
      'title': 'Large Test Novel',
      'subtitle': '',
      'author': 'Test Author',
      'primaryGenre': 'Fantasy',
      'secondaryGenres': <Object?>[],
      'cover': null,
      'tags': ['test data'],
      'synopsis': 'Generated test content for measuring the app at a realistic size.',
      'status': 'drafting',
      'targetWordCount': 400000,
      'deadline': null,
      'language': 'en',
      'accent': '#b4532a',
      'id': p,
      'pinned': false,
      'archived': false,
      'createdAt': now,
      'updatedAt': now,
      'lastOpenedAt': now,
    },
    'collections': {
      'chapters': nodes,
      'chapterContents': contents,
      'loreEntries': entries,
      'loreLinks': loreLinks,
      'characterRelations': relationList,
      'timelineEvents': eventList,
      'plotThreads': threadList,
      'writingSessions': sessions,
    },
  };
}
