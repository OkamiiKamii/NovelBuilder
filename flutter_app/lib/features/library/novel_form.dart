import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/layout/breakpoints.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/novel.dart';
import 'cover_picker.dart';

/// What the novel form returns: the details, and (for a new novel) which novel's setup to start from.
typedef NovelFormResult = ({JsonMap details, String? setupFrom, String? templateId});

/// A worldbuilding template offered for a new novel: built in, or the author's own.
typedef TemplateChoice = ({String id, String name, bool builtin});

/// Creates a novel or edits a novel's details. Returns null when cancelled; nothing is saved by the form itself.
Future<NovelFormResult?> showNovelForm(
  BuildContext context, {
  Novel? editing,
  Novel? draft,
  List<Novel> others = const [],
  List<TemplateChoice> templates = const [],
}) {
  final form = _NovelForm(editing: editing, draft: draft, others: others, templates: templates);
  if (WindowSize.of(context) == WindowSize.compact) {
    return showDialog<NovelFormResult>(
      context: context,
      builder: (_) => Dialog.fullscreen(child: form),
    );
  }
  return showDialog<NovelFormResult>(
    context: context,
    builder: (_) => Dialog(
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 600, maxHeight: 760), child: form),
    ),
  );
}

class _NovelForm extends StatefulWidget {
  const _NovelForm({this.editing, this.draft, required this.others, required this.templates});

  final Novel? editing;

  /// A new novel's title, author and colour, already typed on the title page.
  final Novel? draft;
  final List<Novel> others;
  final List<TemplateChoice> templates;

  @override
  State<_NovelForm> createState() => _NovelFormState();
}

class _NovelFormState extends State<_NovelForm> {
  final _key = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.editing?.title ?? widget.draft?.title ?? '');
  late final _subtitle = TextEditingController(text: widget.editing?.subtitle ?? '');
  late final _author = TextEditingController(text: widget.editing?.author ?? widget.draft?.author ?? '');
  late final _genre = TextEditingController(text: widget.editing?.primaryGenre ?? '');
  late final _otherGenres = TextEditingController(text: widget.editing?.secondaryGenres.join(', ') ?? '');
  late final _target = TextEditingController(text: widget.editing?.targetWordCount?.toString() ?? '');
  late final _tags = TextEditingController(text: widget.editing?.tags.join(', ') ?? '');
  late final _synopsis = TextEditingController(text: widget.editing?.synopsis ?? '');
  late NovelStatus _status = widget.editing?.status ?? NovelStatus.planning;
  late String? _deadline = widget.editing?.deadline;
  late String _accent = [
    widget.editing?.accent,
    widget.draft?.accent,
  ].firstWhere(novelAccents.contains, orElse: () => novelAccents.first)!;
  late String? _cover = widget.editing?.cover;
  String? _setupFrom;
  String? _templateId;

  bool get _creating => widget.editing == null;

  @override
  void dispose() {
    for (final c in [_title, _subtitle, _author, _genre, _otherGenres, _target, _tags, _synopsis]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    if (!_key.currentState!.validate()) return;
    Navigator.of(context).pop<NovelFormResult>((
      details: {
        'title': _title.text,
        'subtitle': _subtitle.text,
        'author': _author.text,
        'status': _status.key,
        'primaryGenre': _genre.text,
        'secondaryGenres': splitList(_otherGenres.text),
        'targetWordCount': _target.text.trim(),
        'deadline': _deadline,
        'tags': splitList(_tags.text),
        'synopsis': _synopsis.text,
        'accent': _accent,
        'cover': _cover,
      },
      setupFrom: _setupFrom,
      templateId: _templateId,
    ));
  }

  Future<void> _pickDeadline() async {
    final now = DateTime.now();
    final current = _deadline == null ? null : DateTime.tryParse(_deadline!);
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? now,
      firstDate: DateTime(now.year - 50),
      lastDate: DateTime(now.year + 50),
    );
    if (picked != null) {
      setState(() => _deadline = picked.toIso8601String().substring(0, 10));
    }
  }

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: 12);
    final local = MaterialLocalizations.of(context);
    return CallbackShortcuts(
      // Cmd/Ctrl+Enter saves from anywhere in the form.
      bindings: {
        const SingleActivator(LogicalKeyboardKey.enter, meta: true): _submit,
        const SingleActivator(LogicalKeyboardKey.enter, control: true): _submit,
      },
      child: Form(
        key: _key,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _creating ? 'New novel' : 'Novel details',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: _title,
                      autofocus: true,
                      maxLength: 200,
                      decoration: const InputDecoration(labelText: 'Title *'),
                      textInputAction: TextInputAction.next,
                      validator: (v) => (v ?? '').trim().isEmpty ? 'Give the novel a title.' : null,
                    ),
                    TextFormField(
                      controller: _subtitle,
                      maxLength: 200,
                      decoration: const InputDecoration(labelText: 'Subtitle'),
                    ),
                    TextFormField(
                      controller: _author,
                      decoration: const InputDecoration(labelText: 'Author'),
                    ),
                    gap,
                    DropdownButtonFormField<NovelStatus>(
                      initialValue: _status,
                      decoration: const InputDecoration(labelText: 'Status'),
                      items: [for (final s in NovelStatus.values) DropdownMenuItem(value: s, child: Text(s.label))],
                      onChanged: (s) => setState(() => _status = s ?? _status),
                    ),
                    gap,
                    Autocomplete<String>(
                      initialValue: TextEditingValue(text: _genre.text),
                      optionsBuilder: (value) {
                        final q = value.text.trim().toLowerCase();
                        return q.isEmpty ? const [] : genreSuggestions.where((g) => g.toLowerCase().contains(q));
                      },
                      onSelected: (g) => _genre.text = g,
                      fieldViewBuilder: (context, controller, focus, onSubmit) => TextFormField(
                        controller: controller,
                        focusNode: focus,
                        decoration: const InputDecoration(labelText: 'Main genre', hintText: 'Any genre, or none'),
                        onChanged: (v) => _genre.text = v,
                      ),
                    ),
                    gap,
                    TextFormField(
                      controller: _otherGenres,
                      decoration: const InputDecoration(labelText: 'Other genres', hintText: 'Separated by commas'),
                    ),
                    gap,
                    TextFormField(
                      controller: _target,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(labelText: 'Target word count', hintText: 'Optional'),
                    ),
                    gap,
                    // Wraps rather than overflowing on a phone with large text.
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8,
                      children: [
                        Text(
                          _deadline == null
                              ? 'No deadline'
                              : 'Deadline: ${local.formatMediumDate(DateTime.parse(_deadline!))}',
                        ),
                        TextButton(
                          onPressed: _pickDeadline,
                          child: Text(_deadline == null ? 'Set deadline' : 'Change'),
                        ),
                        if (_deadline != null)
                          TextButton(onPressed: () => setState(() => _deadline = null), child: const Text('Clear')),
                      ],
                    ),
                    gap,
                    TextFormField(
                      controller: _tags,
                      decoration: const InputDecoration(labelText: 'Tags', hintText: 'Separated by commas'),
                    ),
                    gap,
                    TextFormField(
                      controller: _synopsis,
                      minLines: 3,
                      maxLines: 8,
                      decoration: const InputDecoration(labelText: 'Synopsis', alignLabelWithHint: true),
                    ),
                    gap,
                    CoverField(
                      title: _title.text,
                      accent: _accent,
                      cover: _cover,
                      onChanged: (v) => setState(() => _cover = v),
                    ),
                    gap,
                    Text('Colour (when there is no cover picture)', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final (i, hex) in novelAccents.indexed)
                          ChoiceChip(
                            label: Text(novelAccentNames[i]),
                            avatar: CircleAvatar(backgroundColor: Color(int.parse('ff${hex.substring(1)}', radix: 16))),
                            selected: _accent == hex,
                            onSelected: (_) => setState(() => _accent = hex),
                          ),
                      ],
                    ),
                    if (_creating && widget.others.isNotEmpty) ...[
                      gap,
                      DropdownButtonFormField<String?>(
                        initialValue: _setupFrom,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Start from',
                          helperText:
                              'Another novel\'s setup: its record kinds and fields, relationship types, calendar, '
                              'progress tracking and systems. None of its story comes along.',
                          helperMaxLines: 3,
                        ),
                        items: [
                          const DropdownMenuItem<String?>(child: Text('A blank novel')),
                          for (final n in widget.others)
                            DropdownMenuItem<String?>(
                              value: n.id,
                              child: Text('The setup of “${n.title}”', overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (v) => setState(() => _setupFrom = v),
                      ),
                    ],
                    if (_creating && widget.templates.isNotEmpty) ...[
                      gap,
                      DropdownButtonFormField<String?>(
                        initialValue: _templateId,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Worldbuilding template',
                          helperText: 'Categories and fields to start with. Only adds; you can change all of it later.',
                          helperMaxLines: 2,
                        ),
                        items: [
                          const DropdownMenuItem<String?>(child: Text('None')),
                          for (final t in widget.templates)
                            DropdownMenuItem<String?>(
                              value: t.id,
                              child: Text(t.builtin ? t.name : '${t.name} (yours)', overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (v) => setState(() => _templateId = v),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: Wrap(
                alignment: WrapAlignment.end,
                spacing: 8,
                children: [
                  TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
                  FilledButton(onPressed: _submit, child: Text(_creating ? 'Create novel' : 'Save details')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
