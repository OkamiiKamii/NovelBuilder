import '../collation.dart';
import '../continuity/rules.dart';
import '../integrity/rules.dart' show connectionStatusLabel;
import '../json.dart';
import '../model/story_model.dart';
import '../records/canon.dart';
import '../stable_sort.dart';
import '../timeline/review.dart';
import 'checks.dart';
import 'review.dart';

/// CANON AND CONTINUITY, LAID OVER THE VIEWS (as in the original app)
/// For each record a view draws, what to mark on it: its canon status when it is not plain canon, and what the checks
/// found about it and the author has not yet decided. The findings come from the checks that already exist, each
/// keeping its own rule and its own words. Pure: it reads what it is given, and marks nothing as decided or settled.

enum OverlaySource {
  records('Record check'),
  timeline('Timeline review'),
  canon('Canon'),
  continuity('Continuity check');

  const OverlaySource(this.label);
  final String label;
}

class OverlayWarning {
  OverlayWarning({
    required this.key,
    required this.source,
    required this.severity,
    required this.title,
    required this.rule,
    required this.message,
    required this.because,
  });

  /// The finding's own key: the same one its page keeps decisions under.
  final String key;
  final OverlaySource source;
  final Severity severity;
  final String title;
  final String rule;
  final String message;
  final String because;
}

/// A status drawn on a record: a mark of its own (never colour alone) and its words. [key] is a canon status's key, or
/// `alternate`.
typedef OverlayStatus = ({String key, String label, String hint, String glyph});

class OverlayMark {
  OverlayStatus? status;
  final List<OverlayWarning> warnings = [];
}

const statusGlyphs = {
  'canon': '',
  'provisional': '?',
  'conflicting': '≠',
  'retconned': '↺',
  'non-canon': '✕',
  'alternate': 'A',
};
const warningGlyph = '!';

/// An alternate history being shown: its events that go differently, and those only it has.
typedef ShownHistory = ({String name, String status, Set<String> changed, Set<String> added});

/// A canon flag's decision key: every id its own segment, so a copy of the novel re-points it
/// (`canon|<fact>|fact|<other>`).
String canonKey(String factId, String flagKey) => ['canon', factId, ...flagKey.split(':')].join('|');

const _canonRule =
    'Statements in play about the same subject should agree with each other and with the codex field they name. Only '
    'you decide which one stands.';
const _unpairedRule = 'A statement marked Conflicting contradicts another, so the other one is linked, or noticed.';
const traitRule = 'How the text describes a character should match their codex fields (age, eyes, hair).';

OverlayStatus _statusOf(CanonStatus s, String label) =>
    (key: s.key, label: label, hint: s.hint, glyph: statusGlyphs[s.key]!);

int _byWorst(OverlayWarning a, OverlayWarning b) {
  final c = a.severity.index.compareTo(b.severity.index);
  return c != 0 ? c : localeCompare(a.key, b.key);
}

/// The marks, keyed `event:<id>`, `entry:<id>`, `node:<id>`, `thread:<id>`, `relation:<id>`, `link:<id>` (a stored
/// connection) and `fact:<id>`. Each list given holds only what is still open: decided findings are left out before
/// they come here. [continuity] is null while the manuscript has not been checked.
Map<String, OverlayMark> canonOverlay(
  StoryModel model, {
  required List<RecordFinding> records,
  required List<ReviewFinding> timeline,
  required List<FactReview> canon,
  required List<Issue>? continuity,
  ShownHistory? history,
}) {
  final overlay = <String, OverlayMark>{};
  OverlayMark at(String key) => overlay[key] ??= OverlayMark();
  void warn(Iterable<String> keys, OverlayWarning warning) {
    for (final key in keys.toSet()) {
      final mark = at(key);
      if (!mark.warnings.any((w) => w.key == warning.key)) mark.warnings.add(warning);
    }
  }

  // Statuses: events and stored connections have one of their own; an alternate history's events say so.
  for (final event in model.events.values) {
    final status = event.canon ?? CanonStatus.canon;
    if (status != CanonStatus.canon) {
      at('event:${event.id}').status = _statusOf(status, status.label);
    } else if (history != null && (history.changed.contains(event.id) || history.added.contains(event.id))) {
      at('event:${event.id}').status = (
        key: 'alternate',
        label:
            'Alternate branch: ${history.added.contains(event.id) ? 'happens only in' : 'goes differently in'} '
            '“${history.name}” (${history.status})',
        hint: 'An event of the alternate history shown, not of the main timeline.',
        glyph: statusGlyphs['alternate']!,
      );
    }
  }
  for (final link in model.links) {
    final status = link.canon ?? CanonStatus.canon;
    if (status != CanonStatus.canon) at('link:${link.id}').status = _statusOf(status, connectionStatusLabel(status));
  }

  for (final f in records) {
    warn(
      f.on,
      OverlayWarning(
        key: f.key,
        source: OverlaySource.records,
        severity: f.severity,
        title: f.rule.title,
        rule: f.rule.rule,
        message: f.message,
        because: f.because,
      ),
    );
  }
  for (final f in timeline) {
    warn(
      [for (final id in f.eventIds) 'event:$id', for (final id in f.entryIds) 'entry:$id'],
      OverlayWarning(
        key: f.key,
        source: OverlaySource.timeline,
        severity: Severity.warning,
        title: f.rule.title,
        rule: f.rule.rule,
        message: f.message,
        because: f.because,
      ),
    );
  }
  for (final review in canon) {
    final fact = review.fact;
    final keys = [
      'fact:${fact.id}',
      for (final id in fact.entryIds) 'entry:$id',
      for (final s in fact.sources)
        if (str(s['refId']) case final refId when refId.isNotEmpty)
          switch (s['type']) {
            'chapter' => 'node:$refId',
            'event' => 'event:$refId',
            'entry' => 'entry:$refId',
            _ => '',
          },
    ].where((k) => k.isNotEmpty);
    for (final flag in review.flags) {
      warn(
        keys,
        OverlayWarning(
          key: canonKey(fact.id, flag.key),
          source: OverlaySource.canon,
          severity: flag.kind == 'unpaired' ? Severity.info : Severity.warning,
          title: flag.kind == 'unpaired' ? 'Conflicting, with nothing paired' : 'Statements that may disagree',
          rule: flag.kind == 'unpaired' ? _unpairedRule : _canonRule,
          message: flag.message,
          because:
              'The ${fact.status.label.toLowerCase()} statement “${fact.subject.trim().isNotEmpty ? '${fact.subject.trim()}: ' : ''}'
              '${fact.statement.trim()}”.',
        ),
      );
    }
  }
  for (final issue in continuity ?? const <Issue>[]) {
    warn(
      ['node:${issue.nodeId}', for (final id in issue.entryIds) 'entry:$id'],
      OverlayWarning(
        key: issue.key,
        source: OverlaySource.continuity,
        severity: issue.severity,
        title: issueCategoryLabels[issue.category]!,
        rule: issue.category == 'trait' ? traitRule : ruleKindHints[issue.category]!,
        message: issue.message,
        because: '${issue.nodeTitle}, paragraph ${issue.block + 1}: “${issue.excerpt}”',
      ),
    );
  }

  // Most serious first, then in a fixed order, so the same records always read the same.
  for (final mark in overlay.values) {
    final sorted = stableSorted(mark.warnings, _byWorst);
    mark.warnings
      ..clear()
      ..addAll(sorted);
  }
  return overlay;
}

/// Several records' marks as one: a plot-board cell, a graph line holding several connections.
OverlayMark? mergeMarks(Iterable<OverlayMark?> marks) {
  final present = [
    for (final m in marks)
      if (m != null && (m.status != null || m.warnings.isNotEmpty)) m,
  ];
  if (present.isEmpty) return null;
  final warnings = <String, OverlayWarning>{};
  for (final m in present) {
    for (final w in m.warnings) {
      warnings[w.key] = w;
    }
  }
  // The status that most needs a look: Conflicting first, then set aside, then provisional, then an alternate branch.
  const order = ['conflicting', 'retconned', 'non-canon', 'provisional', 'alternate'];
  final statuses = stableSorted([
    for (final m in present)
      if (m.status != null) m.status!,
  ], (a, b) => order.indexOf(a.key).compareTo(order.indexOf(b.key)));
  final merged = OverlayMark()..status = statuses.firstOrNull;
  merged.warnings.addAll(stableSorted(warnings.values, _byWorst));
  return merged;
}

/// The badge on a drawing: its marks and its tone (the worst finding's severity, or null for the status alone).
({String glyph, Severity? tone})? badgeOf(OverlayMark? mark) {
  if (mark == null || (mark.status == null && mark.warnings.isEmpty)) return null;
  final count = mark.warnings.length;
  return (
    glyph: '${mark.status?.glyph ?? ''}${count > 0 ? '$warningGlyph${count > 1 ? count : ''}' : ''}',
    tone: count > 0 ? mark.warnings.first.severity : null,
  );
}

/// The same, in words, for a screen reader and for every list: "Canon status: Provisional. 2 to check, 1 critical."
String markWords(OverlayMark? mark) {
  if (mark == null || (mark.status == null && mark.warnings.isEmpty)) return '';
  final count = mark.warnings.length;
  final critical = mark.warnings.where((w) => w.severity == Severity.critical).length;
  return [
    if (mark.status != null) 'Canon status: ${mark.status!.label}.',
    if (count > 0) '$count to check${critical > 0 ? ', $critical critical' : ''}.',
  ].join(' ');
}
