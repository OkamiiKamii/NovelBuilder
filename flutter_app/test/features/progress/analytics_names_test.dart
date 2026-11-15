import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/progress/progress_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart' show IdentityChanges;
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import '../../helpers/pump_app.dart';

/// Analytics finds a character where Characters does: by their name, an alias, or a part of their name no one else
/// has; not by a part they share, nor inside another word.
void main() {
  testWidgets('a book that calls her Ilse: Analytics has her where she is, as Characters does', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/library');
    final novel = c.read(libraryServiceProvider).create({'title': 'The Ferry'}).id;
    final s = c.read(characterServiceProvider);
    final ilse = s.change(novel, (x) => x.create(name: 'Ilse Marrow')).id;
    final kit = s.change(novel, (x) => x.create(name: 'Kit Marrow')).id;
    final oren = s.change(novel, (x) => x.create(name: 'Oren Vale')).id;
    s.change(novel, (x) => x.identity(oren, const IdentityChanges(aliases: ['the Ferryman'])));
    JsonMap node(String id, int order) => {
      'id': id,
      'projectId': novel,
      'parentId': null,
      'kind': 'chapter',
      'title': 'Chapter ${order + 1}',
      'order': order,
      'status': 'drafting',
      'wordCount': 10,
      'createdAt': order,
      'updatedAt': 0,
    };
    final pages = [
      'Ilse Marrow came down to the water.', // 1: her full name
      'Ilse waited. Marrow bones in the soup.', // 2: her own first name; "Marrow" is shared with Kit
      'They called for the Ferryman twice.', // 3: Oren, by his alias, as written
      'Ilsehaven was far. Kit slept.', // 4: not Ilse (inside another word); Kit by the name no one else has
    ];
    c.read(novelStoreProvider).writeRows(novel, [
      for (final (i, text) in pages.indexed) ...[
        RowWrite.put('chapters', node('c${i + 1}', i)),
        RowWrite.put('chapterContents', {'id': 'c${i + 1}', 'projectId': novel, 'doc': textToDoc(text)}),
      ],
    ]);
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/progress/analytics');
    await tester.pumpAndSettle();

    final rows = {for (final r in c.read(progressDataProvider)!.analytics.cast.rows) r.id: r.chapters};
    expect(rows[ilse], [1, 2], reason: 'by her full name, and by "Ilse", hers alone; not in "Ilsehaven"');
    expect(rows[kit], [4], reason: '"Kit" is his alone; "Marrow" is shared, so it names neither');
    expect(rows[oren], [3], reason: 'by his alias');
    expect(
      find.bySemanticsLabel(RegExp(r'^Ilse Marrow: appears in 2 chapters, first: Ch\. 1, latest: Ch\. 2')),
      findsOne,
    );

    // Where Characters has them, chapter for chapter.
    final cast = c.read(castProvider)!;
    expect(cast.chaptersOf()[ilse], {1, 2});
    expect(cast.chaptersOf()[kit], {4});
    expect(cast.chaptersOf()[oren], {3});
    await tester.pump(const Duration(seconds: 2));
  });
}
