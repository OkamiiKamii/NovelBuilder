import 'dart:math';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/domain/text/name_board.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'cast_card.dart' show castTone;
import 'name_forge.dart';
import 'vault.dart';

/// THE NAME BOARD, a view of the cast (`name_board.dart` reads it): every name in the book, people and places and the
/// rest, on a board of the alphabet, each under the letter it starts with; a letter shaded as it fills, and gold when
/// crowded. A letter pressed lists its names, each a press from its page. Then the look-alikes (two names a reader
/// could take for one another, and why), and the free letters, with **Forge a name** for the next one. It only reads,
/// but for the name forged, which joins the cast.
class NameBoard extends StatefulWidget {
  const NameBoard({super.key, required this.cast});

  final CastData cast;

  @override
  State<NameBoard> createState() => _NameBoardState();
}

class _NameBoardState extends State<NameBoard> {
  String? _letter;

  List<BoardName> get _names => [
    for (final e in widget.cast.model.entries.values)
      if (e.name.trim().isNotEmpty) (name: e.name.trim(), id: e.id, kind: e.category),
  ];

  Color _kindColour(BuildContext context, BoardName n) => switch (n.kind) {
    'character' => castTone(n.id),
    'location' => const Color(0xFF3F7D4E),
    _ => Theme.of(context).colorScheme.outline,
  };

  Future<void> _forge() async {
    final names = _names;
    final name = await showNameForge(
      context,
      people: [
        for (final n in names)
          if (n.kind == 'character') n.name,
      ],
      places: [
        for (final n in names)
          if (n.kind == 'location') n.name,
      ],
    );
    if (name == null || name.trim().isEmpty || !mounted) return;
    final actions = CharacterActions(context, widget.cast.novelId);
    final made = actions.now((c) => c.create(name: name.trim()));
    if (made != null) {
      actions.tell(
        '${name.trim()} is in the cast.',
        actionLabel: 'Open',
        onAction: () => actions.openCharacter(made.id),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final names = _names;
    final board = byLetter(names);
    final alike = lookAlikes(names);
    final free = freeLetters(board);
    final picked = _letter == null ? null : board[_letter];
    const gold = Color(0xFFE0A93B);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Every name in the book by the letter it starts with. Readers know a name by its first letter and its '
            'shape before they read it through: spread them out, and keep the look-alikes apart.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final across = max(4, min(9, constraints.maxWidth ~/ 86));
              final width = (constraints.maxWidth - (across - 1) * 6) / across;
              return Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final MapEntry(key: letter, value: list) in board.entries)
                    if (letter != '#' || list.isNotEmpty)
                      SizedBox(
                        width: width,
                        child: _LetterTile(
                          key: ValueKey('letter-$letter'),
                          letter: letter,
                          names: list,
                          picked: _letter == letter,
                          crowded: list.length >= crowded,
                          dot: (n) => _kindColour(context, n),
                          onTap: list.isEmpty
                              ? null
                              : () => setState(() => _letter = _letter == letter ? null : letter),
                        ),
                      ),
                ],
              );
            },
          ),
          if (picked != null && picked.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              '${picked.length} ${picked.length == 1 ? 'name' : 'names'} under $_letter',
              style: vaultHeading(context, size: 14, color: scheme.onSurface, weight: 700),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final n in picked)
                  ActionChip(
                    avatar: CircleAvatar(radius: 5, backgroundColor: _kindColour(context, n)),
                    label: Text(n.name),
                    tooltip: 'Open ${n.name}',
                    onPressed: () => context.go(entryPath(n.id, character: n.kind == 'character')),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 18),
          _Heading('LOOK-ALIKES', alike.isEmpty ? 'No two names a reader could take for one another.' : null),
          for (final a in alike.take(12))
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: a.wordA,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const TextSpan(text: '  ·  '),
                          TextSpan(
                            text: a.wordB,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          TextSpan(
                            text: '   ${a.why}',
                            style: TextStyle(color: scheme.onSurfaceVariant, fontStyle: FontStyle.italic),
                          ),
                        ],
                      ),
                      style: vaultText(context, size: 16, color: scheme.onSurface),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${a.inA.map((n) => n.name).join(', ')}  and  ${a.inB.map((n) => n.name).join(', ')}',
                      style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 14),
          _Heading(
            'FREE LETTERS',
            free.isEmpty
                ? 'Every letter has a name already.'
                : 'No name begins with ${free.length == 1 ? 'this letter' : 'these ${free.length}'} yet: room for the '
                      'next one.',
          ),
          if (free.isNotEmpty) ...[
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final l in free)
                  Container(
                    width: 32,
                    height: 32,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: gold.withValues(alpha: 0.6)),
                    ),
                    child: Text(l, style: vaultHeading(context, size: 14, color: scheme.onSurface, weight: 700)),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: _forge,
                icon: const Icon(Icons.auto_awesome_outlined, size: 18),
                label: const Text('Forge a name'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text, this.line);

  final String text;
  final String? line;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            text,
            style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
          ),
          if (line != null) Text(line!, style: vaultText(context, size: 14, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// A letter of the board: the letter, how many, the first names under it, and a dot each in their kind's colour;
/// shaded as it fills, gold when crowded.
class _LetterTile extends StatelessWidget {
  const _LetterTile({
    super.key,
    required this.letter,
    required this.names,
    required this.picked,
    required this.crowded,
    required this.dot,
    required this.onTap,
  });

  final String letter;
  final List<BoardName> names;
  final bool picked;
  final bool crowded;
  final Color Function(BoardName) dot;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const gold = Color(0xFFE0A93B);
    final n = names.length;
    final fill = n == 0
        ? Colors.transparent
        : crowded
        ? gold.withValues(alpha: 0.28)
        : scheme.primary.withValues(alpha: 0.06 + 0.08 * n);
    return Semantics(
      // A node of its own, so each letter is read as itself, not merged into what is round it.
      container: true,
      button: onTap != null,
      label: n == 0
          ? '$letter: no names'
          : '$letter: ${names.map((x) => x.name).join(', ')}${crowded ? ', crowded' : ''}',
      excludeSemantics: true,
      child: Material(
        color: fill,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: picked
                ? scheme.onSurface
                : n == 0
                ? scheme.outlineVariant.withValues(alpha: 0.5)
                : crowded
                ? gold
                : scheme.primary.withValues(alpha: 0.3),
            width: picked ? 2 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: 84,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 6, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        letter,
                        style: vaultHeading(
                          context,
                          size: 20,
                          color: n == 0 ? scheme.onSurfaceVariant.withValues(alpha: 0.5) : scheme.onSurface,
                          weight: 700,
                        ),
                      ),
                      const Spacer(),
                      if (n > 0)
                        Text(
                          '$n',
                          style: vaultHeading(context, size: 11, color: crowded ? gold : scheme.primary, weight: 700),
                        ),
                    ],
                  ),
                  for (final x in names.take(2))
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          margin: const EdgeInsets.only(right: 4),
                          decoration: BoxDecoration(color: dot(x), shape: BoxShape.circle),
                        ),
                        Expanded(
                          child: Text(
                            x.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: vaultText(context, size: 11, color: scheme.onSurfaceVariant),
                          ),
                        ),
                      ],
                    ),
                  if (n > 2) Text('+${n - 2}', style: vaultText(context, size: 10.5, color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
