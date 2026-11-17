// The Flutter app calls the world's records "the Codex"; Scriptor calls that part World (Organize › World). The module
// screens' messages were ported word for word and then given Scriptor's name in these exact phrases (the built-in
// modules' own data keeps the Flutter app's words). The golden test turns
// them back (`toFlutterWords`) before comparing with the Dart, so the agreement is still checked word for word.

/** [Flutter's phrase, Scriptor's phrase], applied in this order. */
export const codexPhrases: readonly (readonly [string, string])[] = [
  ['Open in the Codex', 'Open in World'],
  ['This is a record in the Codex under', 'This is a record in World under'],
  ['on its Codex page', 'on its World page'],
  ['its categories are in the Codex', 'its categories are in World'],
  ['no longer in the Codex', 'no longer in World'],
  ['Adds to the Codex:', 'Adds to World:'],
  ['which is not in the Codex', 'which is not in World'],
];

/** Scriptor's text as the Flutter app words it (for comparing with the Dart's output). */
export function toFlutterWords(json: string): string {
  let s = json;
  for (const [flutter, scriptor] of codexPhrases) s = s.split(scriptor).join(flutter);
  return s;
}
