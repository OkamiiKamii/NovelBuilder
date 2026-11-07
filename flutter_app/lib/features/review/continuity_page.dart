import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/form_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/continuity/rules.dart';
import '../../shared/domain/continuity/text.dart' show formatRuleDuration;
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/review.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/timeline/narrative.dart' show nodeLabel;
import '../workspace/area_switch.dart';
import 'review_page.dart' show decisionWord;
import 'review_providers.dart';
import 'widgets/review_parts.dart';

const _tabs = {'issues': 'Issues', 'reviewed': 'Reviewed', 'tracked': 'What is tracked'};

/// A tracked rule as one line: "Mira: deceased from Chapter 2".
({String subject, String detail, bool broken}) describeRule(ContinuityRule rule, StoryModel model) {
  String? name(String? id) => id == null ? null : model.entries[id]?.name;
  String? title(String? id) => id == null ? null : model.nodes[id]?.title;
  final span =
      '${title(rule.fromNodeId) != null ? 'from ${title(rule.fromNodeId)}' : 'from the start'}'
      '${title(rule.untilNodeId) != null ? ' until ${title(rule.untilNodeId)}' : ''}';
  final subject = name(rule.entryId) ?? 'An entry that was removed';
  switch (rule.kind) {
    case 'travel':
      return (
        subject: '$subject ↔ ${name(rule.toEntryId) ?? 'a place that was removed'}',
        detail: rule.amount != null ? formatRuleDuration(rule.amount!, rule.unit) : 'No time recorded',
        broken: name(rule.entryId) == null || name(rule.toEntryId) == null || rule.amount == null,
      );
    case 'power':
      return (
        subject: subject,
        detail:
            '${rule.label.isNotEmpty ? rule.label : 'Rule'} · blocked by: '
            '${rule.words.isNotEmpty ? rule.words.join(', ') : 'nothing yet'} '
            '(${rule.scope == 'paragraph' ? 'same paragraph' : 'anywhere in the scene'})',
        broken: name(rule.entryId) == null || rule.words.isEmpty,
      );
    case 'possession':
      final state = rule.state == 'held'
          ? 'held by ${name(rule.holderId) ?? 'someone who was removed'}'
          : (rule.state ?? 'lost');
      return (
        subject: subject,
        detail: '$state $span',
        broken: name(rule.entryId) == null || (rule.state == 'held' && name(rule.holderId) == null),
      );
  }
  final state = rule.state == 'deceased'
      ? 'deceased'
      : (rule.label.isNotEmpty ? rule.label : stateLabels[rule.state ?? 'absent']!.toLowerCase());
  return (
    subject: subject,
    detail:
        '$state $span${rule.state == 'condition' ? ' · would not fit: ${rule.words.isNotEmpty ? rule.words.join(', ') : 'nothing yet'}' : ''}',
    broken: name(rule.entryId) == null || (rule.state == 'condition' && rule.words.isEmpty),
  );
}

/// CONTINUITY
/// The manuscript read against what the author tracks (deaths, losses, travel times, the limits of a power) and against
/// the ages and colours in character profiles. Matched by words, so every finding "appears to". A check only reads; the
/// author fixes the text, updates canon (after confirming the exact change), marks it intentional, or dismisses it.
class ContinuityPage extends ConsumerStatefulWidget {
  const ContinuityPage({super.key, this.tab});
  final String? tab;

  @override
  ConsumerState<ContinuityPage> createState() => _ContinuityPageState();
}

class _ContinuityPageState extends ConsumerState<ContinuityPage> {
  late String _tab = _tabs.containsKey(widget.tab) ? widget.tab! : 'issues';
  Severity? _severity;
  String? _category;
  String? _nodeId;
  String? _explaining;
  final _reason = TextEditingController();

  @override
  void didUpdateWidget(ContinuityPage old) {
    super.didUpdateWidget(old);
    if (old.tab != widget.tab && _tabs.containsKey(widget.tab)) _tab = widget.tab!;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(reviewDataProvider);
    if (data == null) return const PageScaffold(title: 'Continuity', child: SizedBox.shrink());
    final theme = Theme.of(context);
    final model = data.model;
    final actions = ReviewActions(context, data.novelId);
    final result = data.manuscript;
    final open = result.open;
    final counts = {for (final s in Severity.values) s: open.where((i) => i.severity == s).length};
    final chapter = open.any((i) => i.nodeId == _nodeId) ? _nodeId : null;
    final visible = [
      for (final i in open)
        if ((_severity == null || i.severity == _severity) &&
            (_category == null || i.category == _category) &&
            (chapter == null || i.nodeId == chapter))
          i,
    ];
    final places = <String, String>{for (final i in open) i.nodeId: i.nodeTitle};

    Widget excerpt(Issue issue) {
      final at = issue.match.isEmpty ? -1 : issue.excerpt.indexOf(issue.match);
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          border: Border(left: BorderSide(color: theme.colorScheme.outline, width: 3)),
          color: theme.colorScheme.surfaceContainerLow,
        ),
        child: at < 0
            ? Text(issue.excerpt)
            : Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: issue.excerpt.substring(0, at)),
                    TextSpan(
                      text: issue.match,
                      style: TextStyle(
                        backgroundColor: theme.colorScheme.tertiaryContainer,
                        color: theme.colorScheme.onTertiaryContainer,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    TextSpan(text: issue.excerpt.substring(at + issue.match.length)),
                  ],
                ),
              ),
      );
    }

    Future<void> updateCanon(Issue issue) async {
      final ok = await showConfirmDialog(
        context,
        title: 'Update canon?',
        message: '${issue.fixSummary} The manuscript is not changed.',
        confirmLabel: 'Update canon',
      );
      if (!ok) return;
      final done = actions.rules((c) {
        c.applyFix(issue.fix!);
        return true;
      });
      if (done == true) actions.tell('Canon updated.');
    }

    Widget issueCard(Issue issue) => Card.outlined(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 6,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SeverityChip(issue.severity),
                Tag(issueCategoryLabels[issue.category]!),
                Text('${issue.nodeTitle} · paragraph ${issue.block + 1}', style: theme.textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 6),
            Text(issue.message),
            excerpt(issue),
            Wrap(
              spacing: 4,
              children: [
                for (final id in issue.entryIds)
                  if (model.entries[id] case final e?)
                    TextButton(
                      onPressed: () => actions.openEntry(e.id, character: e.category == 'character'),
                      child: Text(e.name),
                    ),
                if (issue.ruleId != null)
                  TextButton(onPressed: () => setState(() => _tab = 'tracked'), child: const Text('What is tracked')),
              ],
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton(onPressed: () => actions.openChapter(issue.nodeId), child: const Text('Fix manuscript')),
                if (issue.fix != null)
                  OutlinedButton(onPressed: () => updateCanon(issue), child: const Text('Update canon…')),
                OutlinedButton(
                  onPressed: () => setState(() {
                    _explaining = _explaining == issue.key ? null : issue.key;
                    _reason.clear();
                  }),
                  child: const Text('Mark as intentional…'),
                ),
                TextButton(
                  onPressed: () =>
                      actions.decide(issue.key, issue.message, ReviewDecision.dismissed, nodeId: issue.nodeId),
                  child: const Text('Dismiss'),
                ),
              ],
            ),
            if (_explaining == issue.key) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _reason,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Why is this intentional?',
                  hintText: 'A note for your future self',
                  isDense: true,
                ),
              ),
              Wrap(
                spacing: 6,
                children: [
                  for (final r in intentionalReasons) ActionChip(label: Text(r), onPressed: () => _reason.text = r),
                ],
              ),
              Wrap(
                spacing: 8,
                children: [
                  TextButton(onPressed: () => setState(() => _explaining = null), child: const Text('Cancel')),
                  FilledButton.tonal(
                    onPressed: () {
                      actions.decide(
                        issue.key,
                        issue.message,
                        ReviewDecision.intentional,
                        note: _reason.text,
                        nodeId: issue.nodeId,
                      );
                      setState(() => _explaining = null);
                    },
                    child: const Text('Save as intentional'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );

    final rules = data.rules;
    final header = open.isEmpty
        ? 'No open issues'
        : '${open.length} open ${open.length == 1 ? 'issue' : 'issues'} · ${counts[Severity.critical]} critical · '
              '${counts[Severity.warning]} ${counts[Severity.warning] == 1 ? 'warning' : 'warnings'} · ${counts[Severity.info]} info';

    return PageScaffold(
      title: 'Continuity',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: reviewParts, current: '/review/continuity'),
          const SizedBox(height: 12),
          Semantics(liveRegion: true, child: Text(header, style: theme.textTheme.titleSmall)),
          Text(
            'Read ${result.scanned.paragraphs} ${result.scanned.paragraphs == 1 ? 'paragraph' : 'paragraphs'} in '
            '${result.scanned.documents} ${result.scanned.documents == 1 ? 'chapter or scene' : 'chapters and scenes'} '
            'against ${result.scanned.rules} tracked ${result.scanned.rules == 1 ? 'rule' : 'rules'} and the character '
            'profiles, as saved now. A check only reads: it never changes your text or your canon.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: [
              for (final MapEntry(:key, :value) in _tabs.entries)
                ButtonSegment(
                  value: key,
                  label: Text(
                    '$value (${switch (key) {
                      'issues' => open.length,
                      'reviewed' => result.resolved.length + result.stale.length,
                      _ => rules.length,
                    }})',
                  ),
                ),
            ],
            selected: {_tab},
            showSelectedIcon: false,
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
          const SizedBox(height: 12),
          if (_tab == 'issues') ...[
            if (open.isNotEmpty)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  SizedBox(
                    width: 200,
                    child: DropdownButtonFormField<Severity?>(
                      initialValue: _severity,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Severity', isDense: true),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Every severity')),
                        for (final s in Severity.values)
                          DropdownMenuItem(value: s, child: Text('${s.label} (${counts[s]})')),
                      ],
                      onChanged: (v) => setState(() => _severity = v),
                    ),
                  ),
                  SizedBox(
                    width: 220,
                    child: DropdownButtonFormField<String?>(
                      initialValue: _category,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Kind of check', isDense: true),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Every kind of check')),
                        for (final c in issueCategories)
                          if (open.any((i) => i.category == c))
                            DropdownMenuItem(value: c, child: Text(issueCategoryLabels[c]!)),
                      ],
                      onChanged: (v) => setState(() => _category = v),
                    ),
                  ),
                  SizedBox(
                    width: 220,
                    child: DropdownButtonFormField<String?>(
                      initialValue: chapter,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Chapter', isDense: true),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Whole manuscript')),
                        for (final MapEntry(:key, :value) in places.entries)
                          DropdownMenuItem(
                            value: key,
                            child: Text(value, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) => setState(() => _nodeId = v),
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 8),
            if (open.isEmpty)
              Card.outlined(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        rules.isEmpty && result.resolved.isEmpty
                            ? 'Tell the checker what must stay true'
                            : 'Nothing to review',
                        style: theme.textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        rules.isEmpty
                            ? 'Record who has died, what has been lost, how far apart places are and what your magic '
                                  'cannot do. Every check then reads the manuscript against those, and against the ages '
                                  'and colours in your character profiles.'
                            : 'The manuscript agrees with everything you are tracking, as far as a word-by-word reading '
                                  'can tell.',
                      ),
                      if (rules.isEmpty)
                        Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: FilledButton(
                            onPressed: () => setState(() => _tab = 'tracked'),
                            child: const Text('Choose what to track'),
                          ),
                        ),
                    ],
                  ),
                ),
              )
            else if (visible.isEmpty)
              const Text('No issues match these filters.')
            else
              for (final s in Severity.values)
                if (visible.where((i) => i.severity == s).toList() case final here when here.isNotEmpty) ...[
                  Tooltip(
                    message: s.hint,
                    child: Semantics(
                      header: true,
                      child: Text('${s.label} (${here.length})', style: theme.textTheme.titleMedium),
                    ),
                  ),
                  const SizedBox(height: 4),
                  for (final i in here) issueCard(i),
                ],
          ],
          if (_tab == 'reviewed') ...[
            if (result.resolved.isEmpty && result.stale.isEmpty)
              const Text('Issues you mark as intentional or dismiss are kept here, so you can change your mind.'),
            for (final (:issue, :resolution) in result.resolved)
              Card.outlined(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Wrap(
                        spacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Tag(decisionWord(resolution.decision)),
                          Tag(issueCategoryLabels[issue.category]!),
                          Text('${issue.nodeTitle} · paragraph ${issue.block + 1}', style: theme.textTheme.bodySmall),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(issue.message),
                      if (resolution.note.isNotEmpty)
                        Text('Your note: ${resolution.note}', style: theme.textTheme.bodySmall),
                      excerpt(issue),
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: OutlinedButton(
                          onPressed: () => actions.reopen(resolution.id),
                          child: const Text('Reopen'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (result.stale.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'No longer raised: the text or what is tracked has changed since',
                style: theme.textTheme.titleSmall,
              ),
              for (final r in result.stale)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(r.message.isEmpty ? r.key : r.message),
                  subtitle: r.note.isEmpty ? null : Text('Your note: ${r.note}'),
                  trailing: TextButton(
                    onPressed: () => actions.reopen(r.id),
                    child: const Text('Remove this decision'),
                  ),
                ),
            ],
          ],
          if (_tab == 'tracked') ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final k in ruleKinds)
                  OutlinedButton.icon(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => RuleForm(kind: k, actions: actions),
                    ),
                    icon: const Icon(Icons.add),
                    label: Text(ruleKindLabels[k]!),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            if (rules.isEmpty)
              const Text(
                'Nothing is tracked yet. Ages, eye colours and hair colours in character profiles are checked without '
                'any setup.',
              ),
            for (final k in ruleKinds)
              if (rules.where((r) => r.kind == k).toList() case final here when here.isNotEmpty) ...[
                Semantics(
                  header: true,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(ruleKindLabels[k]!, style: theme.textTheme.titleMedium),
                  ),
                ),
                for (final rule in here)
                  Builder(
                    builder: (context) {
                      final (:subject, :detail, :broken) = describeRule(rule, model);
                      return Card.outlined(
                        margin: const EdgeInsets.only(top: 6),
                        child: ListTile(
                          title: Text(subject),
                          subtitle: Text(
                            [
                              detail,
                              if (rule.aliases.isNotEmpty) 'Also written as: ${rule.aliases.join(', ')}',
                              if (broken) 'This cannot be checked as it stands: something it needs is missing.',
                            ].join('\n'),
                          ),
                          trailing: Wrap(
                            children: [
                              IconButton(
                                tooltip: 'Edit $subject',
                                onPressed: () => showDialog<void>(
                                  context: context,
                                  builder: (_) => RuleForm(kind: rule.kind, rule: rule, actions: actions),
                                ),
                                icon: const Icon(Icons.edit_outlined),
                              ),
                              IconButton(
                                tooltip: 'Stop tracking $subject',
                                onPressed: () async {
                                  final ok = await showConfirmDialog(
                                    context,
                                    title: 'Stop tracking this?',
                                    message:
                                        'Stop tracking “$subject: $detail”? Decisions you made about its findings are '
                                        'kept, and simply stop applying.',
                                    confirmLabel: 'Stop tracking',
                                    destructive: true,
                                  );
                                  if (ok) {
                                    actions.rules((c) {
                                      c.removeRule(rule.id);
                                      return true;
                                    });
                                  }
                                },
                                icon: const Icon(Icons.delete_outline),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
              ],
          ],
        ],
      ),
    );
  }
}

/// Records or edits one thing the manuscript is checked against.
class RuleForm extends ConsumerStatefulWidget {
  const RuleForm({super.key, required this.kind, required this.actions, this.rule});
  final String kind;
  final ContinuityRule? rule;
  final ReviewActions actions;

  @override
  ConsumerState<RuleForm> createState() => _RuleFormState();
}

class _RuleFormState extends ConsumerState<RuleForm> {
  late String? _entryId = widget.rule?.entryId;
  late String _state = widget.rule?.state ?? (widget.kind == 'possession' ? 'lost' : 'deceased');
  late final _label = TextEditingController(text: widget.rule?.label ?? '');
  late final _words = TextEditingController(text: (widget.rule?.words ?? const []).join(', '));
  late final _aliases = TextEditingController(text: (widget.rule?.aliases ?? const []).join(', '));
  late String _scope = widget.rule?.scope ?? 'scene';
  late String? _holderId = widget.rule?.holderId;
  late String? _toEntryId = widget.rule?.toEntryId;
  late final _amount = TextEditingController(
    text: widget.rule?.amount == null ? '' : formatRuleDuration(widget.rule!.amount!, 'days').split(' ').first,
  );
  late String _unit = widget.rule?.unit ?? 'days';
  late String? _fromNodeId = widget.rule?.fromNodeId;
  late String? _untilNodeId = widget.rule?.untilNodeId;

  @override
  void dispose() {
    for (final c in [_label, _words, _aliases, _amount]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(reviewDataProvider);
    if (data == null) return const SizedBox.shrink();
    final model = data.model;
    final kind = widget.kind;
    final preferred = {'status': 'character', 'possession': 'item', 'travel': 'location', 'power': 'power'}[kind];
    final all = stableSorted(model.entries.values, (a, b) => localeCompare(a.name, b.name));
    // The fitting category when the Codex has it; otherwise everything, so custom categories work too.
    final pool = all.any((e) => e.category == preferred) && kind != 'power'
        ? [
            for (final e in all)
              if (e.category == preferred || e.id == _entryId || e.id == _toEntryId) e,
          ]
        : all;
    final characters = [
      for (final e in all)
        if (e.category == 'character') e,
    ];
    final subjectLabel = {
      'status': 'Character',
      'possession': 'Item',
      'travel': 'From',
      'power': 'Ability or power',
    }[kind]!;
    final chapters = stableSorted(
      model.nodes.values.where((n) => model.order.position.containsKey(n.id)),
      (a, b) => model.order.position[a.id]!.compareTo(model.order.position[b.id]!),
    );
    Widget entryMenu(String label, String? value, List<Entry> list, ValueChanged<String?> set) =>
        DropdownButtonFormField<String>(
          initialValue: list.any((e) => e.id == value) ? value : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: label, isDense: true),
          hint: const Text('Choose…'),
          items: [
            for (final e in list)
              DropdownMenuItem(
                value: e.id,
                child: Text(e.name, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: set,
        );
    Widget chapterMenu(String label, String? value, String none, ValueChanged<String?> set) =>
        DropdownButtonFormField<String>(
          initialValue: chapters.any((n) => n.id == value) ? value : '',
          isExpanded: true,
          decoration: InputDecoration(labelText: label, isDense: true),
          items: [
            DropdownMenuItem(value: '', child: Text(none)),
            for (final n in chapters)
              DropdownMenuItem(
                value: n.id,
                child: Text(nodeLabel(model, n.id), overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (v) => set(v == null || v.isEmpty ? null : v),
        );
    const gap = SizedBox(height: 12);

    return FormDialog(
      title: '${widget.rule != null ? 'Edit' : 'Track'}: ${ruleKindLabels[kind]}',
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(ruleKindHints[kind]!, style: Theme.of(context).textTheme.bodySmall),
          gap,
          entryMenu(subjectLabel, _entryId, pool, (v) => setState(() => _entryId = v)),
          gap,
          TextField(
            controller: _aliases,
            decoration: const InputDecoration(
              labelText: 'Also written as (optional)',
              hintText: 'the prince, the heir',
              isDense: true,
            ),
          ),
          if (kind == 'status' || kind == 'possession') ...[
            gap,
            DropdownButtonFormField<String>(
              initialValue: _state,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'State', isDense: true),
              items: [
                for (final s in kind == 'status' ? statusStates : possessionStates)
                  DropdownMenuItem(value: s, child: Text(stateLabels[s]!)),
              ],
              onChanged: (v) => setState(() => _state = v ?? _state),
            ),
          ],
          if (kind == 'possession' && _state == 'held') ...[
            gap,
            entryMenu('Held by', _holderId, characters, (v) => setState(() => _holderId = v)),
          ],
          if (kind == 'travel') ...[
            gap,
            entryMenu('To', _toEntryId, pool, (v) => setState(() => _toEntryId = v)),
            gap,
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    decoration: const InputDecoration(labelText: 'How long it takes', isDense: true),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 140,
                  child: DropdownButtonFormField<String>(
                    initialValue: _unit,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Unit', isDense: true),
                    items: [for (final u in ruleTimeUnits) DropdownMenuItem(value: u, child: Text(u))],
                    onChanged: (v) => setState(() => _unit = v ?? 'days'),
                  ),
                ),
              ],
            ),
          ],
          if (kind == 'power' || (kind == 'status' && _state != 'deceased')) ...[
            gap,
            TextField(
              controller: _label,
              decoration: InputDecoration(
                labelText: kind == 'power' ? 'The rule, in words' : 'In your words',
                hintText: kind == 'power' ? 'needs direct sunlight' : 'imprisoned in the Keep, lost his left hand',
                isDense: true,
              ),
            ),
          ],
          if (kind == 'power' || (kind == 'status' && _state == 'condition')) ...[
            gap,
            TextField(
              controller: _words,
              decoration: InputDecoration(
                labelText: kind == 'power' ? 'Words that mean it cannot be used' : 'Words that would not fit',
                hintText: kind == 'power' ? 'underground, night, cave' : 'both hands, ran',
                isDense: true,
              ),
            ),
          ],
          if (kind == 'power') ...[
            gap,
            DropdownButtonFormField<String>(
              initialValue: _scope,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Look for those words', isDense: true),
              items: const [
                DropdownMenuItem(value: 'scene', child: Text('Anywhere in the same chapter or scene')),
                DropdownMenuItem(value: 'paragraph', child: Text('In the same paragraph')),
              ],
              onChanged: (v) => setState(() => _scope = v ?? 'scene'),
            ),
          ],
          if (kind == 'status' || kind == 'possession') ...[
            gap,
            chapterMenu('From', _fromNodeId, 'From the start', (v) => setState(() => _fromNodeId = v)),
            gap,
            chapterMenu('Until', _untilNodeId, 'Still true at the end', (v) => setState(() => _untilNodeId = v)),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final amount = double.tryParse(_amount.text.trim());
            final problem = _entryId == null
                ? 'Choose ${kind == 'travel' ? 'where the journey starts' : 'the ${subjectLabel.toLowerCase()}'}.'
                : kind == 'travel' && (_toEntryId == null || _toEntryId == _entryId)
                ? 'Choose a different place for the journey to end.'
                : kind == 'travel' && !(amount != null && amount > 0)
                ? 'Say how long the journey takes.'
                : kind == 'possession' && _state == 'held' && _holderId == null
                ? 'Choose who holds it.'
                : (kind == 'power' || (kind == 'status' && _state == 'condition')) && _words.text.trim().isEmpty
                ? 'Add at least one word to look for.'
                : null;
            if (problem != null) return widget.actions.tell(problem);
            final input = {
              'entryId': _entryId,
              'state': _state,
              'label': _label.text,
              'words': _words.text,
              'aliases': _aliases.text,
              'scope': _scope,
              'holderId': _holderId,
              'toEntryId': _toEntryId,
              'amount': amount,
              'unit': _unit,
              'fromNodeId': _fromNodeId,
              'untilNodeId': _untilNodeId,
            };
            final done = widget.actions.rules((c) {
              if (widget.rule != null) {
                c.updateRule(widget.rule!.id, input);
              } else {
                c.createRule(kind, input);
              }
              return true;
            });
            if (done == true) Navigator.of(context).pop();
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}
