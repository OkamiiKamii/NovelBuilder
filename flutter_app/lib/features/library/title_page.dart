import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/layout/breakpoints.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/records/novel.dart';
import '../characters/widgets/vault.dart';
import 'bookshelf.dart';
import 'library_actions.dart';

/// THE TITLE PAGE: a novel begins as a cover. The title is typed onto it, the author under it and its colour chosen
/// beside it, all seen on the jacket as they change; "Begin chapter one" creates the novel and its first chapter and
/// opens the chapter to write in. Every other detail is one press away, in the full form, keeping what was typed.
class TitlePage extends ConsumerStatefulWidget {
  const TitlePage({super.key, required this.onBegin, required this.onMore, this.onImport, this.autofocus = true});

  final void Function(TitleDraft draft) onBegin;
  final void Function(TitleDraft draft) onMore;

  /// Shown only where a backup can be brought in instead (the empty library).
  final VoidCallback? onImport;
  final bool autofocus;

  @override
  ConsumerState<TitlePage> createState() => _TitlePageState();
}

class _TitlePageState extends ConsumerState<TitlePage> {
  final _title = TextEditingController();

  /// The author of the novel made last, so a second book does not ask again.
  late final _author = TextEditingController(
    text: (() {
      final made = [...ref.read(libraryProvider)]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return made.where((n) => n.author.trim().isNotEmpty).firstOrNull?.author ?? '';
    })(),
  );
  String _accent = novelAccents.first;

  @override
  void dispose() {
    _title.dispose();
    _author.dispose();
    super.dispose();
  }

  TitleDraft get _draft => (title: _title.text.trim(), author: _author.text.trim(), accent: _accent);

  bool get _ready => _title.text.trim().isNotEmpty;

  void _begin() {
    if (_ready) widget.onBegin(_draft);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final compact = WindowSize.of(context) == WindowSize.compact;
    final preview = Novel({'title': _title.text.trim(), 'author': _author.text.trim(), 'accent': _accent});
    final heading = vaultHeading(context, size: compact ? 26 : 34, weight: 700, color: scheme.onSurface);

    final jacket = ExcludeSemantics(
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        child: BookJacket(key: ValueKey(_accent), novel: preview, width: compact ? 150 : 250),
      ),
    );

    final form = Column(
      crossAxisAlignment: compact ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'A NEW NOVEL',
          style: TextStyle(fontSize: 12, letterSpacing: 3, fontWeight: FontWeight.w600, color: scheme.onSurfaceVariant),
        ),
        TextField(
          controller: _title,
          autofocus: widget.autofocus,
          textAlign: compact ? TextAlign.center : TextAlign.start,
          style: heading,
          maxLines: null,
          textInputAction: TextInputAction.done,
          decoration: InputDecoration(
            filled: false,
            border: InputBorder.none,
            hintText: 'Your title',
            hintStyle: heading.copyWith(color: scheme.onSurfaceVariant.withValues(alpha: 0.5)),
            semanticCounterText: '',
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _begin(),
        ),
        TextField(
          controller: _author,
          textAlign: compact ? TextAlign.center : TextAlign.start,
          style: vaultText(context, size: 20, color: scheme.onSurface),
          decoration: InputDecoration(
            filled: false,
            border: InputBorder.none,
            hintText: 'Author',
            prefixText: compact ? null : 'by ',
            prefixStyle: vaultText(context, size: 20, color: scheme.onSurfaceVariant, style: FontStyle.italic),
            semanticCounterText: '',
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _begin(),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 0,
          alignment: compact ? WrapAlignment.center : WrapAlignment.start,
          children: [
            for (final (i, hex) in novelAccents.indexed)
              _Swatch(
                color: Color(int.parse('ff${hex.substring(1)}', radix: 16)),
                name: novelAccentNames[i],
                selected: _accent == hex,
                onTap: () => setState(() => _accent = hex),
              ),
          ],
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _ready ? _begin : null,
          style: FilledButton.styleFrom(
            minimumSize: const Size(0, 56),
            padding: const EdgeInsets.symmetric(horizontal: 28),
            textStyle: theme.textTheme.titleMedium,
          ),
          icon: const Icon(Icons.edit_note),
          label: const Text('Begin chapter one'),
        ),
        const SizedBox(height: 8),
        Wrap(
          alignment: compact ? WrapAlignment.center : WrapAlignment.start,
          children: [
            TextButton(onPressed: () => widget.onMore(_draft), child: const Text('More details')),
            if (widget.onImport != null) TextButton(onPressed: widget.onImport, child: const Text('Import backup')),
          ],
        ),
      ],
    );

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: compact ? 16 : 40, vertical: compact ? 20 : 40),
      child: compact
          ? Column(mainAxisSize: MainAxisSize.min, children: [jacket, const SizedBox(height: 24), form])
          : Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                jacket,
                const SizedBox(width: 48),
                Flexible(
                  child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 460), child: form),
                ),
              ],
            ),
    );
  }
}

/// One of the cover colours, named for a screen reader and in its tooltip.
class _Swatch extends StatelessWidget {
  const _Swatch({required this.color, required this.name, required this.selected, required this.onTap});

  final Color color;
  final String name;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: selected,
      label: '$name cover',
      excludeSemantics: true,
      child: Tooltip(
        message: name,
        child: InkResponse(
          onTap: onTap,
          radius: 24,
          child: SizedBox.square(
            dimension: 48,
            child: Center(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                width: selected ? 34 : 28,
                height: selected ? 34 : 28,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  border: Border.all(color: selected ? scheme.onSurface : Colors.transparent, width: 2),
                ),
                child: selected ? const Icon(Icons.check, size: 18, color: Colors.white) : null,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "New novel": the title page, over the page that asked for it.
Future<void> showTitlePage(BuildContext context, WidgetRef ref) {
  Widget page(BuildContext dialog) => TitlePage(
    onBegin: (d) {
      Navigator.of(dialog).pop();
      beginNovelFlow(context, ref, d);
    },
    onMore: (d) {
      Navigator.of(dialog).pop();
      createNovelFlow(context, ref, draft: d);
    },
  );
  if (WindowSize.of(context) == WindowSize.compact) {
    return showDialog<void>(
      context: context,
      builder: (dialog) => Dialog.fullscreen(
        child: Scaffold(
          appBar: AppBar(
            leading: IconButton(
              tooltip: 'Close',
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.of(dialog).pop(),
            ),
          ),
          body: Center(child: SingleChildScrollView(child: page(dialog))),
        ),
      ),
    );
  }
  return showDialog<void>(
    context: context,
    builder: (dialog) => Dialog(
      child: Stack(
        children: [
          SingleChildScrollView(child: page(dialog)),
          Positioned(
            top: 8,
            right: 8,
            child: IconButton(
              tooltip: 'Close',
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.of(dialog).pop(),
            ),
          ),
        ],
      ),
    ),
  );
}
