import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/domain/collab/access.dart';
import '../../shared/domain/collab/collab_changes.dart';
import '../../shared/domain/collab/hunks.dart';
import '../../shared/domain/collab/records.dart';
import '../../shared/domain/json.dart';
import 'collab_providers.dart';

/// Runs a change, saying why when it cannot be made. Nothing is changed when it fails.
bool runCollab(BuildContext context, void Function() change, {String? done}) {
  String? problem;
  try {
    change();
  } on PermissionException catch (e) {
    problem = e.message;
  } on CollabException catch (e) {
    problem = e.message;
  } on StaleWriteException {
    problem = 'This was changed elsewhere in the meantime, so nothing was saved. Look again and retry.';
  }
  final message = problem ?? done;
  if (message != null && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
  return problem == null;
}

String whenWords(num millis) {
  final d = DateTime.fromMillisecondsSinceEpoch(millis.toInt());
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '${d.day} ${months[d.month - 1]} ${d.year}, $hour:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'am' : 'pm'}';
}

/// One conversation: what it is about, the first message, its replies, and what the person here may do with it.
class ThreadCard extends ConsumerStatefulWidget {
  const ThreadCard({super.key, required this.thread, required this.me, this.showTarget = true});
  final Thread thread;
  final Me me;
  final bool showTarget;

  @override
  ConsumerState<ThreadCard> createState() => _ThreadCardState();
}

class _ThreadCardState extends ConsumerState<ThreadCard> {
  final _reply = TextEditingController();

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Widget _message(BuildContext context, Comment c) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final actions = ref.read(collabActionsProvider);
    final mine = c.authorId == widget.me.id;
    final mayDelete = mine || can(widget.me.role, Capability.decide);
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(c.authorName.isEmpty ? 'Someone' : c.authorName, style: theme.textTheme.titleSmall),
              Text('${c.authorRole.label} · ${whenWords(c.createdAt)}', style: muted),
            ],
          ),
          if (c.deleted)
            Text('(Deleted by its writer.)', style: muted)
          else if (c.kind == 'reaction')
            Text('Reaction: ${c.body}')
          else if (c.kind == 'feedback') ...[
            Text(
              'Feedback: ${[for (final q in feedbackQuestions)
                if (c.ratings[q.key] case final n?) '${q.label} ${n.toInt()} of 5'].join(' · ')}',
            ),
            if (c.body.isNotEmpty) Text(c.body),
          ] else
            Text(c.body),
          if (mayDelete && !c.deleted)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () async {
                  final ok = await showConfirmDialog(
                    context,
                    title: 'Delete this message?',
                    message: c.isRoot
                        ? 'The conversation goes with it, unless others have replied: then only these words go.'
                        : 'Only this reply goes.',
                    confirmLabel: 'Delete',
                    destructive: true,
                  );
                  if (ok && context.mounted) runCollab(context, () => actions.remove(c));
                },
                child: const Text('Delete'),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final (:root, :replies) = widget.thread;
    final actions = ref.read(collabActionsProvider);
    final mayResolve = can(widget.me.role, Capability.decide) || widget.me.role == Role.editor;
    final mayReply = can(widget.me.role, Capability.comment);
    return Card.outlined(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (widget.showTarget) Text('On “${root.targetLabel}”', style: theme.textTheme.labelLarge),
                if (root.resolved)
                  Chip(
                    avatar: const Icon(Icons.check_circle_outline, size: 16),
                    label: Text('Resolved${root.resolvedBy == null ? '' : ' by ${root.resolvedBy}'}'),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            if (root.quote.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 6),
                padding: const EdgeInsets.fromLTRB(10, 4, 4, 4),
                decoration: BoxDecoration(
                  border: Border(left: BorderSide(color: theme.colorScheme.outline, width: 3)),
                ),
                child: Text('“${root.quote}”', style: muted?.copyWith(fontStyle: FontStyle.italic)),
              ),
            _message(context, root),
            for (final r in replies)
              Padding(padding: const EdgeInsetsDirectional.only(start: 16), child: _message(context, r)),
            if (mayReply) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _reply,
                minLines: 1,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Reply', isDense: true),
              ),
            ],
            Wrap(
              spacing: 8,
              children: [
                if (mayReply)
                  TextButton(
                    onPressed: () {
                      if (runCollab(context, () => actions.reply(root, _reply.text))) _reply.clear();
                    },
                    child: const Text('Send reply'),
                  ),
                if (mayResolve)
                  TextButton(
                    onPressed: () => runCollab(context, () => actions.setResolved(root, !root.resolved)),
                    child: Text(root.resolved ? 'Re-open' : 'Resolve'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// One suggestion: each change of a text suggestion, removed words struck through and added words shown, or the
/// field changes of a codex suggestion; an author accepts or rejects each, its writer may withdraw it.
class SuggestionCard extends ConsumerWidget {
  const SuggestionCard({super.key, required this.suggestion, required this.me});
  final Suggestion suggestion;
  final Me me;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final actions = ref.read(collabActionsProvider);
    final s = suggestion;
    final decides = can(me.role, Capability.decide);
    final mine = s.authorId == me.id;
    Widget change(String label, String removed, String added) => Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(label, style: theme.textTheme.labelLarge),
          if (removed.isNotEmpty)
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: 'Out: ',
                    style: muted?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  TextSpan(
                    text: removed,
                    style: TextStyle(decoration: TextDecoration.lineThrough, color: theme.colorScheme.error),
                  ),
                ],
              ),
            ),
          if (added.isNotEmpty)
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: 'In: ',
                    style: muted?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  TextSpan(
                    text: added,
                    style: TextStyle(decoration: TextDecoration.underline, color: theme.colorScheme.primary),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
    final hunks = s.isText ? textHunks(s.base, s.proposed) : const <Hunk>[];
    String verdictOf(Hunk h) {
      final d = mapOrNull(s.decisions[h.id]);
      return d == null ? '' : ' (${d['verdict']} by ${d['byName']})';
    }

    return Card.outlined(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              s.isText ? 'Changes to “${s.targetLabel}”' : 'An edit to “${s.targetLabel}”',
              style: theme.textTheme.titleSmall,
            ),
            Text('Suggested by ${s.authorName} · ${whenWords(s.createdAt)} · ${s.status}', style: muted),
            if (s.note.isNotEmpty) Text('Note: ${s.note}'),
            if (s.isText)
              for (final (i, h) in hunks.indexed)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    change(
                      'Change ${i + 1} of ${hunks.length}, at paragraph ${h.at + 1}${verdictOf(h)}',
                      textOf(h.remove),
                      textOf(h.insert),
                    ),
                    if (decides && !s.decisions.containsKey(h.id))
                      Wrap(
                        spacing: 8,
                        children: [
                          FilledButton.tonal(
                            onPressed: () => runCollab(
                              context,
                              () => actions.decideText(s, h.id, accept: true),
                              done: 'Accepted. The text it replaced is in the chapter’s version history.',
                            ),
                            child: const Text('Accept'),
                          ),
                          OutlinedButton(
                            onPressed: () => runCollab(context, () => actions.decideText(s, h.id, accept: false)),
                            child: const Text('Reject'),
                          ),
                        ],
                      ),
                  ],
                )
            else ...[
              for (final c in s.changes) change(c.label, c.from, c.to),
              if (decides && s.status == 'pending')
                Wrap(
                  spacing: 8,
                  children: [
                    FilledButton.tonal(
                      onPressed: () =>
                          runCollab(context, () => actions.decideEntry(s, accept: true), done: 'Accepted.'),
                      child: const Text('Accept'),
                    ),
                    OutlinedButton(
                      onPressed: () => runCollab(context, () => actions.decideEntry(s, accept: false)),
                      child: const Text('Reject'),
                    ),
                  ],
                ),
            ],
            if (mine && s.isOpen && s.decisions.isEmpty)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(
                  onPressed: () => runCollab(context, () => actions.withdraw(s), done: 'Withdrawn.'),
                  child: const Text('Withdraw'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The record of who did what, newest first.
class ActivityList extends StatelessWidget {
  const ActivityList({super.key, required this.activity});
  final List<Activity> activity;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).textTheme.bodySmall;
    if (activity.isEmpty) return const Text('Nothing recorded yet.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final a in activity.take(200))
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('${a.actorName} ${a.verb} ${a.label}${a.count > 1 ? ' (${plural(a.count, 'time')})' : ''}'),
            subtitle: Text('${a.actorRole.label} · ${whenWords(a.at)}', style: muted),
          ),
      ],
    );
  }
}
