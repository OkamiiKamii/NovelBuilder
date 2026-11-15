import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/data/speech.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/characters/table_read.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/records/story_node.dart';
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// Where the author's voice for each speaker is kept, per novel: each one's steps higher or lower.
String tableReadVoicesKey(String novelId) => 'tableread.voices.$novelId';

/// THE TABLE READ, a view of the cast (`table_read.dart` reads it): a chapter as a script, every line under the name of
/// the one who says it and the narration between, and read aloud by the cast, each in a voice of their own (a pitch
/// spread across the cast, which the author may set higher or lower, kept for the novel), the narration in the device's
/// own. Play reads from the part lit; a press on a part reads from there. A line no one is named saying is marked: a
/// reader cannot tell who says it either. It reads only; the voices are the device's own (`speech.dart`), and with none
/// the script is still there to read.
class CastTableRead extends ConsumerStatefulWidget {
  const CastTableRead({super.key, required this.cast});

  final CastData cast;

  @override
  ConsumerState<CastTableRead> createState() => _CastTableReadState();
}

class _CastTableReadState extends ConsumerState<CastTableRead> {
  String? _chapter;
  List<ReadPart>? _parts;
  Object? _readFor;
  int _at = 0;
  bool _playing = false;
  bool? _voiced;
  late final Speaker _speaker = ref.read(speakerProvider);

  @override
  void initState() {
    super.initState();
    _speaker.available().then((ok) {
      if (mounted) setState(() => _voiced = ok);
    });
  }

  @override
  void dispose() {
    if (_playing) _speaker.stop();
    super.dispose();
  }

  List<StoryNode> get _chapters {
    final store = ref.read(novelStoreProvider);
    return [
      for (final n in readingOrder([for (final r in store.rowsIn(widget.cast.novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind) && n.wordCount > 0) n,
    ];
  }

  void _read(String chapter) {
    final store = ref.read(novelStoreProvider);
    final names = namesToFind(widget.cast.entries, widget.cast.profiles);
    final people = [
      for (final l in widget.cast.list)
        if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty)
          (id: l.entry.id, names: names[l.entry.id]!),
    ];
    final key = (
      chapter,
      [for (final p in people) '${p.id}:${p.names.join('|')}'].join(','),
      [for (final l in widget.cast.list) fieldNamed(l.entry, 'Gender')].join(','),
    );
    if (key == _readFor) return;
    _readFor = key;
    ref
        .read(runAsideProvider)(
          tableReadJob(
            store.rawJsonIn(widget.cast.novelId, 'chapterContents'),
            chapter,
            people,
            genders: {for (final l in widget.cast.list) l.entry.id: fieldNamed(l.entry, 'Gender')},
          ),
        )
        .then(
          (parts) {
            if (mounted && _readFor == key) setState(() => _parts = parts);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
        );
  }

  Map<String, int> get _nudged {
    final stored = ref.read(settingsStoreProvider).read(tableReadVoicesKey(widget.cast.novelId));
    return {
      if (stored is Map)
        for (final MapEntry(:key, :value) in stored.entries)
          if (value is int) '$key': value,
    };
  }

  void _nudge(String id, int by) {
    final next = {..._nudged, id: (_nudged[id] ?? 0) + by};
    ref.read(settingsStoreProvider).write(tableReadVoicesKey(widget.cast.novelId), next);
    setState(() {});
  }

  Map<String, CastVoice> _voices(List<ReadPart> parts) {
    final byId = {for (final l in widget.cast.list) l.entry.id: l};
    final heard = <String>[];
    for (final p in parts) {
      if (p.speaker case final s? when !heard.contains(s)) heard.add(s);
    }
    return castVoices([
      for (final id in heard) (id: id, gender: byId[id] == null ? '' : fieldNamed(byId[id]!.entry, 'Gender')),
    ], nudged: _nudged);
  }

  Future<void> _play(List<ReadPart> parts, Map<String, CastVoice> voices) async {
    setState(() => _playing = true);
    while (_playing && mounted && _at < parts.length) {
      final p = parts[_at];
      final v = p.line && p.speaker != null ? voices[p.speaker] ?? narratorVoice : narratorVoice;
      final said = await _speaker.say(p.text, rate: v.rate, pitch: v.pitch);
      if (!mounted || !_playing) return;
      if (!said) {
        setState(() {
          _playing = false;
          _voiced = false;
        });
        return;
      }
      setState(() => _at++);
    }
    if (mounted) {
      setState(() {
        _playing = false;
        if (_at >= parts.length) _at = 0;
      });
    }
  }

  void _pause() {
    setState(() => _playing = false);
    _speaker.stop();
  }

  void _from(int i, List<ReadPart> parts, Map<String, CastVoice> voices) {
    final was = _playing;
    if (was) _speaker.stop();
    setState(() {
      _at = i;
      _playing = false;
    });
    if (was) Future.microtask(() => _play(parts, voices));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final chapters = _chapters;
    if (chapters.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'No chapter has words yet. Once one has, its dialogue can be read here by the cast, each in a voice of '
          'their own.',
          textAlign: TextAlign.center,
          style: vaultText(context, size: 16, color: scheme.onSurfaceVariant),
        ),
      );
    }
    final chapter = chapters.any((c) => c.id == _chapter) ? _chapter! : chapters.first.id;
    _read(chapter);
    final parts = _parts;
    final byId = {for (final l in widget.cast.list) l.entry.id: l};
    final voices = parts == null ? const <String, CastVoice>{} : _voices(parts);
    final unknown = parts == null ? 0 : parts.where((p) => p.line && p.speaker == null).length;
    final likely = parts == null ? 0 : parts.where((p) => p.line && p.likely).length;
    final lines = parts == null ? 0 : parts.where((p) => p.line).length;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'A chapter as a script, read aloud by the cast: each line in the voice of the one who says it. Hear '
            'whether they sound like themselves, and whether a reader can tell who is speaking.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 320),
                child: DropdownButtonFormField<String>(
                  key: ValueKey('table-chapter-$chapter'),
                  initialValue: chapter,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Chapter', isDense: true),
                  items: [
                    for (final (i, c) in chapters.indexed)
                      DropdownMenuItem(
                        value: c.id,
                        child: Text(
                          c.title.trim().isEmpty ? 'Chapter ${i + 1}' : c.title.trim(),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: (v) {
                    if (v == null || v == chapter) return;
                    if (_playing) _pause();
                    setState(() {
                      _chapter = v;
                      _parts = null;
                      _at = 0;
                    });
                  },
                ),
              ),
              if (parts != null && parts.isNotEmpty && _voiced != false)
                FilledButton.icon(
                  key: const ValueKey('table-play'),
                  onPressed: _voiced == null ? null : () => _playing ? _pause() : _play(parts, voices),
                  icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
                  label: Text(_playing ? 'Pause' : (_at == 0 ? 'Read it aloud' : 'Go on')),
                ),
              if (_at > 0)
                TextButton.icon(
                  onPressed: () => _from(0, parts ?? const [], voices),
                  icon: const Icon(Icons.replay, size: 18),
                  label: const Text('From the start'),
                ),
            ],
          ),
          if (_voiced == false)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'This device has no voice to read with. The script is here to read all the same.',
                style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
              ),
            ),
          const SizedBox(height: 14),
          if (parts == null)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            if (voices.isNotEmpty) ...[
              Text(
                'THE CAST’S VOICES',
                style: vaultHeading(
                  context,
                  size: 11.5,
                  color: scheme.primary,
                  weight: 700,
                ).copyWith(letterSpacing: 1.6),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final MapEntry(key: id, value: v) in voices.entries)
                    if (byId[id] case final l?)
                      _VoiceChip(
                        key: ValueKey('voice-$id'),
                        listed: l,
                        voice: v,
                        onLower: v.pitch <= lowestPitch ? null : () => _nudge(id, -1),
                        onHigher: v.pitch >= highestPitch ? null : () => _nudge(id, 1),
                      ),
                ],
              ),
              const SizedBox(height: 10),
            ],
            Text(
              lines == 0
                  ? 'No one speaks in this chapter: it is all narration.'
                  : [
                      if (unknown == 0)
                        'A reader can tell who says each of its $lines lines.'
                      else
                        '$unknown of its $lines lines cannot be told whose they are: marked “Who says this?” below. '
                            'A reader may not know who speaks either.',
                      if (likely > 0)
                        '$likely ${likely == 1 ? 'is' : 'are'} followed from the talk (“she said”, who acts, '
                            'whose turn it is), marked “likely”.',
                    ].join(' '),
              style: vaultText(context, size: 14, color: unknown == 0 ? scheme.onSurfaceVariant : scheme.onSurface),
            ),
            const SizedBox(height: 12),
            for (final (i, p) in parts.indexed)
              _ScriptPart(
                key: ValueKey('part-$i'),
                part: p,
                listed: p.speaker == null ? null : byId[p.speaker],
                lit: i == _at && (_playing || _at > 0),
                onTap: () => _from(i, parts, voices),
              ),
          ],
        ],
      ),
    );
  }
}

/// A speaker's voice: their face and name, how they sound, and lower or higher.
class _VoiceChip extends StatelessWidget {
  const _VoiceChip({super.key, required this.listed, required this.voice, this.onLower, this.onHigher});

  final Listed listed;
  final CastVoice voice;
  final VoidCallback? onLower;
  final VoidCallback? onHigher;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tone = NovelArt.of(context).bound(castTone(listed.entry.id), lift: 0.1, sink: 0.45, tinted: true);
    final name = listed.entry.name;
    return Container(
      padding: const EdgeInsets.fromLTRB(4, 4, 2, 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: castTone(listed.entry.id).withValues(alpha: 0.6)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ExcludeSemantics(
            child: ClipOval(
              child: SizedBox(
                width: 30,
                height: 30,
                child: Cameo(look: cameoLookOf(listed.entry, listed.profile), ground: tone.ground, ink: tone.ink),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Shortened, not overflowing, when a long name and its buttons are wider than a phone.
          Flexible(
            child: Text(
              '$name · ${voiceWord(voice)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: vaultText(context, size: 14, color: scheme.onSurface),
            ),
          ),
          IconButton(
            tooltip: 'Lower $name’s voice',
            visualDensity: VisualDensity.compact,
            onPressed: onLower,
            icon: const Icon(Icons.remove, size: 18),
          ),
          IconButton(
            tooltip: 'Raise $name’s voice',
            visualDensity: VisualDensity.compact,
            onPressed: onHigher,
            icon: const Icon(Icons.add, size: 18),
          ),
        ],
      ),
    );
  }
}

/// A part of the script: a line under its speaker's name (or marked, when no one is named saying it), or narration.
class _ScriptPart extends StatelessWidget {
  const _ScriptPart({super.key, required this.part, required this.listed, required this.lit, required this.onTap});

  final ReadPart part;
  final Listed? listed;
  final bool lit;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final p = part;
    final who = p.line
        ? (listed == null
              ? (p.speaker == null ? 'WHO SAYS THIS?' : 'SOMEONE')
              // Followed from the talk ("she said", an action beat, the other one's turn), not named.
              : '${listed!.entry.name.toUpperCase()}${p.likely ? ' (likely)' : ''}')
        : null;
    return Semantics(
      container: true,
      button: true,
      label: p.line ? '${who!.toLowerCase()}: ${p.text}' : p.text,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: EdgeInsets.fromLTRB(p.line ? 24 : 8, 6, 8, 6),
          decoration: BoxDecoration(
            color: lit ? scheme.primary.withValues(alpha: 0.14) : null,
            borderRadius: BorderRadius.circular(8),
            border: lit ? Border(left: BorderSide(color: scheme.primary, width: 3)) : null,
          ),
          child: p.line
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      who!,
                      style: vaultHeading(
                        context,
                        size: 12,
                        color: listed == null ? scheme.error : castTone(listed!.entry.id),
                        weight: 700,
                      ).copyWith(letterSpacing: 1.4),
                    ),
                    Text(p.text, style: vaultText(context, size: 16.5, color: scheme.onSurface)),
                  ],
                )
              : Text(
                  p.text,
                  style: vaultText(
                    context,
                    size: 14.5,
                    color: scheme.onSurfaceVariant,
                  ).copyWith(fontStyle: FontStyle.italic),
                ),
        ),
      ),
    );
  }
}
