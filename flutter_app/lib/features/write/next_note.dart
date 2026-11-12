import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/providers.dart';
import '../characters/widgets/vault.dart';
import '../workspace/open_novel.dart';

/// A note left for the next sitting: what comes next on this page, in the author's own words, and when it was left.
typedef NextNote = ({String text, int at});

/// Words written in a sitting before leaving the page offers a note for next time.
const nextNoteAfterWords = 100;

String _key(String novelId) => 'write.nextNotes.$novelId';

/// A NOTE FOR NEXT TIME: writers stop where they know what happens next, and leave themselves a line saying so. One
/// note to a chapter or scene, for the open novel, kept in this device's settings (never in the novel itself): left
/// from under the page or as the author leaves it, shown pinned under the last line when they come back, and in the
/// day book; put away when done with.
class NextNotesNotifier extends Notifier<Map<String, NextNote>> {
  @override
  Map<String, NextNote> build() {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const {};
    final raw = ref.read(settingsStoreProvider).read(_key(novelId));
    if (raw is! Map) return const {};
    return {
      for (final MapEntry(:key, :value) in raw.entries)
        if (key is String && value is Map && value['text'] is String && (value['text'] as String).trim().isNotEmpty)
          key: (text: value['text'] as String, at: (value['at'] as num?)?.toInt() ?? 0),
    };
  }

  /// Keeps [text] as the note for [nodeId]; an empty one puts the note away.
  void set(String nodeId, String text, {DateTime? now}) {
    final novelId = ref.read(openNovelProvider);
    if (novelId == null) return;
    final next = {...state};
    if (text.trim().isEmpty) {
      next.remove(nodeId);
    } else {
      next[nodeId] = (text: text.trim(), at: (now ?? DateTime.now()).millisecondsSinceEpoch);
    }
    state = next;
    ref.read(settingsStoreProvider).write(_key(novelId), {
      for (final MapEntry(:key, :value) in next.entries) key: {'text': value.text, 'at': value.at},
    });
  }

  void clear(String nodeId) => set(nodeId, '');
}

final nextNotesProvider = NotifierProvider<NextNotesNotifier, Map<String, NextNote>>(NextNotesNotifier.new);

/// Ways to begin a note, put in the field with a press. Only a start: the author writes the rest.
const nextNoteStarts = ['Next, ', 'Finish the scene where ', 'Remember: ', 'The line I want: '];

/// The sheet for leaving (or changing) the note for [nodeId]. [leaving]: offered as the author leaves the page.
/// Returns whether a note was kept.
Future<bool> leaveNextNote(
  BuildContext context,
  WidgetRef ref, {
  required String nodeId,
  required String title,
  bool leaving = false,
}) async {
  final existing = ref.read(nextNotesProvider)[nodeId];
  // The page put down while the note is written, so its keyboard does not come back up when the note is pinned.
  FocusManager.instance.primaryFocus?.unfocus();
  final text = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useRootNavigator: true,
    builder: (_) => _NoteSheet(title: title, initial: existing?.text ?? '', leaving: leaving),
  );
  if (text == null || text.trim().isEmpty) return false;
  ref.read(nextNotesProvider.notifier).set(nodeId, text);
  return true;
}

class _NoteSheet extends StatefulWidget {
  const _NoteSheet({required this.title, required this.initial, required this.leaving});
  final String title;
  final String initial;
  final bool leaving;

  @override
  State<_NoteSheet> createState() => _NoteSheetState();
}

class _NoteSheetState extends State<_NoteSheet> {
  late final _text = TextEditingController(text: widget.initial);
  final _focus = FocusNode();

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _begin(String start) {
    _text.value = TextEditingValue(
      text: start,
      selection: TextSelection.collapsed(offset: start.length),
    );
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.leaving ? 'Before you go' : 'A note for next time',
                style: vaultHeading(context, size: 18, weight: 700),
              ),
              const SizedBox(height: 4),
              Text(
                'One line for when you come back to “${widget.title}”: what happens next, while you still know. '
                'It waits under your last line.',
                style: vaultText(context, size: 15.5, color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _text,
                focusNode: _focus,
                autofocus: true,
                style: vaultText(context, size: 17, style: FontStyle.italic),
                minLines: 2,
                maxLines: 5,
                maxLength: 280,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: 'Next, they reach the gate and…',
                ),
              ),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final s in nextNoteStarts) ActionChip(label: Text(s.trim()), onPressed: () => _begin(s)),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 8,
                runSpacing: 8,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(widget.leaving ? 'Leave without one' : 'Cancel'),
                  ),
                  ListenableBuilder(
                    listenable: _text,
                    builder: (context, _) => FilledButton.icon(
                      onPressed: _text.text.trim().isEmpty ? null : () => Navigator.of(context).pop(_text.text),
                      icon: const Icon(Icons.push_pin_outlined),
                      label: const Text('Pin the note'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The note as it waits: a slip of paper pinned at a slight angle, "Your note for next time · left 2 days ago", the
/// author's line in the book's italic, and [actions] under it.
class PinnedNote extends StatelessWidget {
  const PinnedNote({super.key, required this.note, this.actions = const [], this.ink, this.muted});

  final NextNote note;
  final List<Widget> actions;
  final Color? ink;
  final Color? muted;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final paper = Color.alphaBlend(scheme.primary.withValues(alpha: 0.14), scheme.surfaceContainerHigh);
    return Semantics(
      container: true,
      label: 'Your note for next time',
      child: Transform.rotate(
        angle: -0.6 * math.pi / 180,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // The slip the whole width, so the pin is on it and its presses sit at its far edge.
            SizedBox(
              width: double.infinity,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: paper,
                  borderRadius: BorderRadius.circular(4),
                  border: Border(left: BorderSide(color: scheme.primary, width: 3)),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 6, offset: const Offset(1, 3)),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 12, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'YOUR NOTE FOR NEXT TIME · left ${formatRelative(context, note.at)}',
                        style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        note.text,
                        style: vaultText(context, size: 17, style: FontStyle.italic, color: scheme.onSurface),
                      ),
                      if (actions.isNotEmpty) Wrap(alignment: WrapAlignment.end, children: actions),
                    ],
                  ),
                ),
              ),
            ),
            // The pin.
            Positioned(
              top: -5,
              right: 18,
              child: ExcludeSemantics(
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: scheme.primary,
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 2)],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Under the page's last line: the note left for this sitting, pinned, to change or be done with; or, with none, a
/// quiet way to leave one. Never touches the text.
class NextNoteSlip extends ConsumerWidget {
  const NextNoteSlip({super.key, required this.nodeId, required this.title, this.offer = true});

  final String nodeId;
  final String title;

  /// Whether to offer leaving a note when there is none (not in focus mode).
  final bool offer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final note = ref.watch(nextNotesProvider)[nodeId];
    if (note == null && !offer) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
      child: note == null
          ? Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () => leaveNextNote(context, ref, nodeId: nodeId, title: title),
                icon: const Icon(Icons.sticky_note_2_outlined, size: 18),
                label: const Text('Leave a note for next time'),
              ),
            )
          : PinnedNote(
              note: note,
              actions: [
                TextButton(
                  onPressed: () => leaveNextNote(context, ref, nodeId: nodeId, title: title),
                  child: const Text('Change'),
                ),
                TextButton.icon(
                  onPressed: () => ref.read(nextNotesProvider.notifier).clear(nodeId),
                  icon: const Icon(Icons.check, size: 18),
                  label: const Text('Done with it'),
                ),
              ],
            ),
    );
  }
}
