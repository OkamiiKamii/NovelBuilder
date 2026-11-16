import 'package:flutter/material.dart';

import '../layout/breakpoints.dart';

/// A CHOICE FROM A LIST, AS LONG AS THE BOOK MAKES IT: a field of the form, chosen from [items], taking what a
/// `DropdownButtonFormField` takes.
///
/// A short list ([longFrom] items or fewer: a status, a kind, a unit) is that dropdown, as it always was. A long one
/// (the chapters, the cast, the places of a book) is not: a dropdown builds every one of its items with the page (to
/// size itself), so a page with a chapter range on a long book built hundreds of rows nobody had opened, and finding
/// chapter 237 meant scrolling to it. Here the field shows only what is chosen; pressed, a list opens with a line to
/// type in, narrowing it as one types, and only the rows on the screen are built.
class ChoiceField<T> extends StatefulWidget {
  const ChoiceField({
    super.key,
    required this.items,
    required this.onChanged,
    this.initialValue,
    @Deprecated('Use initialValue') this.value,
    this.decoration,
    this.isExpanded = false,
    this.hint,
  });

  final List<DropdownMenuItem<T>> items;

  /// Null: the field cannot be changed.
  final ValueChanged<T?>? onChanged;
  final T? initialValue;
  final T? value;
  final InputDecoration? decoration;
  final bool isExpanded;
  final Widget? hint;

  /// The most items a list is a plain dropdown for.
  static const longFrom = 12;

  @override
  State<ChoiceField<T>> createState() => _ChoiceFieldState<T>();
}

class _ChoiceFieldState<T> extends State<ChoiceField<T>> {
  // ignore: deprecated_member_use_from_same_package
  T? get _given => widget.initialValue ?? widget.value;
  late T? _value = _given;

  @override
  void didUpdateWidget(ChoiceField<T> old) {
    super.didUpdateWidget(old);
    // ignore: deprecated_member_use_from_same_package
    if ((old.initialValue ?? old.value) != _given) _value = _given;
  }

  Future<void> _choose() async {
    final picked = await showDialog<(T?,)>(
      context: context,
      builder: (context) =>
          _ChoiceList<T>(title: widget.decoration?.labelText ?? 'Choose', items: widget.items, chosen: _value),
    );
    if (picked == null || !mounted) return;
    setState(() => _value = picked.$1);
    widget.onChanged?.call(picked.$1);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.length <= ChoiceField.longFrom) {
      return DropdownButtonFormField<T>(
        initialValue: _given,
        isExpanded: widget.isExpanded,
        decoration: widget.decoration ?? const InputDecoration(),
        items: widget.items,
        onChanged: widget.onChanged,
        hint: widget.hint,
      );
    }
    final theme = Theme.of(context);
    final enabled = widget.onChanged != null;
    final chosen = widget.items.where((i) => i.value == _value).firstOrNull;
    final shown = chosen?.child ?? widget.hint;
    return Semantics(
      button: true,
      value: chosen == null ? null : textOf(chosen.child),
      child: InkWell(
        onTap: enabled ? _choose : null,
        child: InputDecorator(
          decoration: (widget.decoration ?? const InputDecoration())
              .applyDefaults(theme.inputDecorationTheme)
              .copyWith(enabled: enabled),
          isEmpty: shown == null,
          child: Row(
            children: [
              Expanded(
                // Said once, as the field's value, not again in its label.
                child: DefaultTextStyle.merge(
                  style: theme.textTheme.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  child: ExcludeSemantics(excluding: chosen != null, child: shown ?? const SizedBox.shrink()),
                ),
              ),
              Icon(Icons.arrow_drop_down, color: enabled ? theme.colorScheme.onSurfaceVariant : theme.disabledColor),
            ],
          ),
        ),
      ),
    );
  }
}

/// The words of an item, for finding it by typing: its text, or the texts inside it.
String textOf(Widget w) => switch (w) {
  Text(:final data?) => data,
  Text(:final textSpan?) => textSpan.toPlainText(),
  RichText(:final text) => text.toPlainText(),
  Flex(:final children) => children.map(textOf).where((t) => t.isNotEmpty).join(' '),
  SingleChildRenderObjectWidget(:final child?) => textOf(child),
  ProxyWidget(:final child) => textOf(child),
  _ => '',
};

/// The list a long [ChoiceField] opens: a line to type in, and the items that hold what is typed.
class _ChoiceList<T> extends StatefulWidget {
  const _ChoiceList({required this.title, required this.items, required this.chosen});

  final String title;
  final List<DropdownMenuItem<T>> items;
  final T? chosen;

  @override
  State<_ChoiceList<T>> createState() => _ChoiceListState<T>();
}

class _ChoiceListState<T> extends State<_ChoiceList<T>> {
  final _find = TextEditingController();
  late final _words = [for (final i in widget.items) textOf(i.child).toLowerCase()];

  @override
  void dispose() {
    _find.dispose();
    super.dispose();
  }

  /// The items holding every word typed, in any order.
  List<DropdownMenuItem<T>> _holding() {
    final wanted = _find.text.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    return [
      for (final (i, item) in widget.items.indexed)
        if (wanted.every(_words[i].contains)) item,
    ];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final phone = WindowSize.of(context) == WindowSize.compact;
    final shown = _holding();
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 8, 0),
          child: Row(
            children: [
              Expanded(
                child: Semantics(header: true, child: Text(widget.title, style: theme.textTheme.titleLarge)),
              ),
              IconButton(tooltip: 'Close', onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
          child: TextField(
            controller: _find,
            // On a phone the list comes first; the keyboard only when the line is pressed.
            autofocus: !phone,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: 'Type to find one of ${widget.items.length}',
              isDense: true,
            ),
            onChanged: (_) => setState(() {}),
            // Enter with one left chooses it (read from the line as it is now, not as last drawn).
            onSubmitted: (_) {
              final left = _holding().where((i) => i.enabled).toList();
              if (left.length == 1) Navigator.pop(context, (left.single.value,));
            },
          ),
        ),
        Expanded(
          child: shown.isEmpty
              ? Center(child: Text('Nothing here holds “${_find.text.trim()}”.', style: theme.textTheme.bodyMedium))
              : ListView.builder(
                  itemCount: shown.length,
                  itemBuilder: (context, i) {
                    final item = shown[i];
                    final selected = item.value == widget.chosen;
                    return ListTile(
                      enabled: item.enabled,
                      selected: selected,
                      title: DefaultTextStyle.merge(maxLines: 2, overflow: TextOverflow.ellipsis, child: item.child),
                      trailing: selected ? const Icon(Icons.check) : null,
                      onTap: () => Navigator.pop(context, (item.value,)),
                    );
                  },
                ),
        ),
      ],
    );
    if (phone) return Dialog.fullscreen(child: SafeArea(child: body));
    return Dialog(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 520, maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: body,
      ),
    );
  }
}
