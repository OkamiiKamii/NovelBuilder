import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/book_faces.dart';

/// Shared loading, empty, error and no-results states, so every screen says these things the same way.

class LoadingState extends StatelessWidget {
  const LoadingState({super.key, this.message = 'Loading…'});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: message,
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            ExcludeSemantics(child: Text(message)),
          ],
        ),
      ),
    );
  }
}

/// Nothing here yet. Says what would be here and, when possible, offers the way to add it.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => _StateCard(icon: icon, title: title, message: message, action: action);
}

/// Something went wrong. Says so plainly, never pretends it worked, and offers a retry when one makes sense.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, this.title = 'Something went wrong', required this.message, this.onRetry});

  final String title;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return _StateCard(
      icon: Icons.error_outline,
      iconColor: Theme.of(context).colorScheme.error,
      title: title,
      message: message,
      liveRegion: true,
      action: onRetry == null
          ? null
          : OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Try again')),
    );
  }
}

/// A search or filter matched nothing. This is different from having no records at all.
class NoResultsState extends StatelessWidget {
  const NoResultsState({super.key, this.query, this.onClear});

  final String? query;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final q = query;
    return _StateCard(
      icon: Icons.search_off,
      title: q == null || q.isEmpty ? 'Nothing matches these filters' : 'Nothing matches “$q”',
      message: 'Your records are unchanged; they are only hidden by the current search or filters.',
      action: onClear == null ? null : TextButton(onPressed: onClear, child: const Text('Clear search and filters')),
    );
  }
}

/// Shows an [AsyncValue] with the shared states: loading, error (with retry), empty, or the data.
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({super.key, required this.value, required this.data, this.isEmpty, this.empty, this.onRetry});

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final bool Function(T data)? isEmpty;
  final Widget? empty;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return switch (value) {
      AsyncData(:final value) => (isEmpty?.call(value) ?? false) && empty != null ? empty! : data(value),
      AsyncError(:final error) => ErrorState(message: _describe(error), onRetry: onRetry),
      _ => const LoadingState(),
    };
  }

  static String _describe(Object error) => switch (error) {
    final Exception e => e.toString().replaceFirst('Exception: ', ''),
    _ => 'An unexpected problem occurred.',
  };
}

class _StateCard extends StatelessWidget {
  const _StateCard({
    required this.icon,
    required this.title,
    this.message,
    this.action,
    this.iconColor,
    this.liveRegion = false,
  });

  final IconData icon;
  final Color? iconColor;
  final String title;
  final String? message;
  final Widget? action;
  final bool liveRegion;

  /// THE BLANK PAGE: every empty, error and no-results state is a leaf of the book with its corner turned down, the
  /// area's sign in a medallion between rules, the title in the book face (EB Garamond, bundled), the message in its
  /// italic, and the way on below. The same words as before; only how they are set changed.
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final dark = theme.brightness == Brightness.dark;
    final paper = dark ? scheme.surfaceContainerHigh : Color.lerp(scheme.surfaceContainerLowest, Colors.white, 0.6)!;
    final accent = iconColor ?? scheme.primary;
    // In a space of fixed height (beside the outline, a short landscape window) the page scrolls rather than being
    // cut off; in a scrolling page it simply stands as tall as it is.
    return LayoutBuilder(
      builder: (context, box) => box.hasBoundedHeight
          ? SingleChildScrollView(child: _page(context, scheme, paper, accent))
          : _page(context, scheme, paper, accent),
    );
  }

  Widget _page(BuildContext context, ColorScheme scheme, Color paper, Color accent) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      liveRegion: liveRegion,
      container: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: CustomPaint(
              painter: _BlankPagePainter(
                paper: paper,
                fold: Color.lerp(paper, dark ? Colors.black : const Color(0xFFB9AE9C), dark ? 0.35 : 0.35)!,
                edge: scheme.outlineVariant,
                shadow: Colors.black.withValues(alpha: dark ? 0.5 : 0.12),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 22),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _Medallion(icon: icon, color: accent),
                    const SizedBox(height: 10),
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: BookFaces.of(context).text,
                        fontSize: 23,
                        height: 1.25,
                        fontWeight: FontWeight.w600,
                        color: scheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _Ornament(color: accent),
                    if (message != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        message!,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: BookFaces.of(context).text,
                          fontStyle: FontStyle.italic,
                          fontSize: 17,
                          height: 1.4,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                    if (action != null) ...[const SizedBox(height: 16), action!],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The area's sign in a ring within a ring, in the accent (the error colour for an error).
class _Medallion extends StatelessWidget {
  const _Medallion({required this.icon, required this.color});
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 54,
    height: 54,
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      border: Border.all(color: color.withValues(alpha: 0.55)),
    ),
    child: Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withValues(alpha: 0.1),
        border: Border.all(color: color.withValues(alpha: 0.8), width: 1.4),
      ),
      child: Icon(icon, size: 22, color: color),
    ),
  );
}

/// A rule, a diamond and a rule, as under a chapter heading.
class _Ornament extends StatelessWidget {
  const _Ornament({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 36, height: 1, color: color.withValues(alpha: 0.6)),
        const SizedBox(width: 8),
        Transform.rotate(angle: 0.785398, child: Container(width: 6, height: 6, color: color.withValues(alpha: 0.8))),
        const SizedBox(width: 8),
        Container(width: 36, height: 1, color: color.withValues(alpha: 0.6)),
      ],
    ),
  );
}

/// A leaf of paper with its top right corner turned down, and its shadow.
class _BlankPagePainter extends CustomPainter {
  _BlankPagePainter({required this.paper, required this.fold, required this.edge, required this.shadow});
  final Color paper;
  final Color fold;
  final Color edge;
  final Color shadow;

  static const _corner = 26.0;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final page = Path()
      ..moveTo(0, 0)
      ..lineTo(w - _corner, 0)
      ..lineTo(w, _corner)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawShadow(page, shadow, 6, false);
    canvas.drawPath(page, Paint()..color = paper);
    canvas.drawPath(
      page,
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    // The turned-down corner, lying on the page.
    final flap = Path()
      ..moveTo(w - _corner, 0)
      ..lineTo(w - _corner, _corner)
      ..lineTo(w, _corner)
      ..close();
    canvas.drawShadow(flap, shadow, 2, false);
    canvas.drawPath(flap, Paint()..color = fold);
    canvas.drawPath(
      flap,
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_BlankPagePainter old) =>
      old.paper != paper || old.fold != fold || old.edge != edge || old.shadow != shadow;
}
