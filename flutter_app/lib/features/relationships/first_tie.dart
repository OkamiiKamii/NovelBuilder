import 'package:flutter/material.dart';

import '../../shared/domain/characters/cast.dart';
import '../../shared/domain/relationships/relation_types.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/cast_ties.dart';
import '../characters/widgets/vault.dart';
import 'relationship_page.dart' show relate;

/// THE FIRST LINE ON THE MAP: an empty relationship map is where the first relationship is drawn, not a note saying to
/// go elsewhere. With two characters or more it is the cast's table of pairs (`CastTies`): a "+" in a pair records a
/// tie, and the map draws it. With fewer it is a sentence to finish, "___ and ___ are Rivals.", that makes whoever is
/// not yet in the cast and their relationship in one press (a character already there is named, not asked for).
class FirstTie extends StatefulWidget {
  const FirstTie({super.key, required this.cast});

  final CastData cast;

  @override
  State<FirstTie> createState() => _FirstTieState();
}

class _FirstTieState extends State<FirstTie> {
  final _first = TextEditingController();
  final _second = TextEditingController();
  String _preset = 'friends';

  @override
  void dispose() {
    _first.dispose();
    _second.dispose();
    super.dispose();
  }

  List<Listed> get _people => [
    for (final l in widget.cast.list)
      if (!l.profile.archived) l,
  ];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final people = _people;
    final heading = [
      Text('Draw the first lines', style: vaultHeading(context, size: 18, weight: 700)),
      const SizedBox(height: 4),
      Text(
        people.length >= 2
            ? 'Who is each of your characters to the others? Press a “+” to say, and the map draws it.'
            : 'Name two people and what they are to each other, and the map has its first line.',
        style: vaultText(context, size: 16, color: scheme.onSurfaceVariant, style: FontStyle.italic),
      ),
      const VaultRule(),
    ];
    if (people.length >= 2) {
      return VaultFrame(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ...heading,
            CastTies(found: people, cast: widget.cast),
          ],
        ),
      );
    }

    final known = people.firstOrNull?.entry;
    final words = vaultText(context, size: 20);
    final style = vaultText(context, size: 20, style: FontStyle.italic);
    Widget name(TextEditingController c, String hint, String label) => SizedBox(
      width: 150,
      child: TextField(
        controller: c,
        onChanged: (_) => setState(() {}),
        textCapitalization: TextCapitalization.words,
        style: style,
        decoration: InputDecoration(
          isDense: true,
          filled: false,
          hintText: hint,
          hintStyle: style.copyWith(color: scheme.onSurfaceVariant),
          helperText: label,
          contentPadding: const EdgeInsets.fromLTRB(4, 6, 4, 2),
          border: const UnderlineInputBorder(),
        ),
      ),
    );
    final firstName = known?.name ?? _first.text.trim();
    final ready = firstName.isNotEmpty && _second.text.trim().isNotEmpty;
    final preset = presetFor(_preset);

    void draw() {
      final actions = CharacterActions(context, widget.cast.novelId);
      final second = _second.text.trim();
      final made = relate(actions, (r) {
        final a = known?.id ?? r.create(name: firstName).id;
        final b = r.create(name: second).id;
        r.createRelation(a, b, _preset);
        return true;
      });
      if (made == true) actions.tell('$firstName and $second are on the map.');
    }

    return VaultFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...heading,
          Wrap(
            spacing: 10,
            runSpacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (known != null)
                Text(known.name, style: style.copyWith(fontWeight: FontWeight.w600))
              else
                name(_first, 'Mira', 'A character'),
              Text('and', style: words),
              name(_second, 'Kai', 'Another'),
              Text('are', style: words),
              // As wide as a phone allows; a long name ("Mentor / Student") shortens in place, whole in the menu.
              SizedBox(
                width: 230,
                child: DropdownButton<String>(
                  value: _preset,
                  isExpanded: true,
                  style: style.copyWith(color: scheme.primary),
                  underline: Container(height: 1, color: scheme.primary),
                  onChanged: (v) => setState(() => _preset = v ?? _preset),
                  selectedItemBuilder: (_) => [
                    for (final p in relationPresets)
                      if (p.key != 'custom') Text(p.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                  items: [
                    for (final p in relationPresets)
                      if (p.key != 'custom') DropdownMenuItem(value: p.key, child: Text(p.label)),
                  ],
                ),
              ),
            ],
          ),
          if (preset.directional)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '${firstName.isEmpty ? 'The first' : firstName} is the ${preset.fromRole.toLowerCase()}, '
                '${_second.text.trim().isEmpty ? 'the second' : _second.text.trim()} the ${preset.toRole.toLowerCase()}.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: ready ? draw : null,
            icon: const Icon(Icons.hub_outlined),
            label: const Text('Draw it on the map'),
          ),
        ],
      ),
    );
  }
}
