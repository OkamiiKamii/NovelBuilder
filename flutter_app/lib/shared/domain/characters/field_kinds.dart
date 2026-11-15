/// FIELD KINDS: the fields of a character whose answer has a known shape, by name, wherever they are made or shown. A
/// Gender is chosen, Male or Female, never typed; Pronouns follow it (He/him or She/her); an Age is a number; a Date of
/// Birth a date; an Alignment one of the nine. Any other field is what its author made it.
///
/// A value written before (or written another way: "male", "man", "she") is read as its choice; one that is none of
/// them is kept and shown as written, never changed or dropped.
library;

import '../records/category.dart' show FieldType;

/// The shape a field's answer takes: its type and, for a choice, the choices.
typedef FieldKind = ({FieldType type, List<String> options});

const genders = ['Male', 'Female'];
const pronounChoices = ['He/him', 'She/her'];
const alignments = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
];

const Map<String, FieldKind> _kinds = {
  'gender': (type: FieldType.select, options: genders),
  'sex': (type: FieldType.select, options: genders),
  'pronouns': (type: FieldType.select, options: pronounChoices),
  'age': (type: FieldType.number, options: []),
  'date of birth': (type: FieldType.date, options: []),
  'birth date': (type: FieldType.date, options: []),
  'birthdate': (type: FieldType.date, options: []),
  'birthday': (type: FieldType.date, options: []),
  'alignment': (type: FieldType.select, options: alignments),
  'loyalty': (type: FieldType.number, options: []),
  'ambition': (type: FieldType.number, options: []),
  'political influence': (type: FieldType.number, options: []),
};

/// The kind of the field named [name] (any case), or null for a field that is what its author makes it.
FieldKind? kindOf(String name) => _kinds[name.trim().toLowerCase()];

/// What a field of [kind] is, said in its settings ("Gender is a choice: Male or Female.").
String kindNote(String name, FieldKind kind) {
  final n = name.trim().isEmpty ? 'This field' : name.trim();
  return switch (kind.type) {
    FieldType.select =>
      '$n is a choice: ${kind.options.length <= 3 ? kind.options.join(' or ') : 'one of ${kind.options.length}'}.',
    FieldType.number => '$n is a number.',
    FieldType.date => '$n is a date, chosen from a calendar or written yyyy-mm-dd.',
    _ => '$n is ${kind.type.label.toLowerCase()}.',
  };
}

const _sayings = <String, List<String>>{
  'Male': ['male', 'man', 'boy', 'm', 'masculine', 'he', 'him'],
  'Female': ['female', 'woman', 'girl', 'f', 'lady', 'feminine', 'she', 'her'],
  'He/him': ['he', 'him', 'he/him', 'he / him', 'he/him/his', 'his'],
  'She/her': ['she', 'her', 'she/her', 'she / her', 'she/her/hers', 'hers'],
};

/// [value] as [kind] reads it: for a choice, the choice it says (in any case, or another way of saying it: "man" is
/// Male); else, and for anything that is none of the choices, [value] as written.
String settled(FieldKind? kind, String value) {
  final v = value.trim();
  if (kind == null || kind.type != FieldType.select || v.isEmpty) return value;
  final lower = v.toLowerCase();
  for (final o in kind.options) {
    if (o.toLowerCase() == lower) return o;
    if ((_sayings[o] ?? const []).contains(lower)) return o;
  }
  return value;
}
