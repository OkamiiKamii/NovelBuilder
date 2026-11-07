import 'package:flutter/material.dart';

import '../../../shared/domain/records/category.dart';
import '../../characters/character_actions.dart';
import '../../characters/widgets/vault.dart';
import 'entry_bits.dart';

/// One blank of the charter: the words around it, the kind of entry it makes, an example, and how the entry it makes
/// is linked to the place (the place's own blank has none).
typedef CharterClause = ({String kind, String before, String after, String hint, String? linkLabel});

const charterClauses = <CharterClause>[
  (kind: 'location', before: 'My story takes place in', after: '.', hint: 'Vell', linkLabel: null),
  (kind: 'faction', before: '', after: 'hold power there.', hint: 'The Lantern Guild', linkLabel: 'holds power in'),
  (kind: 'item', before: 'Everyone wants', after: '.', hint: 'the Ninth Key', linkLabel: 'sought in'),
  (kind: 'power', before: 'Everyone fears', after: '.', hint: 'tide-magic', linkLabel: 'feared in'),
  (
    kind: 'lore',
    before: 'And no one has forgotten',
    after: '.',
    hint: 'the night the river burned',
    linkLabel: 'remembered in',
  ),
];

/// Makes the entries of a filled charter in one change: one entry for each filled blank, named exactly as written,
/// each linked to the place when there is one. Returns how many were made (none when every blank is empty).
int foundWorld(CharacterActions actions, Map<String, String> names) {
  final filled = [
    for (final c in charterClauses)
      if ((names[c.kind] ?? '').trim().isNotEmpty) c,
  ];
  if (filled.isEmpty) return 0;
  final made = actions.now((x) {
    final place = filled.where((c) => c.linkLabel == null).map((c) => x.createEntry(c.kind, names[c.kind])).firstOrNull;
    for (final c in filled) {
      if (c.linkLabel == null) continue;
      final e = x.createEntry(c.kind, names[c.kind]);
      if (place != null) x.linkEntries(e.id, place.id, c.linkLabel!);
    }
    return filled.length;
  });
  return made ?? 0;
}

/// THE FIRST PAGE OF THE WORLD: an empty world opens on a page with one short paragraph to finish, a blank for a
/// place, a power that rules it, a thing everyone wants, a thing everyone fears and a thing no one forgets. **Begin
/// this world** makes an entry for each blank filled (any one is enough), all linked to the place. Only the kinds the
/// novel has (and has not archived) are asked for. Nothing is made until the press.
class WorldCharter extends StatefulWidget {
  const WorldCharter({super.key, required this.novelId, required this.kinds});

  final String novelId;
  final Map<String, Category> kinds;

  @override
  State<WorldCharter> createState() => _WorldCharterState();
}

class _WorldCharterState extends State<WorldCharter> {
  late final _fields = {for (final c in charterClauses) c.kind: TextEditingController()};

  @override
  void dispose() {
    for (final f in _fields.values) {
      f.dispose();
    }
    super.dispose();
  }

  List<CharterClause> get _asked => [
    for (final c in charterClauses)
      if (widget.kinds[c.kind] case final k? when !k.archived) c,
  ];

  bool get _any => _asked.any((c) => _fields[c.kind]!.text.trim().isNotEmpty);

  void _begin() {
    final actions = CharacterActions(context, widget.novelId);
    final made = foundWorld(actions, {for (final c in _asked) c.kind: _fields[c.kind]!.text});
    if (made > 0) {
      actions.tell(made == 1 ? 'Your world has its first entry.' : 'Your world has its first $made entries.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final asked = _asked;
    final words = vaultText(context, size: 20);
    if (asked.isEmpty) {
      return Text(
        'Every kind of world entry is archived. Restore one under Categories & fields to add entries.',
        style: vaultText(context, color: scheme.onSurfaceVariant, style: FontStyle.italic),
      );
    }

    Widget blank(CharterClause c, double room) {
      final kind = widget.kinds[c.kind]!;
      final colour = kindColor(kind);
      final field = _fields[c.kind]!;
      final style = vaultText(context, size: 20, style: FontStyle.italic, color: scheme.onSurface);
      // As wide as what is written (or the example), so the paragraph reads as one.
      final shown = field.text.isNotEmpty ? field.text : c.hint;
      final painter = TextPainter(
        text: TextSpan(text: shown, style: style),
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
      )..layout();
      final width = (painter.width + 28).clamp(80.0, (room - 40).clamp(80.0, 420.0));
      painter.dispose();
      return SizedBox(
        width: width,
        child: TextField(
          controller: field,
          onChanged: (_) => setState(() {}),
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          style: style,
          decoration: InputDecoration(
            isDense: true,
            filled: false,
            hintText: c.hint,
            hintStyle: style.copyWith(color: scheme.onSurfaceVariant),
            labelText: null,
            semanticCounterText: '',
            // "Power System / Rule" as "Power System", so the tag fits under the shortest blank.
            helperText: kind.singular.split(' / ').first,
            helperStyle: vaultHeading(context, size: 10.5, weight: 700, color: scheme.onSurfaceVariant),
            contentPadding: const EdgeInsets.fromLTRB(4, 6, 4, 2),
            border: UnderlineInputBorder(borderSide: BorderSide(color: colour.withValues(alpha: 0.6))),
            enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: colour.withValues(alpha: 0.6))),
            focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: colour, width: 2)),
          ),
        ),
      );
    }

    return VaultFrame(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('The first page of your world', style: vaultHeading(context, size: 18, weight: 700)),
          const SizedBox(height: 6),
          Text(
            'Finish the paragraph. Each blank you fill becomes an entry you can build on; leave any of them empty.',
            style: vaultText(context, size: 15.5, color: scheme.onSurfaceVariant, style: FontStyle.italic),
          ),
          const VaultRule(),
          LayoutBuilder(
            builder: (context, box) => Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 10,
              children: [
                // Word by word, so the paragraph wraps as prose does; a full stop stays with its blank.
                for (final c in asked) ...[
                  for (final w in c.before.split(' ').where((w) => w.isNotEmpty)) Text(w, style: words),
                  if (c.after.startsWith('.'))
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(child: blank(c, box.maxWidth)),
                        Text('.', style: words),
                      ],
                    )
                  else ...[
                    blank(c, box.maxWidth),
                    for (final w in c.after.split(' ').where((w) => w.isNotEmpty)) Text(w, style: words),
                  ],
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 16,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton.icon(
                onPressed: _any ? _begin : null,
                icon: const Icon(Icons.auto_stories_outlined),
                label: const Text('Begin this world'),
              ),
              Text(
                'Places, factions, items, powers and lore can also be added one at a time with New entry.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
