// Records what the cast's tools hear of a character in the field it belongs to. A port of
// flutter_app/lib/shared/domain/characters/record_look.dart: `recordIn`, `recordAppearance`, `recordStake`, and
// `recordLook` (a colour checked against the pages, looks.ts), `recordFace` (the face drawn in "Draw their face",
// aids/likeness.ts) and `recordTraits` (the this-or-that deck, thisOrThat.ts).

import { dartToUpperCase } from '../exchange/dartUpperCase';
import { type FieldType } from '../records/category';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type Likeness, wordsFor } from './aids/likeness';
import { type CharacterChanges } from './characterChanges';
import { type CharacterProfile, FieldSuggestion, type ProfileSection } from './characterRecords';
import { kindOf, settled } from './fieldKinds';
import { type Feature, featureFieldNames, featureLabel } from './looks';
import { type Stake, stakeField, stakeFieldNames } from './stakes';
import { traitsAfter } from './thisOrThat';

/** Records `value` as the character's `feature` (looks.ts): in the field they keep it in already ("Eyes", "Eye
 * colour"), else as a new field in the profile's appearance section (or its first of who they are). */
export function recordLook(c: CharacterChanges, entryId: string, feature: Feature, value: string): void {
  recordAppearance(c, entryId, featureLabel[feature], featureFieldNames[feature], value);
}

/** Records `value` in the field named `label` (or one of `names`, in lower case, that they keep it in already), else
 * as a new field `label` in the profile's appearance section (or its first of who they are). */
export function recordAppearance(
  c: CharacterChanges,
  entryId: string,
  label: string,
  names: readonly string[],
  value: string,
): void {
  recordIn(c, entryId, label, names, value, { sections: ['appearance'], newSection: 'Appearance' });
}

/** Records `value` in the field named `label` (or one of `names`, in lower case, that they keep it in already), else
 * as a new field `label` in the first section whose name holds one of `sections` (or their first of who they are). A
 * profile with no section at all is given one, `newSection`, so what was chosen is never lost. */
export function recordIn(
  c: CharacterChanges,
  entryId: string,
  label: string,
  names: readonly string[],
  value: string,
  options: { sections: readonly string[]; newSection: string; type?: FieldType },
): void {
  const { sections, newSection } = options;
  const type = options.type ?? 'text';
  const entry = c.character(entryId);
  const field = entry.fields.find((f) => names.includes(dartToLowerCase(dartTrim(f.key))));
  if (field !== undefined) {
    // A field whose answer has a known shape (fieldKinds.ts), made before as plain text, takes its shape now.
    const kind = field.defId === null && (field.type ?? 'text') === 'text' ? kindOf(field.key) : null;
    c.updateField(entryId, field.id, { value: settled(kind, value), type: kind?.type ?? null, options: kind?.options ?? null });
    return;
  }
  const sectionOf = (profile: CharacterProfile): ProfileSection | null =>
    sections.flatMap((want) => profile.sections.filter((s) => dartToLowerCase(s.name).includes(want)))[0] ??
    profile.sections.find((s) => s.name === 'Core Identity') ??
    profile.sections.find((s) => s.tab === 'overview') ??
    profile.sections[0] ??
    null;
  let section = sectionOf(c.profileOf(entry));
  if (section === null) {
    c.addSection(entryId, newSection);
    section = sectionOf(c.profileOf(c.character(entryId)));
    if (section === null) return;
  }
  c.addField(entryId, section.id, new FieldSuggestion(label, type), { value });
}

/** Records `value` as the character's answer to `stake` (stakes.ts): in the field that answers it already, else as a
 * new field of the stake's own name in their goals, stakes, arc or role in the story. */
export function recordStake(c: CharacterChanges, entryId: string, stake: Stake, value: string): void {
  recordIn(c, entryId, stakeField[stake], stakeFieldNames[stake], value, {
    sections: ['goals', 'stakes', 'opposition', 'role in the story', 'arc'],
    newSection: 'Goals & Stakes',
  });
}

/** Records the face drawn in "Draw their face": the hair, the eyes and the skin in their fields (only what was chosen,
 * and only where it changed), and each mark not already written added to Distinguishing Features, after what is
 * there. Nothing written is taken away. */
export function recordFace(c: CharacterChanges, entryId: string, was: Likeness, now: Likeness): void {
  const before = wordsFor(was);
  const after = wordsFor(now);
  if (after.hair !== null && (now.hair !== was.hair || now.cut !== was.cut || now.curly !== was.curly)) {
    recordAppearance(c, entryId, 'Hair', ['hair', 'hair colour', 'hair color'], after.hair);
  }
  if (after.eyes !== null && now.eyes !== was.eyes) {
    recordAppearance(c, entryId, 'Eyes', ['eyes', 'eye colour', 'eye color', 'eye'], after.eyes);
  }
  if (after.skin !== null && (now.skin !== was.skin || now.skinFamily !== was.skinFamily)) {
    recordAppearance(c, entryId, 'Skin', ['skin', 'skin tone', 'complexion'], after.skin);
  }
  const added = after.marks.filter((m) => !before.marks.includes(m));
  if (added.length === 0) return;
  const entry = c.character(entryId);
  const names = ['distinguishing features', 'features'];
  const field = entry.fields.find((f) => names.includes(dartToLowerCase(dartTrim(f.key))));
  const text = added.join(', ');
  const written = field === undefined ? '' : dartTrim(field.value);
  const value =
    written.length === 0
      ? `${dartToUpperCase(text[0])}${text.substring(1)}.`
      : `${written.replace(/[.\s]*$/, '')}; ${text}.`;
  recordAppearance(c, entryId, 'Distinguishing Features', names, value);
}

/** Records the deck's choices (thisOrThat.ts) in the character's Core Traits (or the traits field they keep), one to
 * a line; else a new Core Traits list in their personality. */
export function recordTraits(c: CharacterChanges, entryId: string, sides: ReadonlyMap<string, number | null>): void {
  const names = ['core traits', 'traits', 'personality traits', 'personality'];
  const entry = c.character(entryId);
  const stored = entry.fields.find((f) => names.includes(dartToLowerCase(dartTrim(f.key))))?.value ?? '';
  recordIn(c, entryId, 'Core Traits', names, traitsAfter(stored, sides), {
    sections: ['personality', 'psychology'],
    newSection: 'Personality & Psychology',
    type: 'tags',
  });
}
