import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/modules/module_defs.dart';
import '../../shared/domain/modules/try_on.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../characters/widgets/vault.dart';
import '../codex/widgets/entry_bits.dart' show kindColor;

/// The sign of each kind of tool, as the module's workspace draws it.
IconData toolIcon(String type) => switch (type) {
  'registry' => Icons.menu_book_outlined,
  'board' => Icons.view_kanban_outlined,
  'table' => Icons.table_chart_outlined,
  'matrix' => Icons.grid_on,
  'meters' => Icons.speed,
  'log' => Icons.history_edu,
  'calculator' => Icons.calculate_outlined,
  'ranks' => Icons.military_tech_outlined,
  'inventory' => Icons.backpack_outlined,
  'lineage' => Icons.account_tree_outlined,
  _ => Icons.open_in_new,
};

/// SEE IT IN YOUR BOOK: under a module, what turning it on would do to this novel (`try_on.dart`), before the press.
/// The Codex as a shelf of volumes, the novel's own kinds as they are and the module's new ones lit and marked NEW
/// ("5 kinds of record now, 9 with it"); what the novel's own entries gain ("James gains Power Rank"); the tools it
/// opens, each with its sign; and that nothing is made until the author adds it, and turning it off deletes nothing.
///
/// Worked out only when opened, and again only when the novel has changed.
class TryOnPanel extends StatefulWidget {
  const TryOnPanel({
    super.key,
    required this.snapshot,
    required this.module,
    required this.novelTitle,
    this.initiallyOpen = false,
  });

  final NovelSnapshot snapshot;
  final ModuleDefinition module;
  final String novelTitle;
  final bool initiallyOpen;

  @override
  State<TryOnPanel> createState() => _TryOnPanelState();
}

class _TryOnPanelState extends State<TryOnPanel> {
  late bool _open = widget.initiallyOpen;
  ModuleTryOn? _tried;
  Object? _for;

  ModuleTryOn _tryOn() {
    // The novel as it stands: its last change and which module.
    final key = (widget.snapshot.project['updatedAt'], widget.snapshot.rows('loreSchemas').length, widget.module.id);
    if (_tried != null && _for == key) return _tried!;
    _for = key;
    return _tried = tryOnModule(widget.snapshot, widget.module);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final title = widget.novelTitle.trim().isEmpty ? 'your book' : '“${widget.novelTitle.trim()}”';
    final toggle = TextButton.icon(
      onPressed: () => setState(() => _open = !_open),
      icon: Icon(_open ? Icons.expand_less : Icons.auto_awesome_outlined),
      label: Text(_open ? 'Hide what it adds' : 'See it in your book'),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Align(alignment: Alignment.centerLeft, child: toggle),
        AnimatedSize(
          duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 220),
          alignment: Alignment.topCenter,
          child: !_open
              ? const SizedBox(width: double.infinity)
              : Padding(
                  padding: const EdgeInsets.only(top: 4, bottom: 8),
                  child: _Preview(tried: _tryOn(), module: widget.module, title: title, scheme: scheme),
                ),
        ),
      ],
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({required this.tried, required this.module, required this.title, required this.scheme});

  final ModuleTryOn tried;
  final ModuleDefinition module;
  final String title;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = tried;
    String list(List<String> words, [int most = 3]) {
      if (words.length <= most) {
        return words.length <= 1 ? words.join() : '${words.take(words.length - 1).join(', ')} and ${words.last}';
      }
      return '${words.take(most).join(', ')} and ${words.length - most} more';
    }

    String gainLine(TryOnGain g) {
      final fields = list(g.fields);
      if (g.entries.isEmpty) return '${g.kind.name} gain ${plural(g.fields.length, 'field')}: $fields.';
      if (g.entries.length == 1) return '${g.entries.single} gains $fields.';
      if (g.entries.length <= 3) return '${list(g.entries)} each gain $fields.';
      return 'Your ${formatNumber(g.entries.length)} ${g.kind.name.toLowerCase()} gain $fields.';
    }

    // On a phone, the first six tools and how many more: the next suggestion stays near.
    final shown = MediaQuery.sizeOf(context).width < 600 ? 6 : t.tools.length;
    final shelf = [
      for (final c in t.before) (kind: c, fresh: false, more: t.gains.any((g) => g.kind.key == c.key)),
      for (final c in t.added) (kind: c, fresh: true, more: false),
    ];
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('In $title, with ${module.name}', style: vaultHeading(context, size: 11.5, weight: 700)),
            const SizedBox(height: 10),
            if (shelf.isNotEmpty) ...[
              // The Codex as a shelf: what is there, and what would come.
              Semantics(
                container: true,
                label:
                    'Kinds of record: ${t.before.length} now, ${t.before.length + t.added.length} with it. '
                    'New: ${t.added.map((c) => c.name).join(', ')}',
                excludeSemantics: true,
                // Every volume in view, the new ones too: narrower spines where the shelf is short (a phone).
                child: LayoutBuilder(
                  builder: (context, box) {
                    final n = shelf.length;
                    double widthWith(double gap) => (box.maxWidth - gap * (n - 1)) / n;
                    // Closer together first, then narrower; never so narrow the name cannot be read.
                    final gap = widthWith(4) >= 14 ? 4.0 : 2.0;
                    final width = widthWith(gap).clamp(11.0, 30.0);
                    final fits = width * n + gap * (n - 1) <= box.maxWidth + 0.5;
                    // When even so they do not all fit, the new ones come first: they are what is being shown.
                    final order = fits ? shelf : [...shelf.where((s) => s.fresh), ...shelf.where((s) => !s.fresh)];
                    final row = Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        for (final (i, s) in order.indexed) ...[
                          if (i > 0) SizedBox(width: gap),
                          _Spine(kind: s.kind, fresh: s.fresh, more: s.more, width: width),
                        ],
                      ],
                    );
                    return fits ? row : SingleChildScrollView(scrollDirection: Axis.horizontal, child: row);
                  },
                ),
              ),
              Container(height: 3, color: scheme.outline.withValues(alpha: 0.5)),
              const SizedBox(height: 6),
              Text(
                t.added.isEmpty
                    ? '${plural(t.before.length, 'kind')} of record, the same with it.'
                    : '${plural(t.before.length, 'kind')} of record now, ${formatNumber(t.before.length + t.added.length)} '
                          'with it: ${list([for (final c in t.added) c.name], 4)}.',
                style: vaultText(context, size: 15, color: scheme.onSurface),
              ),
            ],
            for (final g in t.gains)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.add_circle_outline, size: 16, color: scheme.primary),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(gainLine(g), style: vaultText(context, size: 15, color: scheme.onSurface)),
                    ),
                  ],
                ),
              ),
            if (t.tools.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                'Its workspace opens with ${plural(t.tools.length, 'tool')}',
                style: theme.textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final tool in t.tools.take(shown))
                    Container(
                      padding: const EdgeInsets.fromLTRB(8, 5, 10, 5),
                      decoration: BoxDecoration(
                        color: scheme.surface,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: scheme.outlineVariant),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(toolIcon(tool.type), size: 16, color: scheme.primary),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              tool.title,
                              style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurface),
                            ),
                          ),
                        ],
                      ),
                    ),
                  if (t.tools.length > shown)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 5, 4, 5),
                      child: Text(
                        'and ${formatNumber(t.tools.length - shown)} more',
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ),
                ],
              ),
            ],
            if (t.offersSystem) ...[
              const SizedBox(height: 8),
              Text(
                'And an example system, “${str(module.system!['name'])}”, added only if you ask for it.',
                style: vaultText(context, size: 14.5, color: scheme.onSurfaceVariant, style: FontStyle.italic),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.verified_user_outlined, size: 16, color: scheme.onSurfaceVariant),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Nothing is made until you add it, and turning it off later deletes nothing you wrote.',
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// One kind of record as a volume on the shelf: its colour at the head of the spine, its name down it. A new one
/// stands taller, lit, and marked NEW; one that gains fields has a small "+".
class _Spine extends StatelessWidget {
  const _Spine({required this.kind, required this.fresh, required this.more, required this.width});

  final Category kind;
  final bool fresh;
  final bool more;
  final double width;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final band = kindColor(kind);
    final height = fresh ? 108.0 : 92.0;
    return SizedBox(
      width: width,
      height: height + (fresh ? 16 : 0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          if (fresh)
            SizedBox(
              height: 13,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  'NEW',
                  style: TextStyle(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    color: scheme.primary,
                  ),
                ),
              ),
            ),
          if (fresh) const SizedBox(height: 3),
          Container(
            height: height,
            decoration: BoxDecoration(
              color: fresh ? scheme.primaryContainer : scheme.surfaceContainerHigh,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
              border: Border.all(color: fresh ? scheme.primary : scheme.outlineVariant, width: fresh ? 1.4 : 1),
              boxShadow: fresh ? [BoxShadow(color: scheme.primary.withValues(alpha: 0.3), blurRadius: 8)] : null,
            ),
            child: Column(
              children: [
                Container(
                  height: 10,
                  decoration: BoxDecoration(
                    color: band,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
                  ),
                  alignment: Alignment.center,
                  child: more ? const Icon(Icons.add, size: 9, color: Colors.white) : null,
                ),
                Expanded(
                  child: RotatedBox(
                    quarterTurns: 3,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text(
                          kind.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: fresh ? scheme.onPrimaryContainer : scheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
