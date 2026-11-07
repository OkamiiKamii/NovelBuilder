import 'package:flutter/material.dart';

import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/templates.dart';
import '../../shared/domain/records/category.dart' show FieldType;
import '../../shared/domain/records/entry.dart';
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

/// The interview as a dialog over the profile: one question at a time, how far through, the answer, and Next (saves
/// it and goes on), Skip and Done. [save] puts one answer into its field.
Future<void> showInterview(
  BuildContext context, {
  required Entry entry,
  required CharacterProfile profile,
  required List<CharacterTemplate> templates,
  required void Function(InterviewStep step, String value) save,
}) => showDialog<void>(
  context: context,
  builder: (_) => _Interview(steps: interviewFor(entry, profile, templates), name: entry.name, save: save),
);

class _Interview extends StatefulWidget {
  const _Interview({required this.steps, required this.name, required this.save});
  final List<InterviewStep> steps;
  final String name;
  final void Function(InterviewStep step, String value) save;

  @override
  State<_Interview> createState() => _InterviewState();
}

class _InterviewState extends State<_Interview> {
  final _answer = TextEditingController();
  int _at = 0;
  int _answered = 0;

  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }

  void _next({required bool keep}) {
    final step = widget.steps[_at];
    if (keep && _answer.text.trim().isNotEmpty) {
      widget.save(step, storedAnswer(step.type, _answer.text));
      _answered++;
    }
    _answer.clear();
    if (_at + 1 >= widget.steps.length) {
      Navigator.of(context).pop();
    } else {
      setState(() => _at++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final step = widget.steps[_at];
    return AlertDialog(
      title: Text('Interview with ${widget.name}'),
      scrollable: true,
      content: SizedBox(
        width: 520,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              label: 'Question ${_at + 1} of ${widget.steps.length}',
              excludeSemantics: true,
              child: Row(
                children: [
                  for (var i = 0; i < widget.steps.length; i++)
                    Expanded(
                      child: Container(
                        height: 3,
                        margin: const EdgeInsets.only(right: 3),
                        color: i <= _at ? scheme.primary : scheme.outlineVariant,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            Text(step.ask, style: vaultText(context, size: 23)),
            const SizedBox(height: 4),
            Text(
              'Goes into ${step.fieldName}',
              style: vaultText(context, size: 15, style: FontStyle.italic, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 14),
            TextField(
              key: ValueKey(step.fieldName),
              controller: _answer,
              autofocus: true,
              minLines: 3,
              maxLines: 8,
              style: vaultText(context, size: 18),
              decoration: InputDecoration(labelText: 'Answer', hintText: step.hint),
              onChanged: (_) => setState(() {}),
            ),
            if (_answered > 0) ...[
              const SizedBox(height: 8),
              Text(
                '${_answered == 1 ? 'One answer' : '$_answered answers'} saved to the profile.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        TextButton(onPressed: () => _next(keep: false), child: const Text('Skip')),
        FilledButton(
          onPressed: _answer.text.trim().isEmpty ? null : () => _next(keep: true),
          child: Text(_at + 1 >= widget.steps.length ? 'Save and finish' : 'Next'),
        ),
      ],
    );
  }
}
