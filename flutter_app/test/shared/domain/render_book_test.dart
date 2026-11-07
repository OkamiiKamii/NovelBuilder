import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/exchange/render_book.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/reader/book.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:xml/xml.dart';

import 'fixtures.dart';

/// The ebook and the web serial made from the book: valid files, every page in the book's order, the author's text
/// exactly as written, and a clear reason when something cannot be done.
void main() {
  Book book(String name, BookFormat format, {JsonMap? project}) {
    final s = loadFixture(name);
    final snapshot = project == null
        ? s
        : NovelSnapshot.fromJson({
            ...s.toJson(),
            'project': {...s.project, ...project},
          });
    return buildBook(BookSource.fromSnapshot(snapshot), format);
  }

  final modified = DateTime.utc(2026, 10, 26, 12, 30, 5);
  EpubResult epub(Book b, {String language = 'en'}) => renderEpub(
    b,
    identifier: 'urn:uuid:b0000000-0000-4000-8000-000000000000',
    language: language,
    modified: modified,
  );
  Archive unzip(List<int> bytes) => ZipDecoder().decodeBytes(bytes);
  String textOf(Archive a, String name) => utf8.decode(a.findFile(name)!.content);
  String bodyText(String xhtml) => XmlDocument.parse(xhtml).findAllElements('body').single.innerText;

  group('an EPUB ebook', () {
    test('starts with its type, stored as it is, and names its package', () {
      final a = unzip(epub(book('book', BookFormat.ebook)).bytes);
      expect(a.files.first.name, 'mimetype');
      expect(a.files.first.compression, CompressionType.none);
      expect(textOf(a, 'mimetype'), 'application/epub+zip');
      final container = XmlDocument.parse(textOf(a, 'META-INF/container.xml'));
      expect(container.findAllElements('rootfile').single.getAttribute('full-path'), 'OEBPS/content.opf');
    });

    test('says what the book is, and lists every page, each one present and well-formed', () {
      final a = unzip(epub(book('book', BookFormat.ebook), language: 'en-GB').bytes);
      final opf = XmlDocument.parse(textOf(a, 'OEBPS/content.opf'));
      String meta(String name) => opf.findAllElements(name).single.innerText;
      expect(meta('dc:title'), 'Book Layout Test');
      expect(meta('dc:creator'), 'Test Author');
      expect(meta('dc:language'), 'en-GB');
      expect(meta('dc:identifier'), 'urn:uuid:b0000000-0000-4000-8000-000000000000');
      expect(opf.findAllElements('meta').single.innerText, '2026-10-26T12:30:05Z');
      final items = {for (final i in opf.findAllElements('item')) i.getAttribute('id'): i.getAttribute('href')};
      for (final href in items.values) {
        expect(a.findFile('OEBPS/$href'), isNotNull, reason: href);
        if (href!.endsWith('.xhtml')) XmlDocument.parse(textOf(a, 'OEBPS/$href'));
      }
      expect(opf.findAllElements('item').where((i) => i.getAttribute('properties') == 'nav'), hasLength(1));
    });

    test('reads in the order of the ebook: cover, title page, matter, contents, then the story, then the back', () {
      final b = book('book', BookFormat.ebook);
      final a = unzip(epub(b).bytes);
      final opf = XmlDocument.parse(textOf(a, 'OEBPS/content.opf'));
      final hrefOf = {for (final i in opf.findAllElements('item')) i.getAttribute('id'): i.getAttribute('href')};
      final titles = [
        for (final ref in opf.findAllElements('itemref'))
          XmlDocument.parse(
            textOf(a, 'OEBPS/${hrefOf[ref.getAttribute('idref')]}'),
          ).findAllElements('title').single.innerText,
      ];
      expect(titles, [for (final s in b.sections) s.kind == SectionKind.contents ? 'Contents' : s.title]);
      // The contents page jumps to every part and chapter, and the back matter.
      final nav = XmlDocument.parse(textOf(a, 'OEBPS/nav.xhtml'));
      final toc = nav.findAllElements('nav').firstWhere((n) => n.getAttribute('epub:type') == 'toc');
      expect(toc.findAllElements('a').map((e) => e.innerText), [
        'The First Book',
        'Chapter 1: Arrival',
        'Chapter 2',
        'Chapter 3',
        'Act 1',
        'Chapter 4: Embers',
        'Loose scene',
        'Chapter 5: Empty',
        'Acknowledgements',
        'About the author',
      ]);
    });

    test('carries the author\'s text exactly as written, with the book\'s own scene breaks, and no serial notes', () {
      final b = book('book', BookFormat.ebook);
      final a = unzip(epub(b).bytes);
      final arrival = b.sections.firstWhere((s) => s.title == 'Arrival');
      // Pages are numbered in order; the contents page is nav.xhtml and takes no number.
      final number = b.sections.take(b.sections.indexOf(arrival)).where((s) => s.kind != SectionKind.contents).length;
      final page = textOf(a, 'OEBPS/p${number.toString().padLeft(3, '0')}.xhtml');
      final text = bodyText(page);
      for (final p in arrival.pieces.whereType<TextPiece>()) {
        expect(text, contains(pieceText(p).trim()), reason: pieceText(p));
      }
      expect(text, contains('The chapter’s own opening'), reason: 'curly apostrophes stay curly');
      expect(RegExp('⁂').allMatches(text).length, arrival.pieces.whereType<BreakPiece>().length);
      expect(text, isNot(contains('Thanks for reading')), reason: 'serial notes are for the web, not the ebook');
      expect(page, contains('<em>early</em>'));
      expect(page, contains('<strong>listened</strong>'));
    });

    test('a cover picture from the device goes in; a web address is never fetched, and says so', () {
      const png =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      final withPicture = epub(book('book', BookFormat.ebook, project: {'cover': png}));
      final a = unzip(withPicture.bytes);
      expect(a.findFile('OEBPS/cover.png'), isNotNull);
      expect(withPicture.notes, isEmpty);
      final opf = textOf(a, 'OEBPS/content.opf');
      expect(opf, contains('properties="cover-image"'));

      final web = epub(book('book', BookFormat.ebook, project: {'cover': 'https://example.com/cover.jpg'}));
      expect(unzip(web.bytes).findFile('OEBPS/cover.jpg'), isNull);
      expect(web.notes.single.text, contains('never fetches'));
    });

    test('a novel with nothing written yet is refused with what to do', () {
      final empty = book('kinds', BookFormat.ebook);
      expect(
        () => epub(empty),
        throwsA(
          isA<BookOutputException>().having((e) => e.message, 'message', contains('Write a chapter, then try again')),
        ),
      );
    });

    test('every fixture with text makes an ebook whose every page is well-formed', () {
      for (final name in ['qa-sample', 'made-in-the-app', 'analytics', 'canon']) {
        final a = unzip(epub(book(name, BookFormat.ebook)).bytes);
        for (final f in a.files.where((f) => f.name.endsWith('.xhtml') || f.name.endsWith('.opf'))) {
          expect(() => XmlDocument.parse(utf8.decode(f.content)), returnsNormally, reason: '$name ${f.name}');
        }
      }
    });
  });

  group('a web serial', () {
    test('a chapter goes out with its heading, the notes before and after, and the book\'s scene breaks', () {
      final b = book('book', BookFormat.serial);
      final arrival = b.sections.firstWhere((s) => s.title == 'Arrival');
      final md = renderSerialChapter(b, arrival, SerialFormat.markdown);
      expect(md.split('\n').first, '# Chapter 1: Arrival');
      expect(md, contains('> Thanks for reading\\!'.replaceAll(r'\!', '!')));
      expect(md, contains('> Next week: the river.'));
      expect(md.indexOf('Thanks for reading'), lessThan(md.indexOf('Mira woke')));
      expect(md.indexOf('Mira woke'), lessThan(md.indexOf('Next week')));
      expect(md, contains('*early*'));
      expect(md, contains('**listened**'));
      expect(RegExp('^⁂\$', multiLine: true).allMatches(md).length, arrival.pieces.whereType<BreakPiece>().length);

      final txt = renderSerialChapter(b, arrival, SerialFormat.text);
      expect(txt, startsWith('Chapter 1: Arrival\n\nThanks for reading!\nNew chapters on Fridays.\n'));
      expect(txt, contains('The chapter’s own opening, before its scenes.'));

      final html = renderSerialChapter(b, arrival, SerialFormat.html);
      expect(() => XmlDocument.parse(html), returnsNormally);
      expect(html, contains('<h1>Chapter 1: Arrival</h1>'));
    });

    test('a chapter titled as its number is headed once', () {
      final b = book('book', BookFormat.serial);
      final second = b.sections.firstWhere((s) => s.number == 2);
      expect(renderSerialChapter(b, second, SerialFormat.text).split('\n').first, 'Chapter 2');
    });

    test('every chapter is one file in the zip, named by its place and title', () {
      final b = book('book', BookFormat.serial);
      final a = unzip(renderSerialZip(b, SerialFormat.markdown));
      expect(a.files.map((f) => f.name), [
        '001-arrival.md',
        '002-chapter-2.md',
        '003-chapter-3.md',
        '004-embers.md',
        '005-loose-scene.md',
        '006-empty.md',
      ]);
    });

    test('with nothing written, it is refused with what to do', () {
      expect(
        () => renderSerialZip(book('kinds', BookFormat.serial), SerialFormat.text),
        throwsA(isA<BookOutputException>()),
      );
    });
  });

  test('making the outputs changes nothing in the novel', () {
    final s = loadFixture('book');
    final before = jsonEncode(s.toJson());
    final b = buildBook(BookSource.fromSnapshot(s), BookFormat.ebook);
    epub(b);
    renderSerialZip(buildBook(BookSource.fromSnapshot(s), BookFormat.serial), SerialFormat.html);
    expect(jsonEncode(s.toJson()), before);
  });
}
