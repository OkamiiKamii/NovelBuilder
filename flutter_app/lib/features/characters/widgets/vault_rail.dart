import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/text/fold.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'portrait.dart';
import 'vault.dart';

/// The cast as the vault goes through it: everyone not archived, in the cast's own order.
List<Listed> vaultOrder(CastData cast, {String? keep}) => [
  for (final l in cast.list)
    if (!l.profile.archived || l.entry.id == keep) l,
];

/// Whether [l] answers [query]: by name, epithet, alias or role, letter case and accents aside.
bool vaultMatches(Listed l, String query) {
  final q = foldText(query.trim());
  if (q.isEmpty) return true;
  return [
    l.entry.name,
    l.profile.epithet,
    ...l.profile.aliases,
    ...l.profile.roles,
  ].any((s) => foldText(s).contains(q));
}

/// The one before or after [currentId] in the vault's order (going round at the ends), or null with no one else.
String? vaultStep(CastData cast, String currentId, int by) {
  final order = vaultOrder(cast, keep: currentId);
  if (order.length < 2) return null;
  final at = order.indexWhere((l) => l.entry.id == currentId);
  if (at < 0) return order.first.entry.id;
  return order[(at + by) % order.length].entry.id;
}

/// THE VAULT'S LIST: beside a character's page on a wide screen (in a sheet on a phone), the whole cast to go to
/// without going back. A search by name, epithet, alias or role (Enter opens the first found); each one with where
/// they are in the book; the one shown marked. Going to another keeps the tab being read (their Status, their
/// Relationships…), so the same page of each can be gone through one after another. And a new character from here.
class VaultRail extends StatefulWidget {
  const VaultRail({
    super.key,
    required this.cast,
    required this.currentId,
    required this.onAdd,
    this.tab,
    this.onGone,
    this.autofocus = false,
  });

  final CastData cast;
  final String currentId;

  /// The tab being read, kept when going to another character.
  final String? tab;

  /// A new character (from the page, whose context outlives a sheet).
  final VoidCallback onAdd;

  /// After going to one (a sheet closes itself).
  final VoidCallback? onGone;
  final bool autofocus;

  @override
  State<VaultRail> createState() => _VaultRailState();
}

class _VaultRailState extends State<VaultRail> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  void _go(String id) {
    // The router taken first: in a sheet, closing it lets this list go.
    final router = GoRouter.of(context);
    widget.onGone?.call();
    if (id != widget.currentId) router.go(characterPath(id, tab: widget.tab));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final found = [
      for (final l in vaultOrder(widget.cast, keep: widget.currentId))
        if (vaultMatches(l, _query.text)) l,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _query,
          autofocus: widget.autofocus,
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) {
            if (found.isNotEmpty) _go(found.first.entry.id);
          },
          textInputAction: TextInputAction.go,
          decoration: InputDecoration(
            hintText: 'Search characters',
            prefixIcon: const Icon(Icons.search),
            isDense: true,
            suffixIcon: _query.text.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear search',
                    onPressed: () => setState(_query.clear),
                    icon: const Icon(Icons.clear),
                  ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _query.text.trim().isEmpty ? plural(found.length, 'character') : '${formatNumber(found.length)} found',
          style: vaultHeading(context, size: 12, color: scheme.onSurfaceVariant, weight: 500),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: found.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'No one by that name. Make them?',
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                  ),
                )
              : ListView.builder(
                  itemCount: found.length,
                  itemBuilder: (context, i) {
                    final l = found[i];
                    final here = l.entry.id == widget.currentId;
                    final chapters = l.seenIn.length;
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Material(
                        color: here ? scheme.primaryContainer.withValues(alpha: 0.55) : Colors.transparent,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                          side: BorderSide(color: here ? scheme.primary : Colors.transparent, width: 1.5),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: ListTile(
                          key: ValueKey('vault-${l.entry.id}'),
                          dense: true,
                          selected: here,
                          // Marked by its fill and border; its words as dark as the rest, to be read on the fill.
                          selectedColor: scheme.onSurface,
                          minVerticalPadding: 8,
                          leading: Portrait(name: l.entry.name, image: l.entry.image, focal: l.profile.focal, size: 40),
                          title: Text(l.entry.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                          subtitle: Text(
                            [
                              if (l.profile.epithet.isNotEmpty) l.profile.epithet,
                              chapters == 0 ? 'not in the text yet' : 'in ${plural(chapters, 'chapter')}',
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () => _go(l.entry.id),
                        ),
                      ),
                    );
                  },
                ),
        ),
        const SizedBox(height: 8),
        FilledButton.tonalIcon(
          onPressed: () {
            widget.onGone?.call();
            widget.onAdd();
          },
          icon: const Icon(Icons.person_add_alt_1),
          label: const Text('Add character'),
        ),
      ],
    );
  }
}
