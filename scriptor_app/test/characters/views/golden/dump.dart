// The Flutter app's own outputs for the readings of the cast (views.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given: whose eyes each chapter is told through, the entrances, the
// arcs, every chapter as a table read and its voices, the people waiting for a name, the names in the manuscript,
// everyone's lines and voices, the name board, the cast checked, who is together, the temperaments and foils, and the
// orbit (its plan, the one to know next, and its sky, every number of it, at two widths and three moments of its
// rise). And `misc`: the readings on their own, over texts made to test them.
//
// What is the widgets' (the members of the cast check, the taken words of Waiting for a name, the temperaments of the
// compass, the orbit) is copied here from flutter_app/lib/features/characters/widgets, word for word but for Flutter's
// types (Offset as two doubles, Curves.easeOutCubic/easeOutBack as the Cubic Flutter defines them).
//
// To make the golden again (as for ../../golden/dump.dart):
//   dart run --packages=<that config> dump.dart views.golden.json \
//        ../../../../../flutter_app/test/fixtures/*.novel.json ../../../model/edge.novel.json \
//        ../../../../assets/sample/the-drowned-road.novel.json ../../golden/knowledge.novel.json

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:novel_builder/shared/domain/characters/cast.dart';
import 'package:novel_builder/shared/domain/characters/cast_check.dart';
import 'package:novel_builder/shared/domain/characters/cast_names.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/entrances.dart';
import 'package:novel_builder/shared/domain/characters/feeling_arcs.dart';
import 'package:novel_builder/shared/domain/characters/foils.dart';
import 'package:novel_builder/shared/domain/characters/name_finder.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/characters/pov.dart';
import 'package:novel_builder/shared/domain/characters/table_read.dart';
import 'package:novel_builder/shared/domain/characters/this_or_that.dart';
import 'package:novel_builder/shared/domain/characters/together.dart';
import 'package:novel_builder/shared/domain/characters/unnamed_roles.dart';
import 'package:novel_builder/shared/domain/characters/voice.dart';
import 'package:novel_builder/shared/domain/characters/voice_print.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';
import 'package:novel_builder/shared/domain/text/name_board.dart';

// ---------------------------------------------------------------------------------------------------- as JSON

List<Object?> pairs<K, V>(Map<K, V> m, Object? Function(V v) f) => [
  for (final e in m.entries) [e.key is Enum ? (e.key as Enum).name : '${e.key}', f(e.value)],
];

Object eyesJson(ChapterEyes e) => {
  'chapter': e.chapter,
  'nodeId': e.nodeId,
  'title': e.title,
  'words': e.words,
  'telling': e.telling.name,
  'who': e.who,
  'evidence': e.evidence,
};

Object summaryJson(EyesSummary s) => {
  'each': pairs(s.each, (v) => {'chapters': v.chapters, 'words': v.words}),
  'words': s.words,
  'longestRun': s.longestRun == null
      ? null
      : {'who': s.longestRun!.who, 'from': s.longestRun!.from, 'to': s.longestRun!.to},
  'since': pairs(s.since, (v) => v),
};

Object? placeJson(EntrancePlace? p) =>
    p == null ? null : {'chapter': p.chapter, 'nodeId': p.nodeId, 'block': p.block, 'sentence': p.sentence};

Object entrancesJson(Entrances e) => {
  'order': [
    for (final x in e.order)
      {
        'id': x.id,
        'at': placeJson(x.at),
        'gives': [for (final g in x.gives) g.name],
        'talkedOf': placeJson(x.talkedOf),
        'onStage': x.onStage,
      },
  ],
  'unseen': e.unseen,
  'perChapter': e.perChapter,
  'crowds': [
    for (final c in e.crowds) {'chapter': c.chapter, 'nodeId': c.nodeId, 'block': c.block, 'ids': c.ids},
  ],
};

Object? pointJson(ArcPoint? p) => p == null
    ? null
    : {
        'chapter': p.chapter,
        'nodeId': p.nodeId,
        'mentions': p.mentions,
        'feeling': p.feeling,
        'lines': [
          for (final l in p.lines) {'sentence': l.sentence, 'block': l.block, 'score': l.score},
        ],
      };

Object arcsJson(FeelingArcs a) => {
  'chapters': a.chapters,
  'arcs': [
    for (final c in a.arcs)
      {
        'id': c.id,
        'points': [for (final p in c.points) pointJson(p)],
        'mentions': c.mentions,
        'shape': c.shape?.name,
        'high': pointJson(c.high),
        'low': pointJson(c.low),
      },
  ],
  'thin': a.thin,
};

Object partJson(ReadPart p) => {
  'block': p.block,
  'text': p.text,
  'line': p.line,
  'speaker': p.speaker,
  'likely': p.likely,
};

Object voicesJson(Map<String, CastVoice> v) => pairs(v, (x) => {'pitch': x.pitch, 'rate': x.rate});

Object roleJson(UnnamedRole r) => {
  'role': r.role,
  'phrase': r.phrase,
  'times': r.times,
  'chapters': r.chapters,
  'chapter': r.chapter,
  'nodeId': r.nodeId,
  'block': r.block,
  'said': r.said,
};

Object spokenJson(List<Spoken> l) => [
  for (final s in l) {'nodeId': s.nodeId, 'block': s.block, 'words': s.words},
];

Object printJson(VoicePrint p) => {
  'id': p.id,
  'lines': p.lines,
  'wordsPerLine': p.wordsPerLine,
  'questions': p.questions,
  'cries': p.cries,
  'contractions': p.contractions,
  'wordLength': p.wordLength,
  'signature': p.signature,
};

Object? readingJson(VoiceReading? r) =>
    r == null ? null : {'traits': r.traits, 'soundsLike': r.soundsLike, 'alike': r.alike};

Object boardNameJson(BoardName n) => {'name': n.name, 'id': n.id, 'kind': n.kind};

Object pairingJson(Pairing p) => {
  'a': p.a,
  'b': p.b,
  'both': p.both,
  'opposed': p.opposed,
  'alike': p.alike,
  'differ': p.differ,
};

// ---------------------------------------------------------------------------------------------------- the widgets'

/// cast_photo.dart's castRank.
const _rank = {'Protagonist': 0, 'Antagonist': 1, 'Supporting': 2, 'Minor': 4, 'Background': 5};
int castRank(Listed l) =>
    l.profile.roles.isEmpty ? 3 : l.profile.roles.map((r) => _rank[r] ?? 3).reduce((a, b) => a < b ? a : b);

/// cast_orbit.dart's OrbitRing, orbitPlan and nextToKnow.
enum OrbitRing { principals, cast, minor, wings }

typedef OrbitPlan = ({List<Listed> heart, Map<OrbitRing, List<Listed>> rings});

OrbitPlan orbitPlan(List<Listed> cast, {required bool hasChapters}) {
  int bySeen(Listed a, Listed b) {
    final s = b.seenIn.length.compareTo(a.seenIn.length);
    return s != 0 ? s : a.entry.name.compareTo(b.entry.name);
  }

  final leads = [
    for (final l in cast)
      if (castRank(l) == 0) l,
  ]..sort(bySeen);
  final heart = leads.isNotEmpty ? leads.take(3).toList() : ([...cast]..sort(bySeen)).take(1).toList();
  final rings = <OrbitRing, List<Listed>>{};
  for (final l in cast) {
    if (heart.contains(l)) continue;
    final rank = castRank(l);
    final ring = hasChapters && l.seenIn.isEmpty
        ? OrbitRing.wings
        : rank <= 2
        ? OrbitRing.principals
        : rank == 3
        ? OrbitRing.cast
        : OrbitRing.minor;
    (rings[ring] ??= []).add(l);
  }
  int firstOf(Listed l) => l.first < 0 ? 1 << 30 : l.first;
  for (final people in rings.values) {
    people.sort((a, b) {
      final f = firstOf(a).compareTo(firstOf(b));
      return f != 0 ? f : a.entry.name.compareTo(b.entry.name);
    });
  }
  return (
    heart: heart,
    rings: {
      for (final r in OrbitRing.values)
        if (rings.containsKey(r)) r: rings[r]!,
    },
  );
}

Listed? nextToKnow(OrbitPlan plan, ({int known, int of}) Function(Listed l) known) {
  double part(Listed l) {
    final k = known(l);
    return k.of == 0 ? 1 : k.known / k.of;
  }

  Listed? least(Iterable<Listed> people) {
    Listed? best;
    for (final l in people) {
      final k = known(l);
      if (k.of == 0 || k.known >= k.of) continue;
      if (best == null || part(l) < part(best) || (part(l) == part(best) && l.seenIn.length > best.seenIn.length)) {
        best = l;
      }
    }
    return best;
  }

  return least([...plan.heart, ...?plan.rings[OrbitRing.principals]]) ??
      least([
        for (final r in OrbitRing.values)
          if (r != OrbitRing.principals) ...?plan.rings[r],
      ]);
}

/// Flutter's Cubic, and Curves.easeOutCubic / easeOutBack.
double Function(double) cubic(double a, double b, double c, double d) {
  double ev(double p, double q, double m) => 3 * p * (1 - m) * (1 - m) * m + 3 * q * (1 - m) * m * m + m * m * m;
  return (t) {
    if (t == 0.0 || t == 1.0) return t;
    var start = 0.0;
    var end = 1.0;
    while (true) {
      final midpoint = (start + end) / 2;
      final estimate = ev(a, c, midpoint);
      if ((t - estimate).abs() < 0.001) return ev(b, d, midpoint);
      if (estimate < t) {
        start = midpoint;
      } else {
        end = midpoint;
      }
    }
  };
}

final easeOutCubic = cubic(0.215, 0.61, 0.355, 1.0);
final easeOutBack = cubic(0.175, 0.885, 0.32, 1.275);

/// cast_card.dart's presenceOf.
({List<bool> chapters, int count}) presenceOf(Listed l, StoryOrder order) {
  final marks = List.filled(order.chapters.length, false);
  for (final id in l.seenIn) {
    final n = order.chapterNumber[id];
    if (n != null && n >= 1 && n <= marks.length) marks[n - 1] = true;
  }
  return (chapters: marks, count: marks.where((m) => m).length);
}

/// _CastOrbitState._sky's numbers, for one frame (Offsets as [x, y]).
Object orbitSky(List<Listed> found, StoryOrder order, double width, double riseValue, String? lit) {
  final chapters = order.chapters.length;
  final plan = orbitPlan(found, hasChapters: chapters > 0);
  final presence = {for (final l in found) l.entry.id: presenceOf(l, order)};
  final heartMarks = List.generate(chapters, (i) => plan.heart.any((h) => presence[h.entry.id]!.chapters[i]));
  double share(Listed l) {
    final p = presence[l.entry.id]!;
    if (p.count == 0) return 0;
    var together = 0;
    for (var i = 0; i < chapters; i++) {
      if (p.chapters[i] && heartMarks[i]) together++;
    }
    return together / p.count;
  }

  final most = presence.values.fold(0, (m, p) => math.max(m, p.count));
  final compact = width < 600;
  final height = compact ? width * 1.2 : (width * 0.56).clamp(440.0, 640.0);
  final unit = math.min(width, height);
  final big = (unit * (compact ? 0.13 : 0.15)).clamp(42.0, 84.0);
  final small = big * 0.6;
  final sun = (unit * 0.2).clamp(64.0, 112.0) * (plan.heart.length > 1 ? 0.8 : 1);
  final cx = width / 2, cy = height / 2;
  final rx0 = width / 2 - big / 2 - 14;
  final ry0 = height / 2 - big / 2 - 22;
  final rings = plan.rings.entries.toList();
  final k = rings.length;
  final inner = math.max(0.4, (sun / 2 + big / 2 + 34) / ry0).clamp(0.0, 0.8);
  double reach(int i) => k == 1 ? (inner + 1) / 2 : inner + (0.98 - inner) * i / (k - 1);
  double rise(double from) => easeOutCubic(((riseValue - from) / 0.6).clamp(0.0, 1.0));
  List<double> onRing(double theta, double rx, double ry) => [cx + rx * math.sin(theta), cy + -ry * math.cos(theta)];
  final taken = <List<double>>[
    [cx + 0, cy + (sun / 2 + 10)],
  ];
  double turn(int n, double rx, double ry) {
    final step = 2 * math.pi / n;
    var best = 0.0;
    var widest = -1.0;
    for (var c = 0; c < 36; c++) {
      final offset = step * c / 36;
      var gap = double.infinity;
      for (var j = 0; j < n; j++) {
        final p = onRing(offset + step * j, rx, ry);
        for (final t in taken) {
          final dx = p[0] - t[0], dy = p[1] - t[1];
          gap = math.min(gap, math.sqrt(dx * dx + dy * dy));
        }
      }
      if (gap > widest + 1e-6) {
        widest = gap;
        best = offset;
      }
    }
    taken.addAll([for (var j = 0; j < n; j++) onRing(best + step * j, rx, ry)]);
    return best;
  }

  final heartStep = sun * 0.62;
  final heartT = easeOutBack((riseValue / 0.45).clamp(0.0, 1.0));
  final hearts = [
    for (final (j, l) in plan.heart.indexed)
      (listed: l, at: [cx + (j - (plan.heart.length - 1) / 2) * heartStep, cy + -8], size: sun * heartT),
  ];
  final orbits = <Object>[];
  final bodies = <({Listed listed, String ring, List<double> at, double size, double share, double shown, bool named})>[];
  for (final (i, MapEntry(key: ring, value: people)) in rings.indexed) {
    final f = reach(i);
    final rx = rx0 * f;
    final ry = ry0 * f;
    final t = rise(0.12 + i * 0.1);
    orbits.add({'ring': ring.name, 'rx': rx, 'ry': ry, 'dashed': ring == OrbitRing.wings, 'shown': t});
    final n = people.length;
    final step = 2 * math.pi / n;
    final offset = turn(n, rx, ry);
    final room = n == 1 ? big : ry * step * 0.9;
    for (final (j, l) in people.indexed) {
      final theta = offset + step * j - (1 - t) * 1.1;
      final r = 0.25 + 0.75 * t;
      final count = presence[l.entry.id]!.count;
      final grown = most == 0 ? 0.6 : math.sqrt(count / most);
      final depth = 0.86 + 0.14 * (1 - math.cos(theta)) / 2;
      final size = (math.min(small + (big - small) * grown, room) * depth).clamp(8.0, big);
      bodies.add((
        listed: l,
        ring: ring.name,
        at: [cx + rx * r * math.sin(theta), cy + -ry * r * math.cos(theta)],
        size: size,
        share: share(l),
        shown: t,
        named: n <= (compact ? 8 : 12) && size >= 26,
      ));
    }
  }
  bodies.sort((a, b) => a.at[1].compareTo(b.at[1]));
  final heartAt = hearts.isEmpty
      ? [cx, cy]
      : [hearts.map((h) => h.at[0]).reduce((a, b) => a + b) / hearts.length, hearts.first.at[1]];
  final random = math.Random(7);
  final stars = [
    for (var i = 0; i < 90; i++)
      () {
        final x = random.nextDouble() * width;
        final y = random.nextDouble() * height;
        final alpha = 0.08 + random.nextDouble() * 0.22;
        final radius = 0.4 + random.nextDouble() * 1.0;
        return [x, y, alpha, radius];
      }(),
  ];
  return {
    'height': height,
    'sun': sun,
    'heartT': heartT,
    'heartAt': heartAt,
    'hearts': [
      for (final h in hearts) {'id': h.listed.entry.id, 'at': h.at, 'size': math.max(h.size, 1)},
    ],
    'orbits': orbits,
    'bodies': [
      for (final b in bodies)
        {
          'id': b.listed.entry.id,
          'ring': b.ring,
          'at': b.at,
          'size': b.size,
          'share': b.share,
          'shown': b.shown,
          'named': b.named,
        },
    ],
    'tethers': [
      for (final b in bodies)
        if (b.share > 0 || lit == b.listed.entry.id)
          () {
            final isLit = lit == b.listed.entry.id;
            final strength = isLit ? 1.0 : b.share * b.shown;
            final mid = [heartAt[0] * (1.0 - 0.5) + b.at[0] * 0.5, heartAt[1] * (1.0 - 0.5) + b.at[1] * 0.5];
            final along = [b.at[0] - heartAt[0], b.at[1] - heartAt[1]];
            return {
              'id': b.listed.entry.id,
              'bend': [mid[0] + -along[1] * 0.16, mid[1] + along[0] * 0.16],
              'width': isLit ? 2.4 : 0.8 + 1.6 * strength,
              'mix': 0.4 + 0.6 * strength,
              'alpha': 0.12 + 0.55 * strength,
            };
          }(),
    ],
    'stars': stars,
  };
}

/// cast_compass.dart's temperamentOf.
const _traitFields = ['core traits', 'traits', 'personality traits', 'personality'];
Temperament temperamentOf(Listed l) {
  final field = l.entry.fields.where((f) => _traitFields.contains(f.key.trim().toLowerCase())).firstOrNull;
  return (id: l.entry.id, sides: field == null ? const {} : sidesOf(traitsIn(field.value)));
}

// ---------------------------------------------------------------------------------------------------- reads


Map<String, Object?> reads(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final read = CharacterChanges(s, now: 0, createId: () => throw StateError('reading'));
  final entries = [...model.entries.values]..sort((a, b) => a.id.compareTo(b.id));
  final profiles = {
    for (final r in [...s.rows('characterProfiles')]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
      str(r['entryId']): CharacterProfile(r),
  };
  final links = [
    for (final l in model.links)
      if (l.isEntryLink) l,
  ]..sort((a, b) => a.id.compareTo(b.id));
  final names = namesToFind(entries, profiles);
  final stored = [for (final r in s.rows('chapterContents')) jsonEncode(r)];
  final named = namedInJob(stored, names)();
  final list = listCharacters(entries, profiles, links, model.nodes.values, model.order.position, read.fresh, named: named);

  // CastData's chaptersOf and documentIds.
  final chaptersOf = <String, Set<int>>{};
  for (final node in model.nodes.values) {
    final n = model.order.chapterNumber[node.id];
    if (n == null) continue;
    for (final id in node.mentions) {
      (chaptersOf[id] ??= {}).add(n);
    }
  }
  for (final MapEntry(key: id, value: nodes) in named.entries) {
    for (final node in nodes) {
      if (model.order.chapterNumber[node] case final n?) (chaptersOf[id] ??= {}).add(n);
    }
  }
  final documentIds = [
    for (final n in stableSorted(
      model.nodes.values.where((n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene),
      (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0),
    ))
      n.id,
  ];

  // As whose_eyes.dart, entrances_view.dart, cast_arcs.dart and table_read_view.dart read the book.
  final nodes = [
    for (final n in readingOrder(model.nodes.values))
      if (isDocumentKind(n.kind)) n,
  ];
  final order = [for (final n in nodes) n.id];
  final people = [
    for (final l in list)
      if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty) (id: l.entry.id, names: names[l.entry.id]!),
  ];
  final genders = {for (final l in list) l.entry.id: fieldNamed(l.entry, 'Gender')};
  final eyes = chapterEyesJob(stored, order, {for (final n in nodes) n.id: n.title}, people)();

  final tables = <String, Object>{};
  final voices = <String, Object>{};
  for (final n in nodes) {
    final parts = tableReadJob(stored, n.id, people, genders: genders)();
    tables[n.id] = [for (final p in parts) partJson(p)];
    final heard = <String>[];
    for (final p in parts) {
      if (p.speaker case final sp? when !heard.contains(sp)) heard.add(sp);
    }
    voices[n.id] = voicesJson(
      castVoices([for (final id in heard) (id: id, gender: genders[id] ?? '')], nudged: {if (heard.isNotEmpty) heard.first: 2}),
    );
  }

  // waiting_for_a_name.dart's taken words.
  final taken =
      <String>{
          for (final l in list) ...[
            l.profile.epithet,
            ...l.profile.aliases,
            fieldNamed(l.entry, 'Occupation'),
            fieldNamed(l.entry, 'Job'),
            fieldNamed(l.entry, 'Profession'),
          ],
        }.where((t) => t.trim().isNotEmpty).map((t) => t.trim().toLowerCase()).toSet()
        ..addAll({
          for (final l in list)
            for (final w in RegExp(r'[a-z]+').allMatches('${l.entry.summary} ${l.profile.epithet}'.toLowerCase()))
              if (roleWords.contains(w[0])) w[0]!,
        });
  final unnamed = unnamedRolesJob(stored, order, taken: taken)();

  final manuscript = manuscriptNames(
    [
      for (final row in s.rows('chapterContents'))
        if (model.order.chapterNumber[str(row['id'])] case final number?) (number, blockTexts(row['doc'])),
    ],
    known: knownWords([
      for (final e in entries) e.name,
      for (final p in profiles.values) ...[...p.aliases, p.epithet],
    ]),
    limit: 40,
  );

  final pages = {
    for (final r in s.rows('chapterContents'))
      if (documentIds.contains(str(r['id']))) str(r['id']): blockTexts(r['doc']),
  };
  final speakers = {
    for (final l in list)
      if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty) l.entry.id: names[l.entry.id]!,
  };
  final spoken = {for (final MapEntry(:key, :value) in speakers.entries) key: spokenBy(pages, documentIds, value)};
  final each = spokenByEach(pages, documentIds, speakers, limit: 400);
  final prints = voicePrintsJob(stored, documentIds, speakers)();
  final entryNames = {for (final e in entries) e.id: e.name.trim()};

  final boardNames = [
    for (final e in model.entries.values)
      if (e.name.trim().isNotEmpty) (name: e.name.trim(), id: e.id, kind: e.category),
  ];
  final board = byLetter(boardNames);

  // cast_check.dart's members.
  final ties = <String, int>{};
  for (final r in s.rows('characterRelations').map(CharacterRelation.new)) {
    ties[r.fromId] = (ties[r.fromId] ?? 0) + 1;
    ties[r.toId] = (ties[r.toId] ?? 0) + 1;
  }
  bool gone(Listed l) =>
      RegExp(r'\b(dead|deceased|late|killed|fallen|departed)\b').hasMatch(l.profile.status.toLowerCase());
  final members = <CastMember>[
    for (final l in list)
      if (!l.profile.archived)
        (
          id: l.entry.id,
          name: l.entry.name.trim().isEmpty ? 'Someone unnamed' : l.entry.name.trim(),
          roles: l.profile.roles,
          chapters: chaptersOf[l.entry.id] ?? const {},
          ties: ties[l.entry.id] ?? 0,
          gone: gone(l),
        ),
  ];
  final related = {
    for (final r in s.rows('characterRelations').map(CharacterRelation.new)) pairKey(r.fromId, r.toId),
  };
  final temperaments = [
    for (final l in list)
      if (!l.profile.archived) temperamentOf(l),
  ];
  final answered = [
    for (final t in temperaments)
      if (t.sides.isNotEmpty) t,
  ];
  final foils = foilsOf(answered);
  final (sx, sy) = spreadAxes(answered);

  final plan = orbitPlan(list, hasChapters: model.order.chapters.isNotEmpty);
  // A stand-in for how well each is known: the fields they have, of six.
  ({int known, int of}) known(Listed l) => (known: math.min(l.entry.fields.length, 6), of: 6);
  final next = nextToKnow(plan, known);

  return {
    'people': [for (final p in people) [p.id, p.names]],
    'eyes': [for (final e in eyes) eyesJson(e)],
    'eyesSummary': summaryJson(eyesSummary(eyes)),
    'entrances': entrancesJson(entrancesJob(stored, order, people)()),
    'arcs': arcsJson(feelingArcsJob(stored, order, people)()),
    'tables': tables,
    'voices': voices,
    'taken': taken.toList(),
    'unnamed': [for (final r in unnamed) roleJson(r)],
    'manuscript': [
      for (final n in manuscript) {'name': n.name, 'times': n.times, 'chapters': n.chapters, 'first': n.first},
    ],
    'spoken': pairs(spoken, spokenJson),
    'spokenEach': pairs(each, spokenJson),
    'spokenJob': {
      for (final MapEntry(:key, :value) in speakers.entries) key: spokenJson(spokenJob(stored, documentIds, value)()),
    },
    'prints': [for (final p in prints) printJson(p)],
    'readVoice': {for (final p in prints) p.id: readingJson(readVoice(p.id, prints, entryNames))},
    'board': pairs(board, (v) => [for (final n in v) boardNameJson(n)]),
    'lookAlikes': [
      for (final a in lookAlikes(boardNames))
        {
          'wordA': a.wordA,
          'wordB': a.wordB,
          'inA': [for (final n in a.inA) n.id],
          'inB': [for (final n in a.inB) n.id],
          'why': a.why,
        },
    ],
    'free': freeLetters(board),
    'castCheck': [
      for (final n in castCheck(members, chapters: model.order.chapters.length, most: 40))
        {'kind': n.kind.name, 'who': n.who, 'says': n.says},
    ],
    'together': pairs(chaptersTogether(list, model.order), (v) => v),
    'untied': [
      for (final t in untiedTogether(list, model.order, related: related)) {'a': t.a, 'b': t.b, 'chapters': t.chapters},
    ],
    'temperaments': [
      for (final t in temperaments) [t.id, pairs(t.sides, (v) => v)],
    ],
    'foils': {
      'foils': [for (final p in foils.foils) pairingJson(p)],
      'twins': [for (final p in foils.twins) pairingJson(p)],
      'shared': [
        for (final x in foils.shared) {'axis': x.axis, 'side': x.side, 'count': x.count},
      ],
      'spread': [sx, sy],
    },
    'orbit': {
      'heart': [for (final l in plan.heart) l.entry.id],
      'rings': pairs(plan.rings, (v) => [for (final l in v) l.entry.id]),
      'next': next?.entry.id,
      'skies': {
        for (final width in [390.0, 900.0])
          for (final rise in [0.0, 0.5, 1.0])
            '$width@$rise': rounded(orbitSky(list, model.order, width, rise, list.isEmpty ? null : list.last.entry.id)),
      },
    },
  };
}

bool isDocumentKind(NodeKind? k) => k == NodeKind.chapter || k == NodeKind.scene;

// ---------------------------------------------------------------------------------------------------- misc

Map<String, Object?> misc() {
  const cast = <EyesPerson>[
    (id: 'wren', names: ['Wren Hollis', 'Wren']),
    (id: 'kai', names: ['Kai']),
    (id: 'mj', names: ['Mary-Jane']),
    (id: 'ren', names: ['Ren Vane', 'Ren']),
    (id: 'short', names: ['W']),
    (id: 'droid', names: ['3PO']),
    (id: 'zoe', names: ['Zoë']),
    (id: 'obrien', names: ['O’Brien']),
    (id: 'king1', names: ['the King']),
    (id: 'king2', names: ['the King']),
  ];
  const hard = [
    '“We cross at dawn,” said Wren Hollis. Wren looked at the water; a wren sang on the rail.',
    'Kai whispered: “Not before the tide.” Kai2 laughed. Mikai said nothing.',
    '“Is it far?” asked Mary-Jane. “Far enough,” Wren said. Wren and Kai went on.',
    'Nobody spoke.',
    '',
    'Ren Vane said, “Rank one is D tier.” Ren said nothing more.',
    'Kade Ash came. Kade’s bow, Kaden’s too, and kade. Zoë and Zoëy; O’Brien. the King spoke to 3PO and Mary-Jane, not Mary-Janet. “ 3PO R3PO',
    'I made it to the tower. My hands were raw, and I did not look back. Wren knew. Wren could see. Ren could run.',
    '“You’re late,” she said. Kai shook the water from his coat. “The road was out.” “Which road?” “The low one.”',
    'The waitress came over. The old guard slept; the guard’s dog barked. A Warden smiled. The guards marched. The waitress left.',
  ];
  final names = CastNames(cast);
  final pages = {'h1': hard};
  final hardNames = {for (final p in cast) p.id: p.names};
  return {
    'castNames': [
      for (final t in hard)
        [
          for (final h in names.all(t)) [h.start, h.end, h.id, h.name],
        ],
    ],
    'standingAt': [
      standingAt('“ 3PO R3PO', '3PO'),
      standingAt('Kai said. Mikai said. Kai2.', 'Kai'),
      standingAt('Ölaf and Olaf, Olafsson', 'Olaf'),
      standingAt('anything', ''),
      standingAt('𝒜lan Alan', 'Alan'),
    ],
    'spoken': {for (final MapEntry(:key, :value) in hardNames.entries) key: spokenJson(spokenBy(pages, ['h1'], value))},
    'spokenEach': {
      for (final limit in [1, 2, 60]) '$limit': pairs(spokenByEach(pages, ['h1'], hardNames, limit: limit), spokenJson),
    },
    'eyes': [
      for (final e in chapterEyes([(id: 'h1', title: 'Ferry', paragraphs: hard)], cast)) eyesJson(e),
    ],
    'entrances': entrancesJson(
      entrancesIn([
        (id: 'h1', blocks: [for (final t in hard) (heading: false, text: t)]),
      ], cast),
    ),
    'arcs': arcsJson(
      feelingArcs([
        for (final (i, t) in hard.indexed) (id: 'c$i', blocks: [(heading: false, text: t)]),
      ], cast),
    ),
    'table': [
      for (final p in tableRead([for (final t in hard) (heading: false, text: t)], cast, genders: {'kai': 'Male'}))
        partJson(p),
    ],
    'unnamed': [
      for (final r in unnamedRoles([(id: 'h1', paragraphs: hard), (id: 'h2', paragraphs: hard.reversed.toList())]))
        roleJson(r),
    ],
    'manuscript': [
      for (final n in manuscriptNames([(1, hard), (2, hard)]))
        {'name': n.name, 'times': n.times, 'chapters': n.chapters, 'first': n.first},
    ],
    'shapes': [
      for (final f in [
        [-0.5, -0.4, 0.0, 0.3, 0.5],
        [0.5, 0.3, 0.0, -0.3, -0.5],
        [-0.4, 0.0, 0.5, 0.5, 0.0, -0.4],
        [0.1, 0.12, 0.08, 0.1],
        [0.4, 0.4, -0.3, 0.4],
        [0.2, -0.1, 0.3, -0.2, 0.25, -0.15, 0.1],
        [0.3, 0.1, -0.2, -0.3, -0.1, 0.2, 0.3, 0.33],
      ])
        shapeOf(f)?.name,
    ],
    'voices': voicesJson(
      castVoices(
        [
          (id: 'mark', gender: 'Male'),
          (id: 'kai', gender: 'male'),
          (id: 'wren', gender: 'Female'),
          (id: 'sefa', gender: ''),
          (id: 'tam', gender: 'boy'),
          (id: 'ada', gender: 'girl'),
          (id: 'x', gender: 'm'),
        ],
        nudged: {'mark': 2, 'sefa': -20, 'ada': 7},
      ),
    ),
    'voiceWords': [
      for (final p in [0.6, 0.79, 0.8, 0.96, 0.97, 1.1, 1.11, 1.29, 1.3, 1.6]) voiceWord((pitch: p, rate: 1.0)),
    ],
    'random': [
      for (final seed in [0, 1, 7, 24, -3, 123456789])
        () {
          final r = math.Random(seed);
          return [for (var i = 0; i < 4; i++) r.nextDouble()];
        }(),
    ],
    'nextInt': () {
      final r = math.Random(24);
      return [for (var i = 0; i < 40; i++) r.nextInt([60, 9, 11, 6, 2, 64, 1000, 3, 1 << 31, 4294967296][i % 10])];
    }(),
    'easing': [
      for (final t in [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) [easeOutCubic(t), easeOutBack(t)],
    ],
    'board': [
      for (final s in ['The Drowned Road', 'Wren Hollis', 'A Salt Ship', 'Élodie', 'the', '9 Lives', '', 'ßeta', 'An'])
        initialOf(s),
    ],
    'nameWords': [nameWords('The Wardens’ Tower'), nameWords('Kit of the Quay'), nameWords('al-Rashid'), nameWords('Ilse’s Ö-Marrow')],
    'foils': () {
      const traits = {
        'mark': 'Rational\nBold\nHonest\nCommanding\nLoud',
        'kai': 'Emotional, Cautious, Deceitful, Commanding, Quiet',
        'wren': 'Heart\nCautious\nHonest\nA night owl',
        'ilse': 'Rational\nCautious\nHonest\nDeferential\nQuiet\nTrusting',
        'nan': 'Rational\nCautious\nHonest\nCommanding\nQuiet\nTrusting',
        'tam': 'Honest\nTalkative\nGenerous',
        'jory': 'Honest, Quiet, Bold, Bold, Loud',
        'sefa': 'Nothing on the deck',
      };
      final cast = [for (final MapEntry(:key, :value) in traits.entries) (id: key, sides: sidesOf(traitsIn(value)))];
      final read = foilsOf(cast);
      final (x, y) = spreadAxes(cast);
      return {
        'sides': [for (final t in cast) [t.id, pairs(t.sides, (v) => v)]],
        'foils': [for (final p in read.foils) pairingJson(p)],
        'twins': [for (final p in read.twins) pairingJson(p)],
        'shared': [for (final s in read.shared) {'axis': s.axis, 'side': s.side, 'count': s.count}],
        'spread': [x, y],
        'spreadFew': () {
          final (a, b) = spreadAxes(cast.take(2).toList());
          return [a, b];
        }(),
      };
    }(),
    'castCheck': [
      for (final n in castCheck([
        for (final (i, name) in ['Wren', 'Ilse', 'Crane', 'Nan', 'Kit', 'Jory', 'Doran', 'Tam', 'Bram', 'Ada'].indexed)
          (
            id: name.toLowerCase(),
            name: name,
            roles: [
              ['Protagonist'],
              ['Supporting'],
              [' antagonist '],
              <String>[],
              ['Mentor'],
              <String>[],
              <String>[],
              ['Love interest'],
              <String>[],
              ['Minor'],
            ][i],
            chapters: {
              ...[
                [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                [2, 9],
                <int>[],
                [3, 5, 8],
                [1, 2, 3],
                [4, 6, 7],
                [4, 6, 7],
                [9, 1, 12],
                [5],
                [11],
              ][i],
            },
            ties: i % 3 == 0 ? 0 : 1,
            gone: i == 4,
          ),
      ], chapters: 12, most: 40))
        {'kind': n.kind.name, 'who': n.who, 'says': n.says},
    ],
  };
}

// ---------------------------------------------------------------------------------------------------- hashing

/// As ../../golden/dump.dart hashes: canonical JSON (keys sorted, whole numbers without a fraction), FNV-1a over
/// UTF-16 code units.
String canonical(Object? v) {
  if (v == null) return 'null';
  if (v is bool) return '$v';
  if (v is num) {
    if (v.isFinite && v == v.truncateToDouble() && v.abs() < 9007199254740992) return '${v.toInt()}';
    return '$v';
  }
  if (v is String) return '"${v.replaceAllMapped(RegExp(r'["\\]'), (m) => '\\${m[0]}')}"';
  if (v is List) return '[${v.map(canonical).join(',')}]';
  if (v is Map) {
    final keys = [for (final k in v.keys) '$k']..sort();
    return '{${keys.map((k) => '${canonical(k)}:${canonical(v[k])}').join(',')}}';
  }
  return canonical('$v');
}

String hashOf(Object? v) {
  var h = 0x811c9dc5;
  for (final c in canonical(v).codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

/// With FULL set in the environment, the reads are written whole (to compare with VIEWS_DART); else as hashes.
void main(List<String> args) {
  final full = Platform.environment.containsKey('FULL');
  final out = <String, Object?>{'misc': misc()};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final r = reads(s);
    out[name] = full ? r : {for (final MapEntry(:key, :value) in r.entries) key: hashOf(value)};
  }
  File(args.first).writeAsStringSync(jsonEncode(out));
}

/// The orbit's numbers to nine places: its sines and cosines are the platform's (the Dart VM calls the C library's,
/// JavaScript its own), which can differ in the last place.
Object? rounded(Object? v) => switch (v) {
  double d when d.isFinite => double.parse(d.toStringAsPrecision(9)),
  List l => [for (final x in l) rounded(x)],
  Map m => {for (final MapEntry(:key, :value) in m.entries) key: rounded(value)},
  _ => v,
};
