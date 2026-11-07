import 'dart:math' as math;

import '../collation.dart';
import '../manuscript/outline.dart' show isDocument;
import '../model/story_model.dart';
import '../model/story_order.dart' show subtreeIds;
import '../records/category.dart';
import '../records/entry.dart';
import '../records/review.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';
import 'rules.dart';
import 'text.dart';

/// Decisions about other checks' findings, kept with these and reviewed where those are shown: the timeline review,
/// knowledge, the record check, canon, journeys and ability paths.
const otherChecks = ['timeline|', 'knowledge|', 'integrity|', 'records|', 'canon|', 'travel|', 'paths|'];

class AuditResult {
  AuditResult(this.open, this.resolved, this.stale, this.scanned);

  /// Findings the author has not decided about, most serious first, then in reading order.
  final List<Issue> open;

  /// Findings the author marked intentional or dismissed, with the decision.
  final List<({Issue issue, ReviewItem resolution})> resolved;

  /// Decisions about passages that no longer raise a finding (the text or the rule has changed).
  final List<ReviewItem> stale;
  final ({int documents, int paragraphs, int rules}) scanned;

  /// Every finding, decided or not.
  List<Issue> get all => [...open, for (final r in resolved) r.issue];
}

const _ageFields = ['age'];
const _eyeFields = ['eyes', 'eye colour', 'eye color'];
const _hairFields = ['hair', 'hair colour', 'hair color'];

/// ZERO AUTOMATIC MODIFICATION RULE (as in the original app)
/// Reads the manuscript as it is saved ([docs]: each chapter's and scene's document, by node id) and compares it with
/// what the author has recorded: tracked rules and codex fields. It returns findings and, for each, a *proposed* change
/// to canon that would make the two agree; it applies nothing. Findings are matched by words, not by understanding, so
/// each one says "appears to": it is for the author to judge.
AuditResult audit(
  StoryModel model,
  Map<String, Object?> docs,
  List<ContinuityRule> rules,
  List<ReviewItem> resolutions,
) {
  final nodes = [...model.nodes.values];
  int position(String id) => model.order.position[id] ?? -1;
  final documents = [
    for (final node in stableSorted(
      nodes.where((n) => isDocument(n.kind)),
      (a, b) => position(a.id).compareTo(position(b.id)),
    ))
      (
        node: node,
        paragraphs: [
          for (final p in paragraphsOf(docs[node.id]))
            if (p.text.trim().isNotEmpty) p,
        ],
      ),
  ];
  final entries = [...model.entries.values];
  final entryById = model.entries;
  final characters = [
    for (final e in entries)
      if (e.category == 'character') e,
  ];
  final issues = <Issue>[];

  /// Where a rule starts to apply: after the last chapter or scene inside its starting point.
  int startsAfter(ContinuityRule rule) {
    final from = rule.fromNodeId;
    if (from == null || !model.nodes.containsKey(from)) return -1;
    return subtreeIds(nodes, from).map(position).reduce(math.max);
  }

  double endsAt(ContinuityRule rule) {
    final until = rule.untilNodeId;
    return until != null && model.nodes.containsKey(until) ? position(until).toDouble() : double.infinity;
  }

  String since(ContinuityRule rule) => rule.fromNodeId != null && model.nodes.containsKey(rule.fromNodeId)
      ? model.nodes[rule.fromNodeId]!.title
      : 'the start of the story';

  /// Every way an entry is written in a paragraph: its name, the rule's aliases, and any words linked to it there.
  List<String> namesIn(Paragraph paragraph, Entry entry, [List<String> aliases = const []]) => [
    entry.name,
    ...aliases,
    for (final l in paragraph.links)
      if (l.entryId == entry.id) l.text,
  ];

  void report(
    String category,
    Severity severity,
    StoryNode node,
    Paragraph paragraph,
    Found at,
    List<String?> parts, {
    required String message,
    required List<String> entryIds,
    required String? ruleId,
    required Fix? fix,
    required String fixSummary,
  }) {
    issues.add(
      Issue(
        key: [category, for (final p in parts) p ?? ''].join('|'),
        severity: severity,
        category: category,
        message: message,
        nodeId: node.id,
        nodeTitle: node.title,
        block: paragraph.index,
        excerpt: excerptAround(paragraph.text, at.index),
        match: at.text,
        entryIds: entryIds,
        ruleId: ruleId,
        fix: fix,
        fixSummary: fixSummary,
      ),
    );
  }

  for (final rule in rules) {
    final subject = rule.entryId == null ? null : entryById[rule.entryId];
    if (subject == null) continue;
    final from = startsAfter(rule);
    final until = endsAt(rule);
    final inForce = [
      for (final d in documents)
        if (position(d.node.id) > from && position(d.node.id) < until) d,
    ];

    if (rule.kind == 'status') {
      final state = rule.state ?? 'deceased';
      final described = state == 'deceased'
          ? 'deceased'
          : (rule.label.trim().isNotEmpty ? rule.label.trim() : (state == 'absent' ? 'away' : 'changed'));
      for (final (:node, :paragraphs) in inForce) {
        final end = EndRuleFix(rule.id, node.id);
        final endSummary = 'Record that ${subject.name} is no longer $described from “${node.title}” onwards.';
        ({Paragraph paragraph, Found at})? remembered;
        var acted = false;
        for (final paragraph in paragraphs) {
          final found = findWords(paragraph.text, namesIn(paragraph, subject, rule.aliases));
          if (found.isEmpty) continue;
          final acting = found.where((at) => isActing(paragraph.text, at)).firstOrNull;
          if (state == 'condition') {
            final clash = findWords(paragraph.text, rule.words, loose: true).firstOrNull;
            if (clash != null) {
              report(
                'status',
                Severity.warning,
                node,
                paragraph,
                clash,
                [rule.id, node.id, fingerprint(paragraph.text)],
                message:
                    '${subject.name} is recorded as “$described” from ${since(rule)}; “${clash.text}” in ${node.title} may '
                    'not fit.',
                entryIds: [subject.id],
                ruleId: rule.id,
                fix: end,
                fixSummary: endSummary,
              );
            }
          } else if (acting != null) {
            acted = true;
            report(
              'status',
              state == 'deceased' ? Severity.critical : Severity.warning,
              node,
              paragraph,
              acting,
              [rule.id, node.id, fingerprint(paragraph.text)],
              message:
                  '${subject.name} is recorded as $described from ${since(rule)}, and appears to speak or act in '
                  '${node.title}.',
              entryIds: [subject.id],
              ruleId: rule.id,
              fix: end,
              fixSummary: endSummary,
            );
          } else if (state == 'deceased' && remembered == null) {
            remembered = (paragraph: paragraph, at: found.first);
          }
        }
        // People go on talking about the dead: one gentle note per chapter is enough, and none where there is already
        // an alert.
        if (remembered != null && !acted) {
          report(
            'status',
            Severity.info,
            node,
            remembered.paragraph,
            remembered.at,
            [rule.id, node.id, 'mentioned'],
            message:
                '${subject.name} is recorded as deceased from ${since(rule)}, and is mentioned in ${node.title}. Nothing '
                'to do if they are being remembered.',
            entryIds: [subject.id],
            ruleId: rule.id,
            fix: end,
            fixSummary: endSummary,
          );
        }
      }
    }

    if (rule.kind == 'possession') {
      final state = rule.state ?? 'lost';
      final holder = rule.holderId == null ? null : entryById[rule.holderId];
      if (state == 'held' && holder == null) continue;
      for (final (:node, :paragraphs) in inForce) {
        for (final paragraph in paragraphs) {
          final used = findWords(
            paragraph.text,
            namesIn(paragraph, subject, rule.aliases),
          ).where((at) => isUsed(paragraph.text, at)).firstOrNull;
          if (used == null) continue;
          final fix = EndRuleFix(rule.id, node.id);
          if (state != 'held') {
            report(
              'possession',
              Severity.warning,
              node,
              paragraph,
              used,
              [rule.id, node.id, fingerprint(paragraph.text)],
              message:
                  '${subject.name} is recorded as $state from ${since(rule)}, and appears to be used in ${node.title}.',
              entryIds: [subject.id, ?holder?.id],
              ruleId: rule.id,
              fix: fix,
              fixSummary: 'Record that ${subject.name} is no longer $state from “${node.title}” onwards.',
            );
            continue;
          }
          bool names(Entry entry) => findWords(paragraph.text, namesIn(paragraph, entry)).isNotEmpty;
          final other = characters.where((c) => c.id != holder!.id && names(c)).firstOrNull;
          if (other != null && !names(holder!)) {
            report(
              'possession',
              Severity.warning,
              node,
              paragraph,
              used,
              [rule.id, node.id, fingerprint(paragraph.text)],
              message:
                  '${subject.name} is recorded as held by ${holder.name} from ${since(rule)}; in ${node.title} it appears '
                  'to be used in a passage that names ${other.name} and not ${holder.name}.',
              entryIds: [subject.id, holder.id, other.id],
              ruleId: rule.id,
              fix: fix,
              fixSummary:
                  'Record that ${subject.name} is no longer held by ${holder.name} from “${node.title}” onwards.',
            );
          }
        }
      }
    }

    if (rule.kind == 'travel') {
      final destination = rule.toEntryId == null ? null : entryById[rule.toEntryId];
      final amount = rule.amount;
      if (destination == null || amount == null || amount <= 0) continue;
      final established = amount * hoursIn[rule.unit]!;
      for (final (:node, :paragraphs) in documents) {
        bool mentions(Entry entry) => paragraphs.any(
          (p) => findWords(p.text, namesIn(p, entry, entry.id == subject.id ? rule.aliases : const [])).isNotEmpty,
        );
        if (!mentions(subject) || !mentions(destination)) continue;
        for (final paragraph in paragraphs) {
          final aboutTheTrip =
              findWords(paragraph.text, [
                ...namesIn(paragraph, subject, rule.aliases),
                ...namesIn(paragraph, destination),
              ]).isNotEmpty ||
              findWords(paragraph.text, travelWords, loose: true).isNotEmpty;
          if (!aboutTheTrip) continue;
          // The stated time furthest from what is recorded is the one worth showing.
          final stated = stableSorted(
            durationsIn(paragraph.text),
            (a, b) => (math.log(b.hours / established).abs()).compareTo(math.log(a.hours / established).abs()),
          ).firstOrNull;
          if (stated == null) continue;
          final ratio = established / stated.hours;
          if (ratio < 2 && ratio > 0.5) continue;
          final recorded = formatRuleDuration(amount, rule.unit);
          final told = formatRuleDuration(stated.amount, stated.unit);
          report(
            'travel',
            ratio >= 2 ? Severity.warning : Severity.info,
            node,
            paragraph,
            (index: paragraph.text.indexOf(stated.text), text: stated.text),
            [rule.id, node.id, fingerprint(paragraph.text)],
            entryIds: [subject.id, destination.id],
            ruleId: rule.id,
            message: ratio >= 2
                ? 'Travel between ${subject.name} and ${destination.name} is recorded as $recorded; ${node.title} '
                      'appears to cover it in $told.'
                : 'Travel between ${subject.name} and ${destination.name} is recorded as $recorded; ${node.title} '
                      'mentions $told.',
            fix: TravelFix(rule.id, stated.amount, stated.unit),
            fixSummary:
                'Change the recorded travel time between ${subject.name} and ${destination.name} from $recorded to '
                '$told.',
          );
        }
      }
    }

    if (rule.kind == 'power') {
      if (rule.words.isEmpty) continue;
      final ruleText = rule.label.trim().isNotEmpty
          ? rule.label.trim()
          : 'cannot be used near: ${rule.words.join(', ')}';
      for (final (:node, :paragraphs) in documents) {
        for (final paragraph in paragraphs) {
          final used = findWords(paragraph.text, namesIn(paragraph, subject, rule.aliases)).firstOrNull;
          if (used == null) continue;
          // The setting is often described once, earlier in the scene.
          final setting = rule.scope == 'paragraph' ? [paragraph] : paragraphs;
          final where = setting.where((p) => findWords(p.text, rule.words, loose: true).isNotEmpty).firstOrNull;
          if (where == null) continue;
          final word = findWords(where.text, rule.words, loose: true).first;
          report(
            'power',
            Severity.warning,
            node,
            paragraph,
            used,
            [rule.id, node.id, fingerprint(paragraph.text)],
            entryIds: [subject.id],
            ruleId: rule.id,
            message:
                '${subject.name} has the rule “$ruleText”. It appears to be used in ${node.title}, where “${word.text}” '
                'is mentioned${identical(where, paragraph) ? '' : ' (paragraph ${where.index + 1})'}.',
            fix: UnblockFix(
              rule.id,
              rule.words.where((w) => w.toLowerCase() == word.text.toLowerCase()).firstOrNull ?? word.text,
            ),
            fixSummary: 'Remove “${word.text}” from the conditions that block ${subject.name}.',
          );
        }
      }
    }
  }

  // Character traits recorded as codex fields: age, eye colour, hair colour.
  for (final character in characters) {
    final fields = filledFields(
      character,
      model.categories[character.category] ?? Category.unknown(character.category),
      (id) => entryById[id]?.name,
    );
    ({String id, String label, String text})? field(List<String> labels) =>
        fields.where((f) => labels.contains(f.label.trim().toLowerCase())).firstOrNull;
    final age = field(_ageFields);
    final digits = age == null ? null : RegExp(r'\d+').firstMatch(age.text)?[0];
    final recordedAge = digits == null ? null : double.parse(digits);
    final features = [
      for (final (feature, f) in [('eyes', field(_eyeFields)), ('hair', field(_hairFields))])
        if (f != null && coloursIn(f.text).isNotEmpty) (feature: feature, field: f, colours: coloursIn(f.text)),
    ];
    if (recordedAge == null && features.isEmpty) continue;
    final others = [
      for (final c in characters)
        if (c.id != character.id) c,
    ];

    for (final (:node, :paragraphs) in documents) {
      for (final paragraph in paragraphs) {
        final names = namesIn(paragraph, character);
        if (findWords(paragraph.text, names).isEmpty) continue;
        // "Her blue eyes" in a sentence of its own is this character's when nobody else is in the paragraph.
        final alone = !others.any((c) => findWords(paragraph.text, [c.name]).isNotEmpty);
        for (final sentence in sentencesOf(paragraph.text)) {
          if (!alone && findWords(sentence, names).isEmpty) continue;
          Found at(String text) => (index: paragraph.text.indexOf(text), text: text);
          final stated = recordedAge == null ? null : ageOf(sentence, names);
          if (stated != null && stated.age != recordedAge) {
            final statedAge = _whole(stated.age);
            final value = age!.text.replaceFirst(RegExp(r'\d+'), statedAge);
            report(
              'trait',
              (stated.age - recordedAge!).abs() <= 2 ? Severity.info : Severity.warning,
              node,
              paragraph,
              at(stated.text),
              [character.id, 'age', node.id, fingerprint(paragraph.text)],
              entryIds: [character.id],
              ruleId: null,
              message:
                  "${character.name}'s age is ${_whole(recordedAge)} on their profile; ${node.title} gives it as "
                  '$statedAge.',
              fix: FieldFix(character.id, age.id, value),
              fixSummary: "Change ${character.name}'s ${age.label} on their profile from “${age.text}” to “$value”.",
            );
          }
          // "Her grey eyes" is only safely this character's when nobody else is named in the sentence.
          if (others.any((c) => findWords(sentence, [c.name]).isNotEmpty)) continue;
          for (final (:feature, field: recorded, :colours) in features) {
            final described = colourOf(sentence, feature, names);
            final colour = described == null ? null : coloursIn(described.text).firstOrNull;
            if (described == null || colour == null || colours.contains(colour)) continue;
            final capital = '${colour[0].toUpperCase()}${colour.substring(1)}';
            report(
              'trait',
              Severity.warning,
              node,
              paragraph,
              at(described.text),
              [character.id, feature, node.id, fingerprint(paragraph.text)],
              entryIds: [character.id],
              ruleId: null,
              message:
                  "${character.name}'s $feature ${feature == 'eyes' ? 'are' : 'is'} “${recorded.text}” on their "
                  'profile; ${node.title} describes ${feature == 'eyes' ? 'them' : 'it'} as $colour.',
              fix: FieldFix(character.id, recorded.id, capital),
              fixSummary:
                  "Change ${character.name}'s ${recorded.label} on their profile from “${recorded.text}” to “$capital”.",
            );
          }
        }
      }
    }
  }

  // The same passage can trip the same check twice (a name written two ways); keep the first.
  final unique = <String, Issue>{};
  for (final issue in issues) {
    unique.putIfAbsent(issue.key, () => issue);
  }
  final sorted = stableSorted(unique.values, (a, b) {
    final s = a.severity.index.compareTo(b.severity.index);
    if (s != 0) return s;
    final p = position(a.nodeId).compareTo(position(b.nodeId));
    if (p != 0) return p;
    final k = a.block.compareTo(b.block);
    return k != 0 ? k : localeCompare(a.key, b.key);
  });

  // A decision that the finding needs review keeps it open.
  final decided = {
    for (final r in resolutions)
      if (r.decision.closes) r.key: r,
  };
  final keys = {for (final i in sorted) i.key};
  return AuditResult(
    [
      for (final i in sorted)
        if (!decided.containsKey(i.key)) i,
    ],
    [
      for (final i in sorted)
        if (decided[i.key] case final r?) (issue: i, resolution: r),
    ],
    [
      for (final r in resolutions)
        if (!otherChecks.any(r.key.startsWith) && !keys.contains(r.key)) r,
    ],
    (
      documents: documents.length,
      paragraphs: documents.fold(0, (n, d) => n + d.paragraphs.length),
      rules: rules.length,
    ),
  );
}

String _whole(double v) => v == v.truncateToDouble() ? v.toInt().toString() : '$v';
