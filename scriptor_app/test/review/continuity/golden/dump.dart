// The Flutter app's own outputs for phase 7's continuity check, tracked rules and proofreading (continuity.golden.json
// pins them; outputs.ts makes Scriptor's, keyed and shaped the same way). For every novel given: the check of the
// novel as stored; a script of tracked-rule changes run on a copy (each step's row or refusal), the check of the copy,
// the author's decisions on its first findings and the check again, a decision withdrawn and the check again; each
// finding's "Update canon" applied on its own copy (the row it changes, or the refusal); the page's words (each rule's
// line, the head, the tabs, the filters and their groups, each card, the rule form's choices and what stops it); and
// the proof of the book with its page's words. And `misc`: the helpers and the proof over texts made to test them.
//
// What is the widgets' (continuity_page.dart's describeRule, head, tabs, filters, cards and rule form;
// integrity_service.dart's decide and reopen, applied to the change's own rows) is copied here word for word, but for
// the ids (handed out in turn, as the tests' are).
//
// To make the golden again: run.sh in the scratchpad's `continuity` folder (it holds the package config).

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/continuity/audit.dart';
import 'package:novel_builder/shared/domain/continuity/continuity_changes.dart';
import 'package:novel_builder/shared/domain/continuity/rules.dart';
import 'package:novel_builder/shared/domain/continuity/text.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' show isDocument;
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/review.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';
import 'package:novel_builder/shared/domain/text/proof.dart';
import 'package:novel_builder/shared/domain/timeline/narrative.dart' show nodeLabel;

// ---------------------------------------------------------------------------------------------------- as JSON

Object proofJson(Proof p) => {
  'kind': p.kind.name,
  'chapter': p.chapter,
  'nodeId': p.nodeId,
  'block': p.block,
  'text': p.text,
  'start': p.start,
  'end': p.end,
  'note': p.note,
  'find': p.find,
};

Object auditJson(AuditResult r) => {
  'open': [for (final i in r.open) i.toJson()],
  'resolved': [
    for (final x in r.resolved) {'issue': x.issue.key, 'resolution': x.resolution.id, 'decision': x.resolution.decision.name},
  ],
  'stale': [for (final x in r.stale) x.id],
  'scanned': {'documents': r.scanned.documents, 'paragraphs': r.scanned.paragraphs, 'rules': r.scanned.rules},
};

List<ContinuityRule> rulesOf(NovelSnapshot s) => [for (final r in s.rows('continuityRules')) ContinuityRule(r)]
  ..sort((a, b) {
    final c = a.createdAt.compareTo(b.createdAt);
    return c != 0 ? c : a.id.compareTo(b.id);
  });

Map<String, Object?> docsOf(NovelSnapshot s) => {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']};

AuditResult check(NovelSnapshot s) =>
    audit(StoryModel.fromSnapshot(s), docsOf(s), rulesOf(s), [for (final r in s.rows('continuityResolutions')) ReviewItem(r)]);

// ------------------------------------------------------------------------------- the widgets' parts, word for word

({String subject, String detail, bool broken}) describeRule(ContinuityRule rule, StoryModel model) {
  String? name(String? id) => id == null ? null : model.entries[id]?.name;
  String? title(String? id) => id == null ? null : model.nodes[id]?.title;
  final span =
      '${title(rule.fromNodeId) != null ? 'from ${title(rule.fromNodeId)}' : 'from the start'}'
      '${title(rule.untilNodeId) != null ? ' until ${title(rule.untilNodeId)}' : ''}';
  final subject = name(rule.entryId) ?? 'An entry that was removed';
  switch (rule.kind) {
    case 'travel':
      return (
        subject: '$subject ↔ ${name(rule.toEntryId) ?? 'a place that was removed'}',
        detail: rule.amount != null ? formatRuleDuration(rule.amount!, rule.unit) : 'No time recorded',
        broken: name(rule.entryId) == null || name(rule.toEntryId) == null || rule.amount == null,
      );
    case 'power':
      return (
        subject: subject,
        detail:
            '${rule.label.isNotEmpty ? rule.label : 'Rule'} · blocked by: '
            '${rule.words.isNotEmpty ? rule.words.join(', ') : 'nothing yet'} '
            '(${rule.scope == 'paragraph' ? 'same paragraph' : 'anywhere in the scene'})',
        broken: name(rule.entryId) == null || rule.words.isEmpty,
      );
    case 'possession':
      final state = rule.state == 'held'
          ? 'held by ${name(rule.holderId) ?? 'someone who was removed'}'
          : (rule.state ?? 'lost');
      return (
        subject: subject,
        detail: '$state $span',
        broken: name(rule.entryId) == null || (rule.state == 'held' && name(rule.holderId) == null),
      );
  }
  final state = rule.state == 'deceased'
      ? 'deceased'
      : (rule.label.isNotEmpty ? rule.label : stateLabels[rule.state ?? 'absent']!.toLowerCase());
  return (
    subject: subject,
    detail:
        '$state $span${rule.state == 'condition' ? ' · would not fit: ${rule.words.isNotEmpty ? rule.words.join(', ') : 'nothing yet'}' : ''}',
    broken: name(rule.entryId) == null || (rule.state == 'condition' && rule.words.isEmpty),
  );
}

Object ruleCardJson(ContinuityRule rule, StoryModel model) {
  final (:subject, :detail, :broken) = describeRule(rule, model);
  return {
    'subject': subject,
    'lines': [
      detail,
      if (rule.aliases.isNotEmpty) 'Also written as: ${rule.aliases.join(', ')}',
      if (broken) 'This cannot be checked as it stands: something it needs is missing.',
    ],
    'stopMessage':
        'Stop tracking “$subject: $detail”? Decisions you made about its findings are kept, and simply stop applying.',
  };
}

const _tabs = {'issues': 'Issues', 'reviewed': 'Reviewed', 'tracked': 'What is tracked'};

/// The page as continuity_page.dart builds it, for the filters given (severity, category, chapter: null for none).
Object viewJson(AuditResult result, List<ContinuityRule> rules, Severity? severity, String? category, String? nodeId) {
  final open = result.open;
  final counts = {for (final s in Severity.values) s: open.where((i) => i.severity == s).length};
  final chapter = open.any((i) => i.nodeId == nodeId) ? nodeId : null;
  final visible = [
    for (final i in open)
      if ((severity == null || i.severity == severity) &&
          (category == null || i.category == category) &&
          (chapter == null || i.nodeId == chapter))
        i,
  ];
  final places = <String, String>{for (final i in open) i.nodeId: i.nodeTitle};
  final header = open.isEmpty
      ? 'No open issues'
      : '${open.length} open ${open.length == 1 ? 'issue' : 'issues'} · ${counts[Severity.critical]} critical · '
            '${counts[Severity.warning]} ${counts[Severity.warning] == 1 ? 'warning' : 'warnings'} · ${counts[Severity.info]} info';
  return {
    'header': header,
    'read':
        'Read ${result.scanned.paragraphs} ${result.scanned.paragraphs == 1 ? 'paragraph' : 'paragraphs'} in '
        '${result.scanned.documents} ${result.scanned.documents == 1 ? 'chapter or scene' : 'chapters and scenes'} '
        'against ${result.scanned.rules} tracked ${result.scanned.rules == 1 ? 'rule' : 'rules'} and the character '
        'profiles, as saved now. A check only reads: it never changes your text or your canon.',
    'tabs': [
      for (final MapEntry(:key, :value) in _tabs.entries)
        '$value (${switch (key) {
          'issues' => open.length,
          'reviewed' => result.resolved.length + result.stale.length,
          _ => rules.length,
        }})',
    ],
    'filters': open.isEmpty
        ? null
        : {
            'severity': ['Every severity', for (final s in Severity.values) '${s.label} (${counts[s]})'],
            'category': [
              'Every kind of check',
              for (final c in issueCategories)
                if (open.any((i) => i.category == c)) issueCategoryLabels[c]!,
            ],
            'chapter': ['Whole manuscript', for (final v in places.values) v],
            'chosenChapter': chapter,
          },
    'empty': open.isEmpty
        ? {
            'title': rules.isEmpty && result.resolved.isEmpty ? 'Tell the checker what must stay true' : 'Nothing to review',
            'track': rules.isEmpty ? 'Choose what to track' : null,
          }
        : null,
    'noMatch': open.isNotEmpty && visible.isEmpty,
    'groups': [
      for (final s in Severity.values)
        if (visible.where((i) => i.severity == s).toList() case final here when here.isNotEmpty)
          {'heading': '${s.label} (${here.length})', 'keys': [for (final i in here) i.key]},
    ],
  };
}

Object cardJson(Issue issue, StoryModel model) {
  final at = issue.match.isEmpty ? -1 : issue.excerpt.indexOf(issue.match);
  return {
    'category': issueCategoryLabels[issue.category],
    'where': '${issue.nodeTitle} · paragraph ${issue.block + 1}',
    'excerpt': at < 0
        ? [issue.excerpt, '', '']
        : [issue.excerpt.substring(0, at), issue.match, issue.excerpt.substring(at + issue.match.length)],
    'entries': [
      for (final id in issue.entryIds)
        if (model.entries[id] case final e?) e.name,
    ],
    'tracked': issue.ruleId != null,
    'update': issue.fix == null ? null : '${issue.fixSummary} The manuscript is not changed.',
  };
}

/// The rule form's choices for [kind] with [entryId], [toEntryId] and [state] as the draft holds them.
Object formJson(StoryModel model, String kind, String? entryId, String? toEntryId, String state) {
  final preferred = {'status': 'character', 'possession': 'item', 'travel': 'location', 'power': 'power'}[kind];
  final all = stableSorted(model.entries.values, (a, b) => localeCompare(a.name, b.name));
  final pool = all.any((e) => e.category == preferred) && kind != 'power'
      ? [
          for (final e in all)
            if (e.category == preferred || e.id == entryId || e.id == toEntryId) e,
        ]
      : all;
  final characters = [
    for (final e in all)
      if (e.category == 'character') e,
  ];
  final chapters = stableSorted(
    model.nodes.values.where((n) => model.order.position.containsKey(n.id)),
    (a, b) => model.order.position[a.id]!.compareTo(model.order.position[b.id]!),
  );
  return {
    'subjects': [for (final e in pool) e.name],
    'holders': kind == 'possession' && state == 'held' ? [for (final e in characters) e.name] : null,
    'chapters': kind == 'status' || kind == 'possession'
        ? ['From the start', for (final n in chapters) nodeLabel(model, n.id)]
        : null,
  };
}

/// What stops the form being saved (the Save button's checks), for a draft.
String? problemOf(
  String kind, {
  String? entryId,
  String? toEntryId,
  String amountText = '',
  String state = 'deceased',
  String? holderId,
  String words = '',
}) {
  final subjectLabel = {'status': 'Character', 'possession': 'Item', 'travel': 'From', 'power': 'Ability or power'}[kind]!;
  final amount = double.tryParse(amountText.trim());
  return entryId == null
      ? 'Choose ${kind == 'travel' ? 'where the journey starts' : 'the ${subjectLabel.toLowerCase()}'}.'
      : kind == 'travel' && (toEntryId == null || toEntryId == entryId)
      ? 'Choose a different place for the journey to end.'
      : kind == 'travel' && !(amount != null && amount > 0)
      ? 'Say how long the journey takes.'
      : kind == 'possession' && state == 'held' && holderId == null
      ? 'Choose who holds it.'
      : (kind == 'power' || (kind == 'status' && state == 'condition')) && words.trim().isEmpty
      ? 'Add at least one word to look for.'
      : null;
}

/// integrity_service.dart's decide, on the change's own rows.
void decide(ContinuityChanges c, String key, String message, ReviewDecision kind, {String note = '', String? nodeId}) {
  final existing = c.rows('continuityResolutions').where((r) => r['key'] == key).firstOrNull;
  final now = c.now;
  c.put('continuityResolutions', {
    ...?existing,
    'id': existing?['id'] ?? c.newId(),
    'projectId': c.projectId,
    'key': key,
    'kind': kind.name,
    'note': note.trim(),
    'message': message,
    'nodeId': nodeId != null && c.row('chapters', nodeId) != null ? nodeId : existing?['nodeId'],
    'createdAt': existing?['createdAt'] ?? now,
    'updatedAt': now,
  });
}

// ---------------------------------------------------------------------------------------------------- a novel

JsonMap novel(NovelSnapshot s) {
  var ids = 0;
  var clock = 1000;
  ContinuityChanges changes(NovelSnapshot snap) => ContinuityChanges(snap, now: ++clock, createId: () => 'id${++ids}');
  final model = StoryModel.fromSnapshot(s);
  final all = [...model.entries.values];
  List<Entry> of(String category) => [
    for (final e in all)
      if (e.category == category) e,
  ];
  String? pick(List<Entry> list, int i) => list.length > i ? list[i].id : (all.length > i ? all[i].id : null);
  final characters = of('character');
  final items = of('item');
  final places = of('location');
  final powers = of('power');
  final documents = [
    for (final n in readingOrder(model.nodes.values))
      if (isDocument(n.kind)) n,
  ];
  String? doc(int i) => documents.isEmpty ? null : documents[i < 0 ? documents.length + i : i.clamp(0, documents.length - 1)].id;

  // A script of tracked rules on a copy.
  var copy = s;
  final steps = <Object?>[];
  T? step<T>(T Function(ContinuityChanges c) apply, Object? Function(T) show) {
    final c = changes(copy);
    try {
      final r = apply(c);
      copy = c.snapshot;
      steps.add(show(r));
      return r;
    } on ChangeRefused catch (e) {
      steps.add('refused: ${e.message}');
      return null;
    }
  }

  final first = step(
    (c) => c.createRule('status', {
      'entryId': pick(characters, 0),
      'state': 'deceased',
      'aliases': 'the heir, , The Heir',
      'fromNodeId': doc(0),
    }),
    (r) => r.raw,
  );
  step(
    (c) => c.createRule('status', {
      'entryId': pick(characters, 1),
      'state': 'absent',
      'label': '  imprisoned in the Keep ',
      'fromNodeId': doc(1),
      'untilNodeId': doc(-1),
    }),
    (r) => r.raw,
  );
  step(
    (c) => c.createRule('status', {
      'entryId': pick(characters, 2),
      'state': 'condition',
      'words': 'ran, both hands, ran',
      'fromNodeId': doc(0),
    }),
    (r) => r.raw,
  );
  step((c) => c.createRule('possession', {'entryId': pick(items, 0), 'state': 'lost', 'fromNodeId': doc(0)}), (r) => r.raw);
  step(
    (c) => c.createRule('possession', {
      'entryId': pick(items, 1),
      'state': 'held',
      'holderId': pick(characters, 0),
      'fromNodeId': 'gone',
    }),
    (r) => r.raw,
  );
  step(
    (c) => c.createRule('travel', {'entryId': pick(places, 0), 'toEntryId': pick(places, 1), 'amount': '1.5', 'unit': 'hours'}),
    (r) => r.raw,
  );
  step(
    (c) => c.createRule('power', {
      'entryId': pick(powers, 0),
      'words': ['night', 'dark', 'sea', 'dark'],
      'scope': 'paragraph',
      'label': 'needs the sun',
    }),
    (r) => r.raw,
  );
  step((c) => c.createRule('weather'), (r) => r.raw);
  if (first != null) {
    step((c) {
      c.updateRule(first.id, {'state': 'absent', 'amount': 3, 'unit': 'weeks', 'note': 'kept'});
      return c.owned(first.id);
    }, (r) => r.raw);
  }
  step((c) {
    c.updateRule('nope', {});
    return true;
  }, (r) => r);

  final copyModel = StoryModel.fromSnapshot(copy);
  final rules = rulesOf(copy);
  final checked = check(copy);
  final before = copy;

  // Each finding's "Update canon", on a copy of its own.
  final fixes = <Object?>[];
  for (final issue in [...checked.open, FieldFix('nope', 'x', '1'), EndRuleFix('gone', 'x')]) {
    final fix = issue is Issue ? issue.fix : issue as Fix;
    if (fix == null) continue;
    final c = changes(before);
    try {
      c.applyFix(fix);
      fixes.add({
        'fix': fix.toJson(),
        'rules': [for (final r in c.rows('continuityRules')) r],
        'entries': [for (final r in c.rows('loreEntries')) r['fields']],
      });
    } on ChangeRefused catch (e) {
      fixes.add({'fix': fix.toJson(), 'refused': e.message});
    }
  }

  // The author's decisions on the first findings.
  final open = checked.open;
  final d = changes(copy);
  if (open.isNotEmpty) decide(d, open[0].key, open[0].message, ReviewDecision.intentional, note: ' Flashback sequence ', nodeId: open[0].nodeId);
  if (open.length > 1) decide(d, open[1].key, open[1].message, ReviewDecision.dismissed, nodeId: 'gone');
  if (open.length > 2) decide(d, open[2].key, open[2].message, ReviewDecision.review);
  decide(d, 'status|gone|x|y', 'An old finding', ReviewDecision.intentional, note: 'Disguise');
  decide(d, 'timeline|a', 'Elsewhere', ReviewDecision.dismissed);
  if (open.isNotEmpty) decide(d, open[0].key, open[0].message, ReviewDecision.dismissed, note: 'changed my mind');
  copy = d.snapshot;
  final decided = check(copy);
  final r = changes(copy);
  final withdrawn = r.rows('continuityResolutions').first;
  r.remove('continuityResolutions', str(withdrawn['id']));
  final reopened = check(r.snapshot);

  // The proof of the book.
  final nodes = [
    for (final n in readingOrder([for (final r in s.rows('chapters')) StoryNode(r)]))
      if (isDocument(n.kind)) n,
  ];
  final titles = {for (final n in nodes) n.id: n.title};
  final names = {
    for (final r in s.rows('loreEntries'))
      if ('${r['name'] ?? ''}'.trim().isNotEmpty) '${r['name']}'.trim(),
  };
  final proofs = proofsJob([for (final r in s.rows('chapterContents')) jsonEncode(r)], [for (final n in nodes) n.id], titles, names)();

  return {
    'stored': auditJson(check(s)),
    'script': steps,
    'checked': auditJson(checked),
    'resolutions': copy.rows('continuityResolutions'),
    'decided': auditJson(decided),
    'reopened': auditJson(reopened),
    'fixes': fixes,
    'rules': [for (final r in rules) ruleCardJson(r, copyModel)],
    'view': [
      viewJson(checked, rules, null, null, null),
      viewJson(checked, rules, Severity.warning, null, null),
      viewJson(checked, rules, null, open.isEmpty ? 'trait' : open.last.category, null),
      viewJson(checked, rules, null, null, open.isEmpty ? 'x' : open.last.nodeId),
      viewJson(decided, rules, Severity.info, 'trait', 'gone'),
      viewJson(check(s), rulesOf(s), null, null, null),
    ],
    'cards': [for (final i in checked.open) cardJson(i, copyModel)],
    'form': [
      for (final k in ruleKinds) formJson(copyModel, k, pick(characters, 0), pick(places, 1), k == 'possession' ? 'held' : 'deceased'),
      formJson(copyModel, 'travel', null, null, 'deceased'),
    ],
    'problems': [
      for (final k in ruleKinds) problemOf(k),
      problemOf('travel', entryId: 'a', toEntryId: 'a'),
      problemOf('travel', entryId: 'a', toEntryId: 'b', amountText: ' 0 '),
      problemOf('travel', entryId: 'a', toEntryId: 'b', amountText: '1e2'),
      problemOf('possession', entryId: 'a', state: 'held'),
      problemOf('possession', entryId: 'a', state: 'held', holderId: 'h'),
      problemOf('power', entryId: 'a', words: '   '),
      problemOf('status', entryId: 'a', state: 'condition', words: 'ran'),
      problemOf('status', entryId: 'a', state: 'condition'),
    ],
    'proofs': [for (final p in proofs) proofJson(p)],
  };
}

// ---------------------------------------------------------------------------------------------------- misc

const _hard = [
  'Mira drew the Sunblade and raised it high.',
  'O’Brien said, and O’Brien laughed. C++ came; Mr. Crane strode in.',
  'They sailed for half a day, then an hour, then 2.5 weeks, ninety-nine minutes and twenty one days.',
  'Her gray eyes. Whose blue-green eyes? Alex’s hair is very golden. His eyes were hazel.',
  'Alex had just turned 17. Alex, aged 30, left. Seventeen-year-old Alex ran. Alex is barely 9!',
  'Hi.  "Yes!" she said… Then? no. “Done.”\nNext line. ',
  'naïve ☃ 😀 Zoë Éric ÅNGSTRÖM',
  'The Sunblade in their grip; he threw the old cracked Sunblade.',
  'Mira, then Mira suddenly smiled; Mira walks.',
];

Object misc() {
  JsonMap? found(Found? f) => f == null ? null : {'index': f.index, 'text': f.text};
  final doc = {
    'type': 'doc',
    'content': [
      {
        'type': 'paragraph',
        'content': [
          {'type': 'text', 'text': 'The '},
          {
            'type': 'text',
            'text': 'He',
            'marks': [
              {'type': 'entityLink', 'attrs': {'entryId': 'mira'}},
            ],
          },
          {
            'type': 'text',
            'text': 'ir',
            'marks': [
              {'type': 'bold'},
              {'type': 'entityLink', 'attrs': {'entryId': 'mira'}},
            ],
          },
          {'type': 'hardBreak'},
          {
            'type': 'text',
            'text': 'Kai',
            'marks': [
              {'type': 'entityLink', 'attrs': {'entryId': 'kai'}},
              {'type': 'entityLink', 'attrs': {'entryId': 7}},
            ],
          },
        ],
      },
      {
        'type': 'blockquote',
        'content': [
          {
            'type': 'heading',
            'content': [
              {'type': 'text', 'text': 'Inside'},
            ],
          },
          {
            'type': 'bulletList',
            'content': [
              {
                'type': 'listItem',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {
                        'type': 'em',
                        'content': [
                          {'type': 'text', 'text': 'nested'},
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {'type': 'paragraph'},
    ],
  };
  return {
    'find': [
      for (final s in _hard)
        [
          [for (final f in findWords(s, ['Mira', 'O’Brien', 'C++', 'Mr. Crane', 'Zoë', 'Sunblade', ''])) found(f)],
          [for (final f in findWords(s, ['éric', 'ÅNGSTRÖM', 'gray', 'HALF A DAY'], loose: true)) found(f)],
        ],
    ],
    'acting': [
      for (final s in _hard) [for (final f in findWords(s, ['Mira', 'O’Brien', 'Alex'])) isActing(s, f)],
    ],
    'used': [
      for (final s in _hard) [for (final f in findWords(s, ['Sunblade'])) isUsed(s, f)],
    ],
    'durations': [
      for (final s in _hard)
        [for (final d in durationsIn(s)) {'amount': d.amount, 'unit': d.unit, 'hours': d.hours, 'text': d.text}],
    ],
    'numbers': [
      for (final n in ['0', '007', ' 12 ', 'Twenty-One', 'ninety nine', 'hundred-one', '1.50', '-3', 'an', ''])
        toNumber(n),
    ],
    'colours': [for (final s in _hard) coloursIn(s)],
    'colourOf': [
      for (final s in _hard)
        [found(colourOf(s, 'eyes', ['Alex', 'Zoë'])), found(colourOf(s, 'hair', ['Alex', 'O’Brien']))],
    ],
    'ages': [
      for (final s in _hard)
        [
          for (final x in sentencesOf(s))
            if (ageOf(x, ['Alex', 'Mira']) case final a?) {'age': a.age, 'text': a.text} else null,
        ],
    ],
    'sentences': [for (final s in _hard) sentencesOf(s)],
    'fingerprints': [for (final s in [..._hard, '', '\t\n', 'A B', 'İstanbul ΣΑΣ']) fingerprint(s)],
    'excerpts': [
      excerptAround('x' * 220, 0),
      excerptAround('x' * 221, 0),
      excerptAround('x' * 221, 221),
      excerptAround('${' ' * 100}${'y' * 200}${' ' * 100}', 150, 120),
    ],
    'durationWords': [
      formatRuleDuration(1, 'days'),
      formatRuleDuration(1.5, 'hours'),
      formatRuleDuration(0, 'weeks'),
      formatRuleDuration(2, 'months'),
      formatRuleDuration(0.1 + 0.2, 'minutes'),
    ],
    'paragraphs': [
      for (final p in paragraphsOf(doc))
        {
          'index': p.index,
          'text': p.text,
          'links': [
            for (final l in p.links) {'entryId': l.entryId, 'text': l.text},
          ],
        },
    ],
    'plain': [for (final w in ['looked', 'tried', 'stopped', 'liked', 'hoped', 'filled', 'seemed', 'cried', 'edited', 'ied']) plainOf(w)],
    'proofs': [
      for (final chapters in <List<ProofChapter>>[
        [
          (id: 'a', title: 'One', paragraphs: ['James ran. James stopped. James looked back.', 'Jmaes and Jaems and Jams.', null]),
          (id: 'b', title: '', paragraphs: ['“Open and not closed', 'still open', '"Straight one']),
          (id: 'c', title: 'Three', paragraphs: [null, '   ']),
        ],
        [
          (
            id: 'd',
            title: 'Spaces',
            paragraphs: [
              'One  two   three , four ; five. six. Mr. black. Dr. grey. etc. fine. i think i, i. it is.',
              'It was the The best. He didn\'t walked. They do not needed. She didn’t succeeded. Ran ran RAN.',
              '“Curly” and "straight" and “curly again” and “one more”.',
              '${'Word word, ' * 30} end end.',
            ],
          ),
        ],
        [
          for (var i = 0; i < 3; i++)
            (id: 'm$i', title: 'Many $i', paragraphs: [for (var j = 0; j < 30; j++) 'the the $j and  so on .']),
        ],
      ])
        [for (final p in proofsOf(chapters, names: {'James Hollis', 'Mira'})) proofJson(p)],
    ],
  };
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
