import '../domain/ids.dart';
import '../domain/manuscript/outline.dart';
import '../domain/manuscript/prose.dart';
import '../domain/model/entity_ref.dart';
import '../domain/plot/plot_changes.dart';
import '../domain/records/novel.dart';
import '../domain/records/story_node.dart';
import '../domain/relationships/relation_changes.dart';
import '../domain/relationships/relation_types.dart';
import '../domain/snapshot/novel_snapshot.dart';
import '../domain/timeline/event_changes.dart';
import 'novel_store.dart';
import 'sample_novel_text.dart';
import 'settings_store.dart';

const sampleNovelTitle = 'The Drowned Road';

/// Set once the first start on this device has been dealt with, whether the sample was added or not: it is never
/// added again by itself (a reader who deletes it keeps it deleted). Settings → Add the sample novel adds a copy.
const sampleNovelSetting = 'library.sampleNovel';

/// THE SAMPLE NOVEL: "The Drowned Road", fifteen chapters in three parts (about 10,000 words), with everything a
/// novel here can hold filled in, so that every part of the app has something in it from the first start: its people
/// (with roles), places, factions and things, the connections between them, relationships that change as the story
/// goes, five plot threads placed chapter by chapter, a plan for every chapter (objective, beats, point of view, who
/// is on the page) and a timeline with dates.
///
/// Built with the app's own changes (the ones the screens make), so its records have exactly the shapes the app
/// writes, then stored as one novel. Its text is stored as it was written: it logs no writing sessions, so nobody's
/// words for today or streak include it. New ids every time, so a second copy is wholly separate.
NovelSnapshot sampleNovel({required int now, String Function() createId = newId, String title = sampleNovelTitle}) {
  final projectId = createId();
  var s = NovelSnapshot(
    project: {
      ...normalizeNovelDetails({
        'title': title,
        'subtitle': 'A sample novel',
        'author': 'Novel Builder',
        'primaryGenre': 'Fantasy',
        'secondaryGenres': ['Adventure', 'Mystery'],
        'synopsis':
            'Once in a generation the sea goes out of the bay of Vell, and for a few days the old causeway to the '
            'drowned town of Old Merrow can be walked. Wren Hollis, a cartographer’s apprentice, means to finish the '
            'famous chart her master left blank thirty-one years ago, the day her brother did not come back. The '
            'Wardens say there are nine days. The water says otherwise.',
        'status': NovelStatus.revising.key,
        'targetWordCount': 12000,
        'tags': ['sample'],
        'accent': '#2b7a8c',
      }),
      'id': projectId,
      'pinned': false,
      'archived': false,
      'createdAt': now,
      'updatedAt': now,
      'lastOpenedAt': null,
    },
    collections: const {},
  );

  // ------------------------------------------------------------------------------------------- the manuscript
  final ch = <String>[];
  for (final (p, part) in samplePartTitles.indexed) {
    final volume = createNode(s, NodeKind.volume, title: part, now: now, createId: createId);
    s = volume.snapshot;
    for (final c in sampleChapters.skip(p * sampleChaptersPerPart).take(sampleChaptersPerPart)) {
      final made = createNode(
        s,
        NodeKind.chapter,
        parentId: volume.node.id,
        title: c.title,
        now: now,
        createId: createId,
      );
      final doc = textToDoc(sampleParagraphs(c.text).join('\n'));
      final m = measureDoc(doc);
      final n = ch.length;
      s = made.snapshot
          .putRow('chapterContents', {'id': made.node.id, 'projectId': projectId, 'doc': doc, 'rev': 1, 'savedAt': now})
          .putRow(
            'chapters',
            made.node.withFields({
              'summary': c.summary,
              // Where a book in revision stands: the early chapters final, the last ones still being worked on.
              'status':
                  (n < 10
                          ? NodeStatus.finalDraft
                          : n < 13
                          ? NodeStatus.revising
                          : NodeStatus.draftComplete)
                      .key,
              'wordCount': m.words,
              'charCount': m.characters,
            }).toJson(),
          );
      ch.add(made.node.id);
    }
  }

  // ------------------------------------------------------------- people, places, things, and what ties them
  final r = RelationChanges(s, now: now, createId: createId);
  String person(String name, String role, String summary, String description, {String epithet = ''}) {
    final id = r.create(name: name, roles: [role], summary: summary, epithet: epithet).id;
    r.updateEntry(id, description: description);
    return id;
  }

  String entry(String category, String name, String summary, String description, {List<String> tags = const []}) {
    final id = r.createEntry(category, name).id;
    r.updateEntry(id, summary: summary, description: description, tags: tags);
    return id;
  }

  final wren = person(
    'Wren Hollis',
    'Protagonist',
    'Apprentice cartographer, nineteen. Means to finish the chart her master left blank.',
    'Six years apprenticed to Ilse Marrow, with a pencil and a good eye. Measures twice and draws once, except when '
        'she is excited, which is often. Saw the famous chart at six and decided someone should finish it.',
    epithet: 'the apprentice',
  );
  final ilse = person(
    'Ilse Marrow',
    'Supporting',
    'Cartographer of Vell, fifty and half blind. Walked the road at the last low water and came back alone.',
    'Drew The Bay at Low Water in her nineteenth year and has never said why it stops at the third stone. Has kept '
        'her own record of every tide for thirty years.',
    epithet: 'the master',
  );
  final tobiah = person(
    'Tobiah Fenn',
    'Supporting',
    'A ferryman’s son who knows how the water moves in the bay.',
    'Broad, wind-reddened, never still. His father drowned past the harbour mouth when he was nine. Hates the sea '
        'some days and cannot stay away from it.',
  );
  final nan = person(
    'Nan Ottilie',
    'Minor',
    'Tobiah’s grandmother. Watched the last low water from the shore; remembers the old ferry song.',
    'Lives in two rooms above the Ferrymen’s hall with a cat. Makes terrible tea.',
  );
  final sefa = person(
    'Sefa Quill',
    'Supporting',
    'Chief factor of the Salt Guild in Vell. Wants a safe road to Old Merrow’s warehouses.',
    'Young for the coat, and wears it well. Does business plainly. Will turn back for the water, if not for a book.',
    epithet: 'the factor',
  );
  final crane = person(
    'Aldous Crane',
    'Antagonist',
    'Provost of the Tidewardens. Keeps the true tide tables secret.',
    'Tall, thin, very straight. Was the junior Warden on the bell thirty-one years ago. Believes fear is cheaper than '
        'walls.',
    epithet: 'the Provost',
  );
  final kit = person(
    'Kit Marrow',
    'Minor',
    'Ilse’s younger brother, lost on the road thirty-one years ago at seventeen.',
    'Faster than his sister, and always forgetting things. Counted the seven stones and worked out the bell.',
  );
  final jory = person(
    'Jory',
    'Background',
    'A hauler in Sefa’s crew. Breaks his leg in Old Merrow.',
    'Went ahead to scout the town at sundown with the twins.',
  );

  final vell = entry(
    'location',
    'Vell',
    'The harbour town on the bay, under the Wardens’ tower.',
    'Steep streets down to a long quay. Its people learn the tide bell with their letters.',
  );
  final lanternStreet = entry(
    'location',
    'Lantern Street',
    'Where Ilse Marrow’s chart shop stands, with a view of the harbour between two roofs.',
    'The famous chart hangs behind the counter. The workroom has a big table under the north window.',
  );
  final tower = entry(
    'location',
    'The Wardens’ Tower',
    'A square grey keep at the top of the town, with the tide bell in its open crown.',
    'The Provost’s room is under the bell. The true tide tables are kept there.',
  );
  final hollowLight = entry(
    'location',
    'Hollow Light',
    'The lighthouse on its spur of black rock at the east end of the bay, where the road begins.',
    'Its lamp turns slowly all night; from the road it is the bearing home.',
  );
  final road = entry(
    'location',
    'The Drowned Road',
    'The old causeway to Old Merrow, above water for a few days once in a generation.',
    'Paved with great square slabs. Seven standing stones mark it: fish, wheel, key, lock, ship, crown, bell. A deep '
        'channel by the wheel stone floods first.',
  );
  final wreck = entry(
    'location',
    'The Salt Ship',
    'An old wreck north of the road, lying around the lock stone.',
    'Its timbers are hard as stone. Inside, out of the weather, there is room for two to wait out a fog.',
  );
  final merrow = entry(
    'location',
    'Old Merrow',
    'The salt town the sea took three hundred years ago, at the end of the road.',
    'Roofless houses, a market square with a dry fountain, a church with a crypt, and the bell tower.',
  );
  final bellTower = entry(
    'location',
    'Merrow’s Bell Tower',
    'The tallest thing for five miles. Its bell was rung for help, once.',
    'Kit Marrow’s message is cut into the wall beside the bell.',
  );

  final wardens = entry(
    'faction',
    'The Tidewardens',
    'Keepers of the tide tables and the bell. They close the sands when the sea goes out.',
    'For two hundred years they have said nine days, knowing it is seven.',
  );
  final guild = entry(
    'faction',
    'The Salt Guild',
    'Merchants holding the old charter to salvage Old Merrow, for whoever can mark a safe road there.',
    'Its factors wear good blue coats.',
  );
  final ferrymen = entry(
    'faction',
    'The Ferrymen’s Company',
    'The families who work the crossings of the bay. The Fenns have been with it longest.',
    'Its hall stands by the harbour; its songs keep the oars together.',
  );

  final chart = entry(
    'item',
    'The Bay at Low Water',
    'Ilse Marrow’s famous chart of the road, blank past the third stone.',
    'Framed behind the counter on Lantern Street. People come from three cities to see it.',
    tags: ['chart'],
  );
  final notebook = entry(
    'item',
    'Ilse’s Green Notebook',
    'Field notes from the last low water, and a column of numbers written later.',
    'The numbers are thirty years of tides, measured from the shop window.',
  );
  final compass = entry(
    'item',
    'Kit’s Compass',
    'A worn brass compass Kit left on the shore the morning he went out.',
    'Ilse gives it to Wren before she goes to the tower.',
  );
  final tables = entry(
    'item',
    'The True Tide Tables',
    'The Wardens’ leather book: the sea returns between the sixth and eighth day.',
    'Kept open on the Provost’s desk under a brass weight.',
  );
  final song = entry(
    'lore',
    'The Ferry Song',
    'An old rowing song that is really the way across: the signs on the seven stones, in order.',
    'Fish to the morning, wheel to the west, key in the water and lock in the chest.',
  );

  EntityRef e(String id) => EntityRef(EntityType.entry, id);
  for (final (from, type, to) in [
    (lanternStreet, 'located-in', vell),
    (tower, 'located-in', vell),
    (hollowLight, 'located-in', vell),
    (wreck, 'located-in', road),
    (bellTower, 'located-in', merrow),
    (road, 'related', merrow),
    (crane, 'leads', wardens),
    (sefa, 'member-of', guild),
    (jory, 'member-of', guild),
    (tobiah, 'member-of', ferrymen),
    (nan, 'member-of', ferrymen),
    (wardens, 'controls', tower),
    (guild, 'considers-rival', wardens),
    (chart, 'created-by', ilse),
    (ilse, 'owns', notebook),
    (kit, 'owns', compass),
    (wardens, 'owns', tables),
    (nan, 'knows-about', song),
    (wren, 'located-in', lanternStreet),
  ]) {
    r.createConnection(from: e(from), to: e(to), type: type);
  }

  r.createRelation(ilse, wren, 'mentor-student');
  r.createRelation(ilse, kit, 'siblings');
  r.createRelation(nan, tobiah, 'relatives');
  final friends = r.createRelation(wren, tobiah, 'friends');
  r.recordChange(
    friends.id,
    nodeId: ch[7],
    changes: const StageInput(
      preset: 'romantic-interest',
      affinity: Affinity.trusting,
      event: 'A night in the wreck, waiting out the fog.',
    ),
  );
  final rivals = r.createRelation(wren, sefa, 'rivals');
  r.recordChange(
    rivals.id,
    nodeId: ch[13],
    changes: const StageInput(
      preset: 'allies',
      affinity: Affinity.friendly,
      event: 'Sefa brings the Guild’s boats to the tower.',
    ),
  );
  final enemies = r.createRelation(wren, crane, 'enemies');
  r.recordChange(
    enemies.id,
    nodeId: ch[9],
    changes: const StageInput(affinity: Affinity.hostile),
  );
  s = r.snapshot;

  // ---------------------------------------------------------------------------------- plot threads and plans
  final plot = PlotChanges(s, now: now, createId: createId);
  String thread(
    String title,
    String category,
    String premise,
    List<String> people,
    List<String> places,
    List<(int, String, String)> beats,
  ) {
    final id = plot.createThread(title);
    plot.updateThread(
      id,
      (_) => {
        'premise': premise,
        'category': category,
        'status': 'resolved',
        'characterIds': people,
        'locationIds': places,
        'targetNodeId': ch[beats.last.$1],
      },
    );
    for (final (at, role, beat) in beats) {
      plot.addBeat(id, title: beat, nodeId: ch[at], role: role);
    }
    return id;
  }

  final roadThread = thread(
    'Charting the Drowned Road',
    'main',
    'Wren finishes the chart of the road to Old Merrow before the sea comes back.',
    [wren, tobiah],
    [road, merrow],
    [
      (0, 'introduction', 'The bell rings; the road will rise'),
      (3, 'development', 'The fish stone'),
      (5, 'development', 'The wheel and the key; past the end of Ilse’s chart'),
      (6, 'development', 'The lock stone in the wreck'),
      (11, 'development', 'The ship, the crown and the bell'),
      (14, 'resolution', 'The full map, signed by three'),
    ],
  );
  final blankThread = thread(
    'What Ilse left blank',
    'subplot',
    'Why the famous chart stops at the third stone, and what became of Kit Marrow.',
    [ilse, kit, wren],
    [road, bellTower],
    [
      (1, 'introduction', 'Kit’s name in the notebook'),
      (4, 'development', 'The last date in the column is Kit’s'),
      (8, 'development', 'Ilse tells what Doran knew'),
      (11, 'intersection', 'Letters cut beside the bell'),
      (12, 'resolution', 'What Kit wrote'),
    ],
  );
  final tablesThread = thread(
    'The true tide tables',
    'subplot',
    'The Wardens say nine days of low water. The sea comes back on the seventh.',
    [crane, ilse, wren],
    [tower],
    [
      (3, 'introduction', 'Nine days, says the notice'),
      (6, 'development', 'The water in the channel is moving'),
      (8, 'development', 'Seventh day, not ninth'),
      (9, 'development', 'The Provost’s book'),
      (14, 'resolution', 'The true tables nailed to every door'),
    ],
  );
  final guildThread = thread(
    'The Guild’s salvage',
    'subplot',
    'Sefa Quill wants a safe road to Old Merrow’s warehouses, and will go without one.',
    [sefa, jory],
    [merrow],
    [
      (4, 'introduction', 'Two hundred crowns for a chart'),
      (10, 'development', 'Sefa turns back; three of hers are missing'),
      (13, 'intersection', 'The Guild’s boats come to the bell'),
      (14, 'resolution', 'A new rule in the charter'),
    ],
  );
  final heartThread = thread(
    'Wren and Tobiah',
    'subplot',
    'A ferryman’s son who will not go out on the sand, and goes.',
    [wren, tobiah],
    const [],
    [
      (2, 'introduction', 'Somebody who knows the water had better'),
      (7, 'development', 'A night in the wreck'),
      (12, 'development', 'His hand over hers'),
      (14, 'resolution', 'He takes her hand'),
    ],
  );

  final plans = <(String, List<String>, List<String>, List<String>)>[
    (
      'Show Vell and the bell; Ilse refuses to let Wren finish the chart.',
      ['The bell rings nine times nine', 'The sea draws back from the harbour', 'The blank on the famous chart'],
      [ilse],
      [kit],
    ),
    (
      'The road rises. Wren finds Kit’s name and a column of numbers she cannot read.',
      ['The road from the quay', 'A Warden: one came back', 'The notebook in the drawer', 'Ilse in the doorway'],
      [ilse],
      [kit, crane],
    ),
    (
      'Wren finds her guide, and the song that is a map.',
      ['Tobiah says no', 'Nan Ottilie sings', 'Fish, wheel, key: the stones', 'Tobiah is coming'],
      [tobiah, nan],
      [ilse],
    ),
    (
      'The Wardens close the sands. The first stone, and someone watching.',
      ['The Provost’s notice: nine days', 'A Guild coat in the crowd', 'The fish stone by lantern light'],
      [tobiah, crane],
      [sefa],
    ),
    (
      'The Guild’s offer, and Ilse’s first words about the last low water.',
      ['Sefa: two hundred crowns', 'Ilse remembers Doran', 'The last date is Kit’s'],
      [sefa, ilse],
      [kit],
    ),
    (
      'Out on the road to where Ilse’s chart ends, and one line past it.',
      ['The paved causeway', 'The wheel stone and the bend', 'The deep channel', 'The key stone; the first new line'],
      [tobiah],
      [ilse],
    ),
    (
      'The song read as a map: the lock stone, and the tower in sight. The water is wrong.',
      ['Lock in the chest', 'The stone inside the wreck', 'A bell tower', 'The channel is moving'],
      [tobiah, nan],
      const [],
    ),
    (
      'Trapped by fog; what each of them wants from the sea.',
      ['Fog like a door closing', 'Waiting in the wreck', 'Why the map', 'Morning, and the channel nearly level'],
      [tobiah],
      [ilse],
    ),
    (
      'The numbers are the real tides. Ilse gives Wren Kit’s compass.',
      ['Seventh day, not ninth', 'The Guild’s crew went out this morning', 'What Doran knew', 'Kit’s compass'],
      [ilse],
      [sefa, kit, crane],
    ),
    (
      'Wren confronts the Provost and takes the true tables.',
      ['Into the tower', 'Crane: fear is cheaper', 'Kit was seventeen', 'Wren snatches the book'],
      [crane, tobiah],
      [kit],
    ),
    (
      'Warn the Guild in time; three are already in Old Merrow.',
      ['The channel is a river', 'Sefa reads the book', 'The water, not the book', 'Three of hers are missing'],
      [sefa, tobiah],
      [jory],
    ),
    (
      'Reach Old Merrow, save Jory, and find Kit’s letters.',
      ['Past the last stones', 'The drowned town', 'Jory in the crypt', 'Letters by the bell'],
      [tobiah, jory],
      [sefa, kit],
    ),
    (
      'Kit’s message, and the sea coming back.',
      ['ILSE.', 'The bell was rung for help', 'Someone did', 'The sea is coming back'],
      [tobiah, jory],
      [kit, ilse],
    ),
    (
      'Ring the bell until someone hears it.',
      ['Up the tower', 'Ringing until her hands bleed', 'The sea comes into Old Merrow', 'Lanterns on boats'],
      [tobiah, jory, sefa],
      [ilse, nan],
    ),
    (
      'The finished chart, and what changed in Vell.',
      ['Three names on the chart', 'The true tables posted', 'Crane at the shop', 'The last verse'],
      [ilse, tobiah],
      [crane, sefa, kit, nan],
    ),
  ];
  for (final (i, (objective, beats, appear, mention)) in plans.indexed) {
    plot.updatePlan(
      ch[i],
      (stored) => {
        ...stored,
        'objective': objective,
        'beats': [
          for (final b in beats) {'id': createId(), 'text': b},
        ],
        'povIds': [wren],
        'appearIds': [wren, ...appear],
        'mentionIds': mention,
      },
    );
  }
  s = plot.snapshot;

  // ------------------------------------------------------------------------------------------- the timeline
  final time = EventChanges(s, now: now, createId: createId);
  for (final (name, description, (year, month, day), importance, place, people, chapters, threads) in [
    (
      'Kit Marrow is lost on the road',
      'The sea comes back on the seventh day of the last low water. Twelve went out; Ilse alone came back.',
      (1100, 10, 17),
      'major',
      road,
      [kit, ilse, crane],
      [1, 12],
      [blankThread, tablesThread],
    ),
    (
      'The tide bell rings',
      'Nine times nine: the sea goes out of the bay for the first time in thirty-one years.',
      (1131, 10, 12),
      'major',
      vell,
      [wren, ilse],
      [0],
      [roadThread],
    ),
    ('Wren opens Ilse’s drawer', '', (1131, 10, 12), 'minor', lanternStreet, [wren, ilse], [1], [blankThread]),
    ('Nan Ottilie sings the ferry song', '', (1131, 10, 13), 'minor', vell, [wren, tobiah, nan], [2], [heartThread]),
    (
      'The Provost closes the sands',
      'His notice gives nine days. That night, the fish stone.',
      (1131, 10, 13),
      'minor',
      hollowLight,
      [wren, tobiah, crane],
      [3],
      [tablesThread, roadThread],
    ),
    ('Sefa Quill’s offer', '', (1131, 10, 14), 'minor', lanternStreet, [wren, sefa, ilse], [4], [guildThread]),
    ('To the key stone', '', (1131, 10, 14), 'minor', road, [wren, tobiah], [5], [roadThread]),
    ('The lock stone in the wreck', '', (1131, 10, 15), 'minor', wreck, [wren, tobiah], [6], [roadThread]),
    ('Fog on the causeway', '', (1131, 10, 16), 'minor', wreck, [wren, tobiah], [7], [heartThread]),
    (
      'The Guild’s crew sets out',
      'Twelve, with sledges, on the sixth day: three days early, they think.',
      (1131, 10, 17),
      'minor',
      road,
      [sefa, jory],
      [8],
      [guildThread],
    ),
    ('Wren takes the true tables', '', (1131, 10, 17), 'major', tower, [wren, crane], [9], [tablesThread]),
    (
      'Old Merrow; Kit’s letters',
      '',
      (1131, 10, 17),
      'major',
      bellTower,
      [wren, tobiah, jory],
      [11, 12],
      [blankThread],
    ),
    (
      'The sea comes back, and the bell is rung',
      'The seventh day. Merrow’s bell is heard on the shore; the boats come.',
      (1131, 10, 18),
      'climax',
      bellTower,
      [wren, tobiah, jory, sefa, ilse, nan],
      [13],
      [roadThread, guildThread],
    ),
    (
      'The full map is printed',
      'Signed by Ilse Marrow, Wren Hollis and Kit Marrow.',
      (1132, 4, 20),
      'major',
      lanternStreet,
      [wren, ilse, tobiah],
      [14],
      [roadThread, tablesThread, heartThread],
    ),
  ]) {
    final id = time.createEvent(name);
    time.updateEvent(
      id,
      (_) => {
        'description': description,
        'importance': importance,
        'when': {'precision': 'exact', 'year': year, 'month': month, 'day': day},
        'locationId': place,
        'characters': [
          for (final p in people) {'id': p},
        ],
        'nodeIds': [for (final c in chapters) ch[c]],
        'threadIds': threads,
      },
    );
  }
  return time.snapshot;
}

/// A chapter's paragraphs as written in `sample_novel_text.dart`: separated by blank lines, each trimmed.
List<String> sampleParagraphs(String text) => [
  for (final p in text.split(RegExp(r'\n\s*\n')))
    if (p.trim().isNotEmpty) p.trim().replaceAll(RegExp(r'\s*\n\s*'), ' '),
];

/// Adds a copy of the sample novel to the library, titled [title], and returns it.
Novel addSampleNovel(NovelStore store, {required int now, String title = sampleNovelTitle}) {
  final snapshot = sampleNovel(now: now, title: title);
  store.putNovel(snapshot);
  return Novel(snapshot.project);
}

/// The first time the app starts on this device with nothing in its library, the sample novel is put on the shelf,
/// so a new reader has a whole book to look around. A library that already holds novels (an update, a restored
/// device) is left exactly as it is. Either way it happens once: [sampleNovelSetting] records it.
Novel? addSampleNovelOnFirstStart(NovelStore store, SettingsStore settings, {required int now}) {
  if (settings.read(sampleNovelSetting) != null) return null;
  final empty = store.listNovels().isEmpty;
  // Recorded first: if adding fails, the app still starts, and does not try again on every start.
  settings.write(sampleNovelSetting, empty ? 'added' : 'not added (the library had novels)');
  return empty ? addSampleNovel(store, now: now) : null;
}
