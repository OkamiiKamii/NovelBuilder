// Records what the cast's tools hear of a character in the field it belongs to. A port of `recordIn`,
// `recordAppearance` and `recordStake` from flutter_app/lib/shared/domain/characters/record_look.dart. (`recordLook`,
// `recordFace` and `recordTraits` there read the looks, the drawn face and the this-or-that deck, which are not ported
// yet.)

import { type FieldType } from '../records/category';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type CharacterChanges } from './characterChanges';
import { type CharacterProfile, FieldSuggestion, type ProfileSection } from './characterRecords';
import { kindOf, settled } from './fieldKinds';
import { type Stake, stakeField, stakeFieldNames } from './stakes';

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
