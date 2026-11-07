import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart' show formatRelative;
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/form_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../shared/domain/canon/canon_changes.dart';
import '../../shared/domain/canon/facts.dart';
import '../../shared/domain/canon/review.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/canon.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/timeline/narrative.dart' show nodeLabel;
import '../workspace/area_switch.dart';
import 'review_providers.dart';

/// CANON
/// What is true in the novel's world, and where each statement stands: canon, provisional, conflicting, retconned or
/// non-canon. The status is the author's alone; the possible contradictions shown are observations, never rulings,
/// and nothing changes until the author changes it.
class CanonPage extends ConsumerStatefulWidget {
  const CanonPage({super.key, this.factId});
  final String? factId;

  @override
  ConsumerState<CanonPage> createState() => _CanonPageState();
}

class _CanonPageState extends ConsumerState<CanonPage> {
  late String? _open = widget.factId;
  String _query = '';
  CanonStatus? _status;
  String? _kind;
  String? _about;

  @override
  void didUpdateWidget(CanonPage old) {
    super.didUpdateWidget(old);
    if (old.factId != widget.factId) _open = widget.factId;
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(reviewDataProvider);
    if (data == null) return const PageScaffold(title: 'Canon', child: SizedBox.shrink());
    final theme = Theme.of(context);
    final model = data.model;
    final actions = ReviewActions(context, data.novelId);
    final reviews = data.canon.reviews;
    final flagged = [
      for (final r in reviews)
        if (r.flags.isNotEmpty) r,
    ];
    final query = _query.trim().toLowerCase();
    bool matches(CanonFact f) =>
        (query.isEmpty ||
            [
              f.subject,
              f.statement,
              f.notes,
              for (final h in f.history) str(h['statement']),
              for (final s in f.factSources) s.quote,
            ].join(' ').toLowerCase().contains(query)) &&
        (_status == null || f.status == _status) &&
        (_kind == null || f.kind == _kind) &&
        (_about == null || f.entryIds.contains(_about));
    final shown = [
      for (final r in reviews)
        if (matches(r.fact)) r,
    ];
    final about = stableSorted(
      {for (final f in data.facts) ...f.entryIds}.where(model.entries.containsKey),
      (a, b) => localeCompare(model.entries[a]!.name, model.entries[b]!.name),
    );
    final open = reviews.where((r) => r.fact.id == _open).firstOrNull;

    return PageScaffold(
      title: 'Canon',
      actions: [
        FilledButton.icon(
          onPressed: () {
            final made = actions.canon((c) => c.create());
            if (made != null) setState(() => _open = made.id);
          },
          icon: const Icon(Icons.add),
          label: const Text('New statement'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: reviewParts, current: '/review/canon'),
          const SizedBox(height: 12),
          if (flagged.isNotEmpty)
            Card.outlined(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Semantics(header: true, child: Text('Possible contradictions', style: theme.textTheme.titleMedium)),
                    for (final p in data.canon.pairs)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(p.a.subject),
                        subtitle: Text(
                          '“${p.a.statement}” (${p.a.status.label}) and “${p.b.statement}” (${p.b.status.label}) '
                          '${p.stated ? 'are linked by you as contradicting' : 'appear to conflict'}.',
                        ),
                        onTap: () => setState(() => _open = p.a.id),
                      ),
                    for (final r in flagged)
                      for (final f in r.flags)
                        if (f.kind != 'fact')
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(r.fact.subject),
                            subtitle: Text(f.message),
                            onTap: () => setState(() => _open = r.fact.id),
                          ),
                    Text(
                      'These are observations, not rulings. Confirm, retcon, mark as Conflicting, set aside or ignore '
                      'them: nothing changes until you change it.',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              SizedBox(
                width: 280,
                child: TextField(
                  decoration: const InputDecoration(
                    labelText: 'Search facts',
                    hintText: 'Facts, past wordings and quotes…',
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                  ),
                  onChanged: (t) => setState(() => _query = t),
                ),
              ),
              SizedBox(
                width: 200,
                child: DropdownButtonFormField<CanonStatus?>(
                  initialValue: _status,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Canon status', isDense: true),
                  items: [
                    DropdownMenuItem(value: null, child: Text('Every status (${reviews.length})')),
                    for (final s in statusOrder)
                      DropdownMenuItem(
                        value: s,
                        child: Text('${s.label} (${reviews.where((r) => r.fact.status == s).length})'),
                      ),
                  ],
                  onChanged: (v) => setState(() => _status = v),
                ),
              ),
              SizedBox(
                width: 180,
                child: DropdownButtonFormField<String?>(
                  initialValue: _kind,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Kind', isDense: true),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('Every kind')),
                    for (final k in factKinds) DropdownMenuItem(value: k, child: Text(factKindLabels[k]!)),
                  ],
                  onChanged: (v) => setState(() => _kind = v),
                ),
              ),
              if (about.isNotEmpty)
                SizedBox(
                  width: 200,
                  child: DropdownButtonFormField<String?>(
                    initialValue: _about,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'About', isDense: true),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('About anything')),
                      for (final id in about) DropdownMenuItem(value: id, child: Text(model.entries[id]!.name)),
                    ],
                    onChanged: (v) => setState(() => _about = v),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (open != null) ...[
            FactDetails(
              key: ValueKey(open.fact.id),
              data: data,
              review: open,
              actions: actions,
              onClose: () => setState(() => _open = null),
              onOpen: (id) => setState(() => _open = id),
            ),
            const SizedBox(height: 12),
          ],
          if (reviews.isEmpty)
            const EmptyState(
              icon: Icons.verified_outlined,
              title: 'What is true in your world',
              message:
                  'Record the statements your story relies on (a founding date, a rule of magic, who is whose heir) and '
                  'where each is established. Then the checks can tell you when something seems to disagree.',
            )
          else if (shown.isEmpty)
            const Text('No facts match these filters.')
          else
            for (final s in statusOrder)
              if (shown.where((r) => r.fact.status == s).toList() case final here when here.isNotEmpty) ...[
                Tooltip(
                  message: s.hint,
                  child: Semantics(
                    header: true,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 8, bottom: 4),
                      child: Text('${s.label} (${here.length})', style: theme.textTheme.titleMedium),
                    ),
                  ),
                ),
                for (final r in here)
                  Card(
                    margin: const EdgeInsets.only(bottom: 6),
                    color: r.fact.id == _open ? theme.colorScheme.secondaryContainer : null,
                    child: ListTile(
                      onTap: () => setState(() => _open = r.fact.id),
                      title: Text(r.fact.subject),
                      subtitle: Text(
                        [
                          r.fact.statement.trim().isEmpty ? 'No statement yet' : r.fact.statement,
                          [
                            factKindLabels[r.fact.kind] ?? r.fact.kind,
                            if (r.fact.factSources.isNotEmpty)
                              '${r.fact.factSources.length} ${r.fact.factSources.length == 1 ? 'source' : 'sources'}'
                            else if (r.fact.status == CanonStatus.canon)
                              'No source recorded yet',
                            if (r.flags.isNotEmpty)
                              '${r.flags.length} possible ${r.flags.length == 1 ? 'contradiction' : 'contradictions'}',
                          ].join(' · '),
                        ].join('\n'),
                      ),
                    ),
                  ),
              ],
        ],
      ),
    );
  }
}

/// One statement: its wording (revised, not overwritten, once established), status, kind, what it is about, its
/// sources, the statements it contradicts, its history and notes.
class FactDetails extends StatefulWidget {
  const FactDetails({
    super.key,
    required this.data,
    required this.review,
    required this.actions,
    required this.onClose,
    required this.onOpen,
  });
  final ReviewData data;
  final FactReview review;
  final ReviewActions actions;
  final VoidCallback onClose;
  final ValueChanged<String> onOpen;

  @override
  State<FactDetails> createState() => _FactDetailsState();
}

class _FactDetailsState extends State<FactDetails> {
  String _sourceType = 'chapter';
  String? _sourceRef;
  final _quote = TextEditingController();
  final _note = TextEditingController();

  @override
  void dispose() {
    _quote.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _revise(CanonFact fact) => showDialog<void>(
    context: context,
    builder: (_) => _ReviseDialog(fact: fact, actions: widget.actions),
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final data = widget.data;
    final model = data.model;
    final actions = widget.actions;
    final fact = widget.review.fact;
    final flags = widget.review.flags;
    final others = stableSorted(
      data.facts.where((f) => f.id != fact.id),
      (a, b) => localeCompare(a.subject, b.subject),
    );
    final entries = stableSorted(model.entries.values, (a, b) => localeCompare(a.name, b.name));
    final chapters = stableSorted(
      model.nodes.values.where((n) => model.order.position.containsKey(n.id)),
      (a, b) => model.order.position[a.id]!.compareTo(model.order.position[b.id]!),
    );
    final events = stableSorted(model.events.values, (a, b) => localeCompare(a.name, b.name));
    final linked = {
      ...fact.conflictsWith,
      for (final f in data.facts)
        if (f.conflictsWith.contains(fact.id)) f.id,
    };
    void update(void Function(CanonChanges c) change) {
      actions.canon((c) {
        change(c);
        return true;
      });
    }

    String sourceLabel(FactSource s) => describeSource(
      s,
      node: (id) => model.nodes[id],
      entry: (id) => model.entries[id],
      event: (id) => model.events[id]?.name,
      category: (k) => model.categories[k],
    ).label;

    return Card.outlined(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Semantics(header: true, child: Text('Canon fact', style: theme.textTheme.titleMedium)),
                ),
                IconButton(tooltip: 'Close details', onPressed: widget.onClose, icon: const Icon(Icons.close)),
              ],
            ),
            if (flags.isNotEmpty) ...[
              for (final f in flags)
                Card(
                  color: theme.colorScheme.errorContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(f.message, style: TextStyle(color: theme.colorScheme.onErrorContainer)),
                        Wrap(
                          spacing: 6,
                          children: [
                            if (f.otherId != null)
                              TextButton(
                                onPressed: () => widget.onOpen(f.otherId!),
                                child: const Text('Open the other'),
                              ),
                            if (f.dismiss case final d?)
                              TextButton(
                                onPressed: () => update((c) => c.dismiss(fact.id, d)),
                                child: const Text('Set aside'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              Text(
                'This is only an observation. Whether to confirm one, retcon the other, mark them Conflicting or leave '
                'both as they are is yours to decide.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
            ],
            if (fact.dismissed.isNotEmpty)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(
                  onPressed: () => update((c) => c.undismiss(fact.id)),
                  child: Text('Bring back what was set aside (${fact.dismissed.length})'),
                ),
              ),
            SavedTextField(
              key: ValueKey('subject:${fact.id}'),
              label: 'Subject',
              hint: 'What this is about',
              value: fact.subject,
              onChanged: (v) => actions.canonLater('${fact.id}:subject', (c) => c.update(fact.id, subject: v)),
            ),
            const SizedBox(height: 8),
            if (established.contains(fact.status)) ...[
              Text('Statement', style: theme.textTheme.labelLarge),
              Text(fact.statement.trim().isEmpty ? 'No statement yet' : '“${fact.statement}”'),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(onPressed: () => _revise(fact), child: const Text('Revise the statement…')),
              ),
            ] else
              SavedTextField(
                key: ValueKey('statement:${fact.id}'),
                label: 'Statement',
                hint: 'What is claimed, as one clear sentence.',
                value: fact.statement,
                multiline: true,
                onChanged: (v) => actions.canonLater('${fact.id}:statement', (c) => c.update(fact.id, statement: v)),
              ),
            const SizedBox(height: 8),
            Text('Canon status', style: theme.textTheme.labelLarge),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final s in CanonStatus.values)
                  Tooltip(
                    message: s.hint,
                    child: ChoiceChip(
                      label: Text(s.label),
                      selected: fact.status == s,
                      onSelected: (_) {
                        if (fact.status != s) update((c) => c.setStatus(fact.id, s));
                      },
                    ),
                  ),
              ],
            ),
            if (fact.status == CanonStatus.retconned)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: DropdownButtonFormField<String>(
                  key: ValueKey('replaced:${fact.replacedById}'),
                  initialValue: others.any((f) => f.id == fact.replacedById) ? fact.replacedById : '',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Replaced by', isDense: true),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('Not linked to a replacement')),
                    for (final f in others)
                      DropdownMenuItem(
                        value: f.id,
                        child: Text(f.words, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => update((c) => c.update(fact.id, replacedById: (value: v == '' ? null : v))),
                ),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: 220,
              child: DropdownButtonFormField<String>(
                key: ValueKey('kind:${fact.kind}'),
                initialValue: fact.kind,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Kind', isDense: true),
                items: [for (final k in factKinds) DropdownMenuItem(value: k, child: Text(factKindLabels[k]!))],
                onChanged: (v) => update((c) => c.update(fact.id, kind: v)),
              ),
            ),
            const SizedBox(height: 8),
            Text('About', style: theme.textTheme.labelLarge),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (final id in fact.entryIds)
                  if (model.entries[id] case final e?)
                    InputChip(
                      label: Text(e.name),
                      onDeleted: () => update(
                        (c) => c.update(
                          fact.id,
                          entryIds: [
                            for (final x in fact.entryIds)
                              if (x != id) x,
                          ],
                        ),
                      ),
                      deleteButtonTooltipMessage: 'Remove ${e.name}',
                    ),
                PopupMenuButton<String>(
                  tooltip: 'Add a codex entry this is about',
                  onSelected: (id) => update((c) => c.update(fact.id, entryIds: [...fact.entryIds, id])),
                  itemBuilder: (_) => [
                    for (final e in entries)
                      if (!fact.entryIds.contains(e.id)) PopupMenuItem(value: e.id, child: Text(e.name)),
                  ],
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(
                      'Add a character or entry this is about…',
                      style: TextStyle(color: theme.colorScheme.primary),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('Sources: where this is established', style: theme.textTheme.labelLarge),
            if (fact.factSources.isEmpty)
              Text(
                'Link the chapter, scene or codex entry that makes this true, so you can always check it.',
                style: theme.textTheme.bodySmall,
              ),
            for (final s in fact.factSources)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(sourceLabel(s)),
                subtitle: s.quote.isNotEmpty ? Text('“${s.quote}”') : null,
                trailing: IconButton(
                  tooltip: 'Remove source ${sourceLabel(s)}',
                  onPressed: () => update((c) => c.removeSource(fact.id, s.id)),
                  icon: const Icon(Icons.close),
                ),
              ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 190,
                  child: DropdownButtonFormField<String>(
                    initialValue: _sourceType,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Kind of source', isDense: true),
                    items: [for (final t in sourceTypes) DropdownMenuItem(value: t, child: Text(sourceLabels[t]!))],
                    onChanged: (v) => setState(() {
                      _sourceType = v ?? 'note';
                      _sourceRef = null;
                    }),
                  ),
                ),
                if (_sourceType != 'note')
                  SizedBox(
                    width: 240,
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('ref:$_sourceType:$_sourceRef'),
                      initialValue: _sourceRef,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Source', isDense: true),
                      hint: const Text('Choose…'),
                      items: [
                        if (_sourceType == 'chapter')
                          for (final n in chapters)
                            DropdownMenuItem(
                              value: n.id,
                              child: Text(nodeLabel(model, n.id), overflow: TextOverflow.ellipsis),
                            ),
                        if (_sourceType == 'entry')
                          for (final e in entries) DropdownMenuItem(value: e.id, child: Text(e.name)),
                        if (_sourceType == 'event')
                          for (final e in events) DropdownMenuItem(value: e.id, child: Text(e.name)),
                      ],
                      onChanged: (v) => setState(() => _sourceRef = v),
                    ),
                  ),
                if (_sourceType == 'chapter')
                  SizedBox(
                    width: 280,
                    child: TextField(
                      controller: _quote,
                      decoration: const InputDecoration(
                        labelText: 'Quote',
                        hintText: 'The words that establish it (finds the paragraph)',
                        isDense: true,
                      ),
                    ),
                  ),
                if (_sourceType == 'note')
                  SizedBox(
                    width: 280,
                    child: TextField(
                      controller: _note,
                      decoration: const InputDecoration(
                        labelText: 'Source description',
                        hintText: 'e.g. Series bible, p. 12',
                        isDense: true,
                      ),
                    ),
                  ),
                FilledButton.tonal(
                  onPressed:
                      (_sourceType != 'note' && _sourceRef == null) ||
                          (_sourceType == 'note' && _note.text.trim().isEmpty)
                      ? null
                      : () {
                          update(
                            (c) => c.addSource(
                              fact.id,
                              type: _sourceType,
                              refId: _sourceRef,
                              quote: _quote.text,
                              note: _note.text,
                            ),
                          );
                          setState(() {
                            _sourceRef = null;
                            _quote.clear();
                            _note.clear();
                          });
                        },
                  child: const Text('Add the source'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('Contradicts (your own links)', style: theme.textTheme.labelLarge),
            for (final id in linked)
              if (data.facts.where((f) => f.id == id).firstOrNull case final other?)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: Text(other.subject),
                  subtitle: Text('“${other.statement}” (${other.status.label})'),
                  onTap: () => widget.onOpen(other.id),
                  trailing: IconButton(
                    tooltip: 'Unlink ${other.subject}',
                    onPressed: () => update((c) => c.unlinkConflict(fact.id, other.id)),
                    icon: const Icon(Icons.link_off),
                  ),
                ),
            PopupMenuButton<String>(
              tooltip: 'Link a statement this contradicts',
              onSelected: (id) => update((c) => c.linkConflict(fact.id, id)),
              itemBuilder: (_) => [
                for (final f in others)
                  if (!linked.contains(f.id)) PopupMenuItem(value: f.id, child: Text(f.words)),
              ],
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Text('Link a statement this contradicts…', style: TextStyle(color: theme.colorScheme.primary)),
              ),
            ),
            const SizedBox(height: 8),
            Text('Canon history', style: theme.textTheme.labelLarge),
            for (final step in fact.history)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(switch (step['kind']) {
                  'created' => 'Recorded as ${CanonStatus.of(step['toStatus'])?.label ?? 'Provisional'}',
                  'status' =>
                    '${CanonStatus.of(step['fromStatus'])?.label ?? '?'} → ${CanonStatus.of(step['toStatus'])?.label ?? '?'}',
                  'retcon' => 'Retconned: “${str(step['statement'])}” became “${str(step['newStatement'])}”',
                  _ => 'Reworded: “${str(step['statement'])}” became “${str(step['newStatement'])}”',
                }),
                subtitle: Text(
                  [
                    if (step['at'] case final num at) formatRelative(context, at),
                    if (str(step['reason']).isNotEmpty) str(step['reason']),
                  ].join(' · '),
                ),
              ),
            const SizedBox(height: 8),
            SavedTextField(
              key: ValueKey('notes:${fact.id}'),
              label: 'Notes',
              hint: 'Open questions, implications, things to check.',
              value: fact.notes,
              multiline: true,
              onChanged: (v) => actions.canonLater('${fact.id}:notes', (c) => c.update(fact.id, notes: v)),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'You are the authority here. Nothing changes a status but you.',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
                  onPressed: () async {
                    final ok = await showConfirmDialog(
                      context,
                      title: 'Delete fact',
                      message:
                          'Delete “${fact.subject}” and its whole history? To keep the record, mark it Non-Canon or '
                          'Retconned instead.',
                      confirmLabel: 'Delete fact and history',
                      destructive: true,
                    );
                    if (ok) {
                      update((c) => c.removeFact(fact.id));
                      widget.onClose();
                    }
                  },
                  child: const Text('Delete…'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Revising an established statement: the wording it has now is kept in its history, as a retcon or as a correction.
class _ReviseDialog extends StatefulWidget {
  const _ReviseDialog({required this.fact, required this.actions});
  final CanonFact fact;
  final ReviewActions actions;

  @override
  State<_ReviseDialog> createState() => _ReviseDialogState();
}

class _ReviseDialogState extends State<_ReviseDialog> {
  late final _statement = TextEditingController(text: widget.fact.statement);
  final _reason = TextEditingController();
  bool _minor = false;

  @override
  void dispose() {
    _statement.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormDialog(
    title: 'Revise the statement',
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'It is on the record as ${widget.fact.status.label}: the wording it has now is kept in its history.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _statement,
          minLines: 2,
          maxLines: 5,
          decoration: const InputDecoration(labelText: 'New statement'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _reason,
          decoration: const InputDecoration(labelText: 'Reason for the change', hintText: 'Why is this changing?'),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _minor,
          onChanged: (v) => setState(() => _minor = v ?? false),
          title: const Text('Only a correction of wording (a typo, a clearer phrase), not a retcon'),
        ),
      ],
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(
        onPressed: () {
          widget.actions.canon((c) {
            c.revise(widget.fact.id, _statement.text, reason: _reason.text, minor: _minor);
            return true;
          });
          Navigator.of(context).pop();
        },
        child: Text(_minor ? 'Correct the wording' : 'Retcon it'),
      ),
    ],
  );
}
