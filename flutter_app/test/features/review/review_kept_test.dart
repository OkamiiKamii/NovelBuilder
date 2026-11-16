import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/review/review_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart' show IdentityChanges;
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import 'canon_screens_test.dart' as canon show rows, setUp;

/// The review is kept between visits: going back to Review, Canon or Continuity with nothing written since takes the
/// review already made (the whole book checked once), and a chapter written or a record changed makes it anew, with
/// what was written in it.
void main() {
  testWidgets('kept between visits; made anew when the text or a record is written', (tester) async {
    final n = await canon.setUp(tester);
    final c = n.c;
    // Made once the cast is (a cast made again as where names are on the page arrives, a review with it).
    final made = reviewsMade - 1;
    expect(reviewsMade, greaterThan(0));
    final first = c.read(reviewDataProvider)!;
    final paragraphs = first.manuscript.scanned.paragraphs;

    Future<void> visit(String path) async {
      c.read(routerProvider).go('/write');
      await tester.pumpAndSettle();
      c.read(routerProvider).go(path);
      await tester.pumpAndSettle();
    }

    // Away and back, and to the other screens it serves: the same review, not checked again.
    await visit('/review');
    await visit('/review/canon');
    await visit('/review/continuity');
    expect(reviewsMade, made + 1, reason: 'nothing written: the same review');
    expect(identical(c.read(reviewDataProvider), first), isTrue);

    // Only the text written (no record): the cast is the same, the review is not.
    final store = c.read(novelStoreProvider);
    final c1 = canon.rows(n, 'chapterContents').firstWhere((r) => r['id'] == 'c1');
    store.writeRows(n.novel, [
      RowWrite.put('chapterContents', {...c1, 'doc': textToDoc('The war began.\nNo one came home.')}),
    ]);
    await visit('/review');
    expect(reviewsMade, made + 2, reason: 'the text changed');
    final second = c.read(reviewDataProvider)!;
    expect(second.manuscript.scanned.paragraphs, paragraphs + 1, reason: 'what was written is what is checked');

    // A record changed (a character renamed): the cast is made again, and the review with it.
    c
        .read(characterServiceProvider)
        .change(n.novel, (x) => x.identity(n.orrin, const IdentityChanges(name: 'Orrin Vale')));
    await tester.pumpAndSettle();
    await visit('/review');
    expect(reviewsMade, greaterThan(made + 2));
    expect(identical(c.read(reviewDataProvider), second), isFalse);
    expect(c.read(reviewDataProvider)!.model.entries[n.orrin]!.name, 'Orrin Vale');
  });
}
