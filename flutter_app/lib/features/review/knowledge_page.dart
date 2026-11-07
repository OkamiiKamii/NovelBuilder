import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/states.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/knowledge.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/review.dart';
import '../../shared/domain/stable_sort.dart';
import '../visualize/viz_frame.dart';
import 'review_providers.dart';

/// A state in two letters as well as words, so a cell never says it by colour alone.
const _codes = {
  Awareness.knows: 'K',
  Awareness.partial: 'P',
  Awareness.believes: 'B',
  Awareness.suspects: 'S',
  Awareness.falseBelief: 'F',
  Awareness.unaware: 'U',
};

/// SECRETS AND KNOWLEDGE
/// What each character holds of a secret, read only from what the author has recorded, and how that spreads along the
/// reading or in story time. Nothing is inferred: someone with no record is "not recorded", never "unaware". Two
/// things are checked, each from a stated rule, and only decided about here; nothing about anyone's knowledge changes.
class KnowledgePage extends ConsumerStatefulWidget {
  const KnowledgePage({super.key, this.secretId});
  final String? secretId;

  @override
  ConsumerState<KnowledgePage> createState() => _KnowledgePageState();
}

class _KnowledgePageState extends ConsumerState<KnowledgePage> {
  late String? _secret = widget.secretId;
  KnowledgeAxis _axis = KnowledgeAxis.reading;
  ({String characterId, int point})? _cell;
  String? _explaining;
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(reviewDataProvider);
    Widget frame(Widget child) => VizFrame(
      view: 'knowledge',
      title: 'Secrets and knowledge',
      filters: false,
      config: () => {
        'mode': 'visual',
        'layout': {'ksecret': ?_secret, if (_axis == KnowledgeAxis.story) 'kaxis': 'story'},
      },
      onApply: (JsonMap c) => setState(() {
        final l = mapOrNull(c['layout']) ?? const {};
        _secret = strOrNull(l['ksecret']);
        _axis = l['kaxis'] == 'story' ? KnowledgeAxis.story : KnowledgeAxis.reading;
        _cell = null;
      }),
      child: child,
    );
    if (data == null) return frame(const SizedBox.shrink());
    final model = data.model;
    final theme = Theme.of(context);
    final actions = ReviewActions(context, data.novelId);
    final owned = stableSorted(data.secrets.where((s) => model.entries.containsKey(s.entryId)), (a, b) {
      final c = localeCompare(model.entries[a.entryId]!.name, model.entries[b.entryId]!.name);
      return c != 0 ? c : localeCompare(a.title, b.title);
    });
    if (owned.isEmpty) {
      return frame(
        const EmptyState(
          icon: Icons.lock_outline,
          title: 'No secrets yet',
          message: 'Add one on a character’s Secrets tab, then record there who knows it, where and how.',
        ),
      );
    }
    final secret = owned.where((s) => s.id == _secret).firstOrNull ?? owned.first;
    final owner = model.entries[secret.entryId]!.name;
    final spread = knowledgeSpread(secret, model, _axis);
    final findings = [
      for (final f in checkKnowledge(data.secrets, model))
        if (f.secretId == secret.id) f,
    ];
    String words(Awareness? s, [String belief = '']) =>
        s == null ? 'Not recorded' : '${s.label}${belief.trim().isNotEmpty ? ' (“${belief.trim()}”)' : ''}';
    final cell = _cell == null
        ? null
        : spread.rows
              .where((r) => r.characterId == _cell!.characterId)
              .firstOrNull
              ?.cells
              .elementAtOrNull(_cell!.point);

    Widget grid() {
      if (spread.points.isEmpty) {
        return Text(
          'Nothing about this secret is placed at a ${_axis == KnowledgeAxis.reading ? 'chapter or scene' : 'event'} yet, '
          'so there is nothing to draw along this axis. Who knows what now is above.',
          style: theme.textTheme.bodySmall,
        );
      }
      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          columnSpacing: 16,
          columns: [
            const DataColumn(label: Text('Who')),
            for (final p in spread.points)
              DataColumn(
                label: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 140),
                  child: Text(
                    '${p.label}${p.marks.contains('first') ? ' · first figures' : ''}${p.marks.contains('reveal') ? ' · comes out' : ''}',
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            const DataColumn(label: Text('Now')),
          ],
          rows: [
            for (final row in spread.rows)
              DataRow(
                cells: [
                  DataCell(Text(row.name)),
                  for (final (i, c) in row.cells.indexed)
                    DataCell(
                      Semantics(
                        button: true,
                        label:
                            '${row.name} at ${spread.points[i].label}: ${words(c.record?.state, c.record?.belief ?? '')}'
                            '${c.needs.isNotEmpty ? ', acts on it here' : ''}',
                        excludeSemantics: true,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: _cell?.characterId == row.characterId && _cell?.point == i
                                ? theme.colorScheme.secondaryContainer
                                : null,
                            border: c.here.isNotEmpty ? Border.all(color: theme.colorScheme.primary) : null,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            '${c.record?.state == null ? '—' : _codes[c.record!.state]!}${c.needs.isNotEmpty ? ' !' : ''}',
                            style: theme.textTheme.labelLarge,
                          ),
                        ),
                      ),
                      onTap: () => setState(() => _cell = (characterId: row.characterId, point: i)),
                    ),
                  DataCell(Text(words(row.now.state, row.now.record?.belief ?? ''))),
                ],
              ),
          ],
        ),
      );
    }

    return frame(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              SizedBox(
                width: 300,
                child: DropdownButtonFormField<String>(
                  key: ValueKey('secret:${secret.id}'),
                  initialValue: secret.id,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Which secret', isDense: true),
                  items: [
                    for (final s in owned)
                      DropdownMenuItem(
                        value: s.id,
                        child: Text('${model.entries[s.entryId]!.name}: ${s.title}', overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() {
                    _secret = v;
                    _cell = null;
                  }),
                ),
              ),
              SizedBox(
                width: 300,
                child: DropdownButtonFormField<KnowledgeAxis>(
                  key: ValueKey('axis:$_axis'),
                  initialValue: _axis,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Along', isDense: true),
                  items: [for (final a in KnowledgeAxis.values) DropdownMenuItem(value: a, child: Text(a.label))],
                  onChanged: (v) => setState(() {
                    _axis = v ?? KnowledgeAxis.reading;
                    _cell = null;
                  }),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text.rich(
            TextSpan(
              children: [
                const TextSpan(
                  text: 'What is true: ',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                TextSpan(text: secret.description.trim().isEmpty ? 'Not written yet.' : secret.description),
              ],
            ),
          ),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('$owner’s secret · ${secret.status} · ', style: theme.textTheme.bodySmall),
              TextButton(
                onPressed: () {
                  actions.flush();
                  actions.router.go('/organize/character/${secret.entryId}?tab=secrets');
                },
                child: Text('Record who knows it on $owner’s Secrets tab'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Semantics(header: true, child: Text('Who knows what now', style: theme.textTheme.titleMedium)),
          for (final g in whoKnowsWhat(secret, [for (final r in spread.rows) r.characterId]))
            Text(
              '${g.state?.label ?? 'Not recorded'}: ${g.ids.map((id) => model.entries[id]?.name ?? 'Someone').join(', ')}',
            ),
          const SizedBox(height: 12),
          Semantics(
            header: true,
            child: Text(
              'How it spreads, ${_axis == KnowledgeAxis.reading ? 'as the reader goes' : 'in story time'}',
              style: theme.textTheme.titleMedium,
            ),
          ),
          grid(),
          Text(
            'In each cell, the record in force there: K knows, P knows part of it, B believes it, S suspects, F believes '
            'something false, U unaware, — nothing recorded yet. An outline marks a record placed at that very point; ! '
            'marks that they act on it there. Tap a cell for the record it rests on.',
            style: theme.textTheme.bodySmall,
          ),
          if (cell != null)
            Card.outlined(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (cell.record != null)
                      Text('In force from: ${recordWords(cell.record!, model)}.')
                    else
                      const Text('No record of theirs is in force here.'),
                    if (cell.here.any((r) => !identical(r, cell.record)))
                      Text('Recorded here: ${cell.here.map((r) => recordWords(r, model)).join('; ')}.'),
                    for (final n in cell.needs)
                      Text('Acts on it here${n.note.trim().isNotEmpty ? ': “${n.note.trim()}”' : ''}.'),
                  ],
                ),
              ),
            ),
          if (spread.tellings.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Who told whom', style: theme.textTheme.titleSmall),
            for (final t in spread.tellings)
              Text(
                '${model.entries[t.fromId]?.name} → ${model.entries[t.toId]?.name}, at ${spread.points[t.point].label}',
              ),
          ],
          for (final row in spread.rows)
            if (row.unplaced.isNotEmpty)
              Text(
                '${row.name}: also in their history, with no ${_axis == KnowledgeAxis.reading ? 'chapter or scene' : 'event'}: '
                '${row.unplaced.map((r) => recordWords(r, model)).join('; ')}.',
                style: theme.textTheme.bodySmall,
              ),
          const SizedBox(height: 12),
          Semantics(header: true, child: Text('Checks', style: theme.textTheme.titleMedium)),
          for (final r in KnowledgeRule.values)
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: '${r.title}. ',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  TextSpan(text: '${r.rule} Needs: ${r.requires}'),
                ],
              ),
              style: theme.textTheme.bodySmall,
            ),
          const SizedBox(height: 6),
          if (findings.isEmpty) const Text('Nothing to look at.'),
          for (final f in findings)
            if (data.decisionOf(f.key) case final decision?)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(f.message),
                subtitle: Text(
                  '${decision.decision.label}${decision.note.isNotEmpty ? ' · Your note: ${decision.note}' : ''}',
                ),
                trailing: TextButton(
                  onPressed: () => actions.reopen(decision.id),
                  child: Text('Reopen', semanticsLabel: 'Reopen: ${f.message}'),
                ),
              )
            else
              Card.outlined(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('${f.rule.title}. ${f.message}'),
                      Text('Because: ${f.because}', style: theme.textTheme.bodySmall),
                      if (_explaining == f.key) ...[
                        TextField(
                          controller: _reason,
                          autofocus: true,
                          decoration: const InputDecoration(
                            labelText: 'Why is this intentional?',
                            hintText: 'A bluff, a lucky guess, a lie in the record…',
                            isDense: true,
                          ),
                        ),
                        Wrap(
                          spacing: 8,
                          children: [
                            TextButton(
                              onPressed: () => setState(() => _explaining = null),
                              child: const Text('Cancel'),
                            ),
                            FilledButton.tonal(
                              onPressed: () {
                                actions.decide(f.key, f.message, ReviewDecision.intentional, note: _reason.text);
                                setState(() => _explaining = null);
                              },
                              child: const Text('Save as intentional'),
                            ),
                          ],
                        ),
                      ] else
                        Wrap(
                          spacing: 8,
                          children: [
                            OutlinedButton(
                              onPressed: () => setState(() {
                                _explaining = f.key;
                                _reason.clear();
                              }),
                              child: Text('Mark as intentional…', semanticsLabel: 'Mark as intentional: ${f.message}'),
                            ),
                            TextButton(
                              onPressed: () => actions.decide(f.key, f.message, ReviewDecision.dismissed),
                              child: Text('Dismiss', semanticsLabel: 'Dismiss: ${f.message}'),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
