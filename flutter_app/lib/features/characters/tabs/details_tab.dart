import 'package:flutter/material.dart';

import '../../../core/widgets/saved_text_field.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/codex/codex_changes.dart';
import '../../../shared/domain/collation.dart';
import '../../../shared/domain/records/entry.dart';
import '../../../shared/domain/stable_sort.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import '../widgets/parts.dart';
import '../widgets/sections_view.dart';

const _linkStatuses = ['Active', 'Former', 'Secret'];

/// The details: the profile's detail sections, the description, and what the character is tied to (abilities,
/// possessions, factions, places). Those are records kept elsewhere, linked here, never copied.
class DetailsTab extends StatelessWidget {
  const DetailsTab({super.key, required this.cast, required this.entry, required this.profile, required this.actions});

  final CastData cast;
  final Entry entry;
  final CharacterProfile profile;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final related = [
      for (final r in cast.relatedOf(entry.id))
        if (r.entry.category != 'character') r,
    ];
    List<RelatedEntry> of(Set<String> categories) => [
      for (final r in related)
        if (categories.contains(r.entry.category)) r,
    ];
    final others = [
      for (final r in related)
        if (r.entry.category != 'power' && r.entry.category != 'item') r,
    ];
    const gap = SizedBox(height: 12);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionsView(cast: cast, entry: entry, profile: profile, tab: ProfileTab.details, actions: actions),
        gap,
        ProfileBox(
          title: 'Description',
          children: [
            SavedTextField(
              value: entry.description,
              multiline: true,
              minLines: 4,
              semanticsLabel: 'Description',
              hint: 'Who ${entry.name} is, at whatever length you like.',
              onChanged: (v) =>
                  actions.later('description:${entry.id}', (c) => c.updateEntry(entry.id, description: v)),
            ),
          ],
        ),
        gap,
        ProfileBox(
          title: 'Skills, powers & abilities',
          children: [
            if (of({'power'}).isEmpty)
              const NotRecorded(
                'None linked. Link a power or rule from the codex below; it is shown here, not copied.',
              ),
            for (final r in of({'power'}))
              _LinkRow(cast: cast, entry: entry, profile: profile, link: r, actions: actions),
          ],
        ),
        gap,
        ProfileBox(
          title: 'Equipment & possessions',
          children: [
            if (of({'item'}).isEmpty) const NotRecorded('None linked. Link an item from the codex below.'),
            for (final r in of({'item'}))
              _LinkRow(cast: cast, entry: entry, profile: profile, link: r, actions: actions, withStatus: true),
          ],
        ),
        gap,
        ProfileBox(
          title: 'Affiliations & links',
          caption:
              'Each link is one record, seen from both ends: open the faction and ${entry.name} is listed there too.',
          children: [
            if (others.isEmpty) const NotRecorded('Not linked to any faction, place or other entry yet.'),
            for (final r in others)
              _LinkRow(cast: cast, entry: entry, profile: profile, link: r, actions: actions, withStatus: true),
            const SizedBox(height: 8),
            _AddLink(cast: cast, entry: entry, already: {for (final r in related) r.entry.id}, actions: actions),
          ],
        ),
      ],
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({
    required this.cast,
    required this.entry,
    required this.profile,
    required this.link,
    required this.actions,
    this.withStatus = false,
  });

  final CastData cast;
  final Entry entry;
  final CharacterProfile profile;
  final RelatedEntry link;
  final CharacterActions actions;
  final bool withStatus;

  @override
  Widget build(BuildContext context) {
    final status = profile.linkStatus[link.linkId] ?? '';
    final category = cast.model.categories[link.entry.category]?.singular ?? link.entry.category;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Wrap(
        spacing: 12,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 160),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(link.entry.name, style: Theme.of(context).textTheme.titleSmall),
                Text(category, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          SizedBox(
            width: 220,
            child: SavedTextField(
              value: link.label,
              dense: true,
              label: 'Role or position',
              onChanged: (v) => actions.later('linklabel:${link.linkId}', (c) => c.labelLink(link.linkId, entry.id, v)),
            ),
          ),
          if (withStatus)
            SizedBox(
              width: 170,
              child: DropdownButtonFormField<String>(
                key: ValueKey('${link.linkId}:$status'),
                initialValue: status,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Status', isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Not set')),
                  for (final s in {..._linkStatuses, if (status.isNotEmpty) status})
                    DropdownMenuItem(value: s, child: Text(s)),
                ],
                onChanged: (v) => actions.now((c) => c.setLinkStatus(entry.id, link.linkId, v ?? '')),
              ),
            ),
          IconButton(
            tooltip: 'Remove the link to ${link.entry.name}',
            onPressed: () => actions.now((c) => c.unlink(link.linkId)),
            icon: const Icon(Icons.link_off),
          ),
        ],
      ),
    );
  }
}

class _AddLink extends StatefulWidget {
  const _AddLink({required this.cast, required this.entry, required this.already, required this.actions});

  final CastData cast;
  final Entry entry;
  final Set<String> already;
  final CharacterActions actions;

  @override
  State<_AddLink> createState() => _AddLinkState();
}

class _AddLinkState extends State<_AddLink> {
  String? _to;
  final _role = TextEditingController();

  @override
  void dispose() {
    _role.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final linkable = stableSorted([
      for (final e in w.cast.entries)
        if (e.category != 'character' && !w.already.contains(e.id)) e,
    ], (a, b) => localeCompare(a.name, b.name));
    if (linkable.isEmpty) {
      return const NotRecorded('Every codex entry is already linked, or the novel has none besides characters.');
    }
    String kind(Entry e) => w.cast.model.categories[e.category]?.singular ?? e.category;
    return Wrap(
      spacing: 12,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(
          width: 260,
          child: DropdownButtonFormField<String>(
            key: ValueKey('add:$_to'),
            initialValue: _to,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Link to a faction, item, place…'),
            items: [
              for (final e in linkable)
                DropdownMenuItem(
                  value: e.id,
                  child: Text('${e.name} (${kind(e)})', overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (v) => setState(() => _to = v),
          ),
        ),
        SizedBox(
          width: 220,
          child: TextField(
            controller: _role,
            decoration: const InputDecoration(labelText: 'Role or position there', hintText: 'Captain'),
          ),
        ),
        FilledButton(
          onPressed: _to == null
              ? null
              : () {
                  final made = w.actions.now((c) => c.linkEntries(w.entry.id, _to!, _role.text));
                  if (made != null) {
                    setState(() => _to = null);
                    _role.clear();
                  }
                },
          child: const Text('Link'),
        ),
      ],
    );
  }
}
