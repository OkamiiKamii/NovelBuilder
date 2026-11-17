// The Flutter app's own outputs for the character writing aids (aids.golden.json pins them; outputs.ts makes
// Scriptor's, keyed the same way). For every novel given: the interview each character would be asked, how well they
// are known, their cameo (the look, and what the seed chooses), the words of their likeness, their journal prompts,
// where a scene with them goes and its sparks, the this-or-that deck read from their traits, the empty chairs round
// each, their looks on the page checked against the profile, their card; the cast list for the book every way, the
// cast photograph, the name forge (the book's own names, every tradition); and changes made (the traits, the face, a
// look, the playbill, a scene written in), each a hash of the novel after it. The order of appearance and the lines
// each says (entrances.dart and voice.dart, ported elsewhere) are given whole as `inputs`, for Scriptor to read from.
//
// To make the golden again (as for ../../golden/dump.dart):
//   1. A package config like flutter_app/.dart_tool/package_config.json, with `flutter` pointing at a stand-in package
//      whose lib/foundation.dart is `export 'package:meta/meta.dart' show immutable;` and `novel_builder` at
//      flutter_app. Keep it outside both apps.
//   2. dart run --packages=<that config> dump.dart aids.golden.json \
//        ../../../../../flutter_app/test/fixtures/*.novel.json ../../../model/edge.novel.json \
//        ../../../../assets/sample/the-drowned-road.novel.json ../../golden/knowledge.novel.json aids.novel.json
// With FULL=<file> set, the reads are written there whole, to compare with outputs.ts's (AIDS_DUMP).
//
// The functions of the widget files (interview.dart, cameo.dart, cast_photo.dart, playbill.dart, journal_page.dart,
// write_them_in_page.dart, dramatis_page.dart, character_card_share.dart) import Flutter, so what they work out is
// copied here, as it is there.

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:novel_builder/shared/domain/characters/cast.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/dramatis.dart';
import 'package:novel_builder/shared/domain/characters/empty_chairs.dart';
import 'package:novel_builder/shared/domain/characters/entrances.dart';
import 'package:novel_builder/shared/domain/characters/glance.dart';
import 'package:novel_builder/shared/domain/characters/journal.dart';
import 'package:novel_builder/shared/domain/characters/likeness.dart';
import 'package:novel_builder/shared/domain/characters/looks.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:novel_builder/shared/domain/characters/stakes.dart';
import 'package:novel_builder/shared/domain/characters/templates.dart';
import 'package:novel_builder/shared/domain/characters/this_or_that.dart';
import 'package:novel_builder/shared/domain/characters/voice.dart';
import 'package:novel_builder/shared/domain/characters/write_them_in.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' as outline;
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/plot/plot_changes.dart';
import 'package:novel_builder/shared/domain/records/category.dart' show FieldType;
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/relationships/relation_changes.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';
import 'package:novel_builder/shared/domain/text/name_forge.dart';

// ---------------------------------------------------------------------------------------------------- hashing

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

Object? collectionsOf(NovelSnapshot s) => {
  for (final MapEntry(:key, :value) in s.collections.entries)
    if (value.isNotEmpty) key: value,
};

// ---------------------------------------------------------------------------------------------------- feature code

/// interview.dart, as it is there.
typedef InterviewQuestion = ({String ask, String? hint, List<String> fields});

const interviewQuestions = <InterviewQuestion>[
  (ask: 'What does {name} want more than anything?', hint: null, fields: ['What they want', 'Initial Goals', 'Motivations']),
  (ask: 'What is {name} afraid of?', hint: 'A few words, separated by commas', fields: ['Fears']),
  (ask: 'What stands in {name}’s way?', hint: null, fields: ['What stands in the way', 'External Conflict']),
  (ask: 'What does {name} believe that is not true?', hint: null, fields: ['The lie they believe', 'Beliefs', 'Initial Beliefs']),
  (ask: 'What war goes on inside {name}?', hint: null, fields: ['Internal Conflicts', 'Internal Conflict']),
  (ask: 'What is {name} good at?', hint: 'A few words, separated by commas', fields: ['Strengths']),
  (ask: 'Where does {name} fall short?', hint: 'A few words, separated by commas', fields: ['Weaknesses']),
  (ask: 'What would {name} never do?', hint: null, fields: ['Lines they will not cross', 'Values']),
  (ask: 'What does {name} stand to lose?', hint: null, fields: ['What they stand to lose']),
  (ask: 'Where is {name} when the story begins?', hint: null, fields: ['Starting Point']),
  (ask: 'How should {name}’s story end?', hint: null, fields: ['Intended Resolution', 'What they need']),
  (ask: 'How does {name} sound when speaking?', hint: null, fields: ['Voice']),
];

typedef InterviewStep = ({
  String ask,
  String? hint,
  String fieldName,
  FieldType? type,
  String? fieldId,
  String? sectionId,
  String? sectionName,
  FieldSuggestion? suggestion,
});

List<InterviewStep> interviewFor(Entry entry, CharacterProfile profile, List<CharacterTemplate> templates) {
  final have = <String, EntryField>{};
  for (final f in entry.fields) {
    have.putIfAbsent(f.key.trim().toLowerCase(), () => f);
  }
  final offered = <String, (String, String, FieldSuggestion)>{};
  for (final s in profile.sections) {
    if (s.hidden) continue;
    for (final sug in suggestionsFor(s.name, templates, [for (final f in entry.fields) f.key])) {
      offered.putIfAbsent(sug.name.trim().toLowerCase(), () => (s.id, s.name, sug));
    }
  }
  final name = entry.name.trim().isEmpty ? 'them' : entry.name.trim();
  final used = <String>{};
  final steps = <InterviewStep>[];
  for (final q in interviewQuestions) {
    for (final candidate in q.fields) {
      final key = candidate.toLowerCase();
      final ask = q.ask.replaceAll('{name}', name);
      if (have[key] case final field?) {
        if (field.value.trim().isEmpty && used.add(key)) {
          steps.add((ask: ask, hint: q.hint, fieldName: field.key, type: field.type, fieldId: field.id, sectionId: null, sectionName: null, suggestion: null));
        }
        break;
      }
      if (offered[key] case (final sectionId, final sectionName, final sug)) {
        if (used.add(key)) {
          steps.add((ask: ask, hint: q.hint, fieldName: sug.name, type: sug.type, fieldId: null, sectionId: sectionId, sectionName: sectionName, suggestion: sug));
        }
        break;
      }
    }
  }
  return steps;
}

String storedAnswer(FieldType? type, String answer) => switch (type) {
  FieldType.tags || FieldType.multiselect => [
    for (final part in answer.split(RegExp(r'[,\n]')))
      if (part.trim().isNotEmpty) part.trim(),
  ].join('\n'),
  _ => answer.trim(),
};

({int known, int of}) acquaintance(Entry entry, CharacterProfile profile, List<CharacterTemplate> templates) {
  final have = <String, EntryField>{};
  for (final f in entry.fields) {
    have.putIfAbsent(f.key.trim().toLowerCase(), () => f);
  }
  var known = 0;
  for (final q in interviewQuestions) {
    final field = q.fields.map((c) => have[c.toLowerCase()]).nonNulls.firstOrNull;
    if (field != null && field.value.trim().isNotEmpty) known++;
  }
  return (known: known, of: known + interviewFor(entry, profile, templates).length);
}

/// cameo.dart's `cameoLookOf` (CameoHair as its name).
typedef CameoLook = ({String hair, bool silver, bool pointedEars, bool gone, int seed, Likeness likeness});

CameoLook cameoLookOf(Entry entry, CharacterProfile? profile) {
  final gender = fieldNamed(entry, 'Gender').toLowerCase();
  final age = fieldNamed(entry, 'Age').toLowerCase();
  final species = fieldNamed(entry, 'Species').toLowerCase();
  final status = (profile?.status ?? '').toLowerCase();
  bool word(String text, List<String> words) => words.any((w) => RegExp('\\b$w\\b').hasMatch(text));
  final likeness = likenessOf({for (final f in entry.fields) f.key.trim().toLowerCase(): f.value});
  final hair = switch (likeness.cut) {
    HairCut.long || HairCut.braid => 'long',
    HairCut.shoulder => 'shoulder',
    HairCut.short || HairCut.cropped || HairCut.bald => 'short',
    null =>
      word(gender, ['female', 'woman', 'girl', 'lady', 'she', 'f'])
          ? 'long'
          : word(gender, ['male', 'man', 'boy', 'he', 'm'])
          ? 'short'
          : 'shoulder',
  };
  final years = int.tryParse(RegExp(r'\d+').firstMatch(age)?[0] ?? '');
  final silver = (years != null && years >= 60) || word(age, ['old', 'elderly', 'aged', 'ancient', 'venerable']);
  final ears = word(species, ['elf', 'elves', 'elven', 'fae', 'faerie', 'fairy', 'sidhe']);
  final gone = word(status, ['dead', 'deceased', 'late', 'killed', 'fallen', 'departed']);
  var seed = 0;
  for (final c in entry.id.codeUnits) {
    seed = (seed * 31 + c) & 0x7fffffff;
  }
  return (hair: hair, silver: silver, pointedEars: ears, gone: gone, seed: seed, likeness: likeness);
}

/// The painter's draws from the seed, and the freckles' (cameo.dart's `_CameoPainter.paint`).
Object cameoDraws(CameoLook look, double w, double h, bool bare) {
  final l = look.likeness;
  final ow = bare ? w - 2 : w * 0.66;
  final oh = bare ? h - 2 : h * 0.82;
  final rnd = math.Random(look.seed);
  final build = l.broad ? 0.05 : (l.slight ? -0.045 : 0.0);
  final shoulders = 0.40 + rnd.nextDouble() * 0.06 + build;
  final headRx = ow * (0.16 + rnd.nextDouble() * 0.015);
  final part = rnd.nextBool() ? 1.0 : -1.0;
  final r = math.Random(look.seed + 7);
  return {
    'shoulders': shoulders,
    'headRx': headRx,
    'part': part,
    'freckles': [for (var i = 0; i < 10; i++) r.nextDouble()],
  };
}

Object likenessJson(Likeness l) => {
  'hair': l.hair,
  'cut': l.cut?.name,
  'curly': l.curly,
  'eyes': l.eyes,
  'skin': l.skin?.name,
  'skinFamily': l.skinFamily,
  'beard': l.beard,
  'moustache': l.moustache,
  'glasses': l.glasses,
  'scar': l.scar,
  'eyepatch': l.eyepatch,
  'freckles': l.freckles,
  'hood': l.hood,
  'crown': l.crown,
  'broad': l.broad,
  'slight': l.slight,
};

/// cast_photo.dart's `castRank` and `castPhotoRows`.
const _rank = {'Protagonist': 0, 'Antagonist': 1, 'Supporting': 2, 'Minor': 4, 'Background': 5};
int castRank(Listed l) =>
    l.profile.roles.isEmpty ? 3 : l.profile.roles.map((r) => _rank[r] ?? 3).reduce((a, b) => a < b ? a : b);

({List<Listed> front, List<Listed> back, int more}) castPhotoRows(List<Listed> cast) {
  final ordered = [...cast]
    ..sort((a, b) {
      final r = castRank(a).compareTo(castRank(b));
      if (r != 0) return r;
      final seen = b.seenIn.length.compareTo(a.seenIn.length);
      return seen != 0 ? seen : a.entry.name.compareTo(b.entry.name);
    });
  final anyRoles = ordered.any((l) => castRank(l) != 3);
  final principals = anyRoles ? ordered.where((l) => castRank(l) <= 3).toList() : ordered.take(5).toList();
  final rest = [
    for (final l in ordered)
      if (!principals.contains(l)) l,
  ];
  List<Listed> centred(List<Listed> people) {
    final out = <Listed>[];
    for (final (i, l) in people.indexed) {
      if (i.isOdd) {
        out.insert(0, l);
      } else {
        out.add(l);
      }
    }
    return out;
  }

  final front = centred(principals.take(7).toList());
  final back = centred([...principals.skip(7), ...rest].take(8).toList());
  return (front: front, back: back, more: cast.length - front.length - back.length);
}

/// playbill.dart's parts and `raiseTheCurtain` (through `relate`).
typedef PlaybillPart = ({String part, String role, String hint, String? tie});
const playbillParts = <PlaybillPart>[
  (part: 'The hero', role: 'Protagonist', hint: 'Mira Vance', tie: null),
  (part: 'Who stands against them', role: 'Antagonist', hint: 'The Grey Abbot', tie: 'enemies'),
  (part: 'Who stands by them', role: 'Supporting', hint: 'Kai', tie: 'friends'),
];
const PlaybillPart playbillMore = (part: 'And', role: 'Supporting', hint: 'Orrin', tie: null);

int raiseTheCurtain(CharacterChanges c, List<(PlaybillPart, String)> lines) {
  final named = [
    for (final (part, name) in lines)
      if (name.trim().isNotEmpty) (part, name.trim()),
  ];
  if (named.isEmpty) return 0;
  final r = RelationChanges(c.snapshot, now: c.now, createId: c.newId);
  final ids = [for (final (part, name) in named) (part, r.create(name: name, roles: [part.role]).id)];
  final hero = ids.where((p) => p.$1.tie == null && p.$1.role == 'Protagonist').firstOrNull?.$2;
  if (hero != null) {
    for (final (part, id) in ids) {
      if (part.tie != null) r.createRelation(hero, id, part.tie!);
    }
  }
  c.snapshot = r.snapshot;
  return named.length;
}

/// The ties journal_page.dart and write_them_in_page.dart read.
List<({String id, String name, String tie})> tiesOf(
  List<Listed> list,
  NovelSnapshot s,
  Listed me, {
  required bool byName,
  required bool skipArchived,
}) {
  final byId = {for (final l in list) l.entry.id: l};
  final out = <({String id, String name, String tie})>[];
  for (final r in s.rows('characterRelations').map(CharacterRelation.new)) {
    final other = r.fromId == me.entry.id ? r.toId : (r.toId == me.entry.id ? r.fromId : null);
    final them = other == null ? null : byId[other];
    if (them == null || (skipArchived && them.profile.archived)) continue;
    if (byName ? out.any((o) => o.name == them.entry.name) : out.any((o) => o.id == other)) continue;
    final stage = r.stages.lastOrNull;
    out.add((
      id: them.entry.id,
      name: them.entry.name,
      tie: stage == null ? '' : (stage.title.trim().isNotEmpty ? stage.title.trim() : stage.label.trim()),
    ));
  }
  return out;
}

/// character_card_share.dart's `quoted`.
String quoted(String words) {
  final t = words.trim().replaceFirst(RegExp(r'[,;:\s]+$'), '');
  if (t.isEmpty) return t;
  return RegExp(r'[.!?…—–-]$').hasMatch(t) ? t : '$t.';
}

// ---------------------------------------------------------------------------------------------------- reads

Map<String, String> fieldsOf(Entry e) => {for (final f in e.fields) f.key.trim().toLowerCase(): f.value};

({Map<String, Object?> reads, Map<String, Object?> inputs}) reads(NovelSnapshot s) {
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
  final templates = read.templates();
  final relations = [for (final r in s.rows('characterRelations')) CharacterRelation(r)];
  final active = [
    for (final l in list)
      if (!l.profile.archived) l,
  ];

  // The order of appearance, as dramatis_page.dart reads it.
  final docs = [
    for (final n in readingOrder([for (final r in s.rows('chapters')) StoryNode(r)]))
      if (outline.isDocument(n.kind)) n,
  ];
  final people = [
    for (final l in list)
      if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty) (id: l.entry.id, names: names[l.entry.id]!),
  ];
  final entered = entrancesJob(stored, [for (final n in docs) n.id], people)();
  final appearance = {for (final (i, e) in entered.order.where((e) => e.onStage).indexed) e.id: i};
  final byPosition = stableSorted(
    model.nodes.values.where((n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene),
    (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0),
  ).map((n) => n.id).toList();
  final lines = <String, Object?>{
    for (final l in list)
      if (byPosition.isNotEmpty && (names[l.entry.id] ?? const []).isNotEmpty)
        l.entry.id: [for (final x in spokenJob(stored, byPosition, names[l.entry.id]!)()) x.words],
  };

  final pages = <String, List<String>>{
    for (final r in s.rows('chapterContents')) str(r['id']): blockTexts(r['doc']),
  };
  final allNames = [for (final l in list) ...?names[l.entry.id]];

  final out = <String, Object?>{};
  out['interview'] = [
    for (final l in list)
      {
        'id': l.entry.id,
        'steps': [
          for (final st in interviewFor(l.entry, l.profile, templates))
            {
              'ask': st.ask,
              'hint': st.hint,
              'fieldName': st.fieldName,
              'type': st.type?.name,
              'fieldId': st.fieldId,
              'sectionId': st.sectionId,
              'sectionName': st.sectionName,
              'suggestion': st.suggestion == null ? null : [st.suggestion!.name, st.suggestion!.type.name],
            },
        ],
        'acquaintance': () {
          final a = acquaintance(l.entry, l.profile, templates);
          return [a.known, a.of];
        }(),
      },
  ];
  out['cameo'] = [
    for (final l in list)
      () {
        final look = cameoLookOf(l.entry, l.profile);
        final w = wordsFor(look.likeness);
        return {
          'id': l.entry.id,
          'hair': look.hair,
          'silver': look.silver,
          'pointedEars': look.pointedEars,
          'gone': look.gone,
          'seed': look.seed,
          'likeness': likenessJson(look.likeness),
          'painted': painted(look.likeness),
          'words': [w.hair, w.eyes, w.skin, w.marks],
          'bare': cameoDraws(look, 100, 126, true),
          'boxed': cameoDraws(look, 48, 58, false),
        };
      }(),
  ];
  out['journal'] = [
    for (final l in list)
      {
        'id': l.entry.id,
        'prompts': [
          for (final p in journalPrompts(
            l.entry.name,
            others: [
              for (final t in tiesOf(list, s, l, byName: true, skipArchived: false)) (name: t.name, tie: t.tie),
            ],
            wants: stakesOf(fieldsOf(l.entry))[Stake.wants] ?? '',
          ))
            [p.id, p.ask],
        ],
        'pages': [for (final p in journalPages(read.notes(l.entry.id))) [p.id, promptOf(p), wordsIn(p.content)]],
      },
  ];
  final places = placesFor([
    for (final n in docs)
      (
        id: n.id,
        kind: n.kindKey,
        parentId: n.parentId,
        title: n.title,
        words: n.wordCount,
        planned: (model.plans[n.id]?.objective.trim() ?? '').isNotEmpty,
      ),
  ]);
  out['places'] = [for (final p in places) [p.kind.name, p.nodeId, p.label]];
  out['writeThemIn'] = [
    for (final l in list)
      () {
        final ties = tiesOf(list, s, l, byName: false, skipArchived: true);
        final others = [
          ...ties.map((t) => (id: t.id, name: t.name, tie: t.tie)),
          for (final o in list)
            if (o.entry.id != l.entry.id && !o.profile.archived && !ties.any((t) => t.id == o.entry.id))
              (id: o.entry.id, name: o.entry.name, tie: ''),
        ].take(16).toList();
        return {
          'id': l.entry.id,
          'sparks': [
            for (final sp in sparksFor(l.entry.name, stakesOf(fieldsOf(l.entry)), [
              for (final t in ties) (other: t.name, tie: t.tie),
            ]))
              [sp.from, sp.text],
          ],
          'others': [for (final o in others) o.tie.isEmpty ? o.name : '${o.id}|${o.name} · ${o.tie}'],
        };
      }(),
  ];
  out['thisOrThat'] = [
    for (final l in list)
      () {
        final stored = l.entry.fields
                .where((f) => const ['core traits', 'traits', 'personality traits', 'personality'].contains(f.key.trim().toLowerCase()))
                .firstOrNull
                ?.value ??
            '';
        final sides = sidesOf(traitsIn(stored));
        return {
          'id': l.entry.id,
          'traits': traitsIn(stored),
          'sides': sides,
          'after': traitsAfter(stored, {...sides, 'room': 1, 'fight': -1, 'head': null}),
          'asks': [for (final a in traitAxes) askOf(a, l.entry.name)],
        };
      }(),
  ];
  final lead = chairsLead(list);
  final activeLead = chairsLead(active);
  out['chairs'] = {
    'lead': lead?.entry.id,
    'activeLead': activeLead?.entry.id,
    'each': [
      for (final l in list) [l.entry.id, for (final c in emptyChairs(l, list, relations)) [c.key, c.question, c.line]],
    ],
  };
  out['looks'] = [
    for (final l in list)
      () {
        final mine = names[l.entry.id] ?? const <String>[];
        final others = [
          for (final n in allNames)
            if (!mine.contains(n)) n,
        ];
        final seen = looksIn(pages, [for (final n in docs) n.id], mine, others: others);
        final fields = fieldsOf(l.entry);
        String recorded(Feature f) =>
            [for (final n in f.fieldNames) fields[n]?.trim() ?? ''].where((v) => v.isNotEmpty).firstOrNull ?? '';
        final checks = checkLooks(seen, {for (final f in Feature.values) f: recorded(f)});
        return {
          'id': l.entry.id,
          'seen': [for (final x in seen) [x.feature.name, x.family, x.said, x.nodeId, x.block, x.sentence]],
          'checks': [
            for (final c in checks)
              [c.feature.name, c.recorded, c.family, c.verdict.name, c.sightings.length, recordAs(c.family)],
          ],
          'job': looksJob(stored, [for (final n in docs) n.id], mine, others)().length,
        };
      }(),
  ];
  out['card'] = [
    for (final e in entries)
      if (e.category == 'character')
        () {
          final g = glanceOf(
            e,
            profile: profiles[e.id],
            what: 'Character',
            relations: relations,
            names: {for (final x in entries) x.id: x.name.trim()},
          );
          final said = lines[e.id] as List<String>?;
          final good = said == null ? null : (said.where((w) => w.split(' ').length >= 4).firstOrNull ?? said.firstOrNull);
          return {
            'id': e.id,
            'card': [g.name, g.what, g.epithet, [for (final f in g.facts) [f.label, f.value]], g.ties, g.summary],
            'line': good == null ? null : quoted(good),
          };
        }(),
  ];
  final dramatisPeople = [
    for (final l in list)
      if (!l.profile.archived)
        (
          id: l.entry.id,
          name: l.entry.name,
          about: aboutOf(epithet: l.profile.epithet, summary: l.entry.summary, occupation: fieldNamed(l.entry, 'Occupation')),
          factions: l.factions,
          roles: l.profile.roles,
        ),
  ];
  out['dramatis'] = {
    'about': [for (final p in dramatisPeople) p.about],
    for (final by in CastGrouping.values)
      for (final order in CastOrder.values)
        for (final only in [true, false])
          '${by.name}|${order.name}|$only': composeDramatis(
            dramatisPeople,
            by: by,
            order: order,
            appearance: appearance,
            onlyOnPage: only,
          ),
  };
  final rows = castPhotoRows(active);
  out['photo'] = {
    'front': [for (final l in rows.front) l.entry.id],
    'back': [for (final l in rows.back) l.entry.id],
    'more': rows.more,
    'all': () {
      final r = castPhotoRows(list);
      return [[for (final l in r.front) l.entry.id], [for (final l in r.back) l.entry.id], r.more];
    }(),
  };
  final bookPeople = learnableNames([
    for (final e in entries)
      if (e.category == 'character') e.name,
  ]);
  final bookPlaces = learnableNames([
    for (final e in entries)
      if (e.category == 'location') e.name,
  ]);
  out['forge'] = {
    'people': bookPeople,
    'places': bookPlaces,
    for (final seed in [0, 1, 42])
      for (final start in ['', 'k', 'Th'])
        '$seed|$start': [
          forgeNames(source: bookPeople, seed: seed, start: start),
          forgeNames(source: bookPlaces, seed: seed, start: start),
        ],
  };

  // Changes, each from the novel as it is, with ids and a clock of their own.
  var ids = 0;
  CharacterChanges fresh() => CharacterChanges(s, now: 5000, createId: () => 'id-${++ids}');
  final changes = <String, Object?>{};
  for (final l in list.take(25)) {
    final traits = fresh();
    recordTraits(traits, l.entry.id, {'room': 1, 'fight': -1, 'head': null, 'hour': -1});
    final face = fresh();
    final was = cameoLookOf(l.entry, l.profile).likeness;
    final now = (
      hair: 'red',
      cut: HairCut.braid,
      curly: !was.curly,
      eyes: 'green',
      skin: SkinTone.olive,
      skinFamily: null,
      beard: was.beard,
      moustache: was.moustache,
      glasses: true,
      scar: was.scar,
      eyepatch: was.eyepatch,
      freckles: true,
      hood: was.hood,
      crown: true,
      broad: was.broad,
      slight: was.slight,
    );
    recordFace(face, l.entry.id, was, now);
    final look = fresh();
    recordLook(look, l.entry.id, Feature.eyes, 'Grey');
    recordLook(look, l.entry.id, Feature.hair, 'Black');
    final answer = fresh();
    final steps = interviewFor(l.entry, l.profile, templates);
    for (final (i, st) in steps.take(3).indexed) {
      final value = storedAnswer(st.type, 'answer $i, and more,\nthen');
      if (st.fieldId != null) {
        answer.updateField(l.entry.id, st.fieldId!, value: value);
      } else {
        final sections = answer.profileOf(answer.character(l.entry.id)).sections;
        final section = sections.where((x) => x.name == st.sectionName).firstOrNull;
        answer.addField(l.entry.id, section?.id ?? st.sectionId!, st.suggestion!, value: value);
      }
    }
    final journal = fresh();
    final note = journal.saveNote(
      l.entry.id,
      null,
      title: '${journalTitlePrefix}The night before.',
      content: 'I could not sleep.',
      tags: [journalTag],
    );
    journal.saveNote(l.entry.id, note.id, content: 'I could not sleep. The door hums.');
    changes[l.entry.id] = [
      hashOf(collectionsOf(traits.snapshot)),
      hashOf(collectionsOf(face.snapshot)),
      hashOf(collectionsOf(look.snapshot)),
      hashOf(collectionsOf(answer.snapshot)),
      hashOf(collectionsOf(journal.snapshot)),
      // The fields as they end, to read when the hashes differ.
      [for (final f in face.character(l.entry.id).fields) '${f.key}=${f.value}'],
      [for (final f in traits.character(l.entry.id).fields) '${f.key}=${f.value}'],
    ];
  }
  final curtain = fresh();
  final made = raiseTheCurtain(curtain, [
    (playbillParts[0], ' Ilse '),
    (playbillParts[1], 'Corvan'),
    (playbillParts[2], ''),
    (playbillMore, 'Brannoc'),
  ]);
  changes['curtain'] = [made, hashOf(collectionsOf(curtain.snapshot))];
  final noHero = fresh();
  changes['curtain-no-hero'] = [
    raiseTheCurtain(noHero, [(playbillParts[0], ''), (playbillParts[2], 'Tamsin')]),
    hashOf(collectionsOf(noHero.snapshot)),
  ];
  // A scene written in, every place, for the first character.
  if (list.isNotEmpty) {
    final me = list.first;
    final sparks = sparksFor(me.entry.name, stakesOf(fieldsOf(me.entry)), const []);
    for (final p in places) {
      var snap = s;
      String id;
      switch (p.kind) {
        case PlaceKind.blank:
          id = p.nodeId!;
        case PlaceKind.newChapter:
          final after = docs.where((n) => n.id == p.nodeId).firstOrNull;
          final r = outline.createNode(snap, NodeKind.chapter, parentId: after?.parentId, now: 7000, createId: () => 'id-${++ids}');
          snap = r.snapshot;
          id = r.node.id;
        case PlaceKind.newScene:
          final r = outline.createNode(snap, NodeKind.scene, parentId: p.nodeId, now: 7000, createId: () => 'id-${++ids}');
          snap = r.snapshot;
          id = r.node.id;
      }
      final others = [for (final o in list.skip(1).take(2)) o.entry.id];
      for (final eyes in [true, false]) {
        final plot = PlotChanges(snap, now: 8000, createId: () => 'id-${++ids}');
        plot.updatePlan(
          id,
          (plan) => {
            if (sparks.first.text.isNotEmpty) 'objective': sparks.first.text,
            'appearIds': {...strings(plan['appearIds']), me.entry.id, ...others}.toList(),
            if (eyes) 'povIds': [me.entry.id],
          },
        );
        changes['write:${p.kind.name}:$eyes'] = [id, hashOf(collectionsOf(plot.snapshot))];
      }
    }
  }
  out['changes'] = changes;

  return (
    reads: out,
    inputs: {
      'appearance': appearance,
      'lines': lines,
      'ids': ids,
    },
  );
}

void main(List<String> args) {
  final out = <String, Object?>{};
  final full = <String, Object?>{};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final snapshot = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()));
    final r = reads(snapshot);
    full[name] = r.reads;
    out[name] = {
      'reads': {for (final MapEntry(:key, :value) in r.reads.entries) key: hashOf(value)},
      'inputs': r.inputs,
    };
  }
  File(args[0]).writeAsStringSync(jsonEncode(out));
  final fullPath = Platform.environment['FULL'];
  if (fullPath != null) File(fullPath).writeAsStringSync(jsonEncode(full));
}
