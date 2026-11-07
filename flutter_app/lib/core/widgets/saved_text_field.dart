import 'package:flutter/material.dart';

/// A text field for a stored value that saves as it is typed: [onChanged] is called with every change (callers
/// schedule the save through autosave, so the save status shows it and it survives the app being paused).
///
/// The field owns its text while it has focus: a refresh of the stored value never overwrites what is being typed.
/// When the stored value changes from elsewhere and the field is not in use, it shows the new value.
class SavedTextField extends StatefulWidget {
  const SavedTextField({
    super.key,
    required this.value,
    required this.onChanged,
    this.label,
    this.hint,
    this.helper,
    this.multiline = false,
    this.minLines,
    this.keyboardType,
    this.style,
    this.textInputAction,
    this.onSubmitted,
    this.dense = false,
    this.errorText,
    this.autofocus = false,
    this.semanticsLabel,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String? label;
  final String? hint;
  final String? helper;
  final bool multiline;
  final int? minLines;
  final TextInputType? keyboardType;
  final TextStyle? style;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final bool dense;

  /// Said under the field (a value that does not fit its field). Never stops the value being kept.
  final String? errorText;
  final bool autofocus;

  /// For a field with no visible label.
  final String? semanticsLabel;

  @override
  State<SavedTextField> createState() => _SavedTextFieldState();
}

class _SavedTextFieldState extends State<SavedTextField> {
  late final _controller = TextEditingController(text: widget.value);
  final _focus = FocusNode();

  @override
  void didUpdateWidget(SavedTextField old) {
    super.didUpdateWidget(old);
    if (widget.value != old.value && !_focus.hasFocus && _controller.text != widget.value) {
      _controller.text = widget.value;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final field = TextField(
      controller: _controller,
      focusNode: _focus,
      autofocus: widget.autofocus,
      style: widget.style,
      keyboardType: widget.keyboardType ?? (widget.multiline ? TextInputType.multiline : null),
      textInputAction: widget.textInputAction,
      minLines: widget.multiline ? (widget.minLines ?? 2) : 1,
      maxLines: widget.multiline ? null : 1,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hint,
        helperText: widget.helper,
        helperMaxLines: 3,
        errorText: widget.errorText,
        errorMaxLines: 3,
        isDense: widget.dense,
      ),
    );
    final label = widget.semanticsLabel;
    return label == null ? field : Semantics(label: label, textField: true, child: field);
  }
}
