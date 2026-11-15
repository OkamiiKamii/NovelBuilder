import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/dramatis.dart';
import 'package:novel_builder/shared/domain/exchange/render_book.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/reader/book.dart';
import 'package:novel_builder/shared/domain/reader/matter_changes.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:xml/xml.dart';

void main() {
  const people = <DramatisPerson>[
    (id: 'wren', name: 'Wren Hollis', about: 'a mapmaker', factions: ['The Wardens'], roles: ['Protagonist']),
    (id: 'tobiah', name: 'Tobiah Fenn', about: 'a fisherman', factions: [], roles: ['Supporting']),
    (id: 'abbot', name: 'The Grey Abbot', about: '', factions: ['The Abbey'], roles: ['Antagonist']),
    (id: 'ilse', name: 'Ilse Marrow', about: 'Wren’s grandmother', factions: ['The Wardens'], roles: ['Minor']),
    (id: 'unmet', name: 'Sefa Quill', about: 'a smuggler', factions: [], roles: ['Supporting']),
  ];
  const met = {'wren': 0, 'abbot': 1, 'ilse': 2, 'tobiah': 3};

  group('the cast list made from the cast', () {
    test('by faction, in the order met, only those on the page; no faction last', () {
      expect(
        composeDramatis(people, by: CastGrouping.faction, order: CastOrder.appearance, appearance: met),
        'The Wardens:\n'
        'Wren Hollis — a mapmaker\n'
        'Ilse Marrow — Wren’s grandmother\n'
        '\n'
        'The Abbey:\n'
        'The Grey Abbot\n'
        '\n'
        'Others:\n'
        'Tobiah Fenn — a fisherman',
      );
    });

    test('by the part they play; by name; the whole cast', () {
      expect(
        composeDramatis(people, by: CastGrouping.role, order: CastOrder.name, appearance: met, onlyOnPage: false),
        'Principal characters:\n'
        'The Grey Abbot\n'
        'Wren Hollis — a mapmaker\n'
        '\n'
        'Supporting characters:\n'
        'Sefa Quill — a smuggler\n'
        'Tobiah Fenn — a fisherman\n'
        '\n'
        'And:\n'
        'Ilse Marrow — Wren’s grandmother',
      );
    });

    test('one list; one group alone has no heading', () {
      expect(
        composeDramatis(people, by: CastGrouping.none, order: CastOrder.appearance, appearance: met),
        'Wren Hollis — a mapmaker\nThe Grey Abbot\nIlse Marrow — Wren’s grandmother\nTobiah Fenn — a fisherman',
      );
      expect(
        composeDramatis(people.take(1).toList(), by: CastGrouping.faction, order: CastOrder.name, onlyOnPage: false),
        'Wren Hollis — a mapmaker',
      );
    });

    test('who they are: the title they go by, the first line of their summary, their trade', () {
      expect(aboutOf(epithet: 'The Oathbreaker', summary: 'Long story.', occupation: 'Smith'), 'The Oathbreaker');
      expect(
        aboutOf(epithet: '', summary: 'A mapmaker who never leaves the shop. She dies in book two.', occupation: ''),
        'A mapmaker who never leaves the shop',
        reason: 'the first sentence only',
      );
      expect(aboutOf(epithet: '', summary: '', occupation: 'Ferryman'), 'Ferryman');
      expect(
        aboutOf(epithet: '', summary: 'word ' * 40, occupation: '').length,
        lessThanOrEqualTo(91),
        reason: 'a long first sentence is cut at a word',
      );
    });
  });

  group('in the book', () {
    test('a cast list read back: groups, names and who they are, any dash', () {
      expect(castLines('The Wardens:\nWren Hollis — a mapmaker\n\nTobiah Fenn - a fisherman\nThe Grey Abbot'), [
        (group: true, name: 'The Wardens', about: ''),
        (group: false, name: 'Wren Hollis', about: 'a mapmaker'),
        (group: false, name: 'Tobiah Fenn', about: 'a fisherman'),
        (group: false, name: 'The Grey Abbot', about: ''),
      ]);
    });

    Book book(BookFormat format, Map<String, Object?> matter) => buildBook(
      BookSource(
        project: const {'title': 'The Drowned Road', 'author': 'A. Writer'},
        nodes: [
          StoryNode(const {'id': 'c1', 'kind': 'chapter', 'title': 'The Bell', 'order': 0}),
        ],
        docs: {'c1': textToDoc('The bell rang.')},
        matter: BookMatter({'sceneBreak': '* * *', ...matter}),
      ),
      format,
    );

    test('printed before the story, after the contents of an ebook; its own title; none, no page', () {
      final ebook = book(BookFormat.ebook, {'castList': 'Wren Hollis — a mapmaker'});
      final kinds = [for (final s in ebook.sections) s.kind];
      expect(kinds.indexOf(SectionKind.cast), kinds.indexOf(SectionKind.contents) + 1);
      expect(kinds.indexOf(SectionKind.cast), kinds.indexOf(SectionKind.chapter) - 1);
      expect(ebook.sections.firstWhere((s) => s.kind == SectionKind.cast).title, 'Dramatis Personae');
      expect(ebook.words, 3, reason: 'the cast is not story');

      final named = book(BookFormat.novel, {'castList': 'Wren Hollis', 'castTitle': 'The Players'});
      expect(named.sections.firstWhere((s) => s.kind == SectionKind.cast).title, 'The Players');
      expect(book(BookFormat.novel, {}).sections.any((s) => s.kind == SectionKind.cast), isFalse);
      expect(
        book(BookFormat.serial, {'castList': 'Wren'}).sections.any((s) => s.kind == SectionKind.cast),
        isFalse,
        reason: 'a web serial is chapters only',
      );
    });

    test('in the ebook: its own page in the contents, the names in bold, the groups as headings', () {
      final result = renderEpub(
        book(BookFormat.ebook, {'castList': 'The Wardens:\nWren Hollis — a mapmaker & guide'}),
        identifier: 'urn:uuid:b0000000-0000-4000-8000-000000000000',
        language: 'en',
        modified: DateTime.utc(2026, 11, 14),
      );
      final a = ZipDecoder().decodeBytes(result.bytes);
      final pages = [
        for (final f in a.files)
          if (f.name.endsWith('.xhtml')) utf8.decode(f.content),
      ];
      final cast = pages.singleWhere((p) => p.contains('dramatis-personae'));
      final doc = XmlDocument.parse(cast);
      expect(doc.findAllElements('h3').single.innerText, 'The Wardens');
      expect(doc.findAllElements('b').single.innerText, 'Wren Hollis');
      expect(doc.findAllElements('p').single.innerText, 'Wren Hollis — a mapmaker & guide');
      final nav = pages.singleWhere((p) => p.contains('epub:type="toc"'));
      expect(nav, contains('Dramatis Personae'));
    });

    test('kept with the book’s matter, its title too', () {
      final next = matterWithChanges(
        null,
        projectId: 'n1',
        changes: {'castList': 'Wren Hollis', 'castTitle': 'The Players'},
        now: 1,
        newId: () => 'm1',
      );
      expect((next['castList'], next['castTitle']), ('Wren Hollis', 'The Players'));
    });
  });
}
