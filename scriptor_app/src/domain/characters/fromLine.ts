// What a character's line said, recorded on the new character. A port of
// flutter_app/lib/shared/domain/characters/from_line.dart.

import { str } from '../json';
import { Entry } from '../records/entry';
import { RelationChanges } from '../relationships/relationChanges';
import { dartToLowerCase } from '../text/dartString';
import { type CharacterChanges } from './characterChanges';
import { FieldSuggestion } from './characterRecords';
import { type LineTie } from './oneLine';

/** Records on a new character what their line said (readOneLine): each field in the profile's first section of who
 * they are (Core Identity, or else the first on the overview), a place of origin the world already holds as a link to
 * it, and each tie as a relationship of its kind, who is which as the line said. `fields` in the order the casting
 * call lists them (Age, Gender, Species, Occupation, Place of Origin). */
export function recordFromLine(
  c: CharacterChanges,
  entryId: string,
  fields: ReadonlyMap<string, string>,
  ties: readonly LineTie[],
): void {
  if (fields.size > 0) {
    const profile = c.profileOf(c.character(entryId));
    const section =
      profile.sections.find((s) => s.name === 'Core Identity') ??
      profile.sections.find((s) => s.tab === 'overview') ??
      profile.sections[0] ??
      null;
    if (section !== null) {
      for (const [name, value] of fields) {
        const place =
          name === 'Place of Origin'
            ? (c
                .rows('loreEntries')
                .find(
                  (e) => e['category'] === 'location' && dartToLowerCase(new Entry(e).name) === dartToLowerCase(value),
                ) ?? null)
            : null;
        c.addField(
          entryId,
          section.id,
          place === null ? new FieldSuggestion(name) : new FieldSuggestion(name, 'reference'),
          { value: place === null ? value : str(place['id']) },
        );
      }
    }
  }
  if (ties.length > 0) {
    const r = new RelationChanges(c.snapshot, { now: c.now, createId: () => c.newId() });
    for (const t of ties) {
      if (r.row('loreEntries', t.otherId) === null) continue;
      if (t.newIsFrom) {
        r.createRelation(entryId, t.otherId, t.preset);
      } else {
        r.createRelation(t.otherId, entryId, t.preset);
      }
    }
    c.snapshot = r.snapshot;
  }
}
