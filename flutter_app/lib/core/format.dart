import 'package:flutter/material.dart';

/// 12345 → "12,345".
String formatNumber(num n) {
  final digits = n.round().abs().toString();
  final out = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  return out.toString();
}

/// "1 chapter", "3 chapters".
String plural(int n, String one, [String? many]) => '${formatNumber(n)} ${n == 1 ? one : (many ?? '${one}s')}';

/// When something happened, in words: "just now", "5 minutes ago", "yesterday", or the date.
String formatRelative(BuildContext context, num? millis, {DateTime? now}) {
  if (millis == null || millis <= 0) return 'never';
  final at = DateTime.fromMillisecondsSinceEpoch(millis.toInt());
  final current = now ?? DateTime.now();
  final ago = current.difference(at);
  if (ago.inSeconds < 60) return 'just now';
  if (ago.inMinutes < 60) return '${plural(ago.inMinutes, 'minute')} ago';
  if (ago.inHours < 24 && at.day == current.day) return '${plural(ago.inHours, 'hour')} ago';
  final today = DateTime(current.year, current.month, current.day);
  final day = DateTime(at.year, at.month, at.day);
  if (today.difference(day).inDays == 1) return 'yesterday';
  return MaterialLocalizations.of(context).formatMediumDate(at);
}
