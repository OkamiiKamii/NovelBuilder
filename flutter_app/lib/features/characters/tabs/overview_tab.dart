import 'package:flutter/material.dart';

import '../../../core/format.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/model/entity_ref.dart';
import '../../../shared/domain/model/validity.dart';
import '../../../shared/domain/records/event.dart';
import '../../../shared/domain/records/thread.dart';
import '../../../shared/domain/stable_sort.dart';
import '../../codex/widgets/connections_panel.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import '../widgets/against_your_pages.dart';
import '../widgets/in_their_pages.dart';
import '../widgets/in_their_words.dart';
import '../widgets/parts.dart';
import '../widgets/sections_view.dart';
import '../widgets/vault.dart';

/// The overview: the profile's own sections beside the character's web of relationships (stacked on a narrow
/// screen), their symbol when they have one, then what other parts of the novel say about the character. Each of
/// those shows records that live elsewhere and leads to them; none is a copy.
class OverviewTab extends StatelessWidget {
  const OverviewTab({super.key, required this.cast, required this.listed, required this.actions});

  final CastData cast;
  final Listed listed;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final entry = listed.entry;
    const gap = SizedBox(height: 12);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(
          builder: (context, box) {
            final sections = SectionsView(
              cast: cast,
              entry: entry,
              profile: listed.profile,
              tab: ProfileTab.overview,
              actions: actions,
            );
            final web = VaultFrame(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const VaultHeading('Relationships'),
                  const SizedBox(height: 16),
                  RelationWeb(cast: cast, entry: entry, onOpen: actions.openCharacter),
                ],
              ),
            );
            if (box.maxWidth < 860) return Column(children: [web, gap, sections]);
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: sections),
                const SizedBox(width: 16),
                SizedBox(width: 380, child: web),
              ],
            );
          },
        ),
        if (symbolOf(cast, entry) case final symbol?) ...[gap, _Symbol(symbol)],
        gap,
        _InTheManuscript(cast: cast, listed: listed, actions: actions),
        // What the book says where they are in it (`in_their_pages.dart`), with its own space above; nothing while they
        // are nowhere yet.
        InTheirPages(cast: cast, entryId: entry.id, actions: actions),
        // What they say in the book (`in_their_words.dart`); nothing while they have no lines.
        InTheirWords(cast: cast, entryId: entry.id, actions: actions),
        // Their looks as the chapters give them, beside the profile (`against_your_pages.dart`); nothing when the page is silent.
        AgainstYourPages(cast: cast, entryId: entry.id, actions: actions),
        gap,
        _Timeline(cast: cast, entryId: entry.id, name: entry.name),
        gap,
        _Threads(cast: cast, entryId: entry.id, name: entry.name),
        gap,
        ConnectionsPanel(cast: cast, self: EntityRef(EntityType.entry, entry.id), actions: actions),
        if (_kept(cast, entry.id, () => actions.router.go(characterPath(entry.id, tab: 'progression')))
            case final kept?) ...[
          gap,
          kept,
        ],
      ],
    );
  }

  /// What is recorded about how the character changes, in a line, with the way to the Progression tab.
  static Widget? _kept(CastData cast, String entryId, VoidCallback openTab) {
    final sheets = cast.model.sheets.where((s) => s.entryId == entryId).length;
    final snapshots = cast.snapshot.rows('progressSnapshots').where((s) => s['entryId'] == entryId).length;
    final changes = cast.model.progress.where((c) => c.entryId == entryId).length;
    if (sheets + snapshots + changes == 0) return null;
    return ProfileBox(
      title: 'Character progression',
      children: [
        Text(
          [
            if (sheets > 0) plural(sheets, 'system sheet'),
            if (snapshots > 0) plural(snapshots, 'progression snapshot'),
            if (changes > 0) plural(changes, 'recorded change'),
          ].join(', '),
        ),
        TextButton(onPressed: () => openTab(), child: const Text('Open the Progression tab')),
      ],
    );
  }
}

class _InTheManuscript extends StatelessWidget {
  const _InTheManuscript({required this.cast, required this.listed, required this.actions});

  final CastData cast;
  final Listed listed;
  final CharacterActions actions;

  @override
  Widget build(BuildContext context) {
    final entry = listed.entry;
    final linked = listed.linkedIn;
    List<String> reading(Iterable<String> ids) => stableSorted(
      ids.where(cast.model.nodes.containsKey),
      (a, b) => (cast.model.order.position[a] ?? 0) - (cast.model.order.position[b] ?? 0),
    );
    final plans = cast.model.plans.values;
    final appears = reading([
      for (final p in plans)
        if (p.appearIds.contains(entry.id)) p.id,
    ]);
    final mentioned = reading([
      for (final p in plans)
        if (p.mentionIds.contains(entry.id)) p.id,
    ]);
    Widget chapterLink(String id) => TextButton(
      style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
      onPressed: () => actions.openChapter(id),
      child: Text(documentName(cast, id)),
    );
    final named = listed.namedIn;
    return ProfileBox(
      title: 'In the manuscript',
      children: [
        if (linked.isEmpty && named.isEmpty)
          NotRecorded(
            'No chapter links to ${entry.name} yet. In the editor, select their name (or a title they go by) and link '
            'it to this character.',
          )
        else if (linked.isNotEmpty) ...[
          Text(
            'Linked in ${plural(linked.length, 'chapter or scene', 'chapters and scenes')}. '
            'First: ${documentName(cast, linked.first)}'
            '${linked.length > 1 ? '; latest: ${documentName(cast, linked.last)}' : ''}.',
          ),
          Wrap(children: [for (final id in linked.take(24)) chapterLink(id)]),
          if (linked.length > 24) Text('and ${formatNumber(linked.length - 24)} more'),
        ],
        // Found by name, where nobody linked them (`named_in.dart`).
        if (named.isNotEmpty) ...[
          if (linked.isNotEmpty) const SizedBox(height: 8),
          Text(
            '${linked.isEmpty ? 'Named' : 'Also named'} in ${plural(named.length, 'chapter or scene', 'chapters and scenes')}'
            ' (their name, an alias or their title on the page):',
          ),
          Wrap(children: [for (final id in named.take(24)) chapterLink(id)]),
          if (named.length > 24) Text('and ${formatNumber(named.length - 24)} more'),
        ],
        if (appears.isNotEmpty || mentioned.isNotEmpty) ...[
          const SizedBox(height: 8),
          if (appears.isNotEmpty) ...[
            const Text('Appears in (your appearance record):'),
            Wrap(children: [for (final id in appears) chapterLink(id)]),
          ],
          if (mentioned.isNotEmpty) ...[
            const Text('Mentioned, not on the page (your appearance record):'),
            Wrap(children: [for (final id in mentioned) chapterLink(id)]),
          ],
        ],
      ],
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.cast, required this.entryId, required this.name});

  final CastData cast;
  final String entryId;
  final String name;

  @override
  Widget build(BuildContext context) {
    final context0 = TimeContext(
      position: cast.model.order.position,
      events: cast.model.events,
      calendar: cast.model.calendar,
    );
    final mine = [
      for (final e in cast.model.events.values)
        if (e.characters.any((c) => c.id == entryId)) e,
    ];
    // In story time where the dates say so; events with no place in time are listed apart, never guessed at.
    final dated = <(TimelineEvent, double)>[];
    final undated = <TimelineEvent>[];
    for (final e in mine) {
      final span = spanOfEvent(e.id, context0);
      if (span == null) {
        undated.add(e);
      } else {
        dated.add((e, span.lo));
      }
    }
    final ordered = stableSorted(dated, (a, b) => a.$2.compareTo(b.$2));
    num? ageAt(TimelineEvent e) => e.characters.firstWhere((c) => c.id == entryId).age;
    Widget line(TimelineEvent e) => ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(e.name.isEmpty ? 'An unnamed event' : e.name),
      subtitle: ageAt(e) == null ? null : Text('Age ${formatNumber(ageAt(e)!)} (as you recorded it)'),
    );
    return ProfileBox(
      title: 'Timeline',
      children: [
        if (mine.isEmpty) NotRecorded('No timeline event includes $name yet.'),
        for (final (e, _) in ordered) line(e),
        if (undated.isNotEmpty) ...[
          const SizedBox(height: 4),
          const NotRecorded('Not placed in time:'),
          for (final e in undated) line(e),
        ],
      ],
    );
  }
}

class _Threads extends StatelessWidget {
  const _Threads({required this.cast, required this.entryId, required this.name});

  final CastData cast;
  final String entryId;
  final String name;

  @override
  Widget build(BuildContext context) {
    final threads = [
      for (final t in cast.model.threads.values)
        if (t.characterIds.contains(entryId)) t,
    ];
    String status(PlotThread t) =>
        t.status == ThreadStatus.custom ? (t.customStatus ?? 'Custom') : capitalized(t.statusKey);
    return ProfileBox(
      title: 'Plot threads',
      children: [
        if (threads.isEmpty) NotRecorded('No plot thread names $name yet.'),
        for (final t in threads)
          ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: Text(t.title.isEmpty ? 'An untitled thread' : t.title),
            trailing: Chip(label: Text(status(t)), visualDensity: VisualDensity.compact),
          ),
      ],
    );
  }
}

/// The character's symbol, from their field called "Symbol", as the vault shows it.
class _Symbol extends StatelessWidget {
  const _Symbol(this.symbol);
  final String symbol;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return VaultFrame(
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              container: true,
              label: 'Symbol: $symbol',
              excludeSemantics: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Symbol', style: vaultHeading(context, size: 14)),
                  const SizedBox(height: 4),
                  Text(symbol, style: vaultText(context, size: 22)),
                ],
              ),
            ),
          ),
          ExcludeSemantics(
            child: Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: scheme.primary, width: 1.5),
              ),
              child: Icon(Icons.flare, color: scheme.primary, size: 32),
            ),
          ),
        ],
      ),
    );
  }
}
