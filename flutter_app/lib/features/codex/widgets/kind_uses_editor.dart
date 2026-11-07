import 'package:flutter/material.dart';

import '../../../shared/domain/codex/capabilities.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/records/category.dart';
import '../../../shared/domain/records/link.dart';
import '../../characters/widgets/parts.dart';

/// Which fields each view reads, chosen by the author: nothing is worked out from a field's name. Each menu offers
/// only the fields of a type the view can read; a setting whose field was later retyped or removed is still shown,
/// with what is wrong, until the author changes it.
class KindUsesEditor extends StatelessWidget {
  const KindUsesEditor({super.key, required this.category, required this.links, required this.save});

  final Category category;

  /// Every stored connection of the novel: the author's own kinds of connection are offered as holding.
  final List<Link> links;

  /// Saves new settings, made from the settings as stored right now, so quick changes build on each other.
  final void Function(JsonMap Function(JsonMap stored) change) save;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final uses = category.uses;
    final timeline = mapOrNull(uses['timeline']) ?? const {};
    final map = mapOrNull(uses['map']) ?? const {};
    final ownership = mapOrNull(uses['ownership']) ?? const {};
    JsonMap part(JsonMap stored, String key) => {...?mapOrNull(stored[key])};
    void set(String key, Object? value) => save((stored) => {...stored, key: value});
    void setIn(String key, String sub, Object? value) => save(
      (stored) => {
        ...stored,
        key: {...part(stored, key), sub: value}..removeWhere((_, v) => v == null),
      },
    );
    final builtinKeys = {for (final t in connectionTypes) t.key};
    final ownTypes = {
      for (final t in [for (final l in links) l.type ?? '', strOrNull(ownership['type']) ?? ''])
        if (t.isNotEmpty && !builtinKeys.contains(t)) t,
    };

    /// A menu of the fields that can fill a slot.
    Widget pick(Slot slot, String label, Object? value, String none, void Function(String? id) onChanged) {
      final fitting = fieldsFor(category, slot);
      final current = value is String && value.isNotEmpty ? value : '';
      final stale = current.isNotEmpty && !fitting.any((f) => f.id == current)
          ? category.fields.where((f) => f.id == current).firstOrNull
          : null;
      return SizedBox(
        width: 280,
        child: DropdownButtonFormField<String>(
          key: ValueKey('${category.key}:${slot.key}:$current'),
          initialValue: current,
          isExpanded: true,
          decoration: InputDecoration(labelText: label),
          items: [
            DropdownMenuItem(value: '', child: Text(none)),
            for (final f in fitting)
              DropdownMenuItem(value: f.id, child: Text('${f.name} (${(f.type ?? FieldType.text).label})')),
            if (current.isNotEmpty && !fitting.any((f) => f.id == current))
              DropdownMenuItem(
                value: current,
                child: Text(stale != null ? '${stale.name} (does not suit now)' : 'A field that is gone'),
              ),
          ],
          onChanged: (v) => onChanged(v == null || v.isEmpty ? null : v),
        ),
      );
    }

    /// Whether a view can be shown, in words: not set up, what is still missing, or ready.
    Widget state(KindView view, bool isSet, Slot slot) {
      final missing = missingFor(category, view);
      if (!isSet) {
        return Text(
          fieldsFor(category, slot).isNotEmpty ? 'Not set up.' : 'Add ${typeWords(slot)} to set this up.',
          style: theme.textTheme.bodySmall,
        );
      }
      if (missing.isNotEmpty) return _Issues(missing);
      return Text('Set up: shown under Visualize → Records by kind.', style: theme.textTheme.bodySmall);
    }

    Widget group(String title, List<Widget> children) => Semantics(
      container: true,
      label: title,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
    Widget row(List<Widget> children) => Wrap(spacing: 12, runSpacing: 12, children: children);
    Widget note(String text) => Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(text, style: theme.textTheme.bodySmall),
    );

    final holding = strOrNull(ownership['type']);
    final linkFields = fieldsFor(category, Slot.graphLinks);
    final chosenLinks = uses['graphLinks'] is List ? strings(uses['graphLinks']) : null;
    final graphIssues = [...missingFor(category, 'graphLabel'), ...missingFor(category, 'graphLinks')];

    return ProfileBox(
      title: 'Visualizations',
      caption:
          'Choose the field each view reads. Nothing is worked out from field names. A view ${category.name} is not set '
          'up for shows its records as a table instead.',
      children: [
        group('On a timeline', [
          row([
            pick(Slot.timelineStart, 'Date on the timeline', timeline['start'], 'Not on a timeline', (v) {
              setIn('timeline', 'start', v);
            }),
            pick(Slot.timelineEnd, 'End on the timeline (optional)', timeline['end'], 'No end', (v) {
              setIn('timeline', 'end', v);
            }),
          ]),
          note('A Number is a year of the story’s calendar; a Date is a day.'),
          state(KindView.timeline, uses['timeline'] != null, Slot.timelineStart),
        ]),
        group('On a map', [
          row([
            pick(Slot.mapX, 'Across on the map', map['x'], 'Not set', (v) => setIn('map', 'x', v)),
            pick(Slot.mapY, 'Up on the map', map['y'], 'Not set', (v) => setIn('map', 'y', v)),
          ]),
          state(KindView.map, uses['map'] != null, Slot.mapX),
        ]),
        group('By rank', [
          pick(Slot.rank, 'Rank', uses['rank'], 'Not ranked', (v) => set('rank', v)),
          note('A Choice (one) ranks by the order of its choices, lowest first.'),
          state(KindView.rank, uses['rank'] != null, Slot.rank),
        ]),
        group('By who holds it', [
          row([
            SizedBox(
              width: 280,
              child: DropdownButtonFormField<String>(
                key: ValueKey('${category.key}:holding:$holding'),
                initialValue: holding ?? '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Connection that means holding it'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Not set')),
                  for (final t in connectionTypes) DropdownMenuItem(value: t.key, child: Text(t.label)),
                  for (final t in ownTypes)
                    DropdownMenuItem(value: t, child: Text('${connectionType(t).label} (your own)')),
                ],
                onChanged: (v) => setIn('ownership', 'type', v == null || v.isEmpty ? null : v),
              ),
            ),
            pick(Slot.ownershipField, 'Current holder field (optional)', ownership['field'], 'None', (v) {
              setIn('ownership', 'field', v);
            }),
          ]),
          note('A holder is the record a connection of this type comes from: “Mira owns the Ember Crown”.'),
          state(KindView.ownership, uses['ownership'] != null, Slot.ownershipField),
        ]),
        group('In the ability tree', [
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: uses['tree'] == true,
            onChanged: (v) => set('tree', v == true ? true : null),
            title: const Text('Its records are abilities, skills, classes or the like'),
          ),
          note(
            'Kept for the Ability paths view (Phase 15), with the paths you record between them: prerequisites, '
            'upgrades, evolutions, fusions, replacements, exclusions.',
          ),
        ]),
        group('In the knowledge graph', [
          pick(Slot.graphLabel, 'Label in the knowledge graph', uses['graphLabel'], 'Its name', (v) {
            set('graphLabel', v);
          }),
          if (linkFields.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Link fields drawn as connections:', style: theme.textTheme.bodySmall),
            for (final def in linkFields)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                controlAffinity: ListTileControlAffinity.leading,
                value: chosenLinks == null || chosenLinks.contains(def.id),
                title: Text(def.name, semanticsLabel: 'Draw ${def.name} in the knowledge graph'),
                onChanged: (on) => save((stored) {
                  final live = [for (final d in fieldsFor(category, Slot.graphLinks)) d.id];
                  final now = [
                    for (final id in stored['graphLinks'] is List ? strings(stored['graphLinks']) : live)
                      if (id != def.id) id,
                  ];
                  final next = on == true ? [...now, def.id] : now;
                  // Every link field ticked is the same as none chosen: all are drawn, including ones added later.
                  return {...stored, 'graphLinks': live.every(next.contains) ? null : next};
                }),
              ),
          ],
          if (graphIssues.isNotEmpty) _Issues(graphIssues),
        ]),
      ],
    );
  }
}

class _Issues extends StatelessWidget {
  const _Issues(this.items);
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final m in items)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline, size: 16, color: theme.colorScheme.error),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(m, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
