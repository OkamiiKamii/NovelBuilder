/// THE LEDGER: the numbers a progression story's pages give for its system (the stats and the levels the blueprint
/// names), in the order the book gives them, and where they do not add up. Readers of these books keep the ledger
/// themselves and write in about every slip; this keeps it first.
///
/// A number is read where the page names a stat or a track and gives it a number: "Strength 14", "Strength: 14",
/// "Level 5", "reached Level 5", and the system's own form, "Strength +2 (12 → 14)". Four slips are found:
///
/// - **the sum**: "+2 (12 → 15)": the sum does not come out;
/// - **the start**: a rise from a number the pages did not leave it at ("12 → 14", when it was last 13);
/// - **backwards**: a level lower than one the book already gave;
/// - **the sheet**: the pages end on a number the sheet does not hold (when the system has one sheet).
///
/// Reads only.
library;

import 'dart:convert';

import '../manuscript/prose.dart';

/// Where a number was read: the chapter (its place, from 1, and id), the paragraph, the value (the "to" of a rise),
/// the rise when it is one (from, by), and the sentence.
typedef LedgerEntry = ({int chapter, String nodeId, int block, num value, num? from, num? by, String said});

/// One stat or track's numbers in reading order; [track] when it is a level that should not go down.
typedef LedgerLine = ({String name, bool track, List<LedgerEntry> entries});

/// What a slip is.
enum SlipKind { sum, start, backwards, sheet }

/// A slip: which kind, on which line, where (the entry it is at), and what it says.
typedef LedgerSlip = ({SlipKind kind, String name, LedgerEntry at, String says});

/// What a book's ledger holds: each named thing's numbers, and the slips.
typedef Ledger = ({List<LedgerLine> lines, List<LedgerSlip> slips});

String _n(num v) => v == v.roundToDouble() ? v.round().toString() : v.toString();

/// A sentence: up to a stop, a closing bracket of the system's ("]", "】"), not a stop inside a number ("3.5").
final _sentence = RegExp(r'(?:[^.!?…\]】]|\.(?=\d))+[.!?…\]】]*');

/// Where the earlier number was, said from the later one: "in chapter 4", or "earlier in the chapter".
String _where(LedgerEntry earlier, LedgerEntry later) =>
    earlier.chapter == later.chapter ? 'earlier in the chapter' : 'in chapter ${earlier.chapter}';

/// The sentence of [text] around [at].
String _around(String text, int at) {
  for (final m in _sentence.allMatches(text)) {
    if (m.start <= at && at < m.end) return m[0]!.trim();
  }
  return text.trim();
}

/// The ledger of [chapters] (in reading order, each its id and paragraphs) for the stats [stats] and levels [tracks]
/// a blueprint names; [sheet], when the system has one sheet, its values by name, for the last check.
Ledger numberLedger(
  List<({String id, List<String> paragraphs})> chapters, {
  required List<String> stats,
  required List<String> tracks,
  Map<String, num> sheet = const {},
}) {
  final names = [
    for (final s in stats)
      if (s.trim().length >= 2) (name: s.trim(), track: false),
    for (final t in tracks)
      if (t.trim().length >= 2) (name: t.trim(), track: true),
  ];
  const number = r'(\d+(?:\.\d+)?)';
  final lines = <LedgerLine>[];
  for (final n in names) {
    final word = RegExp.escape(n.name);
    final rise = RegExp(
      '(?<![\\p{L}])$word\\s*([+−-])\\s*$number\\s*\\(\\s*$number\\s*(?:→|->|to)\\s*$number\\s*\\)',
      caseSensitive: false,
      unicode: true,
    );
    final plain = RegExp(
      '(?<![\\p{L}])$word(?![\\p{L}])\\s*(?::|=|is now|is|of|at)?\\s*$number(?![\\d%])',
      caseSensitive: false,
      unicode: true,
    );
    final entries = <LedgerEntry>[];
    for (final (c, chapter) in chapters.indexed) {
      for (final (b, text) in chapter.paragraphs.indexed) {
        final found = <(int, LedgerEntry)>[];
        final taken = <(int, int)>[];
        for (final m in rise.allMatches(text)) {
          final sign = m[1] == '+' ? 1 : -1;
          found.add((
            m.start,
            (
              chapter: c + 1,
              nodeId: chapter.id,
              block: b,
              value: num.parse(m[4]!),
              from: num.parse(m[3]!),
              by: sign * num.parse(m[2]!),
              said: _around(text, m.start),
            ),
          ));
          taken.add((m.start, m.end));
        }
        for (final m in plain.allMatches(text)) {
          if (taken.any((t) => m.start >= t.$1 && m.start < t.$2)) continue;
          found.add((
            m.start,
            (
              chapter: c + 1,
              nodeId: chapter.id,
              block: b,
              value: num.parse(m[1]!),
              from: null,
              by: null,
              said: _around(text, m.start),
            ),
          ));
        }
        found.sort((x, y) => x.$1 - y.$1);
        entries.addAll(found.map((f) => f.$2));
      }
    }
    if (entries.isNotEmpty) lines.add((name: n.name, track: n.track, entries: entries));
  }

  final slips = <LedgerSlip>[];
  for (final line in lines) {
    LedgerEntry? last;
    for (final e in line.entries) {
      if (e.from != null && e.by != null && (e.from! + e.by! - e.value).abs() > 1e-9) {
        slips.add((
          kind: SlipKind.sum,
          name: line.name,
          at: e,
          says:
              '${line.name} ${_n(e.from!)} ${e.by! < 0 ? '−' : '+'} ${_n(e.by!.abs())} is ${_n(e.from! + e.by!)}, '
              'not ${_n(e.value)} (chapter ${e.chapter}).',
        ));
      } else if (e.from != null && last != null && (e.from! - last.value).abs() > 1e-9) {
        slips.add((
          kind: SlipKind.start,
          name: line.name,
          at: e,
          says:
              '${line.name} rises from ${_n(e.from!)} in chapter ${e.chapter}, but it was ${_n(last.value)} '
              '${_where(last, e)}.',
        ));
      } else if (line.track && last != null && e.value < last.value) {
        slips.add((
          kind: SlipKind.backwards,
          name: line.name,
          at: e,
          says:
              '${line.name} ${_n(e.value)} in chapter ${e.chapter}, after ${line.name} ${_n(last.value)} '
              '${_where(last, e)}.',
        ));
      }
      last = e;
    }
    final held = sheet.entries.where((s) => s.key.toLowerCase() == line.name.toLowerCase()).firstOrNull;
    if (held != null && last != null && (held.value - last.value).abs() > 1e-9) {
      slips.add((
        kind: SlipKind.sheet,
        name: line.name,
        at: last,
        says:
            'The pages end on ${line.name} ${_n(last.value)} (chapter ${last.chapter}); the sheet holds '
            '${_n(held.value)}.',
      ));
    }
  }
  return (lines: lines, slips: slips);
}

/// [numberLedger] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), in reading order
/// [order], as a job for an isolate.
Ledger Function() numberLedgerJob(
  List<String> storedContents,
  List<String> order, {
  required List<String> stats,
  required List<String> tracks,
  Map<String, num> sheet = const {},
}) => () {
  final wanted = order.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages['${row['id']}'] = [
        for (final b in docBlocks(row['doc']))
          if (!b.heading) b.text,
      ];
    } on FormatException {
      continue;
    }
  }
  return numberLedger(
    [for (final id in order) (id: id, paragraphs: pages[id] ?? const [])],
    stats: stats,
    tracks: tracks,
    sheet: sheet,
  );
};
