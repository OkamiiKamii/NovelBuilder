import 'package:flutter/material.dart';

import '../../relationships/relationship_page.dart' show relate;
import '../character_actions.dart';
import 'vault.dart';

/// One part on the playbill: what the line says, the role the character takes, an example name, and the tie to the
/// hero it records (none for the hero, or for the cast beyond).
typedef PlaybillPart = ({String part, String role, String hint, String? tie});

const playbillParts = <PlaybillPart>[
  (part: 'The hero', role: 'Protagonist', hint: 'Mira Vance', tie: null),
  (part: 'Who stands against them', role: 'Antagonist', hint: 'The Grey Abbot', tie: 'enemies'),
  (part: 'Who stands by them', role: 'Supporting', hint: 'Kai', tie: 'friends'),
];

/// Further parts, added a line at a time: the cast beyond, supporting, with no tie assumed.
const PlaybillPart playbillMore = (part: 'And', role: 'Supporting', hint: 'Orrin', tie: null);

/// Makes the cast of a filled playbill in one change: a character for each name written (as written), with the part's
/// role, and the hero's ties to those who stand against and by them. Returns how many characters were made.
int raiseTheCurtain(CharacterActions actions, List<(PlaybillPart, String)> lines) {
  final named = [
    for (final (part, name) in lines)
      if (name.trim().isNotEmpty) (part, name.trim()),
  ];
  if (named.isEmpty) return 0;
  final made = relate(actions, (r) {
    final ids = [
      for (final (part, name) in named) (part, r.create(name: name, roles: [part.role]).id),
    ];
    final hero = ids.where((p) => p.$1.tie == null && p.$1.role == 'Protagonist').firstOrNull?.$2;
    if (hero != null) {
      for (final (part, id) in ids) {
        if (part.tie != null) r.createRelation(hero, id, part.tie!);
      }
    }
    return named.length;
  });
  return made ?? 0;
}

/// DRAMATIS PERSONAE: an empty cast is a playbill to fill, not a note and a button. Its lines: the hero, who stands
/// against them, who stands by them, and as many more as wanted ("Add another part"). **Raise the curtain** makes
/// them all at once, each with the part's role (Protagonist, Antagonist, Supporting), and records the hero's ties: the
/// one against as Enemies, the one beside as Friends, so the relationship map has its first lines. Any line can be
/// left empty; nothing is made until the press. One at a time is still New character.
class Playbill extends StatefulWidget {
  const Playbill({super.key, required this.novelId, required this.onCreate});

  final String novelId;

  /// One character at a time, with their portrait card (as New character).
  final VoidCallback onCreate;

  @override
  State<Playbill> createState() => _PlaybillState();
}

class _PlaybillState extends State<Playbill> {
  late final List<(PlaybillPart, TextEditingController)> _lines = [
    for (final p in playbillParts) (p, TextEditingController()),
  ];

  @override
  void dispose() {
    for (final (_, c) in _lines) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _any => _lines.any((l) => l.$2.text.trim().isNotEmpty);

  void _raise() {
    final actions = CharacterActions(context, widget.novelId);
    final made = raiseTheCurtain(actions, [for (final (p, c) in _lines) (p, c.text)]);
    if (made > 0) actions.tell(made == 1 ? 'Your first character is in the cast.' : 'Your cast of $made is ready.');
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return VaultFrame(
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Dramatis personae', textAlign: TextAlign.center, style: vaultHeading(context, size: 20, weight: 700)),
          const SizedBox(height: 4),
          Text(
            'Who is in your story? Name them on the playbill; leave any line empty.',
            textAlign: TextAlign.center,
            style: vaultText(context, size: 16, color: scheme.onSurfaceVariant, style: FontStyle.italic),
          ),
          const VaultRule(),
          for (final (i, (part, controller)) in _lines.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: LayoutBuilder(
                builder: (context, box) {
                  final narrow = box.maxWidth < 420;
                  final label = Text(
                    part.part,
                    style: vaultHeading(context, size: 11.5, weight: 700, color: scheme.onSurfaceVariant),
                  );
                  final field = TextField(
                    controller: controller,
                    onChanged: (_) => setState(() {}),
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    style: vaultText(context, size: 19),
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: part.hint,
                      helperText: part.role,
                      semanticCounterText: '',
                    ),
                  );
                  return Semantics(
                    label:
                        '${part.part}, ${part.role}${i >= playbillParts.length ? ' ${i - playbillParts.length + 2}' : ''}',
                    textField: true,
                    child: narrow
                        ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [label, field])
                        : Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: 200,
                                child: Padding(padding: const EdgeInsets.only(top: 14), child: label),
                              ),
                              Expanded(child: field),
                            ],
                          ),
                  );
                },
              ),
            ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: _lines.length >= 8
                  ? null
                  : () => setState(() => _lines.add((playbillMore, TextEditingController()))),
              icon: const Icon(Icons.add),
              label: const Text('Add another part'),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _any ? _raise : null,
            icon: const Icon(Icons.theater_comedy_outlined),
            label: const Text('Raise the curtain'),
          ),
          Align(
            child: TextButton(onPressed: widget.onCreate, child: const Text('Create a character')),
          ),
          const SizedBox(height: 8),
          Text(
            'The hero’s ties are recorded too: against them as Enemies, beside them as Friends.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
