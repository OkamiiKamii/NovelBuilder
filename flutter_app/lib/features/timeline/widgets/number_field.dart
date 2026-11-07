import 'package:flutter/material.dart';

/// A whole number the author types, saved when they leave the field or press Enter (not on every keystroke, so a
/// year is never saved half-typed). Empty is "not set". A value [check] refuses is said under the field, and the
/// stored value stays as it was.
class NumberField extends StatefulWidget {
  const NumberField({
    super.key,
    required this.label,
    required this.value,
    required this.onCommit,
    this.check,
    this.hint,
    this.helper,
    this.enabled = true,
    this.allowEmpty = true,
    this.decimals = false,
  });

  final String label;
  final num? value;
  final ValueChanged<num?> onCommit;

  /// Why a value cannot be saved, or null when it can.
  final String? Function(num? value)? check;
  final String? hint;
  final String? helper;
  final bool enabled;
  final bool allowEmpty;
  final bool decimals;

  @override
  State<NumberField> createState() => _NumberFieldState();
}

String _show(num? n) => n == null ? '' : (n == n.truncate() ? '${n.truncate()}' : '$n');

class _NumberFieldState extends State<NumberField> {
  late final _controller = TextEditingController(text: _show(widget.value));
  final _focus = FocusNode();
  String? _problem;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus) _commit();
    });
  }

  @override
  void didUpdateWidget(NumberField old) {
    super.didUpdateWidget(old);
    if (widget.value != old.value && !_focus.hasFocus) _controller.text = _show(widget.value);
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _commit() {
    final text = _controller.text.trim();
    final parsed = text.isEmpty ? null : num.tryParse(text);
    String? problem;
    if (text.isNotEmpty && parsed == null) {
      problem = 'Give a number; it was not changed.';
    } else if (parsed == null && !widget.allowEmpty) {
      problem = 'Give a number; it was not changed.';
    } else if (parsed != null && !widget.decimals && parsed != parsed.truncate()) {
      problem = 'Give a whole number; it was not changed.';
    } else {
      problem = widget.check?.call(parsed);
    }
    setState(() => _problem = problem);
    if (problem != null) return;
    if (parsed != widget.value) widget.onCommit(parsed);
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _controller,
    focusNode: _focus,
    enabled: widget.enabled,
    keyboardType: const TextInputType.numberWithOptions(signed: true, decimal: true),
    textInputAction: TextInputAction.done,
    onSubmitted: (_) => _commit(),
    decoration: InputDecoration(
      labelText: widget.label,
      hintText: widget.hint,
      helperText: widget.helper,
      helperMaxLines: 2,
      errorText: _problem,
      errorMaxLines: 3,
    ),
  );
}
