import 'package:flutter/foundation.dart';

import '../json.dart';
import '../json_record.dart';
import '../manuscript/prose.dart' show countWords;
import '../records/story_node.dart';
import '../snapshot/novel_snapshot.dart';
import '../stable_sort.dart';

/// How the book is being looked at: as a printed novel, on an e-reader, or as chapters posted to the web.
enum BookFormat {
  novel('Standard novel', 'A printed page: title page, part dividers, chapter openers, turned a page at a time.'),
  ebook('Ebook', 'An e-reader: cover, a contents page that jumps, and text that reflows to the screen.'),
  serial(
    'Web serial',
    'A chapter as posted online: its number and title, your notes before and after, and Previous / Next.',
  );

  const BookFormat(this.label, this.hint);
  final String label;
  final String hint;
}

/// The scene-break marks offered, as in the original app ('' prints a blank gap).
const sceneBreaks = ['* * *', '***', '⁂', '—', '#', ''];

/// What goes around the story: dedication, epigraph, copyright, acknowledgements, about the author, and the mark
/// printed between scenes. One row per novel in `bookMatter`, as the original app keeps it.
class BookMatter extends JsonRecord {
  BookMatter(super.raw);

  String get dedication => str(raw['dedication']);
  String get epigraph => str(raw['epigraph']);
  String get epigraphSource => str(raw['epigraphSource']);
  String get copyright => str(raw['copyright']);
  String get acknowledgements => str(raw['acknowledgements']);
  String get aboutAuthor => str(raw['aboutAuthor']);

  /// What is printed where a scene ends and another begins.
  String get sceneBreak => str(raw['sceneBreak'], '* * *');

  static final empty = BookMatter(const {'sceneBreak': '* * *'});
}

/// One thing on the page: a block of the author's text exactly as saved (a ProseMirror node), or a scene break.
@immutable
sealed class Piece {
  const Piece();
}

class TextPiece extends Piece {
  const TextPiece(this.node);
  final JsonMap node;
}

class BreakPiece extends Piece {
  const BreakPiece();
}

enum SectionKind { cover, title, copyright, dedication, epigraph, contents, part, chapter, acknowledgements, about }

/// A stretch of the book that starts on its own page.
@immutable
class Section {
  const Section({
    required this.id,
    required this.kind,
    required this.title,
    this.label = '',
    this.number,
    this.depth = 0,
    this.nodeId,
    this.words = 0,
    this.pieces = const [],
    this.text = '',
    this.noteBefore = '',
    this.noteAfter = '',
    this.source = '',
  });

  final String id;
  final SectionKind kind;

  /// What it is called in the table of contents.
  final String title;

  /// "Chapter 3", "Volume 1": printed above the title when the title says something more.
  final String label;

  /// For a chapter, its number in the book.
  final int? number;

  /// How far in it sits in the contents (a chapter inside a volume is 1).
  final int depth;

  /// The chapter or group it comes from.
  final String? nodeId;
  final int words;
  final List<Piece> pieces;

  /// Plain text, for front and back matter.
  final String text;
  final String noteBefore;
  final String noteAfter;

  /// For an epigraph: who said it.
  final String source;

  /// Whether the label adds anything to the title ("Chapter 3" above "The Bell", but not above "Chapter 3").
  bool get showsLabel => label.isNotEmpty && label.toLowerCase() != title.trim().toLowerCase();
}

@immutable
class Book {
  const Book({
    required this.title,
    required this.subtitle,
    required this.author,
    required this.cover,
    required this.accent,
    required this.sceneBreak,
    required this.sections,
    required this.words,
    required this.chapters,
  });

  final String title;
  final String subtitle;
  final String author;
  final String? cover;
  final String accent;
  final String sceneBreak;
  final List<Section> sections;

  /// Words of story (front and back matter are not counted).
  final int words;
  final int chapters;
}

/// What the book is made from: the novel's details, its chapters and scenes, their saved text, and its matter.
@immutable
class BookSource {
  const BookSource({required this.project, required this.nodes, required this.docs, this.matter});

  /// From a novel as stored. Rows are taken by id, the order the original's database gave them.
  factory BookSource.fromSnapshot(NovelSnapshot snapshot) {
    List<JsonMap> byId(String collection) =>
        [...snapshot.rows(collection)]..sort((a, b) => str(a['id']).compareTo(str(b['id'])));
    final matter = byId('bookMatter');
    return BookSource(
      project: snapshot.project,
      nodes: [for (final r in byId('chapters')) StoryNode(r)],
      docs: {for (final r in snapshot.rows('chapterContents')) str(r['id']): r['doc']},
      matter: matter.isEmpty ? null : BookMatter(matter.first),
    );
  }
  final JsonMap project;

  /// In the order they are stored (by id), as the original read them.
  final List<StoryNode> nodes;
  final Map<String, Object?> docs;
  final BookMatter? matter;
}

String _inline(Object? nodes) => [
  for (final n in maps(nodes))
    n['type'] == 'text'
        ? str(n['text'])
        : n['type'] == 'hardBreak'
        ? '\n'
        : _inline(n['content']),
].join();

int _wordsIn(JsonMap node) => node['type'] == 'paragraph' || node['type'] == 'heading'
    ? countWords(_inline(node['content']))
    : maps(node['content']).fold(0, (n, child) => n + _wordsIn(child));

final _breakLine = RegExp(r'^(?:(?:\*\s*){3,}|#|-{3,}|~{3,}|⁂)$');

/// A line an author typed to mark a scene break: `***`, `* * *`, `#`, `---`, `~~~` or `⁂`, alone in its paragraph.
bool isBreakLine(String text) => _breakLine.hasMatch(text.trim());

/// The blocks of one saved document, with typed scene breaks and horizontal rules recognised as breaks.
List<Piece> _piecesOf(Object? doc) => [
  for (final node in maps(mapOrNull(doc)?['content']))
    node['type'] == 'horizontalRule' || (node['type'] == 'paragraph' && isBreakLine(_inline(node['content'])))
        ? const BreakPiece()
        : TextPiece(node),
];

bool _hasText(List<Piece> pieces) => pieces.any((p) => p is TextPiece && _inline([p.node]).trim().isNotEmpty);

/// Joins the parts of a chapter with a break between each, never two in a row and never one at either end.
List<Piece> _join(List<List<Piece>> parts) {
  final out = <Piece>[];
  for (final part in parts.where(_hasText)) {
    if (out.isNotEmpty) out.add(const BreakPiece());
    out.addAll(part);
  }
  // Blank paragraphs at the start or end of a chapter, or beside a scene break, are the editor's spacing, not the page's.
  bool blank(Piece? p) => p is TextPiece && p.node['type'] == 'paragraph' && _inline(p.node['content']).trim().isEmpty;
  bool edge(Piece? p) => p == null || p is BreakPiece;
  var kept = out;
  for (var before = -1; before != kept.length;) {
    before = kept.length;
    final current = kept;
    kept = [
      for (final (i, p) in current.indexed)
        if (!(blank(p) &&
            (edge(i > 0 ? current[i - 1] : null) || edge(i + 1 < current.length ? current[i + 1] : null))))
          p,
    ];
  }
  final tidy = [
    for (final (i, p) in kept.indexed)
      if (!(p is BreakPiece && (i == 0 || kept[i - 1] is BreakPiece))) p,
  ];
  while (tidy.isNotEmpty && tidy.last is BreakPiece) {
    tidy.removeLast();
  }
  return tidy;
}

/// READ-ONLY RENDERING RULE
/// Lays the manuscript out as a book. It is a pure function of what is saved: it reads the chapters, scenes and their
/// text and returns a new description of pages, holding nothing that could write back. A port of the original app's
/// `buildBook`.
///
/// The order is the manuscript's own. Volumes, acts and arcs become part dividers; each chapter starts a new page and
/// takes in its scenes, with a scene break between them; what each format puts around the story (a cover, a title
/// page, a contents page) is added here.
Book buildBook(BookSource source, BookFormat format) {
  final matter = source.matter ?? BookMatter.empty;
  List<StoryNode> kids(String? parentId) =>
      stableSorted(source.nodes.where((n) => n.parentId == parentId), (a, b) => a.order.compareTo(b.order));
  final body = <Section>[];
  var chapters = 0;
  final partCount = <String, int>{};

  void walk(String? parentId, int depth) {
    for (final node in kids(parentId)) {
      final kind = node.kindKey;
      if (kind == 'chapter' || kind == 'scene') {
        // A scene outside any chapter stands as a section of its own, unnumbered.
        final scenes = kind == 'chapter'
            ? kids(node.id).where((c) => c.kindKey == 'scene').toList()
            : const <StoryNode>[];
        final pieces = _join([_piecesOf(source.docs[node.id]), for (final s in scenes) _piecesOf(source.docs[s.id])]);
        final number = kind == 'chapter' ? ++chapters : null;
        final label = number != null ? 'Chapter $number' : '';
        body.add(
          Section(
            id: node.id,
            kind: SectionKind.chapter,
            nodeId: node.id,
            depth: depth,
            number: number,
            label: label,
            // A chapter still called "Chapter 3" has no title of its own to print under the number.
            title: node.title.trim().isNotEmpty ? node.title.trim() : (label.isNotEmpty ? label : 'Untitled'),
            pieces: pieces,
            words: pieces.fold(0, (n, p) => n + (p is TextPiece ? _wordsIn(p.node) : 0)),
            noteBefore: str(node.raw['noteBefore']).trim(),
            noteAfter: str(node.raw['noteAfter']).trim(),
          ),
        );
      } else {
        final count = (partCount[kind] ?? 0) + 1;
        partCount[kind] = count;
        final name = '${node.kind?.label ?? kind} $count';
        // A web serial is a run of chapters: the parts they sit in are not pages of their own.
        if (format != BookFormat.serial) {
          body.add(
            Section(
              id: node.id,
              kind: SectionKind.part,
              nodeId: node.id,
              depth: depth,
              label: name,
              title: node.title.trim().isNotEmpty ? node.title.trim() : name,
            ),
          );
        }
        walk(node.id, depth + 1);
      }
    }
  }

  walk(null, 0);

  List<Section> page(SectionKind kind, String title, String text) =>
      text.trim().isEmpty ? const [] : [Section(id: kind.name, kind: kind, title: title, text: text.trim())];
  final front = <Section>[];
  final back = <Section>[];
  if (format != BookFormat.serial) {
    if (format == BookFormat.ebook) front.add(const Section(id: 'cover', kind: SectionKind.cover, title: 'Cover'));
    front.add(const Section(id: 'title', kind: SectionKind.title, title: 'Title page'));
    front
      ..addAll(page(SectionKind.copyright, 'Copyright', matter.copyright))
      ..addAll(page(SectionKind.dedication, 'Dedication', matter.dedication));
    if (matter.epigraph.trim().isNotEmpty) {
      front.add(
        Section(
          id: 'epigraph',
          kind: SectionKind.epigraph,
          title: 'Epigraph',
          text: matter.epigraph.trim(),
          source: matter.epigraphSource.trim(),
        ),
      );
    }
    if (format == BookFormat.ebook) {
      front.add(const Section(id: 'contents', kind: SectionKind.contents, title: 'Contents'));
    }
    back
      ..addAll(page(SectionKind.acknowledgements, 'Acknowledgements', matter.acknowledgements))
      ..addAll(page(SectionKind.about, 'About the author', matter.aboutAuthor));
  }
  return Book(
    title: str(source.project['title']),
    subtitle: str(source.project['subtitle']),
    author: str(source.project['author']),
    cover: strOrNull(source.project['cover']),
    accent: str(source.project['accent'], '#b4532a'),
    sceneBreak: matter.sceneBreak,
    sections: [...front, ...body, ...back],
    words: body.fold(0, (n, s) => n + s.words),
    chapters: chapters,
  );
}

/// The plain text of a piece, as the original reads it for counting and for plain outputs.
String pieceText(TextPiece piece) => _inline(piece.node['content']);

/// A place in the book: which section, and how far through it (0 to 1).
typedef BookPlace = ({int index, double fraction});

/// How much of the story lies before a place, from 0 to 1, by words. Front matter counts as the start and back matter
/// as the end.
double progressAt(Book book, BookPlace place) {
  final sections = book.sections;
  if (book.words == 0) return sections.length > 1 ? (place.index / (sections.length - 1)).clamp(0, 1).toDouble() : 0;
  var before = 0;
  for (var i = 0; i < place.index && i < sections.length; i++) {
    before += sections[i].words;
  }
  final here = place.index < sections.length ? sections[place.index].words : 0;
  return ((before + here * place.fraction.clamp(0, 1)) / book.words).clamp(0, 1).toDouble();
}

/// Minutes to read some words, at an unhurried 250 a minute.
int readingMinutes(int words) => (words / 250).round() < 1 ? 1 : (words / 250).round();
