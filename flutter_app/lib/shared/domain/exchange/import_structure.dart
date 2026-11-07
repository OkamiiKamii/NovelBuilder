import 'dart:convert';
import 'dart:typed_data';

import '../json.dart';
import '../manuscript/prose.dart' show measure;
import '../records/story_node.dart';
import 'compile.dart' show Align;
import 'import_docx.dart';
import 'import_parse.dart';

/// A volume, act, arc, chapter or scene an imported file will become, with its text.
class ImportNode {
  ImportNode(this.kind, this.title, [List<ImportBlock>? blocks, List<ImportNode>? children])
    : blocks = blocks ?? [],
      children = children ?? [];
  NodeKind kind;
  String title;
  List<ImportBlock> blocks;
  final List<ImportNode> children;

  JsonMap toJson() => {
    'kind': kind.name,
    'title': title,
    'words': metricsOf(blocks).words,
    'children': [for (final c in children) c.toJson()],
  };
}

class ImportOptions {
  const ImportOptions({this.splitChapters = true, this.splitScenes = true, required this.fallbackTitle});

  /// Start a new chapter at each chapter heading. Off puts everything in one chapter.
  final bool splitChapters;

  /// Turn scene breaks (`* * *`, `#`, a rule) into separate scenes. Off keeps them as dividers in the text.
  final bool splitScenes;

  /// Used when the file has no chapter headings (usually the file name).
  final String fallbackTitle;
}

const _number =
    r'(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ]\w+)?|thirty(?:[- ]\w+)?|forty(?:[- ]\w+)?|fifty(?:[- ]\w+)?)';
final _chapter = RegExp(
  '^(?:chapter\\s+$_number\\b|(?:prologue|epilogue|interlude|foreword|preface|afterword|introduction)\\b)',
  caseSensitive: false,
);
final _group = RegExp('^(volume|book|part|act|arc)\\s+$_number\\b', caseSensitive: false);
final _sceneBreak = RegExp(
  r'^(?:(?:\*\s*){3,}|#{1,3}|(?:-\s*){3,}|(?:~\s*){3,}|(?:•\s*){3,}|⁂|§|(?:o\s*){3}|(?:x\s*){3})$',
  caseSensitive: false,
);
const _groupKind = {
  'volume': NodeKind.volume,
  'book': NodeKind.volume,
  'part': NodeKind.volume,
  'act': NodeKind.act,
  'arc': NodeKind.arc,
};

/// Typed "Volume 2" / "Act I" lines outrank any styled heading, in this order.
const _typedLevel = {NodeKind.volume: -30, NodeKind.act: -20, NodeKind.arc: -10};
const _kindAtDepth = [NodeKind.volume, NodeKind.act, NodeKind.arc];

String _headingText(ImportBlock block) => switch (block) {
  ImportHeading() => block.text,
  ImportParagraph() => block.text,
  ImportDivider() => '',
}.trim();

/// Works out the story structure of an imported document: volumes/acts/arcs, chapters and scenes. A port of the
/// original app's `buildStructure`.
///
///  - Conventional headings are recognised by their wording, whether or not they were styled as headings:
///    "Chapter 12", "Prologue", "PART TWO", "Act I", and the usual scene-break marks (* * *, #, ---).
///  - For other styled headings, what follows decides: a heading followed directly by a deeper heading is a container
///    (volume, act, arc); one followed by text is a chapter; a deeper heading inside a chapter is a named scene.
///  - A single top heading above everything else is the book's title.
List<ImportNode> buildStructure(List<ImportBlock> blocks, ImportOptions options) {
  final headings = blocks.whereType<ImportHeading>().toList();
  final firstHeading = headings.isEmpty ? null : headings.first;
  bool isBookTitle(ImportBlock block) =>
      block is ImportHeading &&
      (block.level == 0 ||
          (identical(block, firstHeading) &&
              headings.length > 1 &&
              headings.skip(1).every((h) => h.level > block.level) &&
              !_chapter.hasMatch(block.text) &&
              !_group.hasMatch(block.text)));

  final roots = <ImportNode>[];
  final groups = <({ImportNode node, num level})>[];
  ImportNode? chapter;
  num chapterLevel = double.infinity;
  ImportNode? scene;
  var breakPending = false;

  List<ImportNode> siblings() => groups.isEmpty ? roots : groups.last.node.children;

  void startGroup(String title, num level, [NodeKind? kind]) {
    while (groups.isNotEmpty && groups.last.level >= level) {
      groups.removeLast();
    }
    if (groups.length >= _kindAtDepth.length) groups.removeRange(_kindAtDepth.length - 1, groups.length);
    // A typed "Act"/"Arc" keeps its name's kind when it fits; otherwise the depth decides.
    final depthKind = _kindAtDepth[groups.length];
    final fits = kind != null && _kindAtDepth.indexOf(kind) >= groups.length;
    final node = ImportNode(fits ? kind : depthKind, title);
    siblings().add(node);
    groups.add((node: node, level: level));
    chapter = null;
    scene = null;
    chapterLevel = double.infinity;
  }

  ImportNode startChapter(String title, [num level = double.infinity]) {
    while (groups.isNotEmpty && groups.last.level >= level) {
      groups.removeLast();
    }
    final made = ImportNode(NodeKind.chapter, title);
    chapter = made;
    chapterLevel = level;
    siblings().add(made);
    scene = null;
    breakPending = false;
    return made;
  }

  void startScene([String? title]) {
    final parent = chapter ?? startChapter(options.fallbackTitle);
    if (title == null && parent.blocks.isNotEmpty && parent.children.isEmpty) {
      // Text before the first break becomes the first scene, so the chapter is all scenes.
      // (Before a *named* scene heading it is the chapter's own opening, and stays there.)
      parent.children.add(ImportNode(NodeKind.scene, 'Scene 1', parent.blocks));
      parent.blocks = [];
    }
    final made = ImportNode(NodeKind.scene, title ?? 'Scene ${parent.children.length + 1}');
    scene = made;
    parent.children.add(made);
    breakPending = false;
  }

  void addText(ImportBlock block) {
    if (breakPending) startScene();
    final target =
        scene ?? chapter ?? startChapter(roots.isNotEmpty || groups.isNotEmpty ? 'Opening' : options.fallbackTitle);
    target.blocks.add(block);
  }

  void sceneBreak() {
    final target = scene ?? chapter;
    if (target == null || target.blocks.isEmpty) return;
    if (options.splitScenes) {
      breakPending = true;
    } else {
      target.blocks.add(const ImportDivider());
    }
  }

  for (final (index, block) in blocks.indexed) {
    final text = _headingText(block);
    if (block is ImportDivider || (block is ImportParagraph && _sceneBreak.hasMatch(text))) {
      sceneBreak();
      continue;
    }
    if (!options.splitChapters) {
      addText(block);
      continue;
    }
    if (isBookTitle(block)) continue;

    final group = _group.firstMatch(text);
    if (block is ImportHeading) {
      // A real heading keeps its own level, so what follows at the same level closes it.
      if (group != null) {
        startGroup(text, block.level, _groupKind[group[1]!.toLowerCase()]);
        continue;
      }
      if (_chapter.hasMatch(text)) {
        startChapter(text, block.level);
        continue;
      }
      final next = index + 1 < blocks.length ? blocks[index + 1] : null;
      final leadsToDeeper = next is ImportHeading && next.level > block.level;
      if (chapter != null && block.level > chapterLevel) {
        options.splitScenes ? startScene(text) : addText(block);
        continue;
      }
      leadsToDeeper ? startGroup(text, block.level) : startChapter(text, block.level);
      continue;
    }
    // An ordinary line that is worded like a heading. A typed chapter line is short and does not read like a
    // sentence ("Chapter one was the hardest.").
    if (text.length <= 80 && !text.contains('\n')) {
      if (group != null && text.length <= 60) {
        final kind = _groupKind[group[1]!.toLowerCase()]!;
        startGroup(text, _typedLevel[kind]!, kind);
        continue;
      }
      if (_chapter.hasMatch(text) &&
          !RegExp(
            r'[.!?,;]$',
          ).hasMatch(text.replaceFirst(RegExp(r'^chapter\s+\S+[.:]?\s*', caseSensitive: false), 'x'))) {
        startChapter(text);
        continue;
      }
    }
    addText(block);
  }

  // Text that came before the first chapter heading is front matter, unless it is the whole document.
  final first = roots.isEmpty ? null : roots.first;
  if (first != null &&
      first.kind == NodeKind.chapter &&
      (first.title == options.fallbackTitle || first.title == 'Opening') &&
      roots.length > 1) {
    first.title = 'Front matter';
  }
  return roots;
}

/// Builds the editor's document format (ProseMirror JSON) from imported blocks, text and formatting intact. Null when
/// there is no text.
JsonMap? toDoc(List<ImportBlock> blocks) {
  final content = <JsonMap>[];
  for (final block in blocks) {
    switch (block) {
      case ImportDivider():
        content.add({'type': 'horizontalRule'});
      case ImportHeading():
        content.add({
          'type': 'heading',
          'attrs': {'level': block.level.clamp(1, 3), 'textAlign': null},
          'content': [
            {'type': 'text', 'text': block.text},
          ],
        });
      case ImportParagraph():
        final inline = <JsonMap>[];
        for (final run in block.runs) {
          final marks = [
            if (run.bold) {'type': 'bold'},
            if (run.italic) {'type': 'italic'},
            if (run.underline) {'type': 'underline'},
            if (run.strike) {'type': 'strike'},
          ];
          for (final (i, piece) in run.text.split('\n').indexed) {
            if (i > 0) inline.add({'type': 'hardBreak'});
            if (piece.isNotEmpty) inline.add({'type': 'text', 'text': piece, if (marks.isNotEmpty) 'marks': marks});
          }
        }
        final paragraph = <String, Object?>{
          'type': 'paragraph',
          'attrs': {'textAlign': block.align != null && block.align != Align.left ? block.align!.name : null},
          if (inline.isNotEmpty) 'content': inline,
        };
        content.add(
          block.quote
              ? {
                  'type': 'blockquote',
                  'content': [paragraph],
                }
              : paragraph,
        );
    }
  }
  return content.isEmpty ? null : {'type': 'doc', 'content': content};
}

({int words, int characters, int paragraphs, int readingMinutes}) metricsOf(List<ImportBlock> blocks) => measure([
  for (final b in blocks)
    switch (b) {
      ImportParagraph() => b.text,
      ImportHeading() => b.text,
      ImportDivider() => '',
    },
]);

class ImportSummary {
  int volumes = 0;
  int chapters = 0;
  int scenes = 0;
  int words = 0;
}

ImportSummary summarise(List<ImportNode> nodes) {
  final summary = ImportSummary();
  void walk(ImportNode node) {
    if (node.kind == NodeKind.chapter) {
      summary.chapters++;
    } else if (node.kind == NodeKind.scene) {
      summary.scenes++;
    } else {
      summary.volumes++;
    }
    summary.words += metricsOf(node.blocks).words;
    node.children.forEach(walk);
  }

  nodes.forEach(walk);
  return summary;
}

/// Reads a manuscript file into neutral blocks, by its extension. Throws [ImportException] with a reason.
List<ImportBlock> parseFile(String name, List<int> bytes) {
  final dot = name.lastIndexOf('.');
  final extension = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  if (extension == 'docx') return parseDocx(Uint8List.fromList(bytes));
  if (extension == 'doc') {
    throw ImportException(
      'Old-style .doc files cannot be read. Open it in Word and save it as .docx, then import that.',
    );
  }
  // A byte-order mark is dropped, as a browser's decoder drops it.
  final text = const Utf8Decoder(allowMalformed: true).convert(bytes).replaceFirst(RegExp('^\uFEFF'), '');
  if (extension == 'rtf') return parseRtf(text);
  if (extension == 'md' || extension == 'markdown') return parseMarkdown(text);
  if (extension == 'txt' || extension.isEmpty) return parseText(text);
  throw ImportException('“.$extension” files cannot be imported. Use .txt, .md, .docx or .rtf.');
}
