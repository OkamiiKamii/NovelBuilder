import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/theme/app_theme.dart';
import 'package:novel_builder/app/theme/novel_art.dart';
import 'package:novel_builder/app/theme/theme_choice.dart';
import 'package:novel_builder/features/library/bookshelf.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

/// A one-pixel picture, as a cover kept in a novel is.
const _picture =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

void main() {
  test('every theme carries its own way of drawing the novels; the book themes are bound, Monolith is the system', () {
    expect(AppTheme.light().extension<NovelArt>()!.style, ArtStyle.bound);
    expect(AppTheme.dark().extension<NovelArt>()!.style, ArtStyle.bound);
    expect(AppTheme.monolith().extension<NovelArt>()!.style, ArtStyle.system);

    // The book's colour is the author's: the bound jacket is that colour; the system jacket keeps it as its band.
    const colour = Color(0xFF7A2E2E);
    final bound = NovelArt.parchment.bound(colour);
    final system = NovelArt.monolith.bound(colour);
    expect(bound.band, isNull);
    expect(bound.ground.first, Color.lerp(colour, Colors.white, 0.08));
    expect(system.band, colour);
    expect(system.frame, MonolithTokens.accentPrimary);
    expect(system.motif, MonolithTokens.accentSecondary);
    expect(NovelArt.monolith.spine(colour).core, colour);
    expect(NovelArt.midnight.spine(colour).core, isNull);
  });

  testWidgets('switching the theme redraws every cover at once, and changes nothing the author chose', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/');
    final lib = c.read(libraryServiceProvider);
    lib.create({'title': 'Ashfall', 'accent': '#7A2E2E', 'status': 'planning'});
    lib.create({'title': 'Glass', 'accent': '#2E5A7A', 'status': 'planning', 'cover': _picture});
    await tester.pumpAndSettle();
    final statusLine = find.text('NOVEL · PLANNING');

    c.read(themeChoiceProvider.notifier).choose(ThemeChoice.monolith);
    await tester.pumpAndSettle();
    expect(statusLine, findsWidgets, reason: 'the system jacket heads its designed cover with a status line');
    expect(
      find.descendant(of: find.byType(BookJacket), matching: find.byType(Image)),
      findsWidgets,
      reason: 'the cover picture is shown as it is',
    );

    c.read(themeChoiceProvider.notifier).choose(ThemeChoice.light);
    await tester.pumpAndSettle();
    expect(statusLine, findsNothing, reason: 'nothing of System Monolith stays behind');

    final books = {for (final n in c.read(libraryProvider)) n.title: n};
    expect(books['Ashfall']!.accent, '#7A2E2E');
    expect(books['Glass']!.accent, '#2E5A7A');
    expect(books['Glass']!.cover, _picture, reason: 'the picture is kept untouched');
  });
}
