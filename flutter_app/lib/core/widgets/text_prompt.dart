import 'package:flutter/material.dart';

/// Asks for one line of text (a title, a name). Returns null when cancelled. The dialog owns its text field, so it
/// stays valid while the dialog animates away.
Future<String?> showTextPrompt(
  BuildContext context, {
  required String title,
  required String label,
  String initial = '',
  String? hint,
  String confirmLabel = 'Save',
}) => showDialog<String>(
  context: context,
  builder: (_) => _TextPrompt(title: title, label: label, initial: initial, hint: hint, confirmLabel: confirmLabel),
);

class _TextPrompt extends StatefulWidget {
  const _TextPrompt({
    required this.title,
    required this.label,
    required this.initial,
    this.hint,
    required this.confirmLabel,
  });

  final String title;
  final String label;
  final String initial;
  final String? hint;
  final String confirmLabel;

  @override
  State<_TextPrompt> createState() => _TextPromptState();
}

class _TextPromptState extends State<_TextPrompt> {
  late final _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.title),
    content: TextField(
      controller: _controller,
      autofocus: true,
      decoration: InputDecoration(labelText: widget.label, hintText: widget.hint),
      onSubmitted: (v) => Navigator.of(context).pop(v),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(onPressed: () => Navigator.of(context).pop(_controller.text), child: Text(widget.confirmLabel)),
    ],
  );
}
