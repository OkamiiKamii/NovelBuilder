import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/review/review_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/review/collect.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('with nothing raised, Review is a certificate of what was checked, not a wall of filters', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/review');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'}).id;
    final s = c.read(characterServiceProvider);
    s.change(novel, (x) => x.create(name: 'Mira'));
    s.change(novel, (x) => x.createEntry('location', 'Vell'));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    expect(find.text('In good order'), findsOneWidget);
    expect(find.textContaining('Every check read 1 character and 1 world entry'), findsOneWidget);
    for (final source in ReviewSource.values) {
      expect(find.text(source.label), findsWidgets);
    }
    expect(find.text('Search the warnings'), findsNothing, reason: 'no filters with nothing to filter');
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    // Once a check raises something, the list and its filters return.
    c.read(canonServiceProvider).canon(novel, (x) => x.create(subject: 'Weather', status: CanonStatus.conflicting));
    await tester.pumpAndSettle();
    expect(find.text('In good order'), findsNothing);
    expect(find.byType(SegmentedButton<bool>), findsOneWidget, reason: 'one at a time, or the whole list');
  });
}
