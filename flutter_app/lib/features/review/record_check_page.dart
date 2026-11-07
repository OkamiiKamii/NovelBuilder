import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/integrity/fixes.dart';
import '../../shared/domain/integrity/rules.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/records/canon.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/review.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import '../characters/widgets/parts.dart';
import '../codex/widgets/connections_panel.dart';
import '../workspace/area_switch.dart';
import 'data/integrity_service.dart';

final integrityServiceProvider = Provider<IntegrityService>(
  (ref) => IntegrityService(ref.watch(novelStoreProvider), ref.watch(backupServiceProvider)),
);

/// RECORD CHECK: how the novel's records point at one another, checked by stated rules. Each finding comes from one
/// rule and the records it rests on; the same records give the same findings. Nothing changes until the author
/// chooses a fix; a merge is shown in full first, and every reference follows it.
class RecordCheckPage extends ConsumerWidget {
  const RecordCheckPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    if (cast == null) {
      return PageScaffold(
        title: Destination.review.label,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EmptyState(
              icon: Icons.menu_book_outlined,
              title: 'No novel open',
              message: 'Review works inside one novel. Open one from the Library.',
              action: FilledButton(
                onPressed: () => context.go(Destination.library.path),
                child: const Text('Go to Library'),
              ),
            ),
          ],
        ),
      );
    }
    final service = ref.watch(integrityServiceProvider);
    final actions = CharacterActions(context, cast.novelId);
    final model = cast.model;
    final decisions = [for (final r in cast.snapshot.rows('continuityResolutions')) ReviewItem(r)];
    ReviewItem? decision(String key) => decisions.where((d) => d.key == key).firstOrNull;
    final aliases = {
      for (final p in cast.snapshot.rows('characterProfiles'))
        if (p['entryId'] is String)
          p['entryId']! as String: [for (final a in (p['aliases'] as List? ?? const [])) '$a'],
    };
    final broken = brokenReferences(model, cast.snapshot.rows('structureMarkers'));
    final unresolved = unresolvedFields(model);
    final unfit = unfitEntries(model);
    final unsuited = unsuitedKinds(model);
    final duplicates = duplicateCandidates(model.entries.values.toList(), aliases);
    final openDuplicates = [
      for (final d in duplicates)
        if (!(decision(d.key)?.decision.closes ?? false)) d,
    ];
    final decidedDuplicates = [
      for (final d in duplicates)
        if (decision(d.key)?.decision.closes ?? false) (pair: d, decision: decision(d.key)!),
    ];
    final flagged = flaggedConnections(model);
    final open = broken.length + unresolved.length + unfit.length + unsuited.length + openDuplicates.length;
    String name(EntityRef r) => model.resolve(r)?.label ?? 'something deleted';

    void run(String what, void Function() fix) {
      try {
        fix();
      } on Object catch (e) {
        actions.tell('$what did not happen, and nothing was changed: $e');
      }
    }

    Widget open_(EntityRef r, [String? label]) => switch (r.type) {
      EntityType.entry || EntityType.node when model.exists(r) => TextButton(
        onPressed: () => openRecord(actions, cast, r),
        child: Text(label ?? name(r)),
      ),
      _ => Text(label ?? name(r)),
    };

    EntityRef? whereKept(BrokenReference b) => switch (b.table) {
      'chapterPlans' || 'chapters' => EntityRef(EntityType.node, b.rowId),
      'loreEntries' => EntityRef(EntityType.entry, b.rowId),
      _ => null,
    };

    return PageScaffold(
      title: 'Record check',
      subtitle:
          '${cast.novelTitle} · ${open == 0 ? 'Nothing to look at' : '${formatNumber(open)} to look at'}'
          '${decidedDuplicates.isNotEmpty ? ' · ${formatNumber(decidedDuplicates.length)} decided' : ''}'
          ' · checked ${plural(model.entries.length, 'entry', 'entries')}, ${plural(model.nodes.length, 'chapter or scene', 'chapters and scenes')}, ${plural(model.events.length, 'event')}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: reviewParts, current: '/review/records'),
          const SizedBox(height: 12),
          ProfileBox(
            title: 'References to records that no longer exist (${broken.length})',
            caption:
                'The rule: a reference must name a record that exists. Connections, relationships, fields, links in the '
                'text, plans and appearance records, events, plot threads, system sheets and structural markers are '
                'checked.',
            children: [
              if (broken.isEmpty) const NotRecorded('None.'),
              for (final b in broken)
                _Finding(
                  message: '${b.says}.',
                  detail: 'Kept in ${b.where}.',
                  actions: [
                    if (whereKept(b) case final r? when model.exists(r)) open_(r, 'Open where it is kept'),
                    if (fixable.contains(b.table))
                      OutlinedButton(
                        onPressed: () => run(
                          'Taking it out',
                          () => service.removeReference(cast.novelId, b.table, b.rowId, b.missing.id),
                        ),
                        child: Text(goesWhole.contains(b.table) ? 'Remove this connection' : 'Take this reference out'),
                      )
                    else
                      const Text('Change it where it is kept: text is never changed from here.'),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 12),
          ProfileBox(
            title: 'References that name nothing (${unresolved.length})',
            caption:
                'The rule: a field that refers to an entry (“Leader”, “Owner”) must hold an entry, not words. Words are '
                'kept as they are until you point the field at an entry.',
            children: [
              if (unresolved.isEmpty) const NotRecorded('None.'),
              for (final u in unresolved)
                _Finding(
                  message: '${u.entry.name}: “${u.fieldName}” holds “${u.value}”, which names no entry.',
                  actions: [
                    open_(EntityRef(EntityType.entry, u.entry.id), 'Open ${u.entry.name}'),
                    if (u.suggestions.isEmpty) const Text('No entry has that name.'),
                    for (final s in u.suggestions)
                      OutlinedButton(
                        onPressed: () => run(
                          'Pointing it',
                          () => service.pointField(cast.novelId, u.entry.id, u.fieldId, u.value, s.id),
                        ),
                        child: Text('Point it at ${s.name}'),
                      ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 12),
          ProfileBox(
            title: 'Values that do not fit their fields (${unfit.length})',
            caption:
                'The rule: each value fits its field as its category defines it. Values are never changed from here.',
            children: [
              if (unfit.isEmpty) const NotRecorded('None.'),
              for (final u in unfit)
                _Finding(
                  message: u.entry.name,
                  detail: [for (final i in u.issues) i.message].join('\n'),
                  actions: [open_(EntityRef(EntityType.entry, u.entry.id), 'Open ${u.entry.name}')],
                ),
            ],
          ),
          const SizedBox(height: 12),
          ProfileBox(
            title: 'Views set up on fields that no longer suit (${unsuited.length})',
            caption:
                'The rule: a view a kind of record is set up for reads fields that still suit it. Only settings you made '
                'are listed; a view never set up is not a problem. Settings are kept, and work again once the field suits.',
            children: [
              if (unsuited.isEmpty) const NotRecorded('None.'),
              for (final u in unsuited)
                _Finding(
                  message: u.category.name,
                  detail: u.problems.join('\n'),
                  actions: [
                    TextButton(
                      onPressed: () =>
                          actions.router.go('/organize/world/kinds?kind=${Uri.encodeComponent(u.category.key)}'),
                      child: Text(
                        'Open these settings',
                        semanticsLabel: 'Open the view settings of ${u.category.name}',
                      ),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 12),
          ProfileBox(
            title: 'Records that look like duplicates (${openDuplicates.length})',
            caption:
                'The rules: two entries of the same category whose names are the same once capitals, accents, '
                'punctuation and a leading “The” are set aside; or one whose name is the other’s alias. Nothing is '
                'merged unless you say so.',
            children: [
              if (openDuplicates.isEmpty) const NotRecorded('None.'),
              for (final d in openDuplicates)
                _Finding(
                  message: '${d.a.name} and ${d.b.name}',
                  detail: d.because,
                  actions: [
                    open_(EntityRef(EntityType.entry, d.a.id), 'Open ${d.a.name}'),
                    open_(EntityRef(EntityType.entry, d.b.id), 'Open the other'),
                    OutlinedButton(
                      onPressed: () => showDialog<void>(
                        context: context,
                        builder: (_) =>
                            _MergeDialog(pair: d, novelId: cast.novelId, service: service, actions: actions),
                      ),
                      child: const Text('Merge…'),
                    ),
                    TextButton(
                      onPressed: () => run(
                        'Deciding',
                        () => service.decide(
                          cast.novelId,
                          d.key,
                          '${d.a.name} and ${d.b.name} are not duplicates.',
                          ReviewDecision.dismissed,
                        ),
                      ),
                      child: Text('Not duplicates', semanticsLabel: 'Not duplicates: ${d.a.name} and ${d.b.name}'),
                    ),
                  ],
                ),
              if (decidedDuplicates.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Decided: not duplicates', style: Theme.of(context).textTheme.titleSmall),
                for (final d in decidedDuplicates)
                  _Finding(
                    message: '${d.pair.a.name} and ${d.pair.b.name}',
                    actions: [
                      TextButton(
                        onPressed: () => run('Reopening', () => service.reopen(cast.novelId, d.decision.id)),
                        child: const Text('Reopen'),
                      ),
                    ],
                  ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          ProfileBox(
            title: 'Connections marked disputed or invalid (${flagged.length})',
            caption:
                'Connections you recorded and marked Disputed, or Invalid (retconned, or not canon). Kept as you marked '
                'them; listed so they are not forgotten.',
            children: [
              if (flagged.isEmpty) const NotRecorded('None.'),
              for (final c in flagged)
                _Finding(
                  message:
                      '${name(c.from)} ${c.label.isEmpty ? 'related to' : '${c.label[0].toLowerCase()}${c.label.substring(1)}'} ${name(c.to)}',
                  detail: connectionStatusLabel(CanonStatus.of(c.canon) ?? CanonStatus.canon),
                  actions: [open_(c.from), open_(c.to)],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Finding extends StatelessWidget {
  const _Finding({required this.message, this.detail, this.actions = const []});

  final String message;
  final String? detail;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(message),
        if (detail != null && detail!.isNotEmpty) Text(detail!, style: Theme.of(context).textTheme.bodySmall),
        if (actions.isNotEmpty)
          Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: actions),
      ],
    ),
  );
}

/// A merge, shown in full before anything happens: which one to keep, what would point at it, what is added, what is
/// not kept. It goes ahead only once the name of the one merged away is typed, after a restore point is kept.
class _MergeDialog extends StatefulWidget {
  const _MergeDialog({required this.pair, required this.novelId, required this.service, required this.actions});

  final DuplicatePair pair;
  final String novelId;
  final IntegrityService service;
  final CharacterActions actions;

  @override
  State<_MergeDialog> createState() => _MergeDialogState();
}

class _MergeDialogState extends State<_MergeDialog> {
  late Entry _keep = widget.pair.a;
  final _typed = TextEditingController();

  Entry get _merge => _keep.id == widget.pair.a.id ? widget.pair.b : widget.pair.a;

  /// The plan for the current choice, worked out once (it reads the whole novel).
  (MergePlan?, String?)? _plan;

  (MergePlan?, String?) _work() {
    try {
      return (widget.service.mergePlan(widget.novelId, _keep.id, _merge.id), null);
    } on Object catch (e) {
      return (null, '$e');
    }
  }

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final (plan, problem) = _plan ??= _work();
    final confirmed = _typed.text.trim() == _merge.name.trim();
    return AlertDialog(
      title: const Text('Merge two entries'),
      scrollable: true,
      content: SizedBox(
        width: 520,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Which one to keep', style: Theme.of(context).textTheme.titleSmall),
            RadioGroup<String>(
              groupValue: _keep.id,
              onChanged: (id) => setState(() {
                _keep = id == widget.pair.a.id ? widget.pair.a : widget.pair.b;
                _plan = null;
                _typed.clear();
              }),
              child: Column(
                children: [
                  for (final e in [widget.pair.a, widget.pair.b])
                    RadioListTile<String>(value: e.id, title: Text('Keep “${e.name}”')),
                ],
              ),
            ),
            if (problem != null) Text(problem, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (plan != null) ...[
              Text(
                '“${plan.mergeName}” is merged into “${plan.keepName}”, and then deleted. Everything that pointed at it will '
                'point at “${plan.keepName}”:',
              ),
              if (plan.repointed.isEmpty) const Text('•  Nothing points at it.'),
              for (final r in plan.repointed) Text('•  ${tableWords(r.table)}: ${formatNumber(r.rows)}'),
              const SizedBox(height: 8),
              Text('Added to “${plan.keepName}”:'),
              for (final c in plan.combined) Text('•  $c'),
              if (plan.dropped.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('Not kept:'),
                for (final d in plan.dropped) Text('•  $d'),
              ],
              const SizedBox(height: 8),
              const Text(
                'A restore point is kept first (Settings → Restore points), so it can be undone. The words of your '
                'chapters are not changed; their links follow the one kept.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _typed,
                decoration: InputDecoration(labelText: 'Type “${_merge.name}” to go ahead'),
                onChanged: (_) => setState(() {}),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(autofocus: true, onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: plan == null || !confirmed
              ? null
              : () {
                  final actions = widget.actions;
                  final names = '“${_merge.name}” into “${_keep.name}”';
                  Navigator.of(context).pop();
                  try {
                    final kept = widget.service.merge(widget.novelId, _keep.id, _merge.id, names: names);
                    actions.tell('Merged $names.', actionLabel: 'Undo', onAction: () => widget.service.undo(kept));
                  } on Object catch (e) {
                    actions.tell('Merging did not happen, and nothing was changed: $e');
                  }
                },
          child: const Text('Merge them'),
        ),
      ],
    );
  }
}
