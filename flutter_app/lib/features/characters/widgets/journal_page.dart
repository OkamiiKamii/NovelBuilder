import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/novel_art.dart';
import '../../../core/format.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/character_records.dart';
import '../../../shared/domain/characters/journal.dart';
import '../../../shared/domain/characters/stakes.dart';
import '../../../shared/domain/records/relation.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'cameo.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// Opens [entryId]'s journal.
Future<void> showJournal(BuildContext context, String entryId) => Navigator.of(
  context,
).push(MaterialPageRoute<void>(fullscreenDialog: true, builder: (_) => JournalPage(entryId: entryId)));

/// IN THEIR HAND (`journal.dart`): a character's journal. A prompt made of what the book knows of them, a page of ruled
/// paper to write on as them, in the first person, and the pages written before, the newest first. A page is kept as it
/// is written (one of their notes, tagged journal, its prompt its title), so nothing is lost on the way out; **Another
/// prompt** deals the next; an old page pressed opens it again to go on with.
class JournalPage extends ConsumerStatefulWidget {
  const JournalPage({super.key, required this.entryId});

  final String entryId;

  @override
  ConsumerState<JournalPage> createState() => _JournalPageState();
}

class _JournalPageState extends ConsumerState<JournalPage> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  int _deal = 0;

  /// The page being written: its note, once kept, and its prompt.
  String? _noteId;
  String? _prompt;

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _keep(CharacterActions actions, String prompt, String text) {
    if (text.trim().isEmpty) return;
    final id = _noteId;
    if (id == null) {
      // The first words make the page; what follows is saved as it is typed.
      final made = actions.now(
        (c) => c.saveNote(widget.entryId, null, title: '$journalTitlePrefix$prompt', content: text, tags: [journalTag]),
      );
      if (made != null) setState(() => _noteId = made.id);
    } else {
      actions.later('journal:$id', (c) => c.saveNote(widget.entryId, id, content: text));
    }
  }

  void _turn(int prompts) {
    ref.read(saveControllerProvider).flush();
    setState(() {
      _deal = (_deal + 1) % prompts;
      _noteId = null;
      _prompt = null;
      _text.clear();
    });
  }

  void _open(CharacterNote page) {
    ref.read(saveControllerProvider).flush();
    setState(() {
      _noteId = page.id;
      _prompt = promptOf(page);
      _text.text = page.content;
    });
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final cast = ref.watch(castProvider);
    final me = cast?.list.where((l) => l.entry.id == widget.entryId).firstOrNull;
    if (cast == null || me == null) return const Scaffold(body: SizedBox.shrink());
    final scheme = Theme.of(context).colorScheme;
    final actions = CharacterActions(context, cast.novelId);
    final name = me.entry.name;
    final byId = {for (final l in cast.list) l.entry.id: l};
    final others = <({String name, String tie})>[];
    for (final r in cast.snapshot.rows('characterRelations').map(CharacterRelation.new)) {
      final other = r.fromId == me.entry.id ? r.toId : (r.toId == me.entry.id ? r.fromId : null);
      final them = other == null ? null : byId[other];
      if (them == null || others.any((o) => o.name == them.entry.name)) continue;
      final stage = r.stages.lastOrNull;
      others.add((
        name: them.entry.name,
        tie: stage == null ? '' : (stage.title.trim().isNotEmpty ? stage.title.trim() : stage.label.trim()),
      ));
    }
    final fields = {for (final f in me.entry.fields) f.key.trim().toLowerCase(): f.value};
    final prompts = journalPrompts(name, others: others, wants: stakesOf(fields)[Stake.wants] ?? '');
    final prompt = _prompt ?? prompts[_deal % prompts.length].ask;
    // The pages written before, the one open now left out.
    final pages = [
      for (final p in journalPages(cast.notes(me.entry.id)))
        if (p.id != _noteId) p,
    ];
    final words = wordsIn(_text.text);
    final tone = NovelArt.of(context).bound(castTone(me.entry.id), lift: 0.1, sink: 0.45, tinted: true);

    return Scaffold(
      appBar: AppBar(title: Text('$name’s journal')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    ExcludeSemantics(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: SizedBox(
                          width: 44,
                          height: 52,
                          child: Cameo(look: cameoLookOf(me.entry, me.profile), ground: tone.ground, ink: tone.ink),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Write as $name, in the first person. Not for the book: to hear them. Every page is kept in '
                        'their notes.',
                        style: vaultText(context, size: 14.5, color: scheme.onSurfaceVariant),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _Paper(
                  prompt: prompt,
                  controller: _text,
                  focus: _focus,
                  onChanged: (t) {
                    setState(() {});
                    _keep(actions, prompt, t);
                  },
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _noteId == null
                            ? (words == 0 ? 'Begin anywhere.' : '')
                            : '${plural(words, 'word')} · kept in $name’s notes',
                        style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () => _turn(prompts.length),
                      icon: const Icon(Icons.auto_stories_outlined, size: 18),
                      label: Text(_noteId == null ? 'Another prompt' : 'A new page'),
                    ),
                  ],
                ),
                if (pages.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Text(
                    'EARLIER PAGES',
                    style: vaultHeading(
                      context,
                      size: 11.5,
                      color: scheme.primary,
                      weight: 700,
                    ).copyWith(letterSpacing: 1.6),
                  ),
                  const SizedBox(height: 6),
                  for (final p in pages) _Earlier(key: ValueKey('page-${p.id}'), page: p, onOpen: () => _open(p)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The page: the prompt at its head, in ink, and ruled lines to write on, the writing on them.
class _Paper extends StatelessWidget {
  const _Paper({required this.prompt, required this.controller, required this.focus, required this.onChanged});

  final String prompt;
  final TextEditingController controller;
  final FocusNode focus;
  final ValueChanged<String> onChanged;

  static const _paper = Color(0xFFF7F1E1);
  static const _ink = Color(0xFF2B2A45);
  static const _rule = Color(0xFFB9C7D8);
  static const _margin = Color(0xFFD9A3A3);
  static const _size = 19.0;
  static const _height = 1.6;
  static const _line = _size * _height;
  static const _top = 12.0;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _paper,
        borderRadius: BorderRadius.circular(6),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 14, offset: Offset(0, 6))],
      ),
      padding: const EdgeInsets.fromLTRB(0, 18, 0, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(52, 0, 18, 8),
            child: Text(
              prompt,
              key: const ValueKey('journal-prompt'),
              style: const TextStyle(
                fontFamily: vaultTextFont,
                fontSize: 17,
                fontStyle: FontStyle.italic,
                color: Color(0xFF6B5A48),
                height: 1.35,
              ),
            ),
          ),
          CustomPaint(
            painter: const _Rules(line: _line, top: _top, rule: _rule, margin: _margin),
            child: Padding(
              padding: const EdgeInsets.only(left: 52, right: 18),
              child: TextField(
                key: const ValueKey('journal-page'),
                controller: controller,
                focusNode: focus,
                minLines: 12,
                maxLines: null,
                keyboardType: TextInputType.multiline,
                textCapitalization: TextCapitalization.sentences,
                onChanged: onChanged,
                cursorColor: _ink,
                style: const TextStyle(
                  fontFamily: vaultTextFont,
                  fontSize: _size,
                  height: _height,
                  color: _ink,
                  fontStyle: FontStyle.italic,
                ),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                  isCollapsed: true,
                  contentPadding: EdgeInsets.only(top: _top),
                  hintText: 'Dear diary…',
                  hintStyle: TextStyle(color: Color(0x667A6A58), fontStyle: FontStyle.italic),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Ruled lines, one under each line of writing, and a margin rule at the left.
class _Rules extends CustomPainter {
  const _Rules({required this.line, required this.top, required this.rule, required this.margin});

  final double line;
  final double top;
  final Color rule;
  final Color margin;

  @override
  void paint(Canvas canvas, Size size) {
    final ruled = Paint()
      ..color = rule
      ..strokeWidth = 1;
    for (var y = top + line - 4; y < size.height; y += line) {
      canvas.drawLine(Offset(12, y), Offset(size.width - 12, y), ruled);
    }
    canvas.drawLine(
      const Offset(42, 0),
      Offset(42, size.height),
      Paint()
        ..color = margin
        ..strokeWidth = 1.2,
    );
  }

  @override
  bool shouldRepaint(_Rules old) => old.line != line || old.top != top;
}

/// An earlier page: its prompt, when it was written, and its first lines; pressed, opened to go on with.
class _Earlier extends StatelessWidget {
  const _Earlier({super.key, required this.page, required this.onOpen});

  final CharacterNote page;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final when = DateTime.fromMillisecondsSinceEpoch(page.createdAt.toInt());
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${shortDate(when)} · ${plural(wordsIn(page.content), 'word')}',
                  style: vaultHeading(context, size: 11.5, color: scheme.primary, weight: 700),
                ),
                const SizedBox(height: 2),
                Text(
                  promptOf(page),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: vaultText(
                    context,
                    size: 14,
                    color: scheme.onSurfaceVariant,
                  ).copyWith(fontStyle: FontStyle.italic),
                ),
                const SizedBox(height: 4),
                Text(
                  page.content.trim(),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: vaultText(context, size: 15.5, color: scheme.onSurface),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// A day as a page is dated: "14 Nov 2026".
String shortDate(DateTime t) => '${t.day} ${_months[t.month - 1]} ${t.year}';
