import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/codex/world_finder.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/manuscript/prose.dart';
import '../../../shared/domain/records/category.dart';
import '../../characters/character_actions.dart';
import '../../characters/characters_providers.dart';
import '../../characters/widgets/cast_card.dart' show monogram;
import '../../characters/widgets/vault.dart';
import 'entry_bits.dart';

/// Where the names set aside as "Not an entry" are kept, per novel.
String notEntriesKey(String novelId) => 'world.notEntries.$novelId';

/// FOUND IN YOUR PAGES, at the top of the World: the places, groups, powers and things the manuscript names that the
/// world does not hold yet (`world_finder.dart`), each a card in its kind's colour: "Mimir Forest", "Location ·
/// reads as a place · in chapter 1", **Add as Location** (one press, under the kind it reads as), **Another kind**
/// (the same, under any other), or **Not an entry**, which sets it aside for this novel. The most written first;
/// three, then "Show all".
///
/// It reads the saved chapters once per change of the novel, only while the World is shown. Nothing is added until a
/// press.
class FoundInPages extends ConsumerStatefulWidget {
  const FoundInPages({super.key, required this.cast});

  final CastData cast;

  @override
  ConsumerState<FoundInPages> createState() => _FoundInPagesState();
}

class _FoundInPagesState extends ConsumerState<FoundInPages> {
  static const _first = 3;
  bool _all = false;
  CastData? _for;
  List<WorldFind> _found = const [];

  Set<String> _setAside() {
    final stored = ref.read(settingsStoreProvider).read(notEntriesKey(widget.cast.novelId));
    return {
      if (stored is List)
        for (final s in stored) '$s',
    };
  }

  List<WorldFind> _finds() {
    final cast = widget.cast;
    if (identical(cast, _for)) return _found;
    _for = cast;
    final store = ref.read(novelStoreProvider);
    _found = worldFinds(
      [
        for (final row in store.rowsIn(cast.novelId, 'chapterContents'))
          if (cast.model.order.chapterNumber[str(row['id'])] case final number?) (number, blockTexts(row['doc'])),
      ],
      known: {
        for (final e in cast.entries) worldKey(e.name),
        for (final p in cast.profiles.values) ...p.aliases.map(worldKey),
      },
      limit: 40,
    );
    return _found;
  }

  void _notAnEntry(WorldFind f) {
    ref.read(settingsStoreProvider).write(notEntriesKey(widget.cast.novelId), [..._setAside(), worldKey(f.name)]);
    setState(() {});
  }

  void _add(WorldFind f, String kind) {
    final actions = CharacterActions(context, widget.cast.novelId);
    final made = actions.now((c) => c.createEntry(kind, f.name));
    if (made != null) {
      actions.tell(
        '${f.name} is in the world.',
        actionLabel: 'Open',
        onAction: () => actions.openEntry(made.id, character: false),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final aside = _setAside();
    final kinds = widget.cast.model.categories;
    final finds = [
      for (final f in _finds())
        if (!aside.contains(worldKey(f.name)) && kinds[f.kind] != null && !kinds[f.kind]!.archived) f,
    ];
    if (finds.isEmpty) return const SizedBox.shrink();
    final shown = _all ? finds : finds.take(_first).toList();
    final scheme = Theme.of(context).colorScheme;
    final others = [
      for (final k in kinds.values)
        if (k.key != 'character' && !k.archived) k,
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text('Found in your pages', style: vaultHeading(context, size: 13, weight: 700)),
          ),
          const SizedBox(height: 2),
          Text(
            'Places, groups, powers and things your chapters name that the world does not hold yet.',
            style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, box) {
              final columns = ((box.maxWidth + 12) / 300).floor().clamp(1, 3);
              final width = (box.maxWidth - 12 * (columns - 1)) / columns;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final f in shown)
                    SizedBox(
                      width: width,
                      child: _FindCard(
                        find: f,
                        kind: kinds[f.kind]!,
                        others: [
                          for (final k in others)
                            if (k.key != f.kind) k,
                        ],
                        onAdd: (kind) => _add(f, kind),
                        onSetAside: () => _notAnEntry(f),
                      ),
                    ),
                ],
              );
            },
          ),
          if (finds.length > _first)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: TextButton(
                onPressed: () => setState(() => _all = !_all),
                child: Text(_all ? 'Show fewer' : 'Show all ${formatNumber(finds.length)}'),
              ),
            ),
          const SizedBox(height: 4),
          Divider(color: scheme.outlineVariant),
        ],
      ),
    );
  }
}

class _FindCard extends StatelessWidget {
  const _FindCard({
    required this.find,
    required this.kind,
    required this.others,
    required this.onAdd,
    required this.onSetAside,
  });

  final WorldFind find;
  final Category kind;
  final List<Category> others;
  final ValueChanged<String> onAdd;
  final VoidCallback onSetAside;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tone = kindColor(kind);
    final ink = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark
        ? const Color(0xFFFFF8EC)
        : const Color(0xFF1B140E);
    final f = find;
    final where = f.chapters == 1 ? 'in chapter ${f.first}' : 'in ${formatNumber(f.chapters)} chapters';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.7)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Its letter on its kind's colour, as the encyclopedia sets entries.
              ExcludeSemantics(
                child: Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: tone, borderRadius: BorderRadius.circular(6)),
                  child: Text(monogram(f.name), style: vaultHeading(context, size: 13, weight: 700, color: ink)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      f.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: vaultHeading(context, size: 15, weight: 700, color: scheme.onSurface),
                    ),
                    Text(
                      '${kind.singular} · ${f.why} · $where',
                      style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 4,
            children: [
              TextButton.icon(
                onPressed: () => onAdd(kind.key),
                icon: const Icon(Icons.add, size: 18),
                label: Text('Add as ${kind.singular}'),
              ),
              if (others.isNotEmpty)
                PopupMenuButton<String>(
                  tooltip: 'Add ${f.name} as another kind',
                  useRootNavigator: true,
                  onSelected: onAdd,
                  itemBuilder: (_) => [for (final k in others) PopupMenuItem(value: k.key, child: Text(k.singular))],
                  child: IgnorePointer(
                    child: TextButton(
                      onPressed: () {},
                      style: TextButton.styleFrom(foregroundColor: scheme.onSurfaceVariant),
                      child: const Text('Another kind'),
                    ),
                  ),
                ),
              TextButton(
                onPressed: onSetAside,
                style: TextButton.styleFrom(foregroundColor: scheme.onSurfaceVariant),
                child: const Text('Not an entry'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
