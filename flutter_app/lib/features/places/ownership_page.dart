import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/form_dialog.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/factions/ownership.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/validity.dart';
import '../../shared/domain/stable_sort.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../relationships/relationship_page.dart' show relate;
import '../visualize/visualize_providers.dart';
import '../visualize/viz_frame.dart';
import 'factions_page.dart' show pointWords;
import 'widgets/when_picker.dart';

/// OWNERSHIP
/// One item's hands: who made it, each holding in order with how it began and how it passed on, the stretches nobody
/// is recorded as holding it, and where it stands at any point; drawn as a chain, or as a table. What happens to it is
/// recorded here too: made, found, given, sold, stolen, inherited, lost, destroyed, or in the author's own words.
class OwnershipPage extends ConsumerStatefulWidget {
  const OwnershipPage({super.key});

  @override
  ConsumerState<OwnershipPage> createState() => _OwnershipPageState();
}

class _OwnershipPageState extends ConsumerState<OwnershipPage> {
  bool _list = false;
  String? _item;
  Anchor? _at;

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final notifier = ref.read(vizStateProvider.notifier);
    Widget frame(Widget child) => VizFrame(
      view: 'ownership',
      title: 'Ownership',
      filters: false,
      config: () => {
        'mode': _list ? 'list' : 'visual',
        'layout': {'oitem': ?_item, if (_at != null) 'oat': _at!.raw},
      },
      onApply: (JsonMap c) => setState(() {
        final l = mapOrNull(c['layout']) ?? const {};
        _list = c['mode'] == 'list';
        _item = strOrNull(l['oitem']);
        _at = Anchor.fromJson(l['oat']);
      }),
      actions: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.linear_scale), label: Text('Chain')),
            ButtonSegment(value: true, icon: Icon(Icons.table_rows_outlined), label: Text('Table')),
          ],
          selected: {_list},
          showSelectedIcon: false,
          onSelectionChanged: (v) => setState(() => _list = v.first),
        ),
      ],
      child: child,
    );
    if (cast == null) return frame(const SizedBox.shrink());
    final model = cast.model;
    final theme = Theme.of(context);
    final actions = CharacterActions(context, cast.novelId);
    final items = ownedItems(model);
    if (items.isEmpty) {
      return frame(
        const EmptyState(
          icon: Icons.inventory_2_outlined,
          title: 'No items yet',
          message: 'Add items under Organize → World, or record that someone owns something.',
        ),
      );
    }
    final item =
        items.where((i) => i.id == _item).firstOrNull ??
        items.where((i) => model.links.any((l) => l.type == 'owns' && l.toId == i.id)).firstOrNull ??
        items.first;
    final o = ownershipOf(model, item.id, _at)!;
    Widget card(Holding h, int i) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (i > 0)
          const ExcludeSemantics(
            child: Padding(padding: EdgeInsets.all(6), child: Icon(Icons.arrow_forward)),
          ),
        Card.outlined(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(
              color: h.inThisTimeline ? theme.colorScheme.outline : theme.colorScheme.error,
              style: h.inThisTimeline ? BorderStyle.solid : BorderStyle.none,
            ),
          ),
          child: InkWell(
            onTap: () => notifier.select(EntityRef(EntityType.entry, h.holderId)),
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 220),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(h.holderName, style: theme.textTheme.titleSmall),
                    Text('${h.how.isNotEmpty ? '${h.how}, ' : ''}${h.began}', style: theme.textTheme.bodySmall),
                    if (h.ended != null)
                      Text(
                        'until ${h.ended}${h.endHow.isNotEmpty ? ' (${h.endHow})' : ''}',
                        style: theme.textTheme.bodySmall,
                      ),
                    if (!h.inThisTimeline)
                      Text(
                        'does not happen in this timeline',
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                      ),
                    if (h.timeless) Text('(no time given)', style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 240,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('item:${item.id}'),
                  initialValue: item.id,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Item', isDense: true),
                  items: [for (final i in items) DropdownMenuItem(value: i.id, child: Text(i.name))],
                  onChanged: (v) => setState(() => _item = v),
                ),
              ),
              SizedBox(
                width: 260,
                child: AsOfField(
                  model: model,
                  label: 'Ownership as of',
                  value: _at,
                  onChanged: (v) => setState(() => _at = v),
                ),
              ),
              FilledButton.icon(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => OwnershipForm(actions: actions, itemId: item.id),
                ),
                icon: const Icon(Icons.edit_note),
                label: const Text('Record what happens to it'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: item.name,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  TextSpan(text: ', as of ${pointWords(_at, model)}: ${o.now.words}'),
                ],
              ),
            ),
          ),
          if (o.makers.isNotEmpty)
            Text(
              'Made by ${o.makers.map((m) => '${m.name} (${m.when})').join(', ')}.',
              style: theme.textTheme.bodySmall,
            ),
          const SizedBox(height: 8),
          if (o.holdings.isEmpty)
            const Text('No holding recorded: who has had it is not known.')
          else if (!_list)
            Semantics(
              container: true,
              label: 'Who has held ${item.name}, in order',
              child: Wrap(
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [for (final (i, h) in o.holdings.indexed) card(h, i)],
              ),
            )
          else
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                columns: const [
                  DataColumn(label: Text('Holder')),
                  DataColumn(label: Text('From')),
                  DataColumn(label: Text('How')),
                  DataColumn(label: Text('Until')),
                  DataColumn(label: Text('How it ended')),
                ],
                rows: [
                  for (final h in o.holdings)
                    DataRow(
                      cells: [
                        DataCell(
                          Text('${h.holderName}${h.inThisTimeline ? '' : ' (does not happen in this timeline)'}'),
                        ),
                        DataCell(Text(h.began)),
                        DataCell(Text(h.how.isEmpty ? '—' : h.how)),
                        DataCell(Text(h.ended ?? 'still')),
                        DataCell(Text(h.endHow.isEmpty ? '—' : h.endHow)),
                      ],
                    ),
                ],
              ),
            ),
          if (o.unknown.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final u in o.unknown) Text('$u.', style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

/// What happens to an item, recorded as "Owns" connections: a first holder; a new holder from a point (the holding
/// before ends there, and is kept); or an end with nobody after (lost, destroyed). The same connection as anywhere
/// else.
class OwnershipForm extends ConsumerStatefulWidget {
  const OwnershipForm({super.key, required this.actions, required this.itemId});
  final CharacterActions actions;
  final String itemId;

  @override
  ConsumerState<OwnershipForm> createState() => _OwnershipFormState();
}

class _OwnershipFormState extends ConsumerState<OwnershipForm> {
  String _what = 'given';
  String? _holder;
  String? _which;
  JsonMap? _when;
  final _own = TextEditingController();

  @override
  void dispose() {
    _own.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    if (cast == null) return const SizedBox.shrink();
    final model = cast.model;
    final name = model.entries[widget.itemId]?.name ?? 'it';
    final o = ownershipOf(model, widget.itemId);
    final open = [
      for (final h in o?.holdings ?? const <Holding>[])
        if (h.inThisTimeline && h.link.validity?.until == null) h,
    ];
    final which = open.any((h) => h.link.id == _which) ? _which! : open.firstOrNull?.link.id;
    final ends = howEnded.contains(_what) || _what == 'own-end';
    final others = stableSorted(
      model.entries.values.where((e) => e.id != widget.itemId),
      (a, b) => localeCompare(a.name, b.name),
    );
    String cap(String s) => '${s[0].toUpperCase()}${s.substring(1)}';
    return FormDialog(
      title: 'What happens to $name',
      width: 460,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            initialValue: _what,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'What happens', isDense: true),
            items: [
              for (final h in howGained) DropdownMenuItem(value: h, child: Text('${cap(h)} (it passes to someone)')),
              const DropdownMenuItem(value: 'own', child: Text('It passes to someone, in your own words…')),
              for (final h in howEnded) DropdownMenuItem(value: h, child: Text('${cap(h)} (nobody has it after)')),
              const DropdownMenuItem(value: 'own-end', child: Text('Nobody has it after, in your own words…')),
            ],
            onChanged: (v) => setState(() => _what = v ?? 'given'),
          ),
          if (_what == 'own' || _what == 'own-end') ...[
            const SizedBox(height: 12),
            TextField(
              controller: _own,
              decoration: const InputDecoration(
                labelText: 'What happens, in your own words',
                hintText: 'pawned, buried with him, melted down…',
                isDense: true,
              ),
            ),
          ],
          if (!ends) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _holder,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Who has it next', isDense: true),
              hint: const Text('Choose…'),
              items: [
                for (final e in others)
                  DropdownMenuItem(
                    value: e.id,
                    child: Text(e.name, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => setState(() => _holder = v),
            ),
          ],
          if (open.length > 1) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: which,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Whose holding', isDense: true),
              items: [for (final h in open) DropdownMenuItem(value: h.link.id, child: Text(h.holderName))],
              onChanged: (v) => setState(() => _which = v),
            ),
          ],
          const SizedBox(height: 12),
          WhenPicker(model: model, label: 'When', value: _when, onChanged: (v) => setState(() => _when = v)),
          const SizedBox(height: 8),
          Text(
            open.isNotEmpty
                ? 'Held now by ${open.map((h) => h.holderName).join(' and ')}: that holding ends at the point you '
                      'choose, and is kept as history.'
                : 'Nobody is recorded as holding it now.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final error = _save(open, which);
            // An empty error: the change was refused, and the refusal has been said already.
            if (error != null) return error.isEmpty ? null : widget.actions.tell(error);
            if (context.mounted) Navigator.of(context).pop();
          },
          child: const Text('Record it'),
        ),
      ],
    );
  }

  /// Records it; says what is missing instead, or null when it was saved.
  String? _save(List<Holding> open, String? which) {
    final ends = howEnded.contains(_what) || _what == 'own-end';
    final how = _what == 'own' || _what == 'own-end' ? _own.text.trim() : _what;
    final when = _when;
    if (how.isEmpty) return 'Say what happens.';
    if (ends) {
      if (open.isEmpty || which == null) return 'Nobody is recorded as holding it now.';
      if (when == null) return 'Choose when it happens.';
      final done = relate(widget.actions, (r) {
        r.endConnection(which, when, endHow: how);
        return true;
      });
      return done == true ? null : '';
    }
    final holder = _holder;
    if (holder == null) return 'Choose who has it next.';
    if (open.isNotEmpty && which != null) {
      if (when == null) {
        final before = open.where((h) => h.link.id == which).firstOrNull?.holderName ?? 'the holder before';
        return 'Choose when it happens: $before holds it until then.';
      }
      final done = relate(widget.actions, (r) => r.changeConnection(which, when, fromId: holder, how: how));
      return done != null ? null : '';
    }
    final done = relate(
      widget.actions,
      (r) => r.createConnection(
        from: EntityRef(EntityType.entry, holder),
        to: EntityRef(EntityType.entry, widget.itemId),
        type: 'owns',
        startsAt: when,
        how: how,
      ),
    );
    return done != null ? null : '';
  }
}
