import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/data/background.dart';
import '../../../shared/domain/characters/voice.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'kept_reader.dart';
import 'parts.dart';
import 'vault.dart';

/// How many lines are shown before "Show all".
const linesShown = 5;

/// IN THEIR OWN WORDS: what a character says in the book (`voice.dart`), every line tied to them by how the dialogue
/// is written, in reading order, set as the quotations they are, each over its chapter's name. A press opens the
/// chapter at that line. To hear a voice, keep it their own, and catch the line that sounds like someone else.
///
/// Read from the saved text away from the screen, when the page opens and when the cast changes. It only reads.
class InTheirWords extends ConsumerStatefulWidget {
  const InTheirWords({super.key, required this.cast, required this.entryId, required this.actions});

  final CastData cast;
  final String entryId;
  final CharacterActions actions;

  @override
  ConsumerState<InTheirWords> createState() => _InTheirWordsState();
}

class _InTheirWordsState extends ConsumerState<InTheirWords> with KeptReader<InTheirWords, List<Spoken>> {
  bool _all = false;

  @override
  String get readingNovelId => widget.cast.novelId;

  @override
  List<Spoken> get nothingRead => const [];

  List<String> get _names => widget.cast.findNames[widget.entryId] ?? const <String>[];

  @override
  Object? readingInputs() {
    final chapters = widget.cast.documentIds;
    if (chapters.isEmpty || _names.isEmpty) return null;
    return ('spoken', widget.cast.novelId, chapters.join(','), _names.join('|'));
  }

  @override
  Future<List<Spoken>> runReading(RunAside run) =>
      run(spokenJob(widget.actions.service.storedChapters(widget.cast.novelId), widget.cast.documentIds, _names));

  @override
  Widget build(BuildContext context) {
    keepReading();
    final lines = reading;
    if (lines == null || lines.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final shown = _all ? lines : lines.take(linesShown).toList();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: ProfileBox(
        title: 'In their own words',
        caption: 'The lines the book gives them to say. Press one to read it there.',
        children: [
          for (final s in shown)
            InkWell(
              borderRadius: BorderRadius.circular(6),
              onTap: () => widget.actions.openChapterAt(s.nodeId, _findable(s.words), s.block),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // A large opening quotation mark, as a pull quote is set.
                    ExcludeSemantics(
                      child: Text(
                        '“',
                        style: vaultText(context, size: 40, color: scheme.primary).copyWith(height: 0.9),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${s.words}”',
                            maxLines: 6,
                            overflow: TextOverflow.ellipsis,
                            semanticsLabel: s.words,
                            style: vaultText(context, size: 18, style: FontStyle.italic, color: scheme.onSurface),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            documentName(widget.cast, s.nodeId),
                            style: vaultHeading(context, size: 11.5, weight: 700, color: scheme.primary),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right, size: 18, color: scheme.primary),
                  ],
                ),
              ),
            ),
          if (lines.length > linesShown)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _all = !_all),
                child: Text(_all ? 'Show fewer' : 'Show all ${lines.length}'),
              ),
            ),
        ],
      ),
    );
  }

  /// A short run of the line's first words, enough to find it in the chapter.
  static String _findable(String words) {
    final parts = words.split(RegExp(r'\s+'));
    return parts.take(5).join(' ').replaceAll(RegExp(r'[.,!?…—–]+$'), '');
  }
}
