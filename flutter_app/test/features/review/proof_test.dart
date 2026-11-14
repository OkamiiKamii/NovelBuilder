import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/shell/proof_card.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/review/proof_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/text/proof.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// A book of one chapter, "The Hooded Figures", with [text] in it, open.
  Future<({ProviderContainer c, String novel, String chapter})> book(WidgetTester tester, String text) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill In Fantasy'}).id;
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'James'));
    final manuscript = c.read(manuscriptServiceProvider);
    final chapter = manuscript.create(novel, NodeKind.chapter, title: 'The Hooded Figures').id;
    manuscript.save(novel, chapter, textToDoc(text), baseRev: manuscript.open(novel, chapter).rev);
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    return (c: c, novel: novel, chapter: chapter);
  }

  Future<void> openMore(WidgetTester tester) async {
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pumpAndSettle();
  }

  testWidgets('under More: how many a proofreader would mark, and of which kinds; pressed, the list, each read where '
      'it is', (tester) async {
    final b = await book(
      tester,
      'James ran. James stopped. James looked back.\n'
      'With that the waitress left and didn’t looked back.\n'
      'Then Jmaes laughed, and the the door closed.',
    );
    final before = jsonEncode(b.c.read(novelStoreProvider).load(b.novel)!.toJson(exportedAt: 0));
    await openMore(tester);

    final card = find.bySemanticsLabel(RegExp(r'^Before a reader sees it: 3 to check'));
    expect(card, findsOneWidget);
    expect(find.text('3 things to check'), findsOneWidget);
    expect(find.text('1 name slip · 1 doubled word · 1 after “didn’t”'), findsOneWidget);
    await tester.ensureVisible(card);
    await tester.pumpAndSettle();
    await tester.tap(card);
    await tester.pumpAndSettle();

    expect(find.byType(ProofScreen), findsOneWidget);
    expect(find.textContaining('3 things to check in Skill In Fantasy'), findsOneWidget);
    expect(find.text('After “didn’t”, the plain verb: “look”?'), findsOneWidget);
    expect(find.text('“Jmaes”: is it James?'), findsOneWidget);

    // A kind at a time.
    await tester.tap(find.text('Doubled words 1'));
    await tester.pumpAndSettle();
    expect(find.text('“the” twice.'), findsOneWidget);
    expect(find.text('“Jmaes”: is it James?'), findsNothing);

    // Read it there: the chapter, with find on the slip.
    await tester.tap(find.text('Read it there'));
    await tester.pumpAndSettle();
    expect(find.byType(ProofScreen), findsNothing);
    expect(currentLocation(b.c), '/write');
    expect(b.c.read(selectedNodeProvider), b.chapter);
    expect(
      jsonEncode(b.c.read(novelStoreProvider).load(b.novel)!.toJson(exportedAt: 0)),
      before,
      reason: 'it only reads',
    );
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a book that reads clean: said so, and nothing to press', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await openMore(tester);
    expect(find.byType(ProofCard), findsOneWidget);
    expect(find.text('Nothing to check: the book reads clean.'), findsOneWidget);
  });

  testWidgets('a chapter with no title opens its chapter', (tester) async {
    final opened = <String>[];
    final proofs = proofsOf([
      (id: 'c1', title: '', paragraphs: ['Some words here.']),
    ]);
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => showProof(
              context,
              title: 'A',
              proofs: proofs,
              titles: const {'c1': ''},
              onRead: (_, _, _) => opened.add('read'),
              onChapter: (id) => opened.add('chapter $id'),
            ),
            child: const Text('go'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.text('Chapter 1 has no title.'), findsOneWidget);
    await tester.tap(find.text('Read it there'));
    await tester.pumpAndSettle();
    expect(opened, ['chapter c1']);
  });
}
