import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/text_prompt.dart';
import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/character_changes.dart';
import '../../../shared/domain/characters/record_look.dart';
import '../../../shared/domain/characters/unnamed_roles.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_order.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'name_forge.dart';
import 'page_notes.dart';
import 'vault.dart';

/// Where the roles set aside ("Not a character") are kept, for a novel: on this device.
String unnamedAsideKey(String novelId) => 'characters.unnamedAside.$novelId';

/// The names a role is called by on the page, so a character given it is found where the page names them so.
List<String> roleAliases(String phrase) {
  final p = phrase.trim();
  if (p.isEmpty) return const [];
  return {p, '${p[0].toUpperCase()}${p.substring(1)}'}.toList();
}

/// WAITING FOR A NAME, on Characters (`unnamed_roles.dart` finds them): the people the pages keep coming back to
/// without a name ("the waitress", "the old guard"), each with how often and where, and the sentence. **Name them**
/// opens the name forge; **Write a name** asks for one. Either makes them a character: that name, "the waitress" as
/// their title and an alias (so every mention in the pages is theirs), and what they do as their Occupation. **Not a
/// character** sets the role aside on this device. With nobody unnamed, nothing is shown.
class WaitingForAName extends ConsumerStatefulWidget {
  const WaitingForAName({super.key, required this.cast, this.onCount});

  final CastData cast;

  /// Told how many it shows (the strip of notes counts them, `page_notes.dart`).
  final ValueChanged<int>? onCount;

  @override
  ConsumerState<WaitingForAName> createState() => _WaitingForANameState();
}

class _WaitingForANameState extends ConsumerState<WaitingForAName> with CountReporter {
  List<UnnamedRole>? _roles;
  Object? _readFor;
  final _done = <String>{};

  Set<String> _aside() {
    final stored = ref.read(settingsStoreProvider).read(unnamedAsideKey(widget.cast.novelId));
    return {if (stored is List) ...stored.whereType<String>()};
  }

  void _read() {
    final cast = widget.cast;
    final order = [
      for (final n in readingOrder(cast.model.nodes.values))
        if (isDocument(n.kind)) n.id,
    ];
    // Who the cast already is: their titles, aliases and what they do.
    final taken =
        <String>{
            for (final l in cast.list) ...[
              l.profile.epithet,
              ...l.profile.aliases,
              fieldNamed(l.entry, 'Occupation'),
              fieldNamed(l.entry, 'Job'),
              fieldNamed(l.entry, 'Profession'),
            ],
          }.where((t) => t.trim().isNotEmpty).map((t) => t.trim().toLowerCase()).toSet()
          // And what a summary says they are ("Apprentice cartographer"): they are the one.
          ..addAll({
            for (final l in cast.list)
              for (final w in RegExp(r'[a-z]+').allMatches('${l.entry.summary} ${l.profile.epithet}'.toLowerCase()))
                if (roleWords.contains(w[0])) w[0]!,
          });
    final key = (order.join(','), taken.join('|'), cast.snapshot.rows('chapterContents').length);
    if (key == _readFor) return;
    _readFor = key;
    final store = ref.read(novelStoreProvider);
    ref
        .read(runAsideProvider)(
          unnamedRolesJob(store.rawJsonIn(cast.novelId, 'chapterContents'), order, taken: taken, setAside: _aside()),
        )
        .then(
          (roles) {
            if (mounted && _readFor == key) setState(() => _roles = roles);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
        );
  }

  void _make(UnnamedRole role, String name) {
    final actions = CharacterActions(context, widget.cast.novelId);
    final made = actions.now((c) {
      final e = c.create(name: name.trim(), epithet: role.phrase);
      c.identity(e.id, IdentityChanges(aliases: roleAliases(role.phrase)));
      recordIn(
        c,
        e.id,
        'Occupation',
        const ['occupation', 'job', 'profession', 'trade'],
        '${role.role[0].toUpperCase()}${role.role.substring(1)}',
        sections: const ['identity', 'position'],
        newSection: 'Core Identity',
      );
      return e;
    });
    if (made == null) return;
    setState(() => _done.add(role.role));
    actions.tell(
      '${name.trim()} is ${role.phrase} now: ${role.times == 1 ? 'the mention is' : 'all ${role.times} mentions are'} theirs.',
      actionLabel: 'Open',
      onAction: () => actions.openCharacter(made.id),
    );
  }

  Future<void> _forge(UnnamedRole role) async {
    final name = await showNameForge(context, people: [for (final e in widget.cast.entries) e.name]);
    if (name != null && name.trim().isNotEmpty && mounted) _make(role, name);
  }

  Future<void> _write(UnnamedRole role) async {
    final name = await showTextPrompt(
      context,
      title: 'Who is ${role.phrase}?',
      label: 'Their name',
      confirmLabel: 'Add to the cast',
    );
    if (name != null && name.trim().isNotEmpty && mounted) _make(role, name);
  }

  void _notOne(UnnamedRole role) {
    ref.read(settingsStoreProvider).write(unnamedAsideKey(widget.cast.novelId), [..._aside(), role.role]);
    setState(() => _done.add(role.role));
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _read();
    });
    final roles = [
      for (final r in _roles ?? const <UnnamedRole>[])
        if (!_done.contains(r.role)) r,
    ];
    report(widget.onCount, roles.length);
    if (roles.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.person_search_outlined, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Flexible(
                child: Semantics(
                  header: true,
                  child: Text(
                    'WAITING FOR A NAME',
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
            'People your pages keep coming back to, without a name yet.',
            style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          for (final r in roles.take(5))
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 6),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: scheme.outlineVariant),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: scheme.primary, width: 1.5),
                        ),
                        child: Text('?', style: vaultHeading(context, size: 17, color: scheme.primary, weight: 700)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${r.phrase[0].toUpperCase()}${r.phrase.substring(1)}',
                              style: vaultHeading(context, size: 15, weight: 700),
                            ),
                            Text(
                              '${r.times} times, ${r.chapters == 1 ? 'in chapter ${r.chapter}' : 'in ${r.chapters} chapters, from chapter ${r.chapter}'}',
                              style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '“${r.said}”',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                  ),
                  Wrap(
                    spacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      FilledButton.tonalIcon(
                        onPressed: () => _forge(r),
                        icon: const Icon(Icons.auto_awesome, size: 18),
                        label: const Text('Name them'),
                      ),
                      TextButton(onPressed: () => _write(r), child: const Text('Write a name')),
                      TextButton(onPressed: () => _notOne(r), child: const Text('Not a character')),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
