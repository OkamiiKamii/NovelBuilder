/// THE BOOK'S FINGERPRINT: the whole novel as a print, every paragraph a thread. Each paragraph is given to the
/// character it is about (the one named most in it, or, when none is named, whoever the scene was with), and marked
/// when someone speaks in it. Drawn chapter by chapter, it shows at a glance whose book it is, where each one's
/// scenes fall, and how much of it is talk; no two books make the same print.
///
/// Reads only.
library;

import 'dart:convert';

import '../manuscript/prose.dart';

/// One paragraph: its words, whose it is (a character's id, or null), and whether anyone speaks in it.
typedef PrintLine = ({int words, String? who, bool spoken});

/// One chapter (or scene): its id, title and paragraphs.
typedef PrintChapter = ({String id, String title, List<PrintLine> lines});

/// The print: its chapters in reading order, and for each character how many paragraphs are theirs.
typedef BookPrint = ({List<PrintChapter> chapters, Map<String, int> shares});

final _wordRun = RegExp(r'[\p{L}\p{N}’\x27]+', unicode: true);
final _speech = RegExp('[“”"]');

/// The paragraphs of one chapter as threads: each given to the character named most in it, else to the one the
/// scene was with (the last named before it in the chapter), else to no one. [names] are each character's names.
List<PrintLine> printLines(List<String> paragraphs, Map<String, RegExp> names) {
  final out = <PrintLine>[];
  String? scene;
  for (final p in paragraphs) {
    if (p.trim().isEmpty) continue;
    String? who;
    var most = 0;
    for (final MapEntry(key: id, value: pattern) in names.entries) {
      final n = pattern.allMatches(p).length;
      if (n > most) {
        most = n;
        who = id;
      }
    }
    if (who != null) scene = who;
    out.add((words: _wordRun.allMatches(p).length, who: who ?? scene, spoken: _speech.hasMatch(p)));
  }
  return out;
}

/// A pattern for each character's names, whole words, capitals as written.
Map<String, RegExp> namePatterns(Map<String, List<String>> names) => {
  for (final MapEntry(key: id, value: list) in names.entries)
    if (list.where((n) => n.trim().length >= 2).isNotEmpty)
      id: RegExp(
        '(?<![\\p{L}\\p{N}])(?:${(list.where((n) => n.trim().length >= 2).toList()..sort((a, b) => b.length - a.length)).map(RegExp.escape).join('|')})(?![\\p{L}\\p{N}])',
        unicode: true,
      ),
};

/// The print of [chapters] (in reading order) from [pages] (each chapter's paragraphs), [names] each character's names.
BookPrint bookPrint(
  List<({String id, String title})> chapters,
  Map<String, List<String>> pages,
  Map<String, List<String>> names,
) {
  final patterns = namePatterns(names);
  final out = <PrintChapter>[];
  final shares = <String, int>{};
  for (final c in chapters) {
    final lines = printLines(pages[c.id] ?? const [], patterns);
    for (final l in lines) {
      if (l.who != null) shares[l.who!] = (shares[l.who!] ?? 0) + 1;
    }
    out.add((id: c.id, title: c.title, lines: lines));
  }
  return (chapters: out, shares: shares);
}

/// [bookPrint] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), as a job for an isolate.
BookPrint Function() bookPrintJob(
  List<({String id, String title})> chapters,
  List<String> storedContents,
  Map<String, List<String>> names,
) => () {
  final wanted = {for (final c in chapters) c.id};
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
  return bookPrint(chapters, pages, names);
};
