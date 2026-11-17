// The Flutter app's own outputs for the Systems core (systems.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given: each system's window kind, example sheet and blueprint
// lines; every sheet's status window as the window works it out, its climb, its level history; every pair of sheets
// in a system set face to face; the book's own system read from its pages; and a script of changes (each preset begun,
// sheets added and changed, items and systems removed, refusals), its made-up ids renamed in order. And `misc`: the system's
// messages in every bracket, systems from made-up pages, presets begun.
//
// What is the widgets' (system_speaks.dart's windowKindOf, status_window.dart's window and exampleHeld,
// system_gallery.dart's blueprintLines) is copied here word for word but for Flutter's types, since those files need
// Flutter: dart.exe runs the domain itself (compute, climb, face_off, system_message, from_pages, system_changes,
// system_presets).
//
// To make the golden again (from the scratch dir holding the package config that names novel_builder):
//   dart run dump.dart systems.golden.json <the Flutter fixtures>/*.novel.json ../../model/edge.novel.json \
//        ../../../assets/sample/the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/systems/climb.dart';
import 'package:novel_builder/shared/domain/systems/compute.dart';
import 'package:novel_builder/shared/domain/systems/face_off.dart';
import 'package:novel_builder/shared/domain/systems/from_pages.dart';
import 'package:novel_builder/shared/domain/systems/system_changes.dart';
import 'package:novel_builder/shared/domain/systems/system_message.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

// ---------------------------------------------------------------------------------------------------- the widgets'

String windowKindOf(SystemBlueprint system) {
  final words = [
    system.name,
    for (final g in system.groupList) g.name,
    for (final t in system.tracks) t.name,
    for (final v in system.variables) v.name,
  ].join(' ').toLowerCase();
  if (RegExp(r'\b(realm|qi|cultivat|dao|meridian|dantian)').hasMatch(words)) return 'cultivation';
  if (RegExp(r'\b(threat|power rating|superpower|hero)').hasMatch(words)) return 'superhero';
  if (RegExp(r'\b(arcan|rune|sigil|spell slot|magic)').hasMatch(words)) return 'hard-magic';
  return 'litrpg';
}

List<String> exampleHeld(JsonMap content) {
  final seen = <String>{};
  return [
    for (final i in maps(content['items']))
      if (seen.add(str(i['groupId']))) str(i['id']),
  ];
}

List<List<String>> blueprintLines(JsonMap content) {
  List<String> names(String key) => [for (final m in maps(content[key])) str(m['name'])];
  String some(List<String> all, [int shown = 3]) =>
      all.length <= shown ? all.join(', ') : '${all.take(shown).join(', ')} and ${all.length - shown} more';
  final tracks = names('tracks');
  final ranks = names('ranks');
  final variables = names('variables');
  final groups = names('groups');
  return [
    if (tracks.isNotEmpty) ['Levels & realms', tracks.join(', ')],
    if (ranks.isNotEmpty) ['Ranks', ranks.join(' → ')],
    if (variables.isNotEmpty) ['Attributes & resources', some(variables)],
    if (groups.isNotEmpty) ['Classes, skills & more', groups.join(', ')],
  ];
}

String _number(double n) {
  if (n == n.roundToDouble()) return n.toInt().toString();
  return n.toStringAsFixed(n.abs() < 10 ? 1 : 0);
}

/// The status window's parts as status_window.dart works them out (shown, not edited).
JsonMap window(JsonMap content, List<String> held, SheetProfile? profile, String holder, bool compact) {
  final system = SystemBlueprint(content);
  final sheet = computeSheet(system, profile ?? SheetProfile(itemIds: held));
  final rows = sheet.rows;
  SheetRow? maxOf(SheetRow r) => rows
      .where(
        (m) => m.variable.kind == 'derived' && m.variable.name.toLowerCase() == 'max ${r.variable.name}'.toLowerCase(),
      )
      .firstOrNull;
  final resources = [
    for (final r in rows)
      if (r.variable.kind == 'resource') r,
  ];
  final usedAsMost = {for (final r in resources) ?maxOf(r)?.variable.id};
  final attributes = [
    for (final r in rows)
      if (r.variable.kind == 'number' || r.variable.kind == 'choice') r,
  ];
  final follows = [
    for (final r in rows)
      if (r.variable.kind == 'derived' && !usedAsMost.contains(r.variable.id)) r,
  ];
  final byGroup = <String, List<SheetItem>>{};
  for (final i in sheet.items) {
    (byGroup[i.group?.name ?? 'Held'] ??= []).add(i);
  }
  final ranks = {for (final r in system.ranks) r.id: r.name};
  String plain(SheetRow r) => r.value is double ? _number(r.value! as double) : r.display;
  return {
    'standing': [
      ['Name', holder],
      for (final t in sheet.tracks) [
        t.track.name,
        t.level != null ? '${t.level}${t.track.cap > 0 ? ' / ${t.track.cap}' : ''}' : t.label,
        if (!compact) t.next,
      ],
    ],
    'resources': [
      for (final r in resources)
        () {
          final most = maxOf(r);
          final now = r.value is double ? r.value! as double : null;
          final top = most?.value is double ? most!.value! as double : now;
          final part = now == null || top == null || top <= 0 ? 1.0 : (now / top).clamp(0.0, 1.0);
          final unit = r.variable.unit.trim();
          final short = unit.isNotEmpty && unit.length <= 3
              ? unit
              : r.variable.name.trim().split(RegExp(r'\s+')).first;
          return [
            short,
            most == null
                ? r.display
                : '${now == null ? '?' : _number(now)} / ${plain(most)}${unit.isEmpty ? '' : ' $unit'}',
            part,
          ];
        }(),
    ],
    'attributes': [
      for (final r in attributes) [r.variable.name, r.display, r.sources.isNotEmpty],
    ],
    'follows': compact ? [] : [for (final r in follows) [r.variable.name, r.display]],
    'groups': [
      for (final MapEntry(key: group, value: items) in byGroup.entries)
        [
          group,
          [
            for (final i in items)
              [i.item.name, ranks[i.item.rankId], [...i.effects, for (final c in i.costs) 'costs ${c.label}'], i.from],
          ],
        ],
    ],
  };
}

// ---------------------------------------------------------------------------------------------------- parts

Object? sheetOut(ComputedSheet s) => {
  'rows': [
    for (final r in s.rows) [r.variable.id, r.value is double ? r.value : r.value, r.display, r.sources, r.error],
  ],
  'tracks': [
    for (final t in s.tracks) [t.track.id, t.label, t.level, t.next, t.unmet, t.xp?.progress, t.error],
  ],
  'items': [
    for (final i in s.items) [i.item.id, i.group?.id, i.requires, i.unmet, [for (final c in i.costs) c.label], i.effects, i.error, i.from],
  ],
  'available': [for (final i in s.available) i.id],
  'points': s.points == null ? null : [s.points!.earned, s.points!.spent, s.points!.unspent],
};

JsonMap novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final systems = [...model.systems.values];
  final sheets = model.sheets;
  String nameOf(SystemSheet sh) => model.entries[sh.entryId]?.name.trim() ?? '';

  final windows = {
    for (final system in systems)
      system.id: {
        'kind': windowKindOf(system),
        'example': exampleHeld(system.raw),
        'lines': blueprintLines(system.raw),
        'blank': window(system.raw, exampleHeld(system.raw), null, 'Your hero', false),
        'sheets': {
          for (final sh in sheets)
            if (sh.systemId == system.id) sh.id: window(system.raw, sh.itemIds, SheetProfile.of(sh), nameOf(sh), false),
        },
      },
  };

  final climbs = {
    for (final sh in sheets)
      if (model.systems[sh.systemId] case final system?)
        sh.id: [
          for (final c in climbsOf(
            system,
            sh,
            chapterOf: model.order.chapterNumber,
            chapters: model.order.chapters.length,
            who: nameOf(sh),
          ))
            {
              'track': c.track,
              'cap': c.cap,
              'actual': [for (final p in c.actual) [p.$1, p.$2]],
              'projected': [for (final p in c.projected) [p.$1, p.$2]],
              'perChapter': c.perChapter,
              'unit': c.unit,
              'says': c.says,
            },
        ],
  };

  final position = model.order.position;
  final history = {
    for (final sh in sheets)
      if (model.systems[sh.systemId] case final system?)
        sh.id: [
          for (final h in xpHistory(system, SheetProfile.of(sh), (id) => id == null ? -1 : (position[id] ?? 9007199254740991)))
            [h.entry.id, h.level, h.track.id],
        ],
  };

  final faces = <String, Object?>{};
  for (final system in systems) {
    final mine = [
      for (final sh in sheets)
        if (sh.systemId == system.id && model.entries.containsKey(sh.entryId)) sh,
    ];
    var n = 0;
    for (var i = 0; i < mine.length; i++) {
      for (var j = 0; j < mine.length; j++) {
        if (i == j || n >= 12) continue;
        n++;
        final f = faceOff(
          computeSheet(system, SheetProfile.of(mine[i])),
          computeSheet(system, SheetProfile.of(mine[j])),
          aName: nameOf(mine[i]),
          bName: nameOf(mine[j]),
        );
        faces['${mine[i].id}|${mine[j].id}'] = {
          'rows': [
            for (final r in f.rows) [r.name, r.a, r.b, r.unit, r.level],
          ],
          'says': f.says,
        };
      }
    }
  }

  final entryPowers = [
    for (final e in model.entries.values)
      if (e.category == 'power') e.name,
  ];
  final own = ownSystemJob(
    [for (final r in s.rows('chapterContents')) jsonEncode(r)],
    {...model.order.chapterNumber},
    entryPowers,
  )();

  return {
    'windows': windows,
    'sheets': {
      for (final sh in sheets)
        if (model.systems[sh.systemId] case final system?) sh.id: sheetOut(computeSheet(system, SheetProfile.of(sh))),
    },
    'climbs': climbs,
    'history': history,
    'faces': faces,
    'own': own == null
        ? null
        : {
            'preset': own.preset.id,
            'signs': [for (final w in own.signs) [w.word, w.times]],
            'powers': own.powers,
            'abilityGroup': own.abilityGroup,
            'items': [for (final i in maps(own.content['items'])) [i['id'], i['groupId'], i['name']]],
          },
    'changes': changes(s, model),
  };
}

/// A script of changes (its made-up ids renamed, `renamed`): what is stored after each step, and what each refusal says.
Object? changes(NovelSnapshot s, StoryModel model) {
  var n = 0;
  String fresh() => 'n${(n++).toString().padLeft(4, '0')}';
  final c = SystemChanges(s, now: 1700000000000, createId: fresh);
  final out = <String, Object?>{};
  Object? stored() => {
    'systems': c.rows('systems'),
    'sheets': c.rows('systemSheets'),
    'links': c.rows('loreLinks').length,
  };
  String? refused(void Function() f) {
    try {
      f();
      return null;
    } on ChangeRefused catch (e) {
      return e.message;
    }
  }

  final made = [for (final p in systemPresets) c.createSystem(p.content)];
  final blank = c.createSystem();
  out['made'] = [for (final m in made) m.id];
  out['blank'] = blank.raw;
  final entries = [...model.entries.keys];
  final chapters = [for (final ch in model.order.chapters) ch.id];
  if (entries.isNotEmpty) {
    final game = made.first;
    final sheet = c.addSheet(game.id, entries.first);
    out['again'] = c.addSheet(game.id, entries.first).id == sheet.id;
    final system = c.systems().firstWhere((x) => x.id == game.id);
    final v = system.variables;
    final t = system.tracks;
    c.updateSheet(
      sheet.id,
      (_) => {
        'itemIds': [for (final i in system.items) i.id, 'nope', system.items.first.id],
        'values': {v[0].id: 15, if (v.length > 1) v[1].id: 'x', 'zz': 3},
        'progress': {t.first.id: 4, 'zz': 1},
        'xp': [
          {'trackId': t.first.id, 'amount': 500, 'nodeId': chapters.isEmpty ? 'gone' : chapters.first, 'source': ' Combat ', 'note': ' n '},
          {'trackId': t.first.id, 'amount': 0},
          {'trackId': 'zz', 'amount': 5},
          {'trackId': t.first.id, 'amount': '5'},
          {'id': 'keep', 'trackId': t.first.id, 'amount': -20, 'nodeId': 'gone'},
        ],
        'spent': {
          v[0].id: 2,
          for (final x in v)
            if (x.kind == 'derived') x.id: 3,
          if (v.length > 1) v[1].id: 0,
        },
        'note': 7,
      },
    );
    out['sheet'] = c.row('systemSheets', sheet.id);
    // An item taken out takes the paths recorded to or from it.
    final first = system.items.first;
    c.put('loreLinks', {'id': 'link-a', 'projectId': s.projectId, 'fromType': 'ability', 'fromId': '${game.id}/${first.id}', 'toType': 'entry', 'toId': entries.first});
    c.put('loreLinks', {'id': 'link-b', 'projectId': s.projectId, 'fromType': 'entry', 'fromId': entries.first, 'toType': 'ability', 'toId': '${game.id}/${system.items.last.id}'});
    c.updateSystem(game.id, (cur) => {'items': [for (final i in maps(cur.raw['items'])) if (i['id'] != first.id) i], 'name': '  '});
    out['updated'] = stored();
    final second = c.addSheet(made[1].id, entries.last);
    out['second'] = second.id;
    c.removeSystem(made[1].id);
    out['removed'] = stored();
    c.removeSheet(sheet.id);
  }
  out['refusals'] = [
    refused(() => c.updateSheet('missing', (_) => {})),
    refused(() => c.addSheet(blank.id, 'missing')),
    refused(() => c.addSheet('missing', 'missing')),
    refused(() => c.removeSystem('missing')),
    refused(() => c.removeSheet('missing')),
    refused(() => c.updateSystem('missing', (_) => {})),
  ];
  out['end'] = stored();
  return renamed(out);
}

/// The ids the changes make are random (`newId`, not the change's own): each is named by where it is first met,
/// walking the output in its own order (a map's keys before its values), `u0`, `u1`…, the same on both sides; then the
/// output is written canonically.
String renamed(Object? out) {
  final names = <String, String>{};
  final uuid = RegExp(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}');
  String name(String s) => s.replaceAllMapped(uuid, (m) => names.putIfAbsent(m[0]!, () => 'u${names.length}'));
  Object? walk(Object? v) {
    if (v is String) return name(v);
    if (v is List) return [for (final x in v) walk(x)];
    if (v is Map) {
      // A row's key order is not its meaning: plain keys in order, keys holding an id as they were made.
      final plain = [for (final k in v.keys) if (!uuid.hasMatch('$k')) '$k']..sort();
      final ids = [for (final k in v.keys) if (uuid.hasMatch('$k')) '$k'];
      final out = <String, Object?>{};
      for (final k in [...plain, ...ids]) {
        final key = name(k);
        out[key] = walk(v[k]);
      }
      return out;
    }
    return v;
  }

  return canonical(walk(out));
}

JsonMap misc() {
  final messages = <Object?>[];
  final parts = <MessageParts>[
    (kind: MessageKind.levelUp, who: 'Wren', track: 'Level', level: 5, name: '', rank: '', stat: '', from: 0, by: 1, detail: '+5 points\n\n  to assign  '),
    (kind: MessageKind.levelUp, who: '  ', track: '  ', level: 1, name: '', rank: '', stat: '', from: 0, by: 1, detail: ''),
    (kind: MessageKind.skill, who: '', track: '', level: 1, name: 'Fireball', rank: 'F', stat: '', from: 0, by: 1, detail: 'Burns'),
    (kind: MessageKind.skill, who: '', track: '', level: 1, name: '', rank: ' ', stat: '', from: 0, by: 1, detail: ''),
    (kind: MessageKind.stat, who: '', track: '', level: 1, name: '', rank: '', stat: 'Strength', from: 12, by: 2, detail: ''),
    (kind: MessageKind.stat, who: '', track: '', level: 1, name: '', rank: '', stat: '', from: 1.25, by: -0.5, detail: ''),
    (kind: MessageKind.stat, who: '', track: '', level: 1, name: '', rank: '', stat: 'Luck', from: 9.95, by: 0.1, detail: ''),
    (kind: MessageKind.title, who: '', track: '', level: 1, name: 'Chosen', rank: 'S', stat: '', from: 0, by: 1, detail: ''),
    (kind: MessageKind.quest, who: '', track: '', level: 1, name: 'Find the bell', rank: '', stat: '', from: 0, by: 1, detail: 'Reward: 100 XP\nTime: a day'),
    (kind: MessageKind.questDone, who: '', track: '', level: 1, name: '', rank: '', stat: '', from: 0, by: 1, detail: ''),
    (kind: MessageKind.warning, who: '', track: '', level: 1, name: 'Mana low', rank: '', stat: '', from: 0, by: 1, detail: ''),
  ];
  for (final p in parts) {
    for (final b in Bracket.values) {
      messages.add(messageLines(p, b));
    }
  }
  final pages = <Object?>[];
  final books = <(List<String>, List<String>)>[
    (['She gained a level. The skill rose; skills, skills, Skill.', 'Her class: Mage. The system spoke.'], []),
    (['Qi gathered in the dantian. The realm broke; realms; Realms.', 'The sect elder gave a pill.'], ['Iron Body']),
    (['A spell, a rune, mana and mana.', 'The wizard cast spells.'], ['Fireball', ' fireball ', '', 'Ward']),
    (['The hero and the villain. Powers! Superpowers.'], []),
    (['Nothing here at all.'], []),
    (['Nothing here at all.'], ['Shadow Step']),
    (['level qi spell hero'], []),
    ([], []),
  ];
  for (final (texts, powers) in books) {
    final f = systemFromPages(texts, powers);
    pages.add(
      f == null
          ? null
          : [
              f.preset.id,
              [for (final w in f.signs) [w.word, w.times]],
              f.powers,
              f.abilityGroup,
              [for (final i in maps(f.content['items'])) [i['id'], i['groupId'], i['name']]],
            ],
    );
  }
  final presets = {
    for (final p in systemPresets)
      p.id: {
        'kind': windowKindOf(SystemBlueprint(p.content)),
        'example': exampleHeld(p.content),
        'lines': blueprintLines(p.content),
        'window': window(p.content, exampleHeld(p.content), null, 'Your hero', true),
      },
  };
  return {'messages': messages, 'pages': pages, 'presets': presets};
}

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

/// With FULL set, every part whole; else each part of each novel as its hash (`misc` is always whole).
void main(List<String> args) {
  final full = Platform.environment['FULL'] != null;
  final out = <String, Object?>{};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final parts = novel(s);
    out[name] = full ? jsonDecode(jsonEncode(parts, toEncodable: (o) => '$o')) : {
      for (final MapEntry(:key, :value) in parts.entries) key: hashOf(value),
    };
  }
  out['misc'] = jsonDecode(jsonEncode(misc(), toEncodable: (o) => '$o'));
  File(args.first).writeAsStringSync(jsonEncode(out));
}
