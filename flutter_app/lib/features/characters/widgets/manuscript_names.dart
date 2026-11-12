import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/name_finder.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/manuscript/prose.dart';
import '../characters_providers.dart';
import 'cast_card.dart' show castTone, monogram;
import 'vault.dart';

/// IN YOUR MANUSCRIPT: the names the author keeps writing but has not added to the cast (`name_finder.dart`), as
/// cards above the cast: each with how often and in how many chapters it is written, **Add to the cast** (one press
/// makes the character) and **Not a character** (set aside for this novel on this device). Shown only when there are
/// such names; nothing is added or changed until a press.
class ManuscriptNames extends ConsumerStatefulWidget {
  const ManuscriptNames({super.key, required this.cast, required this.onAdd});

  final CastData cast;
  final void Function(String name) onAdd;

  @override
  ConsumerState<ManuscriptNames> createState() => _ManuscriptNamesState();
}

/// Where the names set aside as "Not a character" are kept, per novel.
String notCharactersKey(String novelId) => 'cast.notCharacters.$novelId';

class _ManuscriptNamesState extends ConsumerState<ManuscriptNames> {
  static const _first = 6;
  bool _all = false;

  // Worked out once per change of the novel (a new [CastData]); the cast is read without the manuscript text, so the
  // chapters are read here, only while Characters is shown.
  CastData? _for;
  List<ManuscriptName> _found = const [];

  List<ManuscriptName> _names() {
    final cast = widget.cast;
    if (identical(_for, cast)) return _found;
    final store = ref.read(novelStoreProvider);
    _for = cast;
    return _found = manuscriptNames(
      [
        for (final row in store.rowsIn(cast.novelId, 'chapterContents'))
          if (cast.model.order.chapterNumber[str(row['id'])] case final number?) (number, blockTexts(row['doc'])),
      ],
      known: knownWords([
        for (final e in cast.entries) e.name,
        for (final p in cast.profiles.values) ...[...p.aliases, p.epithet],
      ]),
      limit: 40,
    );
  }

  Set<String> _setAside() {
    final stored = ref.read(settingsStoreProvider).read(notCharactersKey(widget.cast.novelId));
    return {
      if (stored is List)
        for (final s in stored) '$s',
    };
  }

  void _notACharacter(ManuscriptName n) {
    final key = notCharactersKey(widget.cast.novelId);
    ref.read(settingsStoreProvider).write(key, [..._setAside(), plainName(n.name)]);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final aside = _setAside();
    final names = [
      for (final n in _names())
        if (!aside.contains(plainName(n.name))) n,
    ];
    if (names.isEmpty) return const SizedBox.shrink();
    final shown = _all ? names : names.take(_first).toList();
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text('In your manuscript', style: vaultHeading(context, size: 13, weight: 700)),
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, box) {
              final columns = ((box.maxWidth + 12) / 262).floor().clamp(1, 4);
              final width = (box.maxWidth - 12 * (columns - 1)) / columns;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final n in shown)
                    SizedBox(
                      width: width,
                      child: _NameCard(name: n, onAdd: () => widget.onAdd(n.name), onSetAside: () => _notACharacter(n)),
                    ),
                ],
              );
            },
          ),
          if (names.length > _first)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: TextButton(
                onPressed: () => setState(() => _all = !_all),
                child: Text(_all ? 'Show fewer' : 'Show all ${formatNumber(names.length)}'),
              ),
            ),
          const SizedBox(height: 4),
          Divider(color: scheme.outlineVariant),
        ],
      ),
    );
  }
}

class _NameCard extends StatelessWidget {
  const _NameCard({required this.name, required this.onAdd, required this.onSetAside});
  final ManuscriptName name;
  final VoidCallback onAdd;
  final VoidCallback onSetAside;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tone = castTone(plainName(name.name));
    final ink = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark
        ? const Color(0xFFFFF8EC)
        : const Color(0xFF1B140E);
    final where = name.chapters == 1 ? 'in chapter ${name.first}' : 'in ${formatNumber(name.chapters)} chapters';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 8),
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
              ExcludeSemantics(
                child: Container(
                  width: 38,
                  height: 38,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
                  child: Text(monogram(name.name), style: vaultHeading(context, size: 13, weight: 700, color: ink)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: vaultHeading(context, size: 15, weight: 700, color: scheme.onSurface),
                    ),
                    Text(
                      '${plural(name.times, 'time')} · $where',
                      style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 4,
            children: [
              TextButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.person_add_alt, size: 18),
                label: Text('Add ${name.name}'),
              ),
              TextButton(
                onPressed: onSetAside,
                style: TextButton.styleFrom(foregroundColor: scheme.onSurfaceVariant),
                child: const Text('Not a character'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
