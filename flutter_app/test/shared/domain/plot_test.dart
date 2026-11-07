// Plot threads, the scene board, structure and pacing, and the appearance matrix, ported: agreement with the original
// app on both real files and a generated saga (tool/golden/plot.test.ts).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/appearances.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/board.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/plot/diagnostics.dart';
import 'package:novel_builder/shared/domain/plot/lanes.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/structure/pacing.dart' as pacing;

import 'fixtures.dart';
import 'golden.dart';

JsonMap? _place(Place? p) => p == null ? null : {'parentId': p.parentId, 'beforeId': p.beforeId};

List<JsonMap> _parts(List<BoardPart> parts) => [
  for (final p in parts)
    {
      'key': p.key,
      'parentId': p.parentId,
      'path': [for (final n in p.path) n.id],
      'columns': [
        for (final c in p.columns)
          {
            'chapter': c.chapter.id,
            'words': c.words,
            'scenes': [
              for (final s in c.scenes) [s.node.id, s.words],
            ],
          },
      ],
      'endBeforeId': p.endBeforeId,
    },
];

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final nodes = [...model.nodes.values];
  final lanes = threadLanes(model);
  final threads = [...model.threads.values];
  final board = boardOf(nodes);
  final firstChapter = nodes.where((n) => n.kind == NodeKind.chapter).firstOrNull;
  final statusOf = firstChapter?.status ?? NodeStatus.idea;
  final docs = [
    for (final n in nodes)
      if (n.kind == NodeKind.chapter || n.kind == NodeKind.scene) n,
  ];
  final ids = [for (final n in docs) n.id];
  final first = docs.firstOrNull;
  final parts = [
    for (final n in nodes)
      if (n.kind == NodeKind.volume || n.kind == NodeKind.act || n.kind == NodeKind.arc) n.id,
  ];
  final markers = [for (final r in s.rows('structureMarkers')) pacing.StructureMarker(r)];
  final barsC = pacing.lengthBars(model);
  final barsS = pacing.lengthBars(model, grain: pacing.Grain.scenes);
  JsonMap bar(pacing.LengthBar b) => {
    'nodeId': b.nodeId,
    'chapterId': b.chapterId,
    'chapterNumber': b.chapterNumber,
    'label': b.label,
    'words': b.words,
    'labels': b.labels,
    'partId': b.partId,
  };
  final locations = [
    for (final e in model.entries.values)
      if (e.category == 'location') e.id,
  ];
  final chapters = model.order.chapters;
  return {
    'lanes': {
      'chapters': [
        for (final c in lanes.chapters) {'id': c.id, 'number': c.number, 'title': c.title},
      ],
      'lanes': [
        for (final l in lanes.lanes)
          {
            'thread': l.thread.id,
            'cells': [
              for (final c in l.cells)
                {
                  'places': [
                    for (final p in c.places)
                      [
                        p.nodeId,
                        p.chapterId,
                        [for (final b in p.beats) b.id],
                        p.eventIds,
                      ],
                  ],
                  'beats': [for (final b in c.beats) b.id],
                  'events': c.eventIds,
                  'role': c.role,
                },
            ],
            'first': l.first,
            'last': l.last,
            'gaps': [
              for (final g in l.gaps) {'from': g.from, 'to': g.to, 'chapters': g.chapters, 'words': gapWords(lanes, g)},
            ],
            'crossings': [
              for (final c in l.crossings) {'beatId': c.beatId, 'column': c.column, 'otherId': c.otherId},
            ],
            'unplaced': [for (final b in l.unplaced) b.id],
            'untold': l.untold,
            'ends': {'introduced': endsOf(l, lanes).introduced, 'resolved': endsOf(l, lanes).resolved},
          },
      ],
    },
    'byNode': {
      for (final e in threadsByNode(model).entries)
        e.key: [
          for (final h in e.value) {'thread': h.thread.id, 'roles': h.roles, 'plain': h.plainIds, 'events': h.events},
        ],
    },
    'diagnosis': {
      for (final q in [5, 20])
        '$q': () {
          final d = diagnose(threads, nodes, q);
          return {
            'frontier': d.frontier,
            'chapters': d.chapterCount,
            'reports': [
              for (final r in d.reports)
                {
                  'thread': r.thread.id,
                  'beats': [
                    for (final b in r.beats) [b.beat.id, b.node?.id, b.chapter, b.missing, beatPlace(b)],
                  ],
                  'quietFor': r.quietFor,
                  'issues': [
                    for (final i in r.issues) {'kind': i.kind, 'message': i.message},
                  ],
                  'silenced': r.silenced,
                },
            ],
          };
        }(),
    },
    'board': _parts(board),
    'filters': {
      'status': _parts(filterBoard(board, BoardFilter(status: statusOf))),
      'text': _parts(filterBoard(board, const BoardFilter(text: 'SCENE 2'))),
      'thread': threads.isEmpty
          ? <Object?>[]
          : _parts(filterBoard(board, BoardFilter(nodeIds: {...threadsByNode(model).keys}))),
    },
    'moves': [
      for (final (i, n) in docs.take(12).indexed)
        for (final Place to in [
          (parentId: n.parentId, beforeId: null),
          (parentId: n.parentId, beforeId: ids[(i + 3) % ids.length]),
          (parentId: nodes.where((x) => x.kind != n.kind && x.kind != NodeKind.scene).firstOrNull?.id, beforeId: null),
          (parentId: null, beforeId: null),
          (parentId: n.id, beforeId: null),
        ])
          {
            'node': n.id,
            'to': _place(to),
            'drop': _place(dropOf(nodes, n.id, to)),
            'bulk': switch (bulkOf(nodes, n.id, to)) {
              final b? => {'scenes': b.scenes, 'words': b.words},
              null => null,
            },
            'place': _place(placeOf(nodes, n.id)),
          },
    ],
    'undo': first == null
        ? <Object?>[]
        : [
            for (final BoardChange ch in [
              StatusChange(first.id, first.title, NodeStatus.idea, first.status),
              StatusChange(first.id, first.title, NodeStatus.idea, NodeStatus.published),
              MoveChange(first.id, first.title, (parentId: null, beforeId: null), placeOf(nodes, first.id)!),
              MoveChange(first.id, first.title, (parentId: 'gone', beforeId: null), placeOf(nodes, first.id)!),
              const MoveChange('gone', 'Gone', (parentId: null, beforeId: null), (parentId: null, beforeId: null)),
            ])
              {'problem': undoProblem(nodes, ch), 'words': boardChangeWords(ch, nodes)},
          ],
    'pacing': {
      for (final grain in pacing.Grain.values)
        for (final partId in [null, ...parts.take(2)])
          '${grain.name}:${partId ?? 'all'}': () {
            final bars = pacing.lengthBars(model, grain: grain, partId: partId);
            final facts = pacing.lengthFacts(bars);
            final dist = pacing.labelDistribution(bars, model, grain);
            return {
              'bars': [for (final b in bars) bar(b)],
              'bands': [
                for (final b in pacing.partBands(bars, model))
                  {'partId': b.partId, 'title': b.title, 'kind': b.kind, 'from': b.from, 'to': b.to},
              ],
              'facts': {
                'count': facts.count,
                'total': facts.total,
                'average': facts.average,
                'median': facts.median,
                'longest': facts.longest?.nodeId,
                'shortest': facts.shortest?.nodeId,
                'empty': facts.empty,
                'labelled': facts.labelled,
              },
              'labels': {
                'labels': dist.labels,
                'cells': [
                  for (final c in dist.cells) {'nodeId': c.nodeId, 'words': c.words, 'unlabelled': c.unlabelled},
                ],
                'totals': [
                  for (final t in dist.totals) {'label': t.label, 'words': t.words, 'bars': t.bars},
                ],
                'unlabelled': dist.unlabelled,
              },
            };
          }(),
    },
    'used': pacing.usedLabels(model),
    'markers': [
      for (final p in pacing.placeMarkers(markers, model))
        {
          'marker': p.marker.id,
          'nodeId': p.nodeId,
          'via': p.via,
          'missing': p.missing,
          'barC': pacing.barOf(p, barsC, model),
          'barS': pacing.barOf(p, barsS, model),
        },
    ],
    'matrices': {
      for (final (k, f) in [
        ('chapters', const MatrixFilter()),
        ('scenes', const MatrixFilter(grain: Grain.scenes)),
        ('all', const MatrixFilter(all: true)),
        ('thread', MatrixFilter(grain: Grain.scenes, threadId: threads.firstOrNull?.id)),
        ('place', MatrixFilter(placeId: locations.firstOrNull)),
        ('status', MatrixFilter(grain: Grain.scenes, status: statusOf)),
        (
          'range',
          MatrixFilter(
            from: chapters.length > 1 ? chapters[1].id : null,
            to: chapters.length > 3 ? chapters[3].id : null,
          ),
        ),
      ])
        k: () {
          final m = appearanceMatrix(model, f);
          return {
            'columns': [
              for (final c in m.columns)
                {
                  'nodeId': c.nodeId,
                  'chapterId': c.chapterId,
                  'chapterNumber': c.chapterNumber,
                  'label': c.label,
                  'short': c.short,
                  'status': c.status.key,
                },
            ],
            'rows': [
              for (final r in m.rows)
                {
                  'id': r.characterId,
                  'name': r.name,
                  'recorded': r.recorded,
                  'cells': [for (final c in r.cells) c.state.name],
                },
            ],
            'hidden': m.hidden,
            'characters': m.characters,
          };
        }(),
    },
  };
}

void main() {
  final golden = readGolden('plot.golden.json');
  final sources = {
    for (final name in fixtureNames) name: loadFixture(name),
    'saga': NovelSnapshot.fromJson(jsonDecode(File('test/fixtures/saga.novel.json').readAsStringSync())),
  };
  for (final MapEntry(key: name, value: snapshot) in sources.entries) {
    group('$name agrees with the original', () {
      final expected = golden[name]! as JsonMap;
      final actual = _report(snapshot);
      for (final part in expected.keys) {
        test(part, () => expectJson(actual[part], expected[part], '$name.$part'));
      }
    });
  }
}
