import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/cast_check.dart';
import '../../../shared/domain/records/relation.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'page_notes.dart';
import 'vault.dart';

/// Where the notes set aside are kept, for a novel: on this device.
String castCheckKey(String novelId) => 'characters.checkSetAside.$novelId';

/// A note's key: what it is about and who.
String noteKey(CastNote n) => '${n.kind.name}:${(n.who.toList()..sort()).join(',')}';

/// THE CAST, CHECKED, on Characters (`cast_check.dart` makes the notes): what an editor would say of the cast, in a few
/// notes, each with the faces it is about: a principal the book forgets, one who goes quiet, two always together,
/// one too light to keep. A press on a face opens them; **Not now** sets a note aside (on this device). Nothing is
/// changed by it.
class CastCheck extends ConsumerStatefulWidget {
  const CastCheck({super.key, required this.cast, this.onCount});

  final CastData cast;

  /// Told how many it shows (the strip of notes counts them, `page_notes.dart`).
  final ValueChanged<int>? onCount;

  @override
  ConsumerState<CastCheck> createState() => _CastCheckState();
}

class _CastCheckState extends ConsumerState<CastCheck> with CountReporter {
  Set<String> _setAside() {
    final stored = ref.read(settingsStoreProvider).read(castCheckKey(widget.cast.novelId));
    return {if (stored is List) ...stored.whereType<String>()};
  }

  void _notNow(CastNote n) {
    setState(() {
      ref.read(settingsStoreProvider).write(castCheckKey(widget.cast.novelId), [..._setAside(), noteKey(n)]);
    });
  }

  @override
  Widget build(BuildContext context) {
    final cast = widget.cast;
    final chapters = cast.model.order.chapters.length;
    final of = cast.chaptersOf();
    final ties = <String, int>{};
    for (final r in cast.snapshot.rows('characterRelations').map(CharacterRelation.new)) {
      ties[r.fromId] = (ties[r.fromId] ?? 0) + 1;
      ties[r.toId] = (ties[r.toId] ?? 0) + 1;
    }
    bool gone(Listed l) =>
        RegExp(r'\b(dead|deceased|late|killed|fallen|departed)\b').hasMatch(l.profile.status.toLowerCase());
    final members = <CastMember>[
      for (final l in cast.list)
        if (!l.profile.archived)
          (
            id: l.entry.id,
            name: l.entry.name.trim().isEmpty ? 'Someone unnamed' : l.entry.name.trim(),
            roles: l.profile.roles,
            chapters: of[l.entry.id] ?? const {},
            ties: ties[l.entry.id] ?? 0,
            gone: gone(l),
          ),
    ];
    final aside = _setAside();
    final notes = [
      for (final n in castCheck(members, chapters: chapters))
        if (!aside.contains(noteKey(n))) n,
    ];
    report(widget.onCount, notes.length);
    if (notes.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final byId = {for (final l in cast.list) l.entry.id: l};
    final actions = CharacterActions(context, cast.novelId);
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.balance, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Flexible(
                child: Semantics(
                  header: true,
                  child: Text(
                    'THE CAST, CHECKED',
                    style: vaultHeading(
                      context,
                      size: 11,
                      color: scheme.primary,
                      weight: 700,
                    ).copyWith(letterSpacing: 2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'What an editor would ask of your cast, from where each of them is in the book.',
            style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          for (final n in notes)
            _Note(
              note: n,
              who: [for (final id in n.who) ?byId[id]],
              onOpen: actions.openCharacter,
              onNotNow: () => _notNow(n),
            ),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.note, required this.who, required this.onOpen, required this.onNotNow});

  final CastNote note;
  final List<Listed> who;
  final ValueChanged<String> onOpen;
  final VoidCallback onNotNow;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // A card ruled in the accent down its left edge (a stripe of its own: a rounded border is one colour all round).
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: scheme.primary),
            Expanded(
              child: Padding(padding: const EdgeInsets.fromLTRB(10, 10, 6, 4), child: _body(context, scheme)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, ColorScheme scheme) {
    final (icon, kicker) = switch (note.kind) {
      NoteKind.forgotten => (Icons.visibility_off_outlined, 'A PRINCIPAL THE BOOK FORGETS'),
      NoteKind.quiet => (Icons.hourglass_bottom, 'GONE QUIET'),
      NoteKind.together => (Icons.people_outline, 'ALWAYS TOGETHER'),
      NoteKind.light => (Icons.content_cut, 'LIGHT ENOUGH TO CUT?'),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final l in who)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: Semantics(
                  button: true,
                  label: 'Open ${l.entry.name}',
                  excludeSemantics: true,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => onOpen(l.entry.id),
                    child: _Face(listed: l),
                  ),
                ),
              ),
            const SizedBox(width: 4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(icon, size: 14, color: scheme.primary),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          kicker,
                          style: vaultHeading(
                            context,
                            size: 10,
                            color: scheme.primary,
                            weight: 700,
                          ).copyWith(letterSpacing: 1.4),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(note.says, style: vaultText(context, size: 15.5, color: scheme.onSurface)),
                ],
              ),
            ),
          ],
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(onPressed: onNotNow, child: const Text('Not now')),
        ),
      ],
    );
  }
}

class _Face extends StatelessWidget {
  const _Face({required this.listed});
  final Listed listed;

  @override
  Widget build(BuildContext context) {
    final tone = NovelArt.of(context).bound(castTone(listed.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: 40,
        height: 48,
        child: Cameo(look: cameoLookOf(listed.entry, listed.profile), ground: tone.ground, ink: tone.ink),
      ),
    );
  }
}
