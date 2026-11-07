import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/collab/access.dart';
import '../../shared/domain/collab/collab_changes.dart';
import '../../shared/domain/collab/records.dart';
import '../../shared/domain/collab/review_files.dart';
import '../workspace/area_switch.dart';
import '../workspace/open_novel.dart';
import '../workspace/section_page.dart';
import 'collab_providers.dart';
import 'collab_widgets.dart';

enum _Tab { people, conversations, suggestions, activity }

/// The owner's side of review by file: who the novel is shared with, the review copies made for them, the feedback
/// brought back, and every conversation and suggested change, each to accept or reject. Nothing is sent by the app:
/// files go only where the author chooses.
class TeamPage extends ConsumerStatefulWidget {
  const TeamPage({super.key});

  @override
  ConsumerState<TeamPage> createState() => _TeamPageState();
}

class _TeamPageState extends ConsumerState<TeamPage> {
  var _tab = _Tab.people;
  var _openOnly = true;

  Future<void> _addPerson(BuildContext context) async {
    final result = await showDialog<({String name, String email, Role role})>(
      context: context,
      builder: (_) => const _PersonDialog(),
    );
    if (result == null || !context.mounted) return;
    runCollab(
      context,
      () => ref.read(collabActionsProvider).addMember(name: result.name, email: result.email, role: result.role),
      done: 'Added ${result.name}. Make a review copy for them to send.',
    );
  }

  Future<void> _sendCopy(BuildContext context, Member m) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    String? message;
    try {
      final result = await ref.read(collabActionsProvider).sendReviewCopy(m, origin: origin);
      if (result != null) message = '$result. It holds only what ${m.role.label.toLowerCase()} may see.';
    } on PermissionException catch (e) {
      message = e.message;
    }
    if (message != null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Future<void> _bringIn(BuildContext context) async {
    final picked = await ref.read(backupFilesProvider).pickBackup();
    if (picked == null || !context.mounted) return;
    final FeedbackPreview preview;
    try {
      preview = ref.read(collabActionsProvider).previewFeedback(picked.text);
    } on CollabException catch (e) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('This feedback cannot be brought in'),
          content: Text('“${picked.name}”: ${e.message}'),
          actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
        ),
      );
      return;
    }
    if (!context.mounted) return;
    bool root(Map<String, Object?> r) => r['parentId'] == null;
    final lines = [
      if (preview.count('comments', where: (r) => root(r) && r['kind'] == 'comment') case final n when n > 0)
        plural(n, 'new comment'),
      if (preview.count('comments', where: (r) => !root(r)) case final n when n > 0) plural(n, 'reply', 'replies'),
      if (preview.count('comments', where: (r) => r['kind'] == 'reaction') case final n when n > 0)
        plural(n, 'reaction'),
      if (preview.count('comments', where: (r) => r['kind'] == 'feedback') case final n when n > 0)
        plural(n, 'feedback form'),
      if (preview.count('suggestions') case final n when n > 0) plural(n, 'suggestion'),
      if (preview.writes.where((w) => w.value == null).length case final n when n > 0) plural(n, 'deletion'),
    ];
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: Text('Feedback from ${preview.member.name}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${preview.member.role.label}, sent ${whenWords(preview.sentAt)}. '
                '${lines.isEmpty ? 'Nothing new.' : 'It brings ${lines.join(', ')}.'}',
              ),
              if (preview.unchanged > 0) Text('${plural(preview.unchanged, 'change')} you already have.'),
              const SizedBox(height: 8),
              const Text('Nothing in the book changes: suggested changes wait for you to accept or reject each one.'),
              if (preview.refused.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  '${plural(preview.refused.length, 'change')} in the file ${preview.refused.length == 1 ? 'is' : 'are'} '
                  'not taken in, because ${preview.member.name}’s role does not allow ${preview.refused.length == 1 ? 'it' : 'them'}:',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                for (final r in preview.refused.take(8)) Text('• ${r.what}: ${r.reason}'),
                if (preview.refused.length > 8) Text('…and ${preview.refused.length - 8} more.'),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            onPressed: preview.writes.isEmpty ? null : () => Navigator.of(context).pop(true),
            child: const Text('Take it in'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    runCollab(
      context,
      () => ref.read(collabActionsProvider).importFeedback(preview),
      done: 'Took in the feedback from ${preview.member.name}.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const SectionPage(destination: Destination.review);
    final data = ref.watch(collabProvider);
    if (data == null) return const LoadingState();
    if (data.me.role != Role.owner) {
      return const PageScaffold(
        title: 'Team and feedback',
        child: EmptyState(
          icon: Icons.groups_outlined,
          title: 'This is a review copy',
          message:
              'The team is kept by the novel’s owner. Your comments and suggestions go back in your feedback file, '
              'from Write.',
        ),
      );
    }
    final threads = [
      for (final t in data.threads())
        if (!_openOnly || !t.root.resolved) t,
    ];
    final suggestions = _openOnly ? data.open : data.suggestions;
    final openThreads = data.threads().where((t) => !t.root.resolved).length;
    final body = switch (_tab) {
      _Tab.people =>
        data.members.isEmpty
            ? const EmptyState(
                icon: Icons.person_add_alt,
                title: 'Nobody yet',
                message:
                    'Add someone, then make a review copy for them. You send it yourself, by email or a drive; '
                    'their feedback file comes back the same way.',
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [for (final m in data.members) _MemberCard(member: m, onSend: _sendCopy)],
              ),
      _Tab.conversations =>
        threads.isEmpty
            ? Text(_openOnly ? 'No open conversations.' : 'No conversations yet.')
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [for (final t in threads) ThreadCard(key: ValueKey(t.root.id), thread: t, me: data.me)],
              ),
      _Tab.suggestions =>
        suggestions.isEmpty
            ? Text(_openOnly ? 'No suggestions waiting.' : 'No suggestions yet.')
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final s in suggestions) SuggestionCard(key: ValueKey(s.id), suggestion: s, me: data.me),
                ],
              ),
      _Tab.activity => ActivityList(activity: data.activity),
    };
    return PageScaffold(
      title: 'Team and feedback',
      actions: [
        OutlinedButton.icon(
          onPressed: () => _addPerson(context),
          icon: const Icon(Icons.person_add_alt),
          label: const Text('Add a person…'),
        ),
        FilledButton.icon(
          onPressed: () => _bringIn(context),
          icon: const Icon(Icons.move_to_inbox_outlined),
          label: const Text('Bring in feedback…'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AreaSwitch(parts: reviewParts, current: '/review/team'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final t in _Tab.values)
                ChoiceChip(
                  selected: _tab == t,
                  onSelected: (_) => setState(() => _tab = t),
                  label: Text(switch (t) {
                    _Tab.people => 'People (${data.members.length})',
                    _Tab.conversations => 'Conversations ($openThreads open)',
                    _Tab.suggestions => 'Suggestions (${data.open.length} waiting)',
                    _Tab.activity => 'Activity',
                  }),
                ),
            ],
          ),
          if (_tab == _Tab.conversations || _tab == _Tab.suggestions)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(_tab == _Tab.conversations ? 'Open conversations only' : 'Waiting suggestions only'),
              value: _openOnly,
              onChanged: (v) => setState(() => _openOnly = v),
            ),
          const SizedBox(height: 12),
          body,
        ],
      ),
    );
  }
}

class _MemberCard extends ConsumerWidget {
  const _MemberCard({required this.member, required this.onSend});
  final Member member;
  final Future<void> Function(BuildContext context, Member m) onSend;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final m = member;
    final actions = ref.read(collabActionsProvider);
    final status = switch (m.status) {
      'revoked' => 'Removed: their feedback is not taken in',
      _ when m.lastSyncAt != null => 'Feedback last brought in ${whenWords(m.lastSyncAt!)}',
      _ => 'No feedback brought in yet',
    };
    final editable = reviewRoles.contains(m.role);
    return Card.outlined(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(m.name, style: theme.textTheme.titleMedium),
            Text('${m.role.label}${m.email.isEmpty ? '' : ' · ${m.email}'}', style: muted),
            Text(status, style: muted),
            if (!editable)
              Text(
                'A ${m.role.label.toLowerCase()} works with the original app’s live sharing, which this app does not '
                'do. Their records are kept.',
                style: muted,
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (!m.revoked && editable)
                  FilledButton.tonalIcon(
                    onPressed: () => onSend(context, m),
                    icon: const Icon(Icons.ios_share),
                    label: const Text('Make a review copy…'),
                  ),
                if (!m.revoked && editable)
                  SizedBox(
                    width: 220,
                    child: DropdownButtonFormField<Role>(
                      key: ValueKey('role:${m.id}:${m.role.name}'),
                      initialValue: m.role,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Role', isDense: true),
                      items: [for (final r in reviewRoles) DropdownMenuItem(value: r, child: Text(r.label))],
                      onChanged: (r) {
                        if (r != null && r != m.role) {
                          runCollab(
                            context,
                            () => actions.updateMember(m, {'role': r.name}),
                            done: '${m.name} is now ${r.label}. Their next review copy follows it.',
                          );
                        }
                      },
                    ),
                  ),
                if (m.revoked)
                  TextButton(
                    onPressed: () => runCollab(context, () => actions.updateMember(m, {'status': 'active'})),
                    child: const Text('Restore'),
                  )
                else
                  TextButton(
                    onPressed: () async {
                      final ok = await showConfirmDialog(
                        context,
                        title: 'Remove ${m.name}?',
                        message:
                            'Feedback files from them will no longer be taken in. What they have already said '
                            'stays, and you can restore them later.',
                        confirmLabel: 'Remove',
                        destructive: true,
                      );
                      if (ok && context.mounted) {
                        runCollab(context, () => actions.updateMember(m, {'status': 'revoked'}));
                      }
                    },
                    child: const Text('Remove'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PersonDialog extends StatefulWidget {
  const _PersonDialog();

  @override
  State<_PersonDialog> createState() => _PersonDialogState();
}

class _PersonDialogState extends State<_PersonDialog> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  var _role = Role.reader;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).textTheme.bodySmall;
    return AlertDialog(
      title: const Text('Add a person'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _name,
              autofocus: true,
              decoration: InputDecoration(labelText: 'Name', errorText: _error),
            ),
            TextField(
              controller: _email,
              decoration: const InputDecoration(
                labelText: 'Email (optional)',
                helperText: 'For your own reference: the app sends nothing.',
              ),
            ),
            const SizedBox(height: 12),
            RadioGroup<Role>(
              groupValue: _role,
              onChanged: (r) => setState(() => _role = r ?? _role),
              child: Column(
                children: [
                  for (final r in reviewRoles)
                    RadioListTile<Role>(
                      value: r,
                      title: Text(r.label),
                      subtitle: Text(r.summary, style: muted),
                      contentPadding: EdgeInsets.zero,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            if (_name.text.trim().isEmpty) {
              setState(() => _error = 'Give the person a name.');
              return;
            }
            Navigator.of(context).pop((name: _name.text, email: _email.text, role: _role));
          },
          child: const Text('Add'),
        ),
      ],
    );
  }
}
