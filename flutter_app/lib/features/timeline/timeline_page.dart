import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/records/event.dart';
import '../../shared/domain/text/fold.dart';
import '../../shared/domain/timeline/ages.dart';
import '../../shared/domain/timeline/chronology.dart';
import '../../shared/domain/timeline/dates.dart';
import '../../shared/domain/timeline/narrative.dart';
import '../characters/widgets/parts.dart';
import '../workspace/area_switch.dart';
import 'event_page.dart';
import 'timeline_providers.dart';
import 'widgets/chronicle.dart';

const _rank = {'minor': 0, 'major': 1, 'climax': 2};

/// Plan → Timeline: every event in the order it happens in the story, which is never the order of the chapters.
/// Filters narrow the list; a character's life path shows their age at each event, as exactly as the dates allow.
class TimelinePage extends ConsumerStatefulWidget {
  const TimelinePage({super.key});

  @override
  ConsumerState<TimelinePage> createState() => _TimelinePageState();
}

class _TimelinePageState extends ConsumerState<TimelinePage> {
  String _query = '';
  String? _character;
  String _minimum = 'minor';
  String? _location;
  String? _precision;
  bool? _showFilters;

  bool get _filtered =>
      _query.trim().isNotEmpty || _character != null || _minimum != 'minor' || _location != null || _precision != null;

  void _clear() => setState(() {
    _query = '';
    _character = null;
    _minimum = 'minor';
    _location = null;
    _precision = null;
  });

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(timelineProvider);
    if (data == null) {
      return PageScaffold(
        title: Destination.plan.label,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EmptyState(
              icon: Icons.menu_book_outlined,
              title: 'No novel open',
              message: 'Plan works inside one novel. Open one from the Library.',
              action: FilledButton(
                onPressed: () => TimelineActions(context, '').router.go(Destination.library.path),
                child: const Text('Go to Library'),
              ),
            ),
          ],
        ),
      );
    }
    final theme = Theme.of(context);
    final actions = TimelineActions(context, data.novelId);
    final model = data.model;
    final cal = data.calendar;
    final compact = WindowSize.of(context) == WindowSize.compact;
    final showFilters = _showFilters ?? !compact;
    final characters = data.cast.characters();
    final character = characters.any((c) => c.id == _character) ? _character : null;
    final placed = data.placed;
    final life = character == null
        ? <LifeStep>[]
        : lifePath(placed, character, calendar: cal, birthDate: birthDateOf(model.entries[character]));
    final ages = {for (final s in life) s.placed.event.id: s};
    final needle = foldText(_query.trim());
    final visible = [
      for (final p in placed)
        if ((character == null || p.event.characters.any((c) => c.id == character)) &&
            (_rank[p.event.importanceKey] ?? 0) >= _rank[_minimum]! &&
            (_location == null || p.event.locationId == _location) &&
            (_precision == null || (p.event.when?.precision ?? 'unknown') == _precision) &&
            (needle.isEmpty ||
                foldText(p.event.name).contains(needle) ||
                foldText(p.event.description).contains(needle)))
          p,
    ];
    // Grouped by year; an undated event that follows another sits with it, under the same year.
    final groups = <ChronicleGroup>[];
    for (final item in visible) {
      final last = groups.lastOrNull;
      final key = item.year != null ? '${item.year}' : (item.anchored && last != null ? last.key : 'undated');
      if (last?.key == key) {
        last!.items.add(item);
      } else {
        groups.add((
          key: key,
          heading: key == 'undated' ? 'Not yet placed in time' : cal.yearName(int.parse(key)),
          items: [item],
        ));
      }
    }
    int problemsOf(Placed p) =>
        p.issues.length + (ages[p.event.id]?.issue == null ? 0 : 1) + data.findingsOf(p.event.id).length;
    final toCheck = placed.where((p) => p.issues.isNotEmpty).length + life.where((s) => s.issue != null).length;
    final open = data.review.open.length;
    final characterName = character == null ? '' : (model.entries[character]?.name ?? '');

    void newEvent() {
      final id = actions.edit((x) {
        final id = x.createEvent();
        // A new event made while looking at a character's life belongs to that life.
        if (character != null) {
          x.updateEvent(
            id,
            (_) => {
              'characters': [
                {'id': character, 'age': null},
              ],
            },
          );
        }
        return id;
      });
      if (id != null) actions.openEvent(id);
    }

    Widget box(double width, Widget child) => SizedBox(width: compact ? double.infinity : width, child: child);
    return PageScaffold(
      title: 'Timeline',
      subtitle:
          '${data.cast.novelTitle} · ${plural(placed.length, 'event')} in the order they happen${toCheck > 0 ? ' · $toCheck to check' : ''}',
      actions: [FilledButton.icon(onPressed: newEvent, icon: const Icon(Icons.add), label: const Text('New event'))],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: planParts, current: '/plan'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 4,
            runSpacing: 0,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                'Dates use ${cal.standard ? 'the standard calendar' : describeCalendar(cal)}.',
                style: theme.textTheme.bodySmall,
              ),
              TextButton(
                onPressed: () => actions.router.go('/plan/calendar'),
                child: const Text('Change the calendar'),
              ),
              TextButton(
                onPressed: () => actions.router.go('/review/timeline'),
                child: Text(open > 0 ? 'Review: $open to look at' : 'Review'),
              ),
              TextButton(onPressed: () => actions.router.go('/visualize/timeline'), child: const Text('Draw it')),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), labelText: 'Search events'),
            onChanged: (v) => setState(() => _query = v),
          ),
          if (compact)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () => setState(() => _showFilters = !showFilters),
                icon: Icon(showFilters ? Icons.expand_less : Icons.tune),
                label: Text(
                  showFilters
                      ? 'Hide filters'
                      : _filtered
                      ? 'Filters (some on)'
                      : 'Filters',
                ),
              ),
            ),
          if (showFilters) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                box(
                  220,
                  DropdownButtonFormField<String>(
                    key: ValueKey('life:$character'),
                    initialValue: character ?? '',
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Life path of'),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('Everyone')),
                      for (final c in characters)
                        DropdownMenuItem(
                          value: c.id,
                          child: Text('${c.name}’s life', overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) => setState(() => _character = v == null || v.isEmpty ? null : v),
                  ),
                ),
                box(
                  200,
                  DropdownButtonFormField<String>(
                    key: ValueKey('importance:$_minimum'),
                    initialValue: _minimum,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Importance'),
                    items: const [
                      DropdownMenuItem(value: 'minor', child: Text('All importance')),
                      DropdownMenuItem(value: 'major', child: Text('Major and climax')),
                      DropdownMenuItem(value: 'climax', child: Text('Climax only')),
                    ],
                    onChanged: (v) => setState(() => _minimum = v ?? 'minor'),
                  ),
                ),
                box(
                  200,
                  DropdownButtonFormField<String>(
                    key: ValueKey('location:$_location'),
                    initialValue: _location ?? '',
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Location'),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('Anywhere')),
                      for (final l in data.places)
                        DropdownMenuItem(
                          value: l.id,
                          child: Text(l.name, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) => setState(() => _location = v == null || v.isEmpty ? null : v),
                  ),
                ),
                box(
                  200,
                  DropdownButtonFormField<String>(
                    key: ValueKey('precision:$_precision'),
                    initialValue: _precision ?? '',
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Date precision'),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('Any date')),
                      for (final p in precisions)
                        DropdownMenuItem(value: p, child: Text('${precisionLabels[p]} dates')),
                    ],
                    onChanged: (v) => setState(() => _precision = v == null || v.isEmpty ? null : v),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          if (character != null) ...[
            ProfileBox(
              title: '$characterName’s life',
              trailing: TextButton(
                onPressed: () => actions.router.go('/visualize/history?who=$character'),
                child: Text('$characterName’s whole life history'),
              ),
              children: [
                if (life.isEmpty)
                  NotRecorded('No events involve $characterName yet. Add them to an event, or create one now.')
                else ...[
                  Text(lifeSummary(life)),
                  if (!life.any((s) => s.label.isNotEmpty))
                    _Small(
                      'To see ages, give $characterName a date of birth on their profile, or an age at any dated event (0 for their birth); the rest are worked out from the dates, as exactly as they allow.',
                    ),
                  if (life.any((s) => s.ageAt is AgeRange))
                    const _Small(
                      'An age like 25–26 means the dates are not exact enough to say which: born some time in a year, someone may not have had their birthday yet.',
                    ),
                ],
              ],
            ),
            const SizedBox(height: 16),
          ],
          if (placed.isEmpty)
            EmptyState(
              icon: Icons.timeline,
              title: 'What happened, and when',
              message:
                  'The timeline is the story’s own chronology, separate from the order chapters are told in. Record events with an exact date, a rough one, or just “about twenty years before the Siege”.',
              action: FilledButton.icon(
                onPressed: newEvent,
                icon: const Icon(Icons.add),
                label: const Text('New event'),
              ),
            )
          else if (visible.isEmpty)
            NoResultsState(query: _query.trim().isEmpty ? null : _query.trim(), onClear: _clear)
          else
            Chronicle(
              groups: groups,
              card: (p) => _EventCard(
                data: data,
                placed: p,
                age: ages[p.event.id],
                problems: problemsOf(p),
                onOpen: () => actions.openEvent(p.event.id),
              ),
            ),
          if (_filtered && placed.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Showing ${visible.length} of ${placed.length} events.', style: theme.textTheme.bodySmall),
            ),
        ],
      ),
    );
  }
}

class _Small extends StatelessWidget {
  const _Small(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(text, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({
    required this.data,
    required this.placed,
    required this.age,
    required this.problems,
    required this.onOpen,
  });

  final TimelineData data;
  final Placed placed;
  final LifeStep? age;
  final int problems;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final event = placed.event;
    final model = data.model;
    final cast = [for (final c in event.characters) ?model.entries[c.id]?.name];
    final told = [
      for (final id in event.nodeIds)
        if (model.nodes.containsKey(id))
          event.reveals[id] == null || event.reveals[id] == RevealRole.told
              ? nodeLabel(model, id)
              : '${nodeLabel(model, id)} (${revealChoices[event.reveals[id]]!.toLowerCase()})',
    ];
    final place = model.entries[event.locationId]?.name;
    final when = [
      placed.label,
      if (event.duration != null) 'lasts ${formatDuration(event.duration)}',
      if (event.ongoing) 'still going on',
      if (event.raw['end'] != null)
        event.end is UnknownDate ? 'end not known' : 'until ${formatDate(event.end, data.eventName, data.calendar)}',
    ].join(' · ');
    final details = [
      ?place,
      if (cast.isNotEmpty) cast.join(', '),
      if (told.isNotEmpty) 'Told in ${told.join(', ')}',
    ].join(' · ');
    final importance = event.importanceKey;
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text.rich(
                TextSpan(
                  children: [
                    if (age != null && age!.label.isNotEmpty)
                      TextSpan(
                        text: '${age!.label} · ',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    TextSpan(text: when),
                  ],
                ),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 2),
              Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(event.name.isEmpty ? 'Untitled event' : event.name, style: theme.textTheme.titleSmall),
                  if (importance != 'minor')
                    Text(
                      importanceLabels[importance] ?? importance,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: importance == 'climax' ? theme.colorScheme.error : theme.colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                ],
              ),
              if (details.isNotEmpty) ...[const SizedBox(height: 2), Text(details, style: theme.textTheme.bodySmall)],
              if (problems > 0) ...[
                const SizedBox(height: 4),
                Text(
                  '$problems ${problems == 1 ? 'thing' : 'things'} to check',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
