import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/data/background.dart';
import '../../../shared/domain/characters/voice_print.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'kept_reader.dart';
import 'parts.dart';
import 'vault.dart';

/// THEIR VOICE, on a character's profile (`voice_print.dart` measures it): how they talk, set against the rest of the
/// cast, from every line the book ties to them: a row of meters (words a line, questions, exclamations, contractions,
/// word length) each with the cast's average marked on it; what sets them apart, in words; their signature words; and
/// whom they sound most like, said plainly when the two could swap lines. With too few lines, how many more it needs.
/// Read from the saved chapters away from the screen. It only reads.
class TheirVoice extends ConsumerStatefulWidget {
  const TheirVoice({super.key, required this.cast, required this.entryId, required this.actions});

  final CastData cast;
  final String entryId;
  final CharacterActions actions;

  @override
  ConsumerState<TheirVoice> createState() => _TheirVoiceState();
}

class _TheirVoiceState extends ConsumerState<TheirVoice> with KeptReader<TheirVoice, List<VoicePrint>> {
  /// Everyone who speaks, by the names they go by, and the chapters: worked out once a cast.
  ({CastData cast, Map<String, List<String>> people, String who, String chapters})? _from;

  ({CastData cast, Map<String, List<String>> people, String who, String chapters}) _inputs() {
    final cast = widget.cast;
    if (_from case final from? when identical(from.cast, cast)) return from;
    final names = cast.findNames;
    final people = {
      for (final l in cast.list)
        if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty) l.entry.id: names[l.entry.id]!,
    };
    return _from = (
      cast: cast,
      people: people,
      who: [for (final MapEntry(:key, :value) in people.entries) '$key:${value.join('|')}'].join(','),
      chapters: cast.documentIds.join(','),
    );
  }

  @override
  String get readingNovelId => widget.cast.novelId;

  @override
  List<VoicePrint> get nothingRead => const [];

  // Everyone's voices, against each other: the same reading for every character, so read once for the whole cast.
  @override
  Object? readingInputs() {
    final from = _inputs();
    if (from.chapters.isEmpty || !from.people.containsKey(widget.entryId)) return null;
    return ('voices', widget.cast.novelId, from.chapters, from.who);
  }

  @override
  Future<List<VoicePrint>> runReading(RunAside run) => run(
    voicePrintsJob(
      widget.actions.service.storedChapters(widget.cast.novelId),
      widget.cast.documentIds,
      _inputs().people,
    ),
  );

  @override
  Widget build(BuildContext context) {
    keepReading();
    final prints = reading;
    if (prints == null) return const SizedBox.shrink();
    final me = prints.where((p) => p.id == widget.entryId).firstOrNull;
    final name = widget.cast.entries.where((e) => e.id == widget.entryId).firstOrNull?.name.trim() ?? 'They';
    if (me == null) return const SizedBox.shrink();
    final names = {for (final e in widget.cast.entries) e.id: e.name.trim()};
    final voice = readVoice(widget.entryId, prints, names)!;
    final others = prints.where((p) => p.id != widget.entryId).toList();
    // The rest of the cast's average; none when no one else speaks enough (no tick then: it would only mark their own).
    double? mean(double Function(VoicePrint) f) =>
        others.isEmpty ? null : others.fold<double>(0.0, (n, p) => n + f(p)) / others.length;
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: ProfileBox(
        title: 'Their voice',
        caption:
            'How $name talks, from ${me.lines} lines, against the rest of the cast'
            '${others.isEmpty ? ' (no one else speaks enough yet)' : ''}.',
        children: [
          _Meter(
            label: 'Words a line',
            value: me.wordsPerLine,
            cast: mean((p) => p.wordsPerLine),
            top: 30,
            say: (v) => v.toStringAsFixed(v >= 10 ? 0 : 1),
          ),
          _Meter(
            label: 'Questions',
            value: me.questions,
            cast: mean((p) => p.questions),
            top: 1,
            say: (v) => '${(v * 100).round()}%',
          ),
          _Meter(
            label: 'Exclamations',
            value: me.cries,
            cast: mean((p) => p.cries),
            top: 1,
            say: (v) => '${(v * 100).round()}%',
          ),
          _Meter(
            label: 'Contractions',
            value: me.contractions,
            cast: mean((p) => p.contractions),
            top: 15,
            say: (v) => '${v.toStringAsFixed(v >= 10 ? 0 : 1)} in 100',
          ),
          _Meter(
            label: 'Word length',
            value: me.wordLength,
            cast: mean((p) => p.wordLength),
            top: 7,
            say: (v) => '${v.toStringAsFixed(1)} letters',
          ),
          if (others.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2, bottom: 6),
              child: Row(
                children: [
                  Container(width: 2, height: 12, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 6),
                  // Wraps with large text, rather than running off a phone's edge.
                  Flexible(
                    child: Text(
                      'the rest of the cast',
                      style: vaultText(context, size: 13, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ),
          for (final t in voice.traits)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(t, style: vaultText(context, size: 15.5, color: scheme.onSurface)),
            ),
          if (me.signature.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'WORDS THAT ARE THEIRS',
              style: vaultHeading(context, size: 10.5, color: scheme.primary, weight: 700).copyWith(letterSpacing: 1.6),
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final w in me.signature)
                  Chip(
                    label: Text('“$w”'),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
              ],
            ),
          ],
          if (voice.soundsLike case final like?) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: (voice.alike ? scheme.errorContainer : scheme.surfaceContainerHigh).withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: voice.alike ? scheme.error.withValues(alpha: 0.5) : scheme.outlineVariant),
              ),
              child: Row(
                children: [
                  Icon(
                    voice.alike ? Icons.record_voice_over : Icons.hearing,
                    size: 18,
                    color: voice.alike ? scheme.error : scheme.primary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      voice.alike
                          ? '$name and $like sound alike: lines as long, as many questions and cries. Could a reader '
                                'tell them apart without the tags?'
                          : 'Sounds most like $like.',
                      style: vaultText(context, size: 15, color: scheme.onSurface),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// One measure: its name, a bar to the value, a tick where the cast's average is, and the value.
class _Meter extends StatelessWidget {
  const _Meter({required this.label, required this.value, required this.top, required this.say, this.cast});

  final String label;
  final double value;
  final double? cast;
  final double top;
  final String Function(double) say;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final part = (value / top).clamp(0.0, 1.0);
    final mark = cast == null ? null : (cast! / top).clamp(0.0, 1.0);
    return Semantics(
      label: cast == null ? '$label: ${say(value)}' : '$label: ${say(value)}; the cast ${say(cast!)}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            SizedBox(
              width: 104,
              child: Text(label, style: vaultText(context, size: 14, color: scheme.onSurface)),
            ),
            Expanded(
              child: SizedBox(
                height: 14,
                child: LayoutBuilder(
                  builder: (context, box) => Stack(
                    alignment: Alignment.centerLeft,
                    children: [
                      Container(
                        height: 6,
                        decoration: BoxDecoration(
                          color: scheme.outlineVariant.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                      Container(
                        height: 6,
                        width: box.maxWidth * part,
                        decoration: BoxDecoration(color: scheme.primary, borderRadius: BorderRadius.circular(3)),
                      ),
                      if (mark != null)
                        Positioned(
                          left: (box.maxWidth * mark - 1).clamp(0.0, box.maxWidth - 2),
                          child: Container(width: 2, height: 14, color: scheme.onSurfaceVariant),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            SizedBox(
              width: 76,
              child: Text(
                say(value),
                textAlign: TextAlign.end,
                style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
