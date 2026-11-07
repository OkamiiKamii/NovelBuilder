// Canon and continuity review, ported: agreement with the original app on the record check's rules, the canon review,
// the marks laid over the views, the knowledge checks and spread, the manuscript continuity check, the gathered review
// and its decisions, and the text helpers (tool/golden/canon.test.ts). Routes are this app's own, so links and
// "see it in context" are compared by their words.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/canon/checks.dart';
import 'package:novel_builder/shared/domain/canon/overlay.dart';
import 'package:novel_builder/shared/domain/canon/review.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/knowledge.dart';
import 'package:novel_builder/shared/domain/continuity/audit.dart';
import 'package:novel_builder/shared/domain/continuity/rules.dart';
import 'package:novel_builder/shared/domain/continuity/text.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/records/review.dart';
import 'package:novel_builder/shared/domain/review/collect.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/timeline/review.dart';

import 'fixtures.dart';
import 'golden.dart';

Object? _num(double? v) => v == null ? null : (v == v.truncateToDouble() ? v.toInt() : v);

JsonMap? _markOut(OverlayMark? m) {
  if (m == null) return null;
  final badge = badgeOf(m);
  return {
    'status': m.status == null
        ? null
        : {'key': m.status!.key, 'label': m.status!.label, 'hint': m.status!.hint, 'glyph': m.status!.glyph},
    'warnings': [for (final w in m.warnings) w.key],
    'badge': badge == null ? null : {'glyph': badge.glyph, 'tone': badge.tone?.name ?? 'status'},
    'words': markWords(m),
  };
}

JsonMap _warningOut(Warning w) => {
  ...w.toJson(),
  'links': [for (final l in w.links) l.label],
  'context': w.context?.label,
};

/// The golden's warning with its routes reduced to their words.
Object? _goldenWarning(Object? w) {
  final m = w! as JsonMap;
  return {
    ...m,
    'links': [for (final l in maps(m['links'])) l['label']],
    'context': mapOrNull(m['context'])?['label'],
  };
}

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final facts = [for (final r in s.rows('canonFacts')) CanonFact(r)];
  final rules = stableRules([for (final r in s.rows('continuityRules')) ContinuityRule(r)]);
  final resolutions = [for (final r in s.rows('continuityResolutions')) ReviewItem(r)];
  final secrets = [for (final r in s.rows('characterSecrets')) CharacterSecret(r)];
  final records = checkRecords(model, facts: facts, rules: rules);
  final canon = reviewCanon(facts, [...model.entries.values], [...model.nodes.values], (k) => model.categories[k]);
  final timeline = reviewTimeline(model, [for (final r in rules) r.raw]);
  final docs = {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']};
  final result = audit(model, docs, rules, resolutions);
  final overlay = canonOverlay(
    model,
    records: records,
    timeline: timeline,
    canon: canon.reviews,
    continuity: result.open,
  );
  final warnings = collectWarnings(
    ReviewInput(
      model: model,
      facts: facts,
      rules: rules,
      markers: s.rows('structureMarkers'),
      aliases: {for (final p in s.rows('characterProfiles')) str(p['entryId']): strings(p['aliases'])},
      secrets: secrets,
      snapshots: [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)],
      manuscript: [...result.open, for (final r in result.resolved) r.issue],
    ),
  );
  final status = withStatus(warnings, resolutions, manuscriptChecked: true);
  final unchecked = withStatus(warnings, resolutions, manuscriptChecked: false);
  return {
    'records': [
      for (final f in records)
        {
          'key': f.key,
          'rule': f.rule.key,
          'severity': f.severity.name,
          'message': f.message,
          'because': f.because,
          'on': f.on,
          'refs': [for (final r in f.refs) r.toJson()],
        },
    ],
    'canon': {
      'reviews': [
        for (final r in canon.reviews)
          {
            'fact': r.fact.id,
            'flags': [
              for (final f in r.flags)
                {
                  'key': f.key,
                  'kind': f.kind,
                  'otherId': ?f.otherId,
                  'message': f.message,
                  if (f.dismiss case final d?)
                    'dismiss': {'factId': ?d.factId, 'entryId': ?d.entryId, 'field': ?d.field},
                },
            ],
          },
      ],
      'pairs': [
        for (final p in canon.pairs) {'a': p.a.id, 'b': p.b.id, 'stated': p.stated},
      ],
    },
    'audit': {
      'open': [for (final i in result.open) i.toJson()],
      'resolved': [
        for (final r in result.resolved) {'issue': r.issue.key, 'resolution': r.resolution.id},
      ],
      'stale': [for (final r in result.stale) r.id],
      'scanned': {
        'documents': result.scanned.documents,
        'paragraphs': result.scanned.paragraphs,
        'rules': result.scanned.rules,
      },
    },
    'knowledge': [
      for (final k in checkKnowledge(secrets, model))
        {
          'key': k.key,
          'rule': k.rule.name,
          'secretId': k.secretId,
          'ownerId': k.ownerId,
          'message': k.message,
          'because': k.because,
          'characterIds': k.characterIds,
        },
    ],
    'spread': {
      for (final secret in secrets)
        for (final axis in KnowledgeAxis.values)
          '${secret.id}/${axis.name}': () {
            final sp = knowledgeSpread(secret, model, axis);
            return {
              'points': [
                for (final p in sp.points) {'id': p.id, 'label': p.label, 'marks': p.marks},
              ],
              'rows': [
                for (final r in sp.rows)
                  {
                    'characterId': r.characterId,
                    'name': r.name,
                    'cells': [
                      for (final c in r.cells)
                        {
                          'record': c.record?.id,
                          'here': [for (final h in c.here) h.id],
                          'needs': [for (final n in c.needs) n.id],
                        },
                    ],
                    'now': {'state': r.now.state?.key, 'record': r.now.record?.id, 'source': r.now.source?.name},
                    'unplaced': [for (final u in r.unplaced) u.id],
                  },
              ],
              'tellings': [
                for (final t in sp.tellings)
                  {'recordId': t.recordId, 'fromId': t.fromId, 'toId': t.toId, 'point': t.point},
              ],
            };
          }(),
    },
    'overlay': {for (final MapEntry(:key, :value) in overlay.entries) key: _markOut(value)},
    'merged': _markOut(mergeMarks(overlay.values.take(5))),
    'warnings': [for (final w in warnings) _warningOut(w)],
    'status': {
      'items': [
        for (final i in status.items) {'key': i.warning.key, 'status': i.status, 'decision': i.decision?.id},
      ],
      'gone': [for (final d in status.gone) d.id],
      'goneUnchecked': [for (final d in unchecked.gone) d.id],
    },
  };
}

/// Rules in the order the original's check reads them: oldest first.
List<ContinuityRule> stableRules(List<ContinuityRule> rules) => [...rules]
  ..sort((a, b) {
    final c = a.createdAt.compareTo(b.createdAt);
    return c != 0 ? c : a.id.compareTo(b.id);
  });

JsonMap _textReport() {
  const samples = [
    'Mira drew the Sunblade and raised it high.',
    'Mira had said nothing; they spoke of Mira.',
    'said Mira, and Mira quietly smiled.',
    'The Sunblade in her hand gleamed. She pocketed the Sunblade.',
    'They rode for two days, then half an hour, then 3 weeks and a month. Twenty-two minutes later, nothing.',
    'Alex was nineteen years old. Twenty-year-old Alex laughed. Alex, 19, ran. Alex is 21 and tall.',
    'Her grey eyes shone. Alex’s hair was black. His hair is golden-brown. Whose blue-green eyes?',
    '“Run!” she cried. He ran… Then: nothing? Yes. “Done.” And so on.',
    'Ünïcödé names: Zoë met Éric at the Café. Zoë’s eyes were violet.',
  ];
  JsonMap? found(Found? f) => f == null ? null : {'index': f.index, 'text': f.text};
  return {
    'find': [
      for (final s in samples)
        [
          [
            for (final f in findWords(s, ['Mira', 'Sunblade', 'Alex', 'Zoë', 'café'])) found(f),
          ],
          [
            for (final f in findWords(s, ['café', 'TWO days', 'nothing'], loose: true)) found(f),
          ],
        ],
    ],
    'acting': [
      for (final s in samples)
        [
          for (final f in findWords(s, ['Mira', 'Alex', 'Zoë'])) isActing(s, f),
        ],
    ],
    'used': [
      for (final s in samples)
        [
          for (final f in findWords(s, ['Sunblade'])) isUsed(s, f),
        ],
    ],
    'durations': [
      for (final s in samples)
        [
          for (final d in durationsIn(s))
            {'amount': _num(d.amount), 'unit': d.unit, 'hours': _num(d.hours), 'text': d.text},
        ],
    ],
    'numbers': [
      for (final n in ['19', 'nineteen', 'twenty-two', 'a', 'hundred', 'twenty two', 'three point', '2.5', 'xyz'])
        _num(toNumber(n)),
    ],
    'colours': [for (final s in samples) coloursIn(s)],
    'colourOf': [
      for (final s in samples)
        [
          found(colourOf(s, 'eyes', ['Alex', 'Zoë'])),
          found(colourOf(s, 'hair', ['Alex'])),
        ],
    ],
    'ages': [
      for (final s in samples)
        [
          for (final x in sentencesOf(s))
            if (ageOf(x, ['Alex']) case final a?) {'age': _num(a.age), 'text': a.text} else null,
        ],
    ],
    'sentences': [for (final s in samples) sentencesOf(s)],
    'fingerprints': [
      for (final s in [...samples, '', '  Mixed   CASE  ', 'naïve ☃ 😀']) fingerprint(s),
    ],
    'excerpts': [
      excerptAround('short', 2),
      excerptAround('${'x' * 300} MATCH ${'y' * 300}', 302),
      excerptAround('a ' * 200, 5),
      excerptAround('b ' * 200, 390),
    ],
    'normalize': [
      for (final t in ['Réal Café', 'ÉLAN, vital!', '  spaced   out ', 'naïve—ﬁne', 'Ångström 1,000', 'Œuvre'])
        normalize(t),
    ],
  };
}

void main() {
  final golden = readGolden('canon.golden.json');
  final sources = {for (final name in fixtureNames) name: loadFixture(name), 'canon': loadFixture('canon')};
  for (final MapEntry(key: name, value: snapshot) in sources.entries) {
    group('$name agrees with the original', () {
      final expected = golden[name]! as JsonMap;
      final actual = _report(snapshot);
      for (final part in expected.keys) {
        test(part, () {
          final want = part == 'warnings'
              ? [for (final w in listOf(expected[part])) _goldenWarning(w)]
              : expected[part];
          expectJson(actual[part], want, '$name.$part');
        });
      }
    });
  }
  group('the text helpers agree with the original', () {
    final expected = golden['text']! as JsonMap;
    final actual = _textReport();
    for (final part in expected.keys) {
      test(part, () => expectJson(actual[part], expected[part], 'text.$part'));
    }
  });
  test('the canon statuses are the original’s', () {
    expect(
      [for (final s in CanonStatus.values) s.key],
      ['canon', 'provisional', 'non-canon', 'retconned', 'conflicting'],
    );
  });
}
