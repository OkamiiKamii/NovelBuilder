import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/reader/book.dart';
import 'package:novel_builder/shared/domain/reader/matter_changes.dart';
import 'package:novel_builder/shared/domain/reader/reader_prefs.dart';

/// The reader's look and the book's matter, against the original app's own results (computed from its `prefs.ts`).
void main() {
  test('contrast and its verdict are the original\'s', () {
    const expected = [
      ('#ffffff', '#1b1b1b', 17.2, 'comfortable for long reading'),
      ('#f4ecd8', '#3b2f20', 11.1, 'comfortable for long reading'),
      ('#000000', '#d6d6d6', 14.4, 'comfortable for long reading'),
      ('#fdf6e3', '#073642', 12.1, 'comfortable for long reading'),
      ('#777777', '#888888', 1.3, 'too faint to read comfortably'),
      ('#ffffff', '#767676', 4.5, 'readable'),
    ];
    for (final (a, b, ratio, verdict) in expected) {
      expect(contrastOf(a, b), ratio, reason: '$a on $b');
      expect(contrastVerdict(contrastOf(a, b)), verdict);
    }
  });

  test('stored preferences are read defensively: out of range is clamped, unknown is the default', () {
    final p = ReaderPrefs.fromJson({
      'size': 99,
      'leading': 0.5,
      'font': 'nope',
      'format': 'serial',
      'scheme': 'custom',
      'customBg': '#ABCDEF',
      'customText': 'red',
      'justify': 'yes',
    });
    expect(p.toJson(), {
      'format': 'serial',
      'flow': 'paged',
      'font': 'book',
      'size': 28.0,
      'leading': 1.2,
      'measure': 66.0,
      'paragraphs': 'auto',
      'indent': 1.5,
      'spacing': 0.8,
      'justify': true,
      'scheme': 'custom',
      'customBg': '#abcdef',
      'customText': '#073642',
      'device': 'ereader',
    });
    expect(ReaderPrefs.fromJson(null), const ReaderPrefs());
    expect(ReaderPrefs.fromJson(p.toJson()), p);
  });

  test('a web serial always scrolls, is spaced apart and ragged, whatever is chosen', () {
    final look = resolveLook(const ReaderPrefs(format: BookFormat.serial));
    expect(
      [look.flow, look.indented, look.justify, look.background, look.text],
      [ReaderFlow.scroll, false, false, '#ffffff', '#1b1b1b'],
    );
    final novel = resolveLook(const ReaderPrefs(paragraphs: ParagraphStyle.spaced, scheme: ReaderScheme.sepia));
    expect([novel.flow, novel.indented, novel.justify, novel.background], [ReaderFlow.paged, false, true, '#f4ecd8']);
  });

  test('a bookmark that cannot be read is no bookmark', () {
    expect(Bookmark.fromJson({'fraction': 0.5}), isNull);
    final b = Bookmark.fromJson({'sectionId': 'c1', 'fraction': 3, 'furthest': -1})!;
    expect([b.sectionId, b.fraction, b.furthest], ['c1', 1.0, 0.0]);
  });

  test('matter is saved as the original saves it: named fields only, every other field kept', () {
    final made = matterWithChanges(
      null,
      projectId: 'p1',
      changes: {'dedication': 'For Wren'},
      now: 5,
      newId: () => 'm1',
    );
    expect(made, {
      'id': 'm1',
      'dedication': 'For Wren',
      'epigraph': '',
      'epigraphSource': '',
      'copyright': '',
      'acknowledgements': '',
      'aboutAuthor': '',
      'sceneBreak': '* * *',
      'projectId': 'p1',
      'updatedAt': 5,
    });
    final changed = matterWithChanges(
      {
        ...made,
        'fromANewerVersion': {'kept': true},
      },
      projectId: 'p1',
      changes: {'sceneBreak': '~ ~ ~ ~ ~ ~ ~ ~ ~', 'epigraph': 'All glass remembers.'},
      now: 9,
      newId: () => 'unused',
    );
    expect(changed['id'], 'm1');
    expect(changed['dedication'], 'For Wren');
    expect(changed['sceneBreak'], '~ ~ ~ ~ ~ ~ ', reason: 'at most 12 characters');
    expect(changed['fromANewerVersion'], {'kept': true});
  });
}
