import 'package:flutter/material.dart';

import '../../../core/format.dart';
import '../../../core/layout/breakpoints.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/category.dart';
import '../../../shared/domain/records/entry.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../../shared/domain/text/fold.dart';
import '../../characters/widgets/cast_card.dart' show ChapterThread;
import '../../characters/widgets/portrait.dart';
import '../../characters/widgets/vault.dart';
import 'entry_bits.dart';

/// The letter an entry is filed under: its first letter without accents ("Élan" under E), "#" for a digit or a sign.
String letterOf(String name) {
  final first = foldText(name.trim()).characters.firstOrNull ?? '';
  return RegExp(r'^\p{L}$', unicode: true).hasMatch(first) ? first.toUpperCase() : '#';
}

/// Entries in the order given, filed under their letters (a letter met again later joins its first group).
List<(String, List<Entry>)> fileByLetter(List<Entry> entries) {
  final groups = <String, List<Entry>>{};
  for (final e in entries) {
    (groups[letterOf(e.name)] ??= []).add(e);
  }
  return [for (final g in groups.entries) (g.key, g.value)];
}

/// For each entry, the chapters (by number, in reading order) where a chapter or one of its scenes links to it.
Map<String, Set<int>> chaptersMentioning(Iterable<StoryNode> nodes, StoryOrder order) {
  final out = <String, Set<int>>{};
  for (final node in nodes) {
    final n = order.chapterNumber[node.id];
    if (n == null || n < 1) continue;
    for (final id in node.mentions) {
      (out[id] ??= {}).add(n);
    }
  }
  return out;
}

/// THE VOLUMES: each kind of record as a bound volume on a shelf (its colour on the spine, its name in the vault's
/// capitals, how many entries it holds). Choosing one opens the encyclopedia at it; "The whole world" shows every kind.
class WorldVolumes extends StatelessWidget {
  const WorldVolumes({
    super.key,
    required this.kinds,
    required this.count,
    required this.total,
    required this.selected,
    required this.onSelect,
  });

  final List<Category> kinds;
  final int Function(String key) count;
  final int total;
  final String? selected;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context) {
    final compact = WindowSize.of(context) == WindowSize.compact;
    return LayoutBuilder(
      builder: (context, box) {
        final columns = compact ? 2 : ((box.maxWidth + 12) / 192).floor().clamp(2, 6);
        final width = (box.maxWidth - 12 * (columns - 1)) / columns;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            SizedBox(
              width: width,
              child: _Volume(
                title: 'The whole world',
                count: total,
                spine: Theme.of(context).colorScheme.primary,
                selected: selected == null,
                onTap: () => onSelect(null),
              ),
            ),
            for (final k in kinds)
              SizedBox(
                width: width,
                child: _Volume(
                  title: k.name,
                  count: count(k.key),
                  spine: kindColor(k),
                  selected: selected == k.key,
                  onTap: () => onSelect(selected == k.key ? null : k.key),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _Volume extends StatelessWidget {
  const _Volume({
    required this.title,
    required this.count,
    required this.spine,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final int count;
  final Color spine;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final gilt = ThemeData.estimateBrightnessForColor(spine) == Brightness.dark
        ? const Color(0xFFF3E3B5)
        : const Color(0xFF3A2A12);
    return Semantics(
      button: true,
      selected: selected,
      label: '$title, ${plural(count, 'entry', 'entries')}',
      excludeSemantics: true,
      child: Material(
        // A light tint of the accent, so the spine and the tick still show on the chosen volume.
        color: selected
            ? Color.alphaBlend(scheme.primary.withValues(alpha: 0.10), scheme.surface)
            : scheme.surfaceContainerLow,
        elevation: selected ? 3 : 0,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.horizontal(left: Radius.circular(3), right: Radius.circular(8)),
          side: BorderSide(
            color: selected ? scheme.primary : scheme.outlineVariant.withValues(alpha: 0.6),
            width: selected ? 2 : 1,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 72),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // The spine: the kind's colour with two gilt bands, as on a bound volume.
                  Container(
                    width: 18,
                    color: spine,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        for (var i = 0; i < 2; i++)
                          Container(height: 2, margin: const EdgeInsets.symmetric(horizontal: 3), color: gilt),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: vaultHeading(context, size: 14, weight: 700, color: scheme.onSurface),
                          ),
                          Text(
                            plural(count, 'entry', 'entries'),
                            style: vaultText(
                              context,
                              size: 15,
                              style: FontStyle.italic,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (selected)
                    Padding(
                      padding: const EdgeInsets.only(right: 10),
                      child: Icon(Icons.check_circle, size: 20, color: scheme.primary),
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

/// THE ENCYCLOPEDIA: entries filed under their letters, each set as an article in a reference book (a drop capital on
/// its kind's colour or its picture, the name in the vault's capitals, its kind and tags, the summary in the book
/// face) with its thread through the chapters. A row of letters jumps to each one.
class Encyclopedia extends StatefulWidget {
  const Encyclopedia({
    super.key,
    required this.entries,
    required this.kindOf,
    required this.mentions,
    required this.chapterCount,
    required this.onOpen,
  });

  /// In the order to show them (by name).
  final List<Entry> entries;
  final Category Function(Entry e) kindOf;
  final Map<String, Set<int>> mentions;
  final int chapterCount;
  final void Function(Entry e) onOpen;

  @override
  State<Encyclopedia> createState() => _EncyclopediaState();
}

class _EncyclopediaState extends State<Encyclopedia> {
  final _keys = <String, GlobalKey>{};

  void _jump(String letter) {
    final target = _keys[letter]?.currentContext;
    if (target != null) {
      Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filed = fileByLetter(widget.entries);
    final compact = WindowSize.of(context) == WindowSize.compact;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (filed.length > 1) ...[
          _LetterIndex(letters: [for (final (l, _) in filed) l], onJump: _jump),
          const SizedBox(height: 8),
        ],
        for (final (letter, entries) in filed) ...[
          _LetterHeading(key: _keys.putIfAbsent(letter, GlobalKey.new), letter: letter),
          LayoutBuilder(
            builder: (context, box) {
              final columns = compact || box.maxWidth < 760 ? 1 : 2;
              final width = (box.maxWidth - 32 * (columns - 1)) / columns;
              return Wrap(
                spacing: 32,
                children: [
                  for (final e in entries)
                    SizedBox(
                      width: width,
                      child: _Article(
                        entry: e,
                        kind: widget.kindOf(e),
                        chapters: widget.mentions[e.id] ?? const {},
                        chapterCount: widget.chapterCount,
                        onOpen: () => widget.onOpen(e),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _LetterIndex extends StatelessWidget {
  const _LetterIndex({required this.letters, required this.onJump});

  final List<String> letters;
  final ValueChanged<String> onJump;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Wrap(
      children: [
        for (final l in letters)
          Tooltip(
            message: l == '#' ? 'Jump to names starting with a number or sign' : 'Jump to $l',
            child: InkWell(
              onTap: () => onJump(l),
              customBorder: const CircleBorder(),
              child: SizedBox(
                width: 48,
                height: 48,
                child: Center(
                  child: Text(l, style: vaultHeading(context, size: 17, weight: 700, color: scheme.primary)),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// A letter set large in the vault's capitals, with a rule running out from it.
class _LetterHeading extends StatelessWidget {
  const _LetterHeading({super.key, required this.letter});

  final String letter;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 4),
      child: Semantics(
        header: true,
        label: letter == '#' ? 'Numbers and signs' : 'Letter $letter',
        excludeSemantics: true,
        child: Row(
          children: [
            Text(letter, style: vaultHeading(context, size: 34, weight: 700, color: scheme.primary)),
            const SizedBox(width: 14),
            Expanded(child: Container(height: 1, color: scheme.primary.withValues(alpha: 0.45))),
            const SizedBox(width: 6),
            Transform.rotate(
              angle: 0.785398,
              child: Container(width: 6, height: 6, color: scheme.primary.withValues(alpha: 0.7)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Article extends StatelessWidget {
  const _Article({
    required this.entry,
    required this.kind,
    required this.chapters,
    required this.chapterCount,
    required this.onOpen,
  });

  final Entry entry;
  final Category kind;
  final Set<int> chapters;
  final int chapterCount;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tone = kindColor(kind);
    final sorted = chapters.where((n) => n <= chapterCount).toList()..sort();
    final where = chapterCount == 0
        ? null
        : sorted.isEmpty
        ? 'Not in the manuscript yet'
        : sorted.length == 1
        ? 'In chapter ${sorted.first}'
        : 'In ${formatNumber(sorted.length)} of ${formatNumber(chapterCount)} chapters · '
              '${sorted.first}–${sorted.last}';
    final marks = [for (var i = 1; i <= chapterCount; i++) chapters.contains(i)];

    return Semantics(
      button: true,
      label: [
        entry.name,
        kind.singular,
        if (entry.summary.isNotEmpty) entry.summary,
        if (entry.tags.isNotEmpty) 'Tags: ${entry.tags.join(', ')}',
        ?where,
      ].join(', '),
      excludeSemantics: true,
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _DropCap(entry: entry, tone: tone),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: vaultHeading(context, size: 16, weight: 700, color: scheme.onSurface),
                    ),
                    Text.rich(
                      TextSpan(
                        children: [
                          WidgetSpan(
                            alignment: PlaceholderAlignment.middle,
                            child: Container(
                              width: 8,
                              height: 8,
                              margin: const EdgeInsets.only(right: 6),
                              decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
                            ),
                          ),
                          TextSpan(text: kind.singular),
                          if (entry.tags.isNotEmpty) TextSpan(text: '  ·  ${entry.tags.join(' · ')}'),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                    ),
                    if (entry.summary.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        entry.summary,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: vaultText(context, size: 16, color: scheme.onSurface),
                      ),
                    ],
                    if (where != null) ...[
                      const SizedBox(height: 8),
                      ChapterThread(marks: marks, tone: tone),
                      const SizedBox(height: 3),
                      Text(where, style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The entry's picture, or its first letter as an illuminated capital on its kind's colour inside a thin frame.
class _DropCap extends StatelessWidget {
  const _DropCap({required this.entry, required this.tone});

  final Entry entry;
  final Color tone;

  static const _size = 64.0;

  @override
  Widget build(BuildContext context) {
    if (uploadedImageBytes(entry.image) != null) {
      return EntryThumb(entry: entry, color: tone, size: _size);
    }
    final dark = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark;
    final ink = dark ? const Color(0xFFFFF8EC) : const Color(0xFF1B140E);
    final initial = entry.name.trim().isEmpty ? '?' : entry.name.trim().characters.first.toUpperCase();
    return ExcludeSemantics(
      child: Container(
        width: _size,
        height: _size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color.lerp(tone, Colors.white, 0.1)!, Color.lerp(tone, Colors.black, 0.4)!],
          ),
        ),
        padding: const EdgeInsets.all(5),
        child: DecoratedBox(
          decoration: BoxDecoration(border: Border.all(color: ink.withValues(alpha: 0.45))),
          child: Center(
            child: Text(initial, style: vaultHeading(context, size: 30, weight: 700, color: ink)),
          ),
        ),
      ),
    );
  }
}
