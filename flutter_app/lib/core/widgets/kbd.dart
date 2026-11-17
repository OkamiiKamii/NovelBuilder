import 'package:flutter/material.dart';

/// A KEY, as shadcn/ui's Kbd shows one: a keycap with its name ("Ctrl", "K", "↵"), for saying which key does what.
/// Read by a screen reader as [spoken] when it is given (a sign such as ↵ is said "Return").
class Kbd extends StatelessWidget {
  const Kbd(this.label, {super.key, this.spoken}) : icon = null;

  /// A key shown by its sign as an icon (an arrow, Return): drawn, not lettered, so no type lacks it.
  const Kbd.icon(IconData this.icon, {super.key, required String this.spoken}) : label = '';

  final String label;
  final IconData? icon;
  final String? spoken;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final style = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: scheme.onSurface,
      fontWeight: FontWeight.w600,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Semantics(
      label: spoken ?? label,
      child: ExcludeSemantics(
        child: Container(
          constraints: const BoxConstraints(minWidth: 22),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(5),
            border: Border.all(color: scheme.outlineVariant),
            // The keycap's lower edge, a little deeper.
            boxShadow: [BoxShadow(color: scheme.outline, offset: const Offset(0, 1.5))],
          ),
          child: icon == null
              ? Text(label, style: style, textAlign: TextAlign.center)
              : Icon(icon, size: (style?.fontSize ?? 11) + 3, color: scheme.onSurface),
        ),
      ),
    );
  }
}

/// Keys and what they do, in a row: "↑ ↓ to choose · ↵ to open".
class KbdHints extends StatelessWidget {
  const KbdHints(this.hints, {super.key});

  /// Each: its keys and what they do.
  final List<(List<Kbd>, String)> hints;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    return Wrap(
      spacing: 16,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final (keys, what) in hints)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final k in keys) ...[k, const SizedBox(width: 4)],
              const SizedBox(width: 2),
              Text(what, style: muted),
            ],
          ),
      ],
    );
  }
}
