import 'package:flutter/material.dart';

import 'hold_to_confirm.dart';

/// Asks before doing something. Resolves to true only when the author chooses [confirmLabel];
/// Cancel, Escape and tapping outside all resolve to false.
///
/// Destructive confirmations put focus on Cancel, so pressing Enter by reflex does not delete anything.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            autofocus: destructive,
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(cancelLabel),
          ),
          // What cannot be taken back is held, not pressed (`hold_to_confirm.dart`).
          if (destructive)
            HoldToConfirm(label: confirmLabel, onConfirmed: () => Navigator.of(context).pop(true))
          else
            FilledButton(autofocus: true, onPressed: () => Navigator.of(context).pop(true), child: Text(confirmLabel)),
        ],
      );
    },
  );
  return result ?? false;
}
