import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../app/theme/novel_art.dart';
import '../../core/layout/breakpoints.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/templates.dart';
import '../../shared/domain/records/category.dart' show FieldType;
import '../../shared/domain/records/entry.dart';
import 'character_actions.dart';
import 'widgets/cameo.dart';
import 'widgets/cast_card.dart' show castTone;
import 'widgets/portrait.dart';
import 'widgets/vault.dart';

/// THE INTERVIEW: a character's empty profile filled the way writers get to know someone, one question at a time
/// ("What does Mira want more than anything?"), each answer going into the field it belongs to (the profile's own
/// fields, by name, whatever the layout). Only fields that are on the character and still empty are asked. The
/// questions are fixed and written here; the answers are the author's alone, saved only when they press Next. The
/// character is named, never given a pronoun.

/// A question and the fields it can fill, by name, in the order tried.
typedef InterviewQuestion = ({String ask, String? hint, List<String> fields});

const interviewQuestions = <InterviewQuestion>[
  (
    ask: 'What does {name} want more than anything?',
    hint: null,
    fields: ['What they want', 'Initial Goals', 'Motivations'],
  ),
  (ask: 'What is {name} afraid of?', hint: 'A few words, separated by commas', fields: ['Fears']),
  (ask: 'What stands in {name}’s way?', hint: null, fields: ['What stands in the way', 'External Conflict']),
  (
    ask: 'What does {name} believe that is not true?',
    hint: null,
    fields: ['The lie they believe', 'Beliefs', 'Initial Beliefs'],
  ),
  (ask: 'What war goes on inside {name}?', hint: null, fields: ['Internal Conflicts', 'Internal Conflict']),
  (ask: 'What is {name} good at?', hint: 'A few words, separated by commas', fields: ['Strengths']),
  (ask: 'Where does {name} fall short?', hint: 'A few words, separated by commas', fields: ['Weaknesses']),
  (ask: 'What would {name} never do?', hint: null, fields: ['Lines they will not cross', 'Values']),
  (ask: 'What does {name} stand to lose?', hint: null, fields: ['What they stand to lose']),
  (ask: 'Where is {name} when the story begins?', hint: null, fields: ['Starting Point']),
  (ask: 'How should {name}’s story end?', hint: null, fields: ['Intended Resolution', 'What they need']),
  (ask: 'How does {name} sound when speaking?', hint: null, fields: ['Voice']),
];

/// A question to put to a character, and where its answer goes: an empty field they have ([fieldId]), or a field one
/// of their sections suggests ([sectionName] and [suggestion]), made when the answer is saved. The section is found by
/// its name then: a profile not yet stored gives its sections new ids each time it is read.
typedef InterviewStep = ({
  String ask,
  String? hint,
  String fieldName,
  FieldType? type,
  String? fieldId,
  String? sectionId,
  String? sectionName,
  FieldSuggestion? suggestion,
});

/// The questions [entry] can still be asked, with its [profile]'s sections and the novel's [templates]: for each, the
/// first of its fields the character has or is offered. A field already filled means the question is answered.
List<InterviewStep> interviewFor(Entry entry, CharacterProfile profile, List<CharacterTemplate> templates) {
  final have = <String, EntryField>{};
  for (final f in entry.fields) {
    have.putIfAbsent(f.key.trim().toLowerCase(), () => f);
  }
  final offered = <String, (String, String, FieldSuggestion)>{};
  for (final s in profile.sections) {
    if (s.hidden) continue;
    for (final sug in suggestionsFor(s.name, templates, [for (final f in entry.fields) f.key])) {
      offered.putIfAbsent(sug.name.trim().toLowerCase(), () => (s.id, s.name, sug));
    }
  }
  final name = entry.name.trim().isEmpty ? 'them' : entry.name.trim();
  final used = <String>{};
  final steps = <InterviewStep>[];
  for (final q in interviewQuestions) {
    for (final candidate in q.fields) {
      final key = candidate.toLowerCase();
      final ask = q.ask.replaceAll('{name}', name);
      if (have[key] case final field?) {
        if (field.value.trim().isEmpty && used.add(key)) {
          steps.add((
            ask: ask,
            hint: q.hint,
            fieldName: field.key,
            type: field.type,
            fieldId: field.id,
            sectionId: null,
            sectionName: null,
            suggestion: null,
          ));
        }
        break;
      }
      if (offered[key] case (final sectionId, final sectionName, final sug)) {
        if (used.add(key)) {
          steps.add((
            ask: ask,
            hint: q.hint,
            fieldName: sug.name,
            type: sug.type,
            fieldId: null,
            sectionId: sectionId,
            sectionName: sectionName,
            suggestion: sug,
          ));
        }
        break;
      }
    }
  }
  return steps;
}

/// The answer as the field stores it: a list field takes one item per line (from commas); text as typed.
String storedAnswer(FieldType? type, String answer) => switch (type) {
  FieldType.tags || FieldType.multiselect => [
    for (final part in answer.split(RegExp(r'[,\n]')))
      if (part.trim().isNotEmpty) part.trim(),
  ].join('\n'),
  _ => answer.trim(),
};

/// THE INTERVIEW AS A CONVERSATION: the author and the character, face to face. Each question is the author's line,
/// each answer the character's reply, in their colour beside their cameo, marked with where it went ("→ Fears"); the
/// talk so far stays on the page above the question now, and at the head, how well they are known so far ("Known 3 of
/// 11"). The author answers as the character. Next saves the answer and asks the next, Skip passes, Done ends; full
/// screen on a phone. [save] puts one answer into its field.
Future<void> showInterview(
  BuildContext context, {
  required Entry entry,
  required CharacterProfile profile,
  required List<CharacterTemplate> templates,
  required void Function(InterviewStep step, String value) save,
}) => showDialog<void>(
  context: context,
  builder: (_) => _Interview(
    steps: interviewFor(entry, profile, templates),
    entry: entry,
    profile: profile,
    known: acquaintance(entry, profile, templates).known,
    save: save,
  ),
);

/// One exchange of the conversation: the question, and the reply (null when it was passed over).
typedef _Exchange = ({String ask, String fieldName, String? reply});

class _Interview extends StatefulWidget {
  const _Interview({
    required this.steps,
    required this.entry,
    required this.profile,
    required this.known,
    required this.save,
  });
  final List<InterviewStep> steps;
  final Entry entry;
  final CharacterProfile profile;

  /// Of the questions, how many the profile already answered before this conversation.
  final int known;
  final void Function(InterviewStep step, String value) save;

  @override
  State<_Interview> createState() => _InterviewState();
}

class _InterviewState extends State<_Interview> {
  final _answer = TextEditingController();
  final _scroll = ScrollController();
  final _said = <_Exchange>[];
  int _at = 0;
  int _answered = 0;

  String get _name => widget.entry.name.trim().isEmpty ? 'them' : widget.entry.name.trim();

  @override
  void dispose() {
    _answer.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _next({required bool keep}) {
    final step = widget.steps[_at];
    final reply = keep && _answer.text.trim().isNotEmpty ? _answer.text.trim() : null;
    if (reply != null) {
      widget.save(step, storedAnswer(step.type, _answer.text));
      _answered++;
    }
    _answer.clear();
    if (_at + 1 >= widget.steps.length) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _said.add((ask: step.ask, fieldName: step.fieldName, reply: reply));
      _at++;
    });
    // The newest question in view, under the talk so far.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final to = _scroll.position.maxScrollExtent;
      if (MediaQuery.of(context).disableAnimations) {
        _scroll.jumpTo(to);
      } else {
        _scroll.animateTo(to, duration: const Duration(milliseconds: 260), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final compact = WindowSize.of(context) == WindowSize.compact;
    final step = widget.steps[_at];
    final tone = castTone(widget.entry.id);
    final total = widget.known + widget.steps.length;
    final known = widget.known + _answered;
    final last = _at + 1 >= widget.steps.length;

    final head = Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
      child: Row(
        children: [
          _Face(entry: widget.entry, profile: widget.profile, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    'Interview with $_name',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: vaultHeading(context, size: 15, weight: 700, color: scheme.onSurface),
                  ),
                ),
                Text(
                  total == 0 ? 'In conversation' : 'Known $known of $total',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );

    final progress = Semantics(
      label: 'Question ${_at + 1} of ${widget.steps.length}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            for (var i = 0; i < widget.steps.length; i++)
              Expanded(
                child: Container(
                  height: 3,
                  margin: const EdgeInsets.only(right: 3),
                  color: i < _at
                      ? tone
                      : i == _at
                      ? scheme.primary
                      : scheme.outlineVariant,
                ),
              ),
          ],
        ),
      ),
    );

    final talk = ListView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      children: [
        for (final x in _said) ...[
          _Asked(text: x.ask, faded: true),
          if (x.reply case final reply?)
            _Reply(entry: widget.entry, profile: widget.profile, text: reply, into: x.fieldName)
          else
            Padding(
              padding: const EdgeInsets.only(bottom: 14, right: 8),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text(
                  'Passed over',
                  style: vaultText(context, size: 14, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                ),
              ),
            ),
        ],
        _Asked(text: step.ask),
        Padding(
          padding: const EdgeInsets.only(left: 6, bottom: 4),
          child: Text(
            'Goes into ${step.fieldName}',
            style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
          ),
        ),
      ],
    );

    final composer = DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        border: Border(top: BorderSide(color: scheme.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                key: ValueKey(step.fieldName),
                controller: _answer,
                autofocus: true,
                minLines: 2,
                maxLines: 6,
                style: vaultText(context, size: 18),
                decoration: InputDecoration(
                  labelText: 'Answer',
                  hintText: step.hint ?? 'In $_name’s own words',
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _answered == 0
                        ? const SizedBox.shrink()
                        : Text(
                            '${_answered == 1 ? 'One answer' : '$_answered answers'} saved to the profile.',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                  ),
                  TextButton(onPressed: () => _next(keep: false), child: const Text('Skip')),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: _answer.text.trim().isEmpty ? null : () => _next(keep: true),
                    icon: Icon(last ? Icons.check : Icons.send),
                    label: Text(last ? 'Save and finish' : 'Next'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );

    final body = Material(
      color: scheme.surface,
      child: Column(
        children: [
          SafeArea(bottom: false, child: head),
          progress,
          Expanded(child: talk),
          composer,
        ],
      ),
    );
    if (compact) return Dialog.fullscreen(child: body);
    return Dialog(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 640, maxHeight: math.min(760, MediaQuery.sizeOf(context).height * 0.9)),
        child: body,
      ),
    );
  }
}

/// The character's face in a circle: their picture, or their cameo on their own colour.
class _Face extends StatelessWidget {
  const _Face({required this.entry, required this.profile, required this.size});

  final Entry entry;
  final CharacterProfile profile;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tone = castTone(entry.id);
    final Widget face;
    if (uploadedImageBytes(entry.image) != null) {
      face = ClipOval(
        child: FittedBox(
          fit: BoxFit.cover,
          child: Portrait(name: entry.name, image: entry.image, focal: profile.focal, size: size),
        ),
      );
    } else {
      final art = NovelArt.of(context);
      final look = art.bound(tone, lift: 0.1, sink: 0.45, tinted: true);
      face = Cameo(
        look: cameoLookOf(entry, profile),
        ground: look.ground,
        ink: look.ink,
        frame: art.system ? look.frame.withValues(alpha: 0.8) : look.ink.withValues(alpha: 0.6),
        bare: true,
      );
    }
    return ExcludeSemantics(
      child: SizedBox.square(dimension: size, child: face),
    );
  }
}

/// The author's line: a question, on the left.
class _Asked extends StatelessWidget {
  const _Asked({required this.text, this.faded = false});

  final String text;
  final bool faded;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Align(
      alignment: Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8, right: 40),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHigh,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(4),
              topRight: Radius.circular(16),
              bottomLeft: Radius.circular(16),
              bottomRight: Radius.circular(16),
            ),
          ),
          child: Text(
            text,
            style: vaultText(context, size: faded ? 17 : 22, color: faded ? scheme.onSurfaceVariant : scheme.onSurface),
          ),
        ),
      ),
    );
  }
}

/// The character's reply: on the right, in their colour, beside their face, and where it went.
class _Reply extends StatelessWidget {
  const _Reply({required this.entry, required this.profile, required this.text, required this.into});

  final Entry entry;
  final CharacterProfile profile;
  final String text;
  final String into;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tone = castTone(entry.id);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Flexible(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Container(
                margin: const EdgeInsets.only(left: 40),
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
                decoration: BoxDecoration(
                  color: Color.alphaBlend(tone.withValues(alpha: 0.2), scheme.surface),
                  border: Border.all(color: tone.withValues(alpha: 0.55)),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                    bottomLeft: Radius.circular(16),
                    bottomRight: Radius.circular(4),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(text, style: vaultText(context, size: 18, color: scheme.onSurface)),
                    const SizedBox(height: 4),
                    Text(
                      '→ $into',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _Face(entry: entry, profile: profile, size: 30),
        ],
      ),
    );
  }
}

/// How well the author knows a character: of the interview's questions, how many their profile has answered.
({int known, int of}) acquaintance(Entry entry, CharacterProfile profile, List<CharacterTemplate> templates) {
  // Answered: a question whose field the character has, filled. Still to ask: what the interview would ask now.
  // A question with no field in this layout counts for neither.
  final have = <String, EntryField>{};
  for (final f in entry.fields) {
    have.putIfAbsent(f.key.trim().toLowerCase(), () => f);
  }
  var known = 0;
  for (final q in interviewQuestions) {
    final field = q.fields.map((c) => have[c.toLowerCase()]).nonNulls.firstOrNull;
    if (field != null && field.value.trim().isNotEmpty) known++;
  }
  return (known: known, of: known + interviewFor(entry, profile, templates).length);
}

/// The interview of [entry], each answer saved into its field as Next is pressed (the field the character has, or
/// the one their section suggests, made now with the answer). The same from the profile and from the cast card.
Future<void> interviewCharacter(
  BuildContext context,
  CharacterActions actions, {
  required Entry entry,
  required CharacterProfile profile,
  required List<CharacterTemplate> templates,
}) => showInterview(
  context,
  entry: entry,
  profile: profile,
  templates: templates,
  save: (step, value) => actions.now((c) {
    if (step.fieldId != null) return c.updateField(entry.id, step.fieldId!, value: value);
    // The section as it is stored now (found by name: an unstored profile's ids change on each read).
    final sections = c.profileOf(c.character(entry.id)).sections;
    final section = sections.where((s) => s.name == step.sectionName).firstOrNull;
    c.addField(entry.id, section?.id ?? step.sectionId!, step.suggestion!, value: value);
  }),
);
