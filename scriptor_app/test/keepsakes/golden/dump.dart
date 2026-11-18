// The Flutter app's own outputs for phase 8's keepsakes (keepsakes.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given: what each keepsake page gathers from it (as their `initState`s
// do, from the rows in the order they are kept), and what each keepsake makes of it: the best lines, the fingerprint,
// the story so far, the jacket's copy and barcode, the quiz at three seeds, the gazette, the postcards (and each one's
// painting), the trailer, the sampler, the sampler's PDF as drawn (each string and line on each page, read back out of
// the real file), and the submission kit and letter. And `misc`: the painting of made-up postcards in every light and
// scene (each as its hash, but with FULL), and String.hashCode of a few ids.
//
// The painting is postcards_page.dart's PostcardScene copied word for word onto a canvas that writes down what it is
// asked to draw (dart:ui is not here); Color.lerp is done as Flutter does it, channel by channel.
//
// To make the golden again: run.sh in the scratchpad's `keepsakes` folder (it holds the package config).

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:novel_builder/shared/domain/analytics/book_print.dart';
import 'package:novel_builder/shared/domain/analytics/book_story.dart';
import 'package:novel_builder/shared/domain/analytics/progress.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/exchange/compile.dart';
import 'package:novel_builder/shared/domain/exchange/render_pdf.dart';
import 'package:novel_builder/shared/domain/exchange/sampler.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/best_lines.dart';
import 'package:novel_builder/shared/domain/manuscript/book_quiz.dart';
import 'package:novel_builder/shared/domain/manuscript/gazette.dart';
import 'package:novel_builder/shared/domain/manuscript/jacket_copy.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' show isDocument;
import 'package:novel_builder/shared/domain/manuscript/postcards.dart';
import 'package:novel_builder/shared/domain/manuscript/submission.dart';
import 'package:novel_builder/shared/domain/manuscript/trailer.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

// ---------------------------------------------------------------------------------------------------- the painting

/// A colour as Flutter keeps it: four channels, 0 to 1.
typedef Rgb = (double, double, double);

Rgb rgb(int argb) => (((argb >> 16) & 255) / 255, ((argb >> 8) & 255) / 255, (argb & 255) / 255);

Rgb lerp(Rgb a, Rgb b, double t) => (a.$1 + (b.$1 - a.$1) * t, a.$2 + (b.$2 - a.$2) * t, a.$3 + (b.$3 - a.$3) * t);

String hex(Rgb c) {
  String two(double v) => ((v.clamp(0.0, 1.0) * 255).round() & 0xff).toRadixString(16).padLeft(2, '0').toUpperCase();
  return '#${two(c.$1)}${two(c.$2)}${two(c.$3)}';
}

final white = rgb(0xFFFFFFFF);
final black = rgb(0xFF000000);

typedef Light = ({Rgb skyTop, Rgb skyLow, Rgb? sun, Rgb far, Rgb near, Rgb water});

final lights = <Light>[
  (skyTop: rgb(0xFFE9A28E), skyLow: rgb(0xFFFCE3C0), sun: rgb(0xFFFFF4D8), far: rgb(0xFFB98A86), near: rgb(0xFF7C5B63), water: rgb(0xFF9DB3C4)),
  (skyTop: rgb(0xFF5FA6D8), skyLow: rgb(0xFFCFE8F6), sun: rgb(0xFFFFF5C4), far: rgb(0xFF86AE9A), near: rgb(0xFF4A7A57), water: rgb(0xFF3A82B4)),
  (skyTop: rgb(0xFF3B2A5C), skyLow: rgb(0xFFE88E5A), sun: rgb(0xFFFFC66E), far: rgb(0xFF6B3F5E), near: rgb(0xFF35213D), water: rgb(0xFF594877)),
  (skyTop: rgb(0xFF0D1530), skyLow: rgb(0xFF2F4272), sun: rgb(0xFFF2EBD3), far: rgb(0xFF26355A), near: rgb(0xFF111934), water: rgb(0xFF1C2B52)),
  (skyTop: rgb(0xFF46515C), skyLow: rgb(0xFFA0ABB2), sun: null, far: rgb(0xFF5D6A70), near: rgb(0xFF384347), water: rgb(0xFF52626B)),
];

String n(double v) {
  final r = (v * 1000).round() / 1000;
  return r == r.truncateToDouble() ? '${r.toInt()}' : '$r';
}

/// A path written as SVG writes it.
class Path {
  final _parts = <String>[];
  void moveTo(double x, double y) => _parts.add('M${n(x)} ${n(y)}');
  void lineTo(double x, double y) => _parts.add('L${n(x)} ${n(y)}');
  void quadraticBezierTo(double x1, double y1, double x2, double y2) => _parts.add('Q${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)}');
  void close() => _parts.add('Z');
  String get d => _parts.join(' ');
}

Object paintOf(Rgb c, [double alpha = 1]) => {'colour': hex(c), 'alpha': alpha};

/// PostcardScene.paint, word for word, onto a list of what is drawn.
List<Object> scene(Postcard card, double w, double h) {
  final out = <Object>[];
  final light = lights[card.light];
  final s = card.scenery;
  final seed = card.place.codeUnits.fold(3, (a, c) => (a * 17 + c) & 0x7fffffff);
  final random = Random(seed);
  out.add({'kind': 'sky', 'x': 0, 'y': 0, 'width': w, 'height': h, 'top': hex(light.skyTop), 'low': hex(light.skyLow), 'to': h * 0.7});
  if (card.light == 3) {
    for (var i = 0; i < 26; i++) {
      final cx = random.nextDouble() * w;
      final cy = random.nextDouble() * h * 0.5;
      out.add({'kind': 'circle', 'cx': cx, 'cy': cy, 'r': 0.6 + random.nextDouble(), 'paint': paintOf(white, 0xCC / 255)});
    }
  }
  final horizon = h * (s.water ? 0.6 : 0.66);
  if (light.sun != null) {
    final sx = w * (0.6 + random.nextDouble() * 0.25);
    final sy = horizon - h * (0.07 + random.nextDouble() * 0.06);
    out.add({'kind': 'circle', 'cx': sx, 'cy': sy, 'r': h * 0.16, 'paint': paintOf(light.sun!, 0.18)});
    out.add({'kind': 'circle', 'cx': sx, 'cy': sy, 'r': h * 0.075, 'paint': paintOf(light.sun!)});
  }
  final far = Path()..moveTo(0, horizon);
  if (s.peaks) {
    var x = 0.0;
    while (x < w) {
      final step = w * (0.12 + random.nextDouble() * 0.14);
      far
        ..lineTo(x + step / 2, horizon - h * (0.2 + random.nextDouble() * 0.22))
        ..lineTo(x + step, horizon - h * 0.04);
      x += step;
    }
  } else {
    for (final x in [for (var i = 0; i <= 24; i++) w * i / 24]) {
      far.lineTo(x, horizon - h * (0.06 + 0.04 * sin(x / w * pi * 3 + seed % 7)));
    }
  }
  far
    ..lineTo(w, horizon + 2)
    ..lineTo(0, horizon + 2)
    ..close();
  out.add({'kind': 'path', 'd': far.d, 'paint': paintOf(light.far)});
  if (s.peaks && card.light != 2) {
    out.add({'kind': 'rect', 'x': 0, 'y': 0, 'width': w, 'height': horizon - h * 0.3, 'paint': paintOf(white, 0.75), 'clip': far.d});
  }
  final ground = lerp(light.near, light.far, 0.15);
  if (s.water) {
    out.add({'kind': 'rect', 'x': 0, 'y': horizon, 'width': w, 'height': h - horizon, 'paint': paintOf(light.water)});
    for (var i = 0; i < 18; i++) {
      final y = horizon + 6 + random.nextDouble() * (h - horizon - 8);
      final x = random.nextDouble() * w;
      out.add({'kind': 'line', 'x1': x, 'y1': y, 'x2': x + 8 + random.nextDouble() * 18, 'y2': y, 'paint': paintOf(white, 0.35), 'width': 1.4});
    }
    final shore = Path()
      ..moveTo(0, horizon + h * 0.08)
      ..quadraticBezierTo(w * 0.25, horizon + h * 0.04, w * 0.42, h * 0.86)
      ..lineTo(w * 0.5, h)
      ..lineTo(0, h)
      ..close();
    out.add({'kind': 'path', 'd': shore.d, 'paint': paintOf(ground)});
  } else if (s.dunes) {
    final sand = [rgb(0xFFE2BD7A), rgb(0xFFC99B56), rgb(0xFFAF7F42)];
    for (final (i, colour) in sand.indexed) {
      final y = horizon + i * h * 0.1;
      final dune = Path()..moveTo(0, y);
      for (final x in [for (var i = 0; i <= 20; i++) w * i / 20]) {
        dune.lineTo(x, y + h * 0.04 * sin(x / w * pi * 2 + i * 1.7 + seed % 5));
      }
      dune
        ..lineTo(w, h)
        ..lineTo(0, h)
        ..close();
      out.add({'kind': 'path', 'd': dune.d, 'paint': paintOf(card.light >= 3 ? lerp(colour, light.near, 0.6) : colour)});
    }
  } else {
    final hill = Path()..moveTo(0, horizon + h * 0.04);
    for (final x in [for (var i = 0; i <= 24; i++) w * i / 24]) {
      hill.lineTo(x, horizon + h * (0.05 + 0.035 * sin(x / w * pi * 2.2 + seed % 3)));
    }
    hill
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    out.add({'kind': 'path', 'd': hill.d, 'paint': paintOf(ground)});
  }
  final dark = paintOf(lerp(light.near, black, 0.25));
  if (s.trees) {
    final base = s.water ? h * 0.9 : horizon + h * 0.1;
    final end = s.water ? w * 0.4 : w;
    for (var x = -w * 0.01; x < end; x += w * (0.02 + random.nextDouble() * 0.016)) {
      final tall = h * (0.12 + random.nextDouble() * 0.12);
      final p = Path()
        ..moveTo(x, base)
        ..lineTo(x + w * 0.016, base - tall)
        ..lineTo(x + w * 0.032, base)
        ..close();
      out.add({'kind': 'path', 'd': p.d, 'paint': dark});
    }
  }
  if (s.tower) {
    final x = s.water ? (s.roofs ? w * 0.22 : w * 0.3) : w * 0.78;
    final base = s.water ? h * 0.9 : horizon + h * 0.08;
    final tall = h * 0.42;
    final wide = w * 0.055;
    out.add({'kind': 'rect', 'x': x - wide / 2, 'y': base - tall, 'width': wide, 'height': tall, 'paint': dark});
    if (s.beacon) {
      final lx = x;
      final ly = base - tall - 5;
      final lamp = light.sun ?? rgb(0xFFFFF4D8);
      final beam = Path()
        ..moveTo(lx, ly)
        ..lineTo(w, ly - h * 0.12)
        ..lineTo(w, ly + h * 0.06)
        ..close();
      out.add({'kind': 'path', 'd': beam.d, 'paint': paintOf(lamp, 0.28)});
      out.add({'kind': 'circle', 'cx': lx, 'cy': ly, 'r': 5, 'paint': paintOf(lamp)});
      final cap = Path()
        ..moveTo(x - wide * 0.7, base - tall)
        ..lineTo(x, base - tall - 14)
        ..lineTo(x + wide * 0.7, base - tall)
        ..close();
      out.add({'kind': 'path', 'd': cap.d, 'paint': dark});
    } else {
      for (var i = 0; i < 3; i++) {
        out.add({'kind': 'rect', 'x': x - wide / 2 + i * wide * 0.4, 'y': base - tall - 6, 'width': wide * 0.22, 'height': 6, 'paint': dark});
      }
    }
  }
  if (s.roofs) {
    final base = s.water ? h * 0.95 : h * 0.97;
    var x = s.water ? w * 0.02 : w * 0.06;
    final end = s.water ? w * 0.4 : w * 0.7;
    final house = paintOf(lerp(light.near, light.skyLow, 0.12));
    final window = paintOf(light.sun ?? light.skyLow, card.light >= 2 ? 0.9 : 0.5);
    while (x < end) {
      final wide = w * (0.05 + random.nextDouble() * 0.04);
      final high = h * (0.1 + random.nextDouble() * 0.12);
      out.add({'kind': 'rect', 'x': x, 'y': base - high, 'width': wide, 'height': high, 'paint': house});
      final roof = Path()
        ..moveTo(x - 2, base - high)
        ..lineTo(x + wide / 2, base - high - h * 0.06)
        ..lineTo(x + wide + 2, base - high)
        ..close();
      out.add({'kind': 'path', 'd': roof.d, 'paint': dark});
      out.add({'kind': 'rect', 'x': x + wide * 0.35, 'y': base - high * 0.7, 'width': wide * 0.3, 'height': high * 0.22, 'paint': window});
      x += wide + 2;
    }
  }
  return out;
}

/// The front's lettering colours and the barcode, as the pages draw them.
Object front(Postcard card) {
  final light = lights[card.light];
  return {'letters': hex(lerp(light.skyLow, white, 0.75)), 'shadow': hex(lerp(light.near, black, 0.35))};
}

List<Object> bars(int seed, double width) {
  final random = Random(seed);
  final out = <Object>[];
  var x = 0.0;
  while (x < width) {
    final w = 0.4 + random.nextInt(3) * 0.4;
    if (random.nextBool()) out.add({'x': x, 'width': w});
    x += w + 0.35;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- the PDF, read back

const _back = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', //
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', //
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

String unescape(String s) {
  final out = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    var c = s.codeUnitAt(i);
    if (c == 0x5c) {
      i++;
      final e = s[i];
      if (RegExp('[0-7]').hasMatch(e)) {
        var j = i;
        while (j < s.length && j < i + 3 && RegExp('[0-7]').hasMatch(s[j])) {
          j++;
        }
        c = int.parse(s.substring(i, j), radix: 8);
        i = j - 1;
      } else {
        c = switch (e) { 'n' => 10, 'r' => 13, 't' => 9, 'b' => 8, 'f' => 12, _ => e.codeUnitAt(0) };
      }
    }
    out.write(_back[c] ?? String.fromCharCode(c));
  }
  return out.toString();
}

/// Each page of a PDF the pdf package wrote (not compressed): every string drawn (face, size, text, where) and every
/// line, in order.
List<Object> pdfPages(List<int> bytes) {
  final text = latin1.decode(bytes);
  final objects = <int, String>{
    for (final m in RegExp(r'(\d+) 0 obj\n([\s\S]*?)\nendobj').allMatches(text)) int.parse(m[1]!): m[2]!,
  };
  final faces = <String, int>{};
  for (final o in objects.values) {
    final m = RegExp(r'/BaseFont/(Times-[A-Za-z]+).*/Name/(F\d+)').firstMatch(o);
    if (m != null) {
      faces[m[2]!] = const ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'].indexOf(m[1]!);
    }
  }
  final kids = RegExp(r'/Kids\[([^\]]*)\]').firstMatch(objects.values.firstWhere((o) => o.contains('/Type/Pages')))![1]!;
  final pages = <Object>[];
  for (final k in RegExp(r'(\d+) 0 R').allMatches(kids)) {
    final page = objects[int.parse(k[1]!)]!;
    final contents = RegExp(r'/Contents\s*(\[[^\]]*\]|\d+ 0 R)').firstMatch(page)![1]!;
    final texts = <Object>[];
    final lines = <Object>[];
    for (final c in RegExp(r'(\d+) 0 R').allMatches(contents)) {
      final stream = RegExp(r'stream\n([\s\S]*)\nendstream').firstMatch(objects[int.parse(c[1]!)]!)![1]!;
      final op = RegExp(
        r'BT /(F\d+) ([-\d.]+) Tf ([-\d.]+) ([-\d.]+) Td \[\(((?:\\[\s\S]|[^\\)])*)\)\]TJ ET|([-\d.]+) ([-\d.]+) m ([-\d.]+) ([-\d.]+) l S',
      );
      for (final m in op.allMatches(stream)) {
        if (m[1] != null) {
          texts.add({
            'face': faces[m[1]!],
            'size': double.parse(m[2]!),
            'text': unescape(m[5]!),
            'x': double.parse(m[3]!),
            'y': double.parse(m[4]!),
          });
        } else {
          lines.add({'x1': double.parse(m[6]!), 'y1': double.parse(m[7]!), 'x2': double.parse(m[8]!), 'y2': double.parse(m[9]!)});
        }
      }
    }
    pages.add({'texts': texts, 'lines': lines});
  }
  return pages;
}

// ---------------------------------------------------------------------------------------------------- as JSON

Object bestJson(BestLine l) => {'text': l.text, 'chapter': l.chapter, 'nodeId': l.nodeId, 'block': l.block, 'score': l.score};

Object printJson(BookPrint p) => {
  'chapters': [
    for (final c in p.chapters)
      {
        'id': c.id,
        'title': c.title,
        'lines': [for (final l in c.lines) {'words': l.words, 'who': l.who, 'spoken': l.spoken}],
      },
  ],
  'shares': p.shares,
};

Object? chapterJson(StoryChapter? c) => c == null ? null : {'id': c.id, 'title': c.title, 'words': c.words};

Object storyJson(BookStory s) => {
  'title': s.title,
  'words': s.words,
  'pages': s.pages,
  'minutes': s.minutes,
  'chapters': s.chapters,
  'daysWritten': s.daysWritten,
  'longestRun': s.longestRun,
  'bestDay': s.bestDay == null ? null : {'day': s.bestDay!.day, 'words': s.bestDay!.words},
  'firstDay': s.firstDay,
  'biggest': chapterJson(s.biggest),
  'lead': s.lead == null ? null : {'id': s.lead!.id, 'name': s.lead!.name, 'mentions': s.lead!.mentions},
  'talker': s.talker == null
      ? null
      : {'id': s.talker!.id, 'name': s.talker!.name, 'lines': s.talker!.lines, 'line': s.talker!.line},
  'leanWords': [for (final w in s.leanWords) {'word': w.word, 'count': w.count}],
  'opening': s.opening,
  'latest': s.latest,
  'next': s.next == null ? null : {'name': s.next!.name, 'words': s.next!.words},
};

Object inputsJson(StoryInputs i) => {
  'title': i.title,
  'target': i.target,
  'chapters': [for (final c in i.chapters) chapterJson(c)],
  'days': [for (final d in i.days) {'day': d.day, 'words': d.words}],
  'people': [for (final p in i.people) {'id': p.id, 'name': p.name, 'names': p.names}],
};

Object quizJson(QuizQuestion q) => {
  'kind': q.kind.name,
  'line': q.line,
  'options': q.options,
  'answer': q.answer,
  'nodeId': q.nodeId,
  'block': q.block,
  'where': q.where,
};

Object gazetteJson(Gazette g) => {
  'name': g.name,
  'editions': [
    for (final e in g.editions)
      {
        'chapter': e.chapter,
        'nodeId': e.nodeId,
        'headline': e.headline,
        'deck': e.deck,
        'lead': e.lead,
        'continues': e.continues,
        'said': [for (final s in e.said) {'words': s.words, 'speaker': s.speaker}],
        'weather': e.weather.name,
        'weatherWord': e.weatherWord,
        'weatherCount': e.weatherCount,
        'inTheNews': [for (final p in e.inTheNews) {'name': p.name, 'count': p.count}],
        'words': e.words,
      },
  ],
};

Object sceneryJson(Scenery s) => {
  'water': s.water,
  'trees': s.trees,
  'peaks': s.peaks,
  'roofs': s.roofs,
  'tower': s.tower,
  'beacon': s.beacon,
  'dunes': s.dunes,
};

Object postcardJson(Postcard p) => {
  'place': p.place,
  'line': p.line,
  'chapter': p.chapter,
  'chapterTitle': p.chapterTitle,
  'nodeId': p.nodeId,
  'block': p.block,
  'scenery': sceneryJson(p.scenery),
  'light': p.light,
  'kept': p.kept,
};

Object trailerJson(Trailer t) => {
  'shots': [for (final s in t.shots) {'kind': s.kind.name, 'text': s.text}],
  'sting': t.sting,
  'cast': t.cast,
};

Object kitJson(List<KitCheck> kit) => [for (final k in kit) {'item': k.item.name, 'ready': k.ready, 'said': k.said}];

// ---------------------------------------------------------------------------------------------------- each novel

Future<Map<String, Object?>> novel(NovelSnapshot s) async {
  final out = <String, Object?>{};
  final novel = Novel(s.project);
  final nodes = [for (final r in s.rows('chapters')) StoryNode(r)];
  final documents = [
    for (final n in readingOrder(nodes))
      if (isDocument(n.kind)) n,
  ];
  final order = [for (final n in documents) n.id];
  final titles = {for (final n in documents) n.id: n.title};
  final stored = [for (final r in s.rows('chapterContents')) jsonEncode(r)];
  final entries = [for (final r in s.rows('loreEntries')) Entry(r)];
  final inOrder = <String, CharacterProfile>{
    for (final r in s.rows('characterProfiles')) str(r['entryId']): CharacterProfile(r),
  };
  final byLowest = <String, CharacterProfile>{
    for (final r in [...s.rows('characterProfiles')]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
      str(r['entryId']): CharacterProfile(r),
  };

  // Your book so far (book_story.dart's storyInputsOf), and the print, which reads the same.
  final perDay = <String, int>{};
  for (final r in s.rows('writingSessions')) {
    final w = WritingSession(r);
    if (w.day.isNotEmpty) perDay[w.day] = (perDay[w.day] ?? 0) + w.netWords;
  }
  final storyNames = namesToFind(entries, inOrder);
  final StoryInputs inputs = (
    title: novel.title,
    target: novel.targetWordCount,
    chapters: [for (final n in documents) (id: n.id, title: n.displayTitle, words: n.wordCount)],
    days: [for (final MapEntry(key: day, value: words) in perDay.entries) (day: day, words: words)],
    people: [
      for (final e in entries)
        if (e.category == 'character' && e.name.trim().isNotEmpty)
          (id: e.id, name: e.name.trim(), names: storyNames[e.id] ?? [e.name.trim()]),
    ],
  );
  out['storyInputs'] = inputsJson(inputs);
  out['story'] = storyJson(bookStoryJob(inputs, stored)());
  out['print'] = printJson(
    bookPrintJob(
      [for (final c in inputs.chapters) (id: c.id, title: c.title)],
      stored,
      {for (final p in inputs.people) p.id: p.names},
    )(),
  );

  out['lines'] = [for (final l in bestLinesJob(stored, order)()) bestJson(l)];

  final jacket = jacketCopyJob(stored, order, novel.synopsis)();
  final words = nodes.fold(0, (n, r) => n + r.wordCount);
  out['jacket'] = {
    'quote': jacket.quote,
    'blurb': jacket.blurb,
    'words': words,
    'seed': novel.id.hashCode ^ words,
    'bars': bars(novel.id.hashCode ^ words, 64),
  };

  // The quiz (book_quiz_page.dart).
  final quizNames = namesToFind(entries, byLowest);
  final people = {
    for (final e in entries)
      if (e.category == 'character' && (quizNames[e.id] ?? const []).isNotEmpty) e.id: quizNames[e.id]!,
  };
  out['quizPeople'] = people;
  out['quiz'] = {
    for (final seed in [1, 42, 1763337600000000])
      '$seed': [for (final q in bookQuizJob(stored, order, titles, people, seed: seed)()) quizJson(q)],
  };

  // The gazette (gazette_page.dart).
  final gazettePeople = <GazettePerson>[
    for (final e in entries)
      if (e.category == 'character' && !(byLowest[e.id]?.archived ?? false) && (quizNames[e.id] ?? []).isNotEmpty)
        (name: e.name.trim(), names: quizNames[e.id]!),
  ];
  final places = [
    for (final e in entries)
      if (e.category == 'location' && (quizNames[e.id] ?? []).isNotEmpty) quizNames[e.id]!,
  ];
  out['gazetteCast'] = {
    'people': [for (final p in gazettePeople) {'name': p.name, 'names': p.names}],
    'places': places,
  };
  out['gazette'] = gazetteJson(gazetteJob(novel.title, stored, order, titles, gazettePeople, places)());

  // The postcards (postcards_page.dart), and each one's painting on the card and on its stamp.
  final placeNames = namesToFind(entries, const <String, CharacterProfile>{});
  final kept = <KeptPlace>[
    for (final e in entries)
      if (e.category == 'location' && (placeNames[e.id] ?? const []).isNotEmpty)
        (names: placeNames[e.id]!, about: '${e.summary} ${e.description}'),
  ];
  out['keptPlaces'] = [for (final k in kept) {'names': k.names, 'about': k.about}];
  final cards = postcardsJob(stored, order, titles, kept)();
  out['postcards'] = [for (final c in cards) postcardJson(c)];
  out['paintings'] = [
    for (final c in cards) {'card': scene(c, 450, 300), 'stamp': scene(c, 52, 55), 'front': front(c)},
  ];

  // The trailer (trailer.dart).
  final cast = <TrailerPerson>[
    for (final e in entries)
      if (e.category == 'character' && e.name.trim().isNotEmpty)
        (name: e.name.trim(), names: storyNames[e.id] ?? [e.name.trim()]),
  ];
  out['trailerCast'] = [for (final p in cast) {'name': p.name, 'names': p.names}];
  out['trailer'] = trailerJson(
    trailerJob(stored, order, title: novel.title, author: novel.author, cast: cast)(),
  );

  // The sampler (sampler_page.dart) and its PDF.
  final sample = samplerJob(stored, order, titles, title: novel.title, author: novel.author, synopsis: novel.synopsis)();
  out['sampler'] = sample.toJson();
  try {
    out['pdf'] = pdfPages(await renderPdf(sample, compress: false));
  } on PdfCannotDraw catch (e) {
    out['pdf'] = {'error': '$e'};
  }

  // The submission kit (submission_page.dart), at a few counts of slips.
  final length = lengthFor(novel.primaryGenre);
  out['submission'] = {
    'length': {'genre': length.genre, 'low': length.low, 'high': length.high},
    for (final slips in [0, 1, 4])
      'kit$slips': kitJson(
        submissionKit(
          title: novel.title,
          author: novel.author,
          genre: novel.primaryGenre,
          words: words,
          synopsis: novel.synopsis,
          openingSlips: slips,
        ),
      ),
    'letter': queryLetter(
      title: novel.title,
      author: novel.author,
      genre: novel.primaryGenre,
      more: novel.secondaryGenres,
      words: words,
      finished: words >= length.low || (novel.targetWordCount != null && words >= novel.targetWordCount!),
      synopsis: novel.synopsis,
    ),
  };
  return out;
}

// ---------------------------------------------------------------------------------------------------- misc

Map<String, Object?> misc(bool full) {
  final places = ['Grey Tower', 'Mimir Forest', 'Port Selwyn', 'the Dunes of Ash', 'Lake Orrin', 'Kestrel Peak', 'Ys'];
  final sceneries = <Scenery>[
    for (var b = 0; b < 128; b += 9)
      (
        water: b & 1 != 0,
        trees: b & 2 != 0,
        peaks: b & 4 != 0,
        roofs: b & 8 != 0,
        tower: b & 16 != 0,
        beacon: b & 32 != 0,
        dunes: b & 64 != 0,
      ),
  ];
  final cards = <Object>[];
  for (final (i, scenery) in sceneries.indexed) {
    for (var light = 0; light < 5; light++) {
      final place = places[(i + light) % places.length];
      final Postcard card = (
        place: place,
        line: '',
        chapter: 1,
        chapterTitle: '',
        nodeId: 'n',
        block: 0,
        scenery: scenery,
        light: light,
        kept: false,
      );
      final made = {'scene': scene(card, 450, 300), 'front': front(card)};
      cards.add({'place': place, 'scenery': sceneryJson(scenery), 'light': light, 'made': full ? made : hashOf(made)});
    }
  }
  final ids = ['', 'a', 'novel-1', 'proj_7Hq2', 'Ωmega', '0f3c6c3e-5a4b-4c1e-9d55-6b1e1c0c9f2a'];
  return {
    'postcards': cards,
    'hashes': {for (final id in ids) id: id.hashCode},
    'bars': {for (final seed in [0, 1, 12345, 987654321]) '$seed': bars(seed, 64)},
  };
}

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
Future<void> main(List<String> args) async {
  final full = Platform.environment['FULL'] != null;
  final out = <String, Object?>{};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final parts = await novel(s);
    out[name] = full ? parts : {for (final MapEntry(:key, :value) in parts.entries) key: hashOf(value)};
  }
  out['misc'] = misc(full);
  File(args.first).writeAsStringSync(jsonEncode(out));
}
