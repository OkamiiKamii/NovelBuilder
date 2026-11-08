import 'package:flutter/material.dart';

import '../../app/theme/app_theme.dart';
import '../../app/theme/book_faces.dart';
import '../../app/theme/theme_choice.dart';
import '../characters/widgets/vault.dart';

/// THE LOOKS AS PAGES: each choice of colours shown as a small page of the book in those very colours (the paper, a
/// chapter heading in the accent, a rule, lines of text, a button), with its name beneath. "Match this device" is the
/// page cut on the diagonal, parchment and midnight. The chosen one is framed in the accent and ticked. Each is a radio
/// button to a screen reader, named as before.
class ThemeSwatches extends StatelessWidget {
  const ThemeSwatches({super.key, required this.choice, required this.onChoose});

  final ThemeChoice choice;
  final ValueChanged<ThemeChoice> onChoose;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final n = ThemeChoice.values.length;
      // All in a row where four fit at a readable size; otherwise two by two, so none is left alone on a line and
      // every name keeps its words whole.
      final across = ((box.maxWidth - (n - 1) * 8) / n - 12) >= 100 ? n : 2;
      final width = ((box.maxWidth - (across - 1) * 8) / across - 12).clamp(84.0, 160.0);
      return Wrap(
        spacing: 8,
        runSpacing: 16,
        children: [
          for (final c in ThemeChoice.values)
            _Swatch(choice: c, selected: c == choice, width: width, onTap: () => onChoose(c)),
        ],
      );
    },
  );
}

class _Swatch extends StatelessWidget {
  const _Swatch({required this.choice, required this.selected, required this.width, required this.onTap});

  final ThemeChoice choice;
  final bool selected;
  final double width;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final page = switch (choice) {
      ThemeChoice.light => _MiniPage(theme: AppTheme.light()),
      ThemeChoice.dark => _MiniPage(theme: AppTheme.dark()),
      ThemeChoice.monolith => _MiniPage(theme: AppTheme.monolith()),
      ThemeChoice.auto => Stack(
        fit: StackFit.expand,
        children: [
          _MiniPage(theme: AppTheme.light()),
          ClipPath(
            clipper: _Diagonal(),
            child: _MiniPage(theme: AppTheme.dark()),
          ),
        ],
      ),
    };
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: false,
      label: choice.label,
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: SizedBox(
            width: width,
            child: Column(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  height: width * 1.27,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: selected ? scheme.primary : scheme.outlineVariant,
                      width: selected ? 3 : 1,
                    ),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(selected ? 3 : 5),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        // Drawn at one size and scaled, so a smaller page on a phone is the same page.
                        FittedBox(
                          fit: BoxFit.cover,
                          child: SizedBox(width: 126, height: 162, child: page),
                        ),
                        if (selected)
                          Positioned(
                            right: 6,
                            bottom: 6,
                            child: CircleAvatar(
                              radius: 11,
                              backgroundColor: scheme.primary,
                              child: Icon(Icons.check, size: 15, color: scheme.onPrimary),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  choice.label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                    color: selected ? scheme.primary : scheme.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A page in [theme]'s colours, drawn small: what writing looks like in it.
class _MiniPage extends StatelessWidget {
  const _MiniPage({required this.theme});
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final s = theme.colorScheme;
    Widget line(double width) => FractionallySizedBox(
      widthFactor: width,
      alignment: Alignment.centerLeft,
      child: Container(
        height: 3,
        margin: const EdgeInsets.only(bottom: 5),
        decoration: BoxDecoration(color: s.onSurface.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(2)),
      ),
    );
    return ColoredBox(
      color: theme.scaffoldBackgroundColor,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: s.surface,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: s.outlineVariant),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
            child: ExcludeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Chapter I',
                    maxLines: 1,
                    textScaler: TextScaler.noScaling,
                    // In the look's own lettering, not the one shown now.
                    style: vaultHeading(
                      context,
                      size: 10,
                      weight: 700,
                      color: s.primary,
                    ).copyWith(fontFamily: (theme.extension<BookFaces>() ?? BookFaces.book).heading),
                  ),
                  Container(
                    height: 1,
                    margin: const EdgeInsets.symmetric(vertical: 6),
                    color: s.primary.withValues(alpha: 0.5),
                  ),
                  line(1),
                  line(0.92),
                  line(0.97),
                  line(0.6),
                  const Spacer(),
                  Container(
                    width: 34,
                    height: 11,
                    decoration: BoxDecoration(color: s.primary, borderRadius: BorderRadius.circular(3)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The lower right half of a page, for the dark half of "Match this device".
class _Diagonal extends CustomClipper<Path> {
  @override
  Path getClip(Size size) => Path()
    ..moveTo(size.width, 0)
    ..lineTo(size.width, size.height)
    ..lineTo(0, size.height)
    ..close();

  @override
  bool shouldReclip(_Diagonal old) => false;
}
