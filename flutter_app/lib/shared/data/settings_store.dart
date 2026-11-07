import 'dart:convert';

import 'database.dart';

/// Settings of the app itself, by key, each a JSON value. Kept on this device.
class SettingsStore {
  SettingsStore(this.db);
  final AppDatabase db;

  Object? read(String key) {
    final rows = db.raw.select('SELECT json FROM settings WHERE key = ?', [key]);
    if (rows.isEmpty) return null;
    try {
      return jsonDecode(rows.single['json']! as String);
    } on FormatException {
      return null; // A damaged value reads as unset; it is replaced on the next save.
    }
  }

  void write(String key, Object? value) => db.raw.execute(
    'INSERT INTO settings (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json',
    [key, jsonEncode(value)],
  );
}
