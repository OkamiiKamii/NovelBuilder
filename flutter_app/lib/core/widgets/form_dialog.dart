import 'package:flutter/material.dart';

/// A dialog for a longer form: a title, the form scrolling under it, and its buttons, at most [width] wide. Unlike a
/// scrollable [AlertDialog] it never measures its content's intrinsic width, so wrapping rows of menus and chips lay
/// out the same in it as on a page.
class FormDialog extends StatelessWidget {
  const FormDialog({super.key, required this.title, required this.content, required this.actions, this.width = 560});
  final String title;
  final Widget content;
  final List<Widget> actions;
  final double width;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Dialog(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: width),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(header: true, child: Text(title, style: theme.textTheme.headlineSmall)),
              const SizedBox(height: 16),
              Flexible(child: SingleChildScrollView(child: content)),
              const SizedBox(height: 16),
              Wrap(alignment: WrapAlignment.end, spacing: 8, runSpacing: 8, children: actions),
            ],
          ),
        ),
      ),
    );
  }
}
