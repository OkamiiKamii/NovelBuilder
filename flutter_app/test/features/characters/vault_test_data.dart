import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/relationships/relation_changes.dart';

/// A plain square picture of one colour, as a portrait for test characters.
String testPortrait(int r, int g, int b) {
  final picture = img.Image(width: 64, height: 64)..clear(img.ColorRgb8(r, g, b));
  return 'data:image/png;base64,${base64Encode(Uint8List.fromList(img.encodePng(picture)))}';
}

/// TEST DATA ONLY (never in a real library): Kaelen Draven of the design reference, made through the app's own
/// changes: the general layout, his identity facts, his traits, a wound and a goal, a symbol, and five relationships.
String addKaelen(ProviderContainer c, String novelId) => c.read(characterServiceProvider).change(novelId, (ch) {
  final kael = ch.create(
    name: 'Kaelen Draven',
    epithet: 'The Oathbreaker',
    roles: ['Protagonist'],
    templateId: 'general',
  );
  ch.identity(kael.id, IdentityChanges(image: (value: testPortrait(60, 50, 40))));
  final sections = CharacterProfile(ch.rows('characterProfiles').firstWhere((p) => p['entryId'] == kael.id)).sections;
  String section(String name) => sections.firstWhere((s) => s.name == name).id;
  for (final (name, value) in [
    ('Age', '27'),
    ('Gender', 'Male'),
    ('Occupation', 'Warrior'),
    ('Alignment', 'Chaotic Neutral'),
  ]) {
    ch.addField(kael.id, section('Core Identity'), FieldSuggestion(name), value: value);
  }
  ch.addField(
    kael.id,
    section('Personality & Psychology'),
    const FieldSuggestion('Core Traits', FieldType.tags),
    value: 'Brooding\nLoyal\nClever\nGuarded\nProtective',
  );
  ch.addField(
    kael.id,
    section('Character Arc'),
    const FieldSuggestion('Wounds', FieldType.longtext),
    value: 'Betrayed by the king he swore to protect.',
  );
  ch.addField(
    kael.id,
    section('Character Arc'),
    const FieldSuggestion('Goal', FieldType.longtext),
    value: 'Uncover the truth and reclaim his honor, or destroy the kingdom that took it.',
  );
  ch.addField(kael.id, section('Core Identity'), const FieldSuggestion('Symbol'), value: 'Broken Sword');
  final others = [
    ('Mira Vale', 'rivals', (120, 70, 60)),
    ('Ren Ashford', 'allies', (70, 90, 120)),
    ('Sera Lune', 'romantic-interest', (140, 110, 80)),
    ('Tomas Hale', 'mentor-student', (90, 90, 70)),
    ('Ilya Thorn', 'enemies', (100, 60, 90)),
  ];
  final ids = <String>[];
  for (final (name, preset, (r, g, b)) in others) {
    final o = ch.create(name: name, templateId: 'supporting');
    ch.identity(o.id, IdentityChanges(image: (value: testPortrait(r, g, b))));
    ids.add(o.id);
    final rel = RelationChanges(ch.snapshot, now: ch.now, createId: ch.newId);
    preset == 'mentor-student' ? rel.createRelation(o.id, kael.id, preset) : rel.createRelation(kael.id, o.id, preset);
    ch.snapshot = rel.snapshot;
  }
  // Two of them know each other, so the web joins them too.
  final rel = RelationChanges(ch.snapshot, now: ch.now, createId: ch.newId)..createRelation(ids[1], ids[2], 'friends');
  ch.snapshot = rel.snapshot;
  return kael.id;
});
