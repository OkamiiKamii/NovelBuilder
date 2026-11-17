// The Flutter app's own outputs for phase 5c's page readings and character progression (progression.golden.json pins
// them; outputs.ts makes Scriptor's, keyed and shaped the same way). For every novel given: the levels its pages give
// (whose each is, with the author's word and without), the ledger and the names in its pages for each of its systems
// (and the names with no system), each person's chart series, a script of tracker changes and of snapshot changes run on
// a copy (each step's row or refusal), each snapshot made worked out and compared, and names added to each system. And
// `misc`: the readings on their own, over texts made to test them.
//
// What is the widgets' (progress_chart.dart's chartSeries, number_ledger_view.dart's ledger inputs, pages_names_view's
// groupFor and adding) is copied here word for word, but for the ids (handed out in turn, as the tests' are).
//
// To make the golden again: run.sh in the scratchpad's `progression` folder (it holds the package config).

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' show isDocument;
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/progression/track.dart';
import 'package:novel_builder/shared/domain/progression/track_changes.dart';
import 'package:novel_builder/shared/domain/records/progress.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/systems/compute.dart';
import 'package:novel_builder/shared/domain/systems/levels_in_pages.dart';
import 'package:novel_builder/shared/domain/systems/number_ledger.dart';
import 'package:novel_builder/shared/domain/systems/pages_names.dart';
import 'package:novel_builder/shared/domain/systems/system_changes.dart';

// ---------------------------------------------------------------------------------------------------- as JSON

Object stepJson(LevelStep s) => {
  'chapter': s.chapter,
  'nodeId': s.nodeId,
  'block': s.block,
  'level': s.level,
  'sentence': s.sentence,
  'up': s.up,
  'backwards': s.backwards,
};

Object levelledJson(Levelled l) => {
  'name': l.name,
  'family': l.family,
  'steps': [for (final s in l.steps) stepJson(s)],
  'mentions': l.mentions,
  'owner': l.owner,
  'self': l.self,
};

Object entryJson(LedgerEntry e) => {
  'chapter': e.chapter,
  'nodeId': e.nodeId,
  'block': e.block,
  'value': e.value,
  'from': e.from,
  'by': e.by,
  'said': e.said,
};

Object ledgerJson(Ledger l) => {
  'lines': [
    for (final x in l.lines) {'name': x.name, 'track': x.track, 'entries': [for (final e in x.entries) entryJson(e)]},
  ],
  'slips': [
    for (final s in l.slips) {'kind': s.kind.name, 'name': s.name, 'at': entryJson(s.at), 'says': s.says},
  ],
};

Object nameJson(PageName n) => {
  'name': n.name,
  'thing': n.thing.name,
  'rank': n.rank,
  'times': n.times,
  'chapter': n.chapter,
  'nodeId': n.nodeId,
  'block': n.block,
  'said': n.said,
};

/// A number as JSON carries it: non-finite ones as words.
Object? js(Object? v) => switch (v) {
  final double d when d.isNaN => 'NaN',
  final double d when d.isInfinite => d > 0 ? 'Infinity' : '-Infinity',
  _ => v,
};

Object resolvedJson(SystemState r) => {
  'auto': r.auto,
  'rows': [
    for (final row in r.rows)
      {
        'id': row.variable.id,
        'value': js(row.value),
        'display': row.display,
        'byHand': row.byHand,
        'systemSays': row.systemSays,
        'sources': row.sources,
        'error': row.error,
      },
  ],
  'tracks': [
    for (final t in r.tracks) {'id': t.track.id, 'label': t.label, 'level': t.level, 'unmet': t.unmet, 'error': t.error},
  ],
  'items': [
    for (final i in r.items) {'id': i.item.id, 'unmet': i.unmet, 'effects': i.effects, 'error': i.error, 'from': i.from},
  ],
  'available': [for (final a in r.available) a.id],
};

Object comparisonJson(Comparison c) => {
  'stats': [
    for (final x in c.stats) {'system': x.system, 'name': x.name, 'from': x.from, 'to': x.to, 'delta': js(x.delta)},
  ],
  'advancement': [
    for (final x in c.advancement) {'system': x.system, 'name': x.name, 'from': x.from, 'to': x.to},
  ],
  'gained': [
    for (final x in c.gained) {'group': x.group, 'name': x.name},
  ],
  'lost': [
    for (final x in c.lost) {'group': x.group, 'name': x.name},
  ],
  'gear': [
    for (final x in c.gear) {'change': x.change, 'name': x.name, 'detail': x.detail},
  ],
  'status': [
    for (final x in c.status) {'dimension': x.dimension, 'label': x.label, 'added': x.added, 'removed': x.removed},
  ],
  'same': c.same,
};

// ---------------------------------------------------------------------------------------------------- the widgets'

/// progress_chart.dart's chartSeries, word for word.
class ChartSeries {
  ChartSeries(this.name, this.points, this.ladder);
  final String name;
  final List<({int at, double y, String value, String when})> points;
  final List<String> ladder;
}

List<ChartSeries> chartSeries(StoryModel model, String entryId) {
  final log = changeLog(model, entryId);
  final lines = <String, ({ProgressCategory category, String subject, List<(int, ProgressChange, String)> sets})>{};
  for (final (i, l) in log.indexed) {
    final category = l.category;
    if (category == null || l.change.action != 'set') continue;
    if (category.shape != 'value' && category.shape != 'named') continue;
    final subject = category.shape == 'named' ? l.change.subject.trim() : '';
    final key = '${category.id}|${subject.toLowerCase()}';
    (lines[key] ??= (category: category, subject: subject, sets: [])).sets.add((i, l.change, l.when));
  }
  final out = <ChartSeries>[];
  for (final line in lines.values) {
    if (line.sets.length < 2) continue;
    final ladder = line.category.ladder;
    final steps = {for (final (i, s) in ladder.indexed) s.trim().toLowerCase(): i};
    final asSteps = ladder.isNotEmpty && line.sets.every((s) => steps.containsKey(s.$2.value.trim().toLowerCase()));
    final numbers = [for (final s in line.sets) double.tryParse(s.$2.value.trim().replaceAll(',', ''))];
    if (!asSteps && numbers.any((n) => n == null)) continue;
    final name = line.subject.isEmpty ? line.category.name : '${line.category.name}: ${line.subject}';
    out.add(
      ChartSeries(name, [
        for (final (k, (at, change, said)) in line.sets.indexed)
          (
            at: at,
            y: asSteps ? steps[change.value.trim().toLowerCase()]!.toDouble() : numbers[k]!,
            value: change.value,
            when: said,
          ),
      ], asSteps ? ladder : const []),
    );
  }
  out.sort((a, b) => localeCompare(a.name, b.name));
  return out;
}

Object seriesJson(ChartSeries s) => {
  'name': s.name,
  'points': [
    for (final p in s.points) {'at': p.at, 'y': js(p.y), 'value': p.value, 'when': p.when},
  ],
  'ladder': s.ladder,
};

/// pages_names_view.dart's groupFor and groupNameOf, word for word.
SysGroup? groupFor(SystemBlueprint system, PageThing thing) {
  final words = switch (thing) {
    PageThing.skill => ['skill', 'spell', 'technique', 'power', 'abilit', 'art'],
    PageThing.title => ['title'],
    PageThing.kit => ['class', 'path', 'calling'],
    PageThing.item => ['item', 'equipment', 'gear', 'inventory', 'artifact', 'relic'],
  };
  return system.groupList.where((g) => words.any((w) => g.name.toLowerCase().contains(w))).firstOrNull;
}

String groupNameOf(PageThing thing) => switch (thing) {
  PageThing.skill => 'Skills',
  PageThing.title => 'Titles',
  PageThing.kit => 'Classes',
  PageThing.item => 'Items',
};

/// pages_names_view.dart's _add, word for word but for the ids (the change's own).
List<String> addNames(SystemChanges x, StoryModel model, String systemId, List<PageName> names) {
  final sheets = [
    for (final s in model.sheets)
      if (s.systemId == systemId) s,
  ];
  final ids = <String>[];
  x.updateSystem(systemId, (current) {
    final groups = [for (final g in current.raw['groups'] as List? ?? const []) g];
    final items = [for (final i in current.raw['items'] as List? ?? const []) i];
    String groupId(PageThing thing) {
      final found =
          groupFor(SystemBlueprint({...current.raw, 'groups': groups}), thing) ?? SysGroup(<String, Object?>{});
      if (found.id.isNotEmpty) return found.id;
      final id = x.newId();
      groups.add({'id': id, 'name': groupNameOf(thing), 'single': thing == PageThing.kit});
      return id;
    }

    for (final n in names) {
      final id = x.newId();
      ids.add(id);
      final rank = current.ranks.where((r) => r.name.toLowerCase() == n.rank.toLowerCase()).firstOrNull;
      items.add({
        'id': id,
        'groupId': groupId(n.thing),
        'name': n.name,
        'rankId': ?rank?.id,
        'description': rank == null && n.rank.isNotEmpty ? 'Rank ${n.rank}, as the pages say.' : '',
      });
    }
    return {'groups': groups, 'items': items};
  });
  if (sheets.length == 1) {
    x.updateSheet(
      sheets.single.id,
      (current) => {
        'itemIds': [...current.itemIds, ...ids],
      },
    );
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------------- reads

/// Ids handed out in turn.
String Function() idsFrom(String prefix) {
  var n = 0;
  return () => '$prefix-${(++n).toString().padLeft(4, '0')}';
}

/// A step of a script: what it gave (as JSON), or the refusal.
Object step(Object? Function() run) {
  try {
    return {'ok': run()};
  } on ChangeRefused catch (e) {
    return {'refused': e.message};
  }
}

Map<String, Object?> novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final entries = [...model.entries.values]..sort((a, b) => a.id.compareTo(b.id));
  final profiles = {
    for (final r in [...s.rows('characterProfiles')]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
      str(r['entryId']): CharacterProfile(r),
  };
  final names = namesToFind(entries, profiles);
  final people = [
    for (final e in entries)
      if (e.category == 'character' && (names[e.id] ?? const []).isNotEmpty) (id: e.id, names: names[e.id]!),
  ];
  final stored = [for (final r in s.rows('chapterContents')) jsonEncode(r)];
  final order = [
    for (final n in readingOrder(model.nodes.values))
      if (isDocument(n.kind)) n.id,
  ];
  final out = <String, Object?>{};

  // Levels: as the pages give them; and with the author's word on the first and the second set aside.
  final levels = levelsInPagesJob(stored, order, const {}, people: people)();
  out['levels'] = [for (final l in levels) levelledJson(l)];
  if (levels.isNotEmpty) {
    final word = {levels.first.name.toLowerCase(): people.isEmpty ? '' : people.last.id};
    final aside = {if (levels.length > 1) levels[1].name.toLowerCase()};
    out['levelsGiven'] = [
      for (final l in levelsInPagesJob(stored, order, aside, people: people, assigned: word)()) levelledJson(l),
    ];
  }

  // The ledger and the names in the pages, for each system; the names with none.
  final systems = [...model.systems.values]..sort((a, b) => a.id.compareTo(b.id));
  out['names'] = [for (final n in namesInPagesJob(stored, order)()) nameJson(n)];
  for (final system in systems) {
    final sheets = [
      for (final x in model.sheets)
        if (x.systemId == system.id && model.entries.containsKey(x.entryId)) x,
    ];
    final sheet = <String, num>{};
    if (sheets.length == 1) {
      final c = computeSheet(system, SheetProfile.of(sheets.single));
      for (final r in c.rows) {
        if (r.value case final double v) sheet[r.variable.name] = v;
      }
      for (final t in c.tracks) {
        if (t.level case final int l) sheet[t.track.name] = l;
      }
    }
    out['ledger:${system.id}'] = ledgerJson(
      numberLedgerJob(
        stored,
        order,
        stats: [for (final v in system.variables) v.name],
        tracks: [
          for (final t in system.tracks)
            if (t.kind == 'levels') t.name,
        ],
        sheet: sheet,
      )(),
    );
    out['names:${system.id}'] = [
      for (final n in namesInPagesJob(stored, order, known: {for (final i in system.items) i.name})()) nameJson(n),
    ];
    // Names added to it, as the view adds them.
    final x = SystemChanges(s, now: 1000, createId: idsFrom('add'));
    final added = addNames(x, model, system.id, [
      (name: 'Tide Sense', thing: PageThing.skill, rank: 'E', times: 1, chapter: 1, nodeId: 'n', block: 0, said: ''),
      (name: 'Giant Slayer', thing: PageThing.title, rank: '', times: 1, chapter: 1, nodeId: 'n', block: 0, said: ''),
      (name: 'Warden', thing: PageThing.kit, rank: 'Common', times: 1, chapter: 1, nodeId: 'n', block: 0, said: ''),
      (name: 'Tide Glass', thing: PageThing.item, rank: '', times: 1, chapter: 1, nodeId: 'n', block: 0, said: ''),
    ]);
    out['added:${system.id}'] = {
      'ids': added,
      'system': x.row('systems', system.id),
      'sheets': [
        for (final r in x.rows('systemSheets'))
          if (r['systemId'] == system.id) r,
      ],
    };
  }

  // Each person's chart series.
  final persons = {
    for (final p in model.progress) p.entryId,
  }.toList()..sort();
  out['charts'] = {
    for (final id in persons) id: [for (final c in chartSeries(model, id)) seriesJson(c)],
  };

  // The tracker's changes, on a copy.
  final who = [
    for (final e in entries)
      if (e.category == 'character') e.id,
  ];
  final first = who.firstOrNull ?? entries.firstOrNull?.id;
  final other = entries.where((e) => e.id != first).firstOrNull?.id;
  final chapter = order.firstOrNull;
  final event = model.events.keys.firstOrNull;
  final t = TrackChanges(s, now: 1000, createId: idsFrom('track'));
  String? level;
  String? titles;
  JsonMap? oaths;
  String? recorded;
  final script = <Object>[
    step(() => (level = t.addPreset('Level').id)),
    step(() => (titles = t.addPreset('Titles').id)),
    step(() => t.addPreset('Attributes').id),
    step(() => t.addPreset('Milestones').id),
    step(() => t.addPreset('level').id),
    step(() => t.addPreset('Level').id),
    step(() => (oaths = t.saveCategory(null, name: '  Oaths ', shape: 'held').raw)),
    step(() => t.saveCategory(null, name: 'oaths').raw),
    step(() => t.saveCategory(null, name: '   ').raw),
    step(() => t.saveCategory(null, name: 'Odd', shape: 'weird').raw),
  ];
  String? idOf(String? Function() f) => f();
  if (first != null) {
    final attributes = t.categories().firstWhere((c) => c.name == 'Attributes').id;
    final milestones = t.categories().firstWhere((c) => c.name == 'Milestones').id;
    script.addAll([
      step(
        () => (recorded = t.record({
          'entryId': first,
          'categoryId': level,
          'action': 'set',
          'value': ' 4 ',
          'at': chapter == null ? null : {'kind': 'node', 'nodeId': chapter},
        }).id),
      ),
      step(() => t.record({'entryId': first, 'categoryId': level, 'action': 'set', 'value': '6'}).raw),
      step(
        () => t.record({
          'entryId': first,
          'categoryId': titles,
          'action': 'gain',
          'subject': 'Giant Slayer',
          'at': event == null ? {'kind': 'date', 'when': {'precision': 'unknown'}} : {'kind': 'event', 'eventId': event},
          'cost': ' A friend ',
        }).raw,
      ),
      step(() => t.record({'entryId': first, 'categoryId': titles, 'action': 'lose', 'refId': other, 'at': null}).raw),
      step(() => t.record({'entryId': first, 'categoryId': milestones, 'action': 'happen', 'subject': 'First kill', 'note': 'n'}).raw),
      step(() => t.record({'entryId': first, 'categoryId': attributes, 'action': 'set', 'subject': 'Strength', 'value': '12'}).raw),
      step(() => t.record({'entryId': first, 'categoryId': attributes, 'action': 'set', 'value': '12'}).raw),
      step(() => t.record({'entryId': first, 'categoryId': level, 'action': 'gain', 'value': '1'}).raw),
      step(() => t.record({'entryId': first, 'categoryId': level, 'action': 'set', 'value': '  '}).raw),
      step(() => t.record({'entryId': 'nobody', 'categoryId': level, 'action': 'set', 'value': '1'}).raw),
      step(() => t.record({'entryId': first, 'categoryId': 'nope', 'action': 'set', 'value': '1'}).raw),
      step(() => t.record({'entryId': first, 'categoryId': titles, 'action': 'gain', 'abilityId': 'x/y'}).raw),
      step(
        () => t.record({
          'entryId': first,
          'categoryId': level,
          'action': 'set',
          'value': '2',
          'at': {'kind': 'node', 'nodeId': 'gone'},
        }).raw,
      ),
      step(
        () => t.record({
          'entryId': first,
          'categoryId': level,
          'action': 'set',
          'value': '2',
          'at': {
            'kind': 'date',
            'when': {'precision': 'relative', 'anchorId': 'gone', 'amount': 1, 'unit': 'day', 'before': false},
          },
        }).raw,
      ),
      step(
        () => t.record({
          'entryId': first,
          'categoryId': level,
          'action': 'set',
          'value': '2',
          'at': {
            'kind': 'date',
            'when': {'precision': 'exact', 'year': 12},
          },
        }).raw,
      ),
      step(() => t.record({'entryId': first, 'categoryId': level, 'action': 'set', 'value': '2', 'at': 'nonsense'}).raw),
      step(() => t.updateChange(idOf(() => recorded) ?? 'none', {'value': '5'}).raw),
      step(() => t.updateChange(idOf(() => recorded) ?? 'none', {'at': null, 'note': 'moved'}).raw),
      step(() => t.updateChange('none', {'value': '5'}).raw),
      step(() => t.saveCategory(level, shape: 'held').raw),
      step(
        () => t.saveCategory(
          level,
          ladder: ['Squire', ' Knight ', '', 'Squire'],
          characterIds: [first, 'nope', first],
          order: 7,
        ).raw,
      ),
      step(() => t.saveCategory(level, archived: true).raw),
      step(() => t.record({'entryId': first, 'categoryId': level, 'action': 'set', 'value': '9'}).raw),
      step(() => t.updateChange(idOf(() => recorded) ?? 'none', {'value': '8'}).raw),
      step(() {
        t.removeCategory(level!);
        return true;
      }),
      step(() {
        t.removeCategory(oaths!['id']! as String);
        return true;
      }),
      step(() {
        t.removeChange(recorded!);
        return true;
      }),
      step(() {
        t.removeChange('none');
        return true;
      }),
    ]);
  }
  out['track'] = {
    'script': script,
    'categories': t.rows('progressCategories'),
    'changes': t.rows('progressChanges'),
    'ordered': [for (final c in t.categories()) c.id],
  };

  // Snapshots, on a copy: for each person with a sheet or a snapshot (else the first character).
  final holders = {
    for (final x in model.sheets) x.entryId,
    for (final r in s.rows('progressSnapshots')) str(r['entryId']),
  }.toList()..sort();
  final logged = <Object>[];
  final snaps = SnapshotChanges(s, now: 2000, createId: idsFrom('snap'));
  for (final id in holders.isEmpty ? [?first] : holders) {
    ProgressSnapshot? a;
    ProgressSnapshot? b;
    logged.add(step(() => (a = snaps.createSnapshot(id, label: ' Start ')).raw));
    logged.add(step(() => (b = snaps.createSnapshot(id, nodeId: chapter, label: 'Ch1')).raw));
    logged.add(step(() => snaps.createSnapshot(id, nodeId: 'missing').raw));
    if (b case final made?) {
      logged.add(
        step(() {
          snaps.updateSnapshot(
            made.id,
            (c) => {
              'label': ' New ',
              'gear': [
                ...maps(c.raw['gear']),
                {'name': 'Sword', 'kind': 'Weapon'},
                {'name': '  '},
                {'id': 'kept', 'name': ' Shield ', 'entryId': other, 'note': 'dented'},
              ],
              'status': {'condition': 'Hurt\n\n Tired ', 'goals': 'Home'},
              'systems': {...?mapOrNull(c.raw['systems']), 'nope': {}},
            },
          );
          return snaps.row('progressSnapshots', made.id);
        }),
      );
      logged.add(
        step(() {
          snaps.updateSnapshot(made.id, (c) => {'nodeId': order.length > 1 ? order[1] : 'missing', 'notes': 'n'});
          return snaps.row('progressSnapshots', made.id);
        }),
      );
      final systems = [...model.systems.values];
      final now = ProgressSnapshot(snaps.row('progressSnapshots', made.id)!);
      logged.add({
        'resolved': {
          for (final MapEntry(key: sid, value: st) in now.systems.entries)
            if (model.systems[sid] case final system?) sid: resolvedJson(resolveSystem(system, st)),
        },
        if (a case final start?) 'compared': comparisonJson(compareSnapshots(start, now, systems)),
      });
    }
    if (a case final start?) {
      logged.add(
        step(() {
          snaps.removeSnapshot(start.id);
          return true;
        }),
      );
    }
  }
  logged.add(step(() => snaps.createSnapshot('nobody').raw));
  logged.add(
    step(() {
      snaps.updateSnapshot('none', (c) => {});
      return true;
    }),
  );
  logged.add(
    step(() {
      snaps.removeSnapshot('none');
      return true;
    }),
  );
  out['snapshots'] = {'script': logged, 'rows': snaps.rows('progressSnapshots')};
  return out;
}

// ---------------------------------------------------------------------------------------------------- misc

List<LevelChapter> book(List<String> chapters) => [
  for (final (i, text) in chapters.indexed) (id: 'c${i + 1}', paragraphs: [text]),
];

const levelTexts = [
  'The armor answered him. Archer Armor Level 1. The bow settled into his hands.',
  'He drew on it again, and the Archer Armor reached Level 2. Then Hunter Armor (Lv. 1) woke.',
  'Hunter Armor Level 2 hummed. The Hunter Armor’s level rose to 4. It was a Level 6 Hunter Armor now.',
  '[Hunter Armor: Lv 7] Then Hunter Armor hit level 9! The Hunter Armor leveled up. [Hunter Armor Level Up!]',
  'Then James’s Hunter Armor reached Level 3. Wren reached Level 5. Tide Sense Lv. 2 flickered.',
  'His Spear of the Deep was now at Level 4. Suddenly Fireball reached Level 10. LVL. 3 Fireball?',
  'The curse struck, and the Hunter Armor dropped to Level 30. The Hunter Armor was Level 20.',
  'Kade and Mira watched the Ember Lamp reach Level 3. Kade’s Ember Lamp reached Level 4.',
  'Kade knew the forest. Kade felt the cold come down. Kade saw the wolves. His Wolf Fang reached Level 2.',
  'Mira lifted the Tide Spear, and the Tide Spear hit Level 2. The Tide Spear has finally reached Level 5.',
  'He wore the Hunter Armor into the rain. The level of the river rose. Floor Level 3 was dark.',
  'The Blade of the North Wind evolved into Level 12. The Old Crown became Level 2… and fell to Level 1.',
  '[Ash Ring Lv.4] [Ash Ring — Level 5] [Ash Ring- Level 6] Ash Ring LVL 7. Ash Ring lvl8.',
  'The Mirror’s level was 3. Mirror Level 3 again. Kira’s Mirror rose to Level 99999.',
];

const people = <({String id, List<String> names})>[
  (id: 'kade', names: ['Kade Ash', 'Kade']),
  (id: 'mira', names: ['Mira']),
  (id: 'kira', names: ['Kira']),
];

const ledgerTexts = [
  ['Kael checked his status. Strength 10. Level 1.', 'HP: 100 / 230'],
  ['[Strength +2 (10 → 12)]', 'He had reached Level 2 at last.', 'Agility = 7. Agility is now 9.'],
  ['Strength 13. Level 4.', '[Strength +2 (12 → 15)]', 'By then he was Level 3.'],
  ['Strength 13. Level 2. Then Strength +2 (12 -> 14). Level 1.', 'By dusk her HP 3.5 and falling. Later.'],
  ['Superstrength 40. Strength 50% of his best. Levelled 3 times.', 'Strength −1 (14 to 13). HP of 12.5.'],
  ['【Strength +0 (13 → 13)】 Level at 9. Agility +1.5 (9 → 10.5).', 'Strength 007. Level 99999999999999999999.'],
];

const nameTexts = [
  ['[Skill acquired: Tide Sense (E)]', 'Title earned: Giant Slayer.'],
  ['【Class unlocked: Warden】', '<Item obtained: Tide Glass>', 'New skill: Spark, and then nothing.'],
  ['He used [Power Strike] again.', '[Power Strike] missed.', 'Skills gained: Storm Step (B).'],
  ['[Title earned: Ironside]', 'They called him [Ironside].', '[Power Strike] hit.', 'spell: fire bolt.'],
  ['[Status]', '[Level up!]', '[Warning]', '[This is a whole sentence in brackets here]', '[Fireball]', '[Spark]'],
  ['Ability unlocked: Shadow Veil (SSS). Technique learned: Iron Body! Power granted: Flame Heart (Rare)'],
  ['Item received: a cracked lantern', 'Class chosen: Rune Knight (A)', '[Rune Knight]', '[New Quest]'],
];

Map<String, Object?> misc() {
  final out = <String, Object?>{};
  out['levels'] = [for (final l in levelsInPages(book(levelTexts))) levelledJson(l)];
  out['levelsPeople'] = [for (final l in levelsInPages(book(levelTexts), people: people)) levelledJson(l)];
  out['levelsAside'] = [
    for (final l in levelsInPages(
      book(levelTexts),
      setAside: {'hunter armor', 'fireball'},
      people: people,
      assigned: {'tide spear': 'kade', 'ember lamp': '', 'wolf fang': 'nobody'},
    ))
      levelledJson(l),
  ];
  out['levelsUp'] = [for (final l in levelsInPages(book(['The Hunter Armor leveled up.']))) levelledJson(l)];
  out['cleaned'] = [
    for (final raw in ['Then The', 'He', 'James’s Hunter Armor', 'Now the Spear of the', "Kade's", 'Status', '  The Old Crown  '])
      [cleanLevelName(raw), ownerIn(raw)],
  ];
  List<({String id, List<String> paragraphs})> chapters(List<List<String>> texts) => [
    for (final (i, p) in texts.indexed) (id: 'c$i', paragraphs: p),
  ];
  out['ledger'] = ledgerJson(
    numberLedger(chapters(ledgerTexts), stats: const ['Strength', 'HP', 'Agility', ' ', 'S'], tracks: const ['Level']),
  );
  out['ledgerSheet'] = ledgerJson(
    numberLedger(
      chapters(ledgerTexts),
      stats: const ['Strength', 'HP', 'Agility'],
      tracks: const ['Level'],
      sheet: {'level': 6, 'HP': 40, 'strength': 13.0, 'Agility': 10.5},
    ),
  );
  out['names'] = [for (final n in namesInPages(chapters(nameTexts))) nameJson(n)];
  out['namesKnown'] = [
    for (final n in namesInPages(chapters(nameTexts), known: {'fireball', ' Power Strike '}, setAside: {'Spark'}))
      nameJson(n),
  ];
  return out;
}

// ------------------------------------------------------------------------------------------- output

/// The test's canonical JSON and its FNV-1a hash (as test/characters/golden/dump.dart).
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
    out[name] = full ? parts : {for (final MapEntry(:key, :value) in parts.entries) key: hashOf(value)};
  }
  out['misc'] = misc();
  File(args.first).writeAsStringSync(jsonEncode(out));
}
