import { describe, expect, it } from 'vitest';
import { cleanUses, mergeUses, missingFor, readyViews, remapUses } from './capabilities';
import type { Category, FieldDef, KindUses } from './types';

const f = (id: string, name: string, type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({ id, name, type, options: [], ...extra });
const FIELDS = [f('found', 'Found', 'number'), f('lost', 'Lost', 'date'), f('east', 'East', 'number'), f('north', 'North', 'number'), f('tier', 'Tier', 'select', { options: ['Low', 'Mid', 'High'] }), f('keeper', 'Keeper', 'reference'), f('code', 'Code', 'text'), f('bonds', 'Bonds', 'references')];
const kind = (uses?: KindUses, fields = FIELDS): Category => ({ key: 'custom-a', name: 'Artifacts', singular: 'Artifact', color: '#000', builtin: false, order: 9, fields, ...(uses ? { uses } : {}) });
const FULL: KindUses = { timeline: { start: 'found', end: 'lost' }, map: { x: 'east', y: 'north' }, rank: 'tier', ownership: { type: 'owns', field: 'keeper' }, graphLabel: 'code', graphLinks: ['bonds'] };

describe('what a kind is set up to be shown as', () => {
  it('nothing set: each view says what to choose; with no field of a fitting type, what to add', () => {
    const bare = kind();
    expect(readyViews(bare)).toEqual([]);
    expect(missingFor(bare, 'timeline')).toEqual(['The date on the timeline is not set: choose a Number or Date field.']);
    expect(missingFor(bare, 'map')).toEqual(['Across on the map is not set: choose a Number field.', 'Up on the map is not set: choose a Number field.']);
    expect(missingFor(bare, 'ownership')).toEqual(['No connection type is chosen as holding an artifact: choose one, such as Owns.']);
    const textOnly = kind(undefined, [f('code', 'Code', 'text')]);
    expect(missingFor(textOnly, 'rank')).toEqual(['Artifacts has no Number or Choice (one) field for the rank: add one, then choose it.']);
    expect([missingFor(bare, 'graphLabel'), missingFor(bare, 'graphLinks')]).toEqual([[], []]);
  });

  it('partly set: only what is complete is ready; the rest says what is still missing', () => {
    const part = kind({ timeline: { start: 'found' }, map: { x: 'east' }, ownership: { field: 'keeper' } });
    expect(readyViews(part)).toEqual(['timeline']);
    expect(missingFor(part, 'map')).toEqual(['Up on the map is not set: choose a Number field.']);
    expect(missingFor(part, 'ownership')).toEqual(['No connection type is chosen as holding an artifact: choose one, such as Owns.']);
    expect(missingFor(kind({ map: { x: 'east', y: 'east' } }), 'map')).toEqual(['The same field is chosen for across and up: choose two different fields.']);
  });

  it('fully set: every view is ready, the graph settings have nothing to say', () => {
    const full = kind(FULL);
    expect(readyViews(full)).toEqual(['timeline', 'map', 'rank', 'ownership']);
    expect([missingFor(full, 'graphLabel'), missingFor(full, 'graphLinks')]).toEqual([[], []]);
  });

  it('a field changed afterwards: renamed or moved, nothing breaks; retyped, removed or cut down, the setting is kept and the problem said', () => {
    const renamed = kind(FULL, [...FIELDS].reverse().map((d) => (d.id === 'tier' ? { ...d, name: 'Grade' } : d)));
    expect(readyViews(renamed)).toEqual(['timeline', 'map', 'rank', 'ownership']);
    const changed = kind(FULL, FIELDS.map((d) => (d.id === 'found' ? { ...d, type: 'text' as const } : d.id === 'north' ? { ...d, archived: true } : d.id === 'tier' ? { ...d, options: ['Only'] } : d.id === 'bonds' ? { ...d, type: 'tags' as const } : d)));
    expect(readyViews(changed)).toEqual(['ownership']);
    expect(missingFor(changed, 'timeline')).toEqual(['Found, chosen for the date on the timeline, is now Short text; it needs to be a Number or Date field.']);
    expect(missingFor(changed, 'map')).toEqual(['North, chosen for up on the map, was removed (archived): restore it or choose another.']);
    expect(missingFor(changed, 'rank')).toEqual(['Tier, chosen for the rank, has fewer than two choices to rank by.']);
    expect(missingFor(changed, 'graphLinks')).toEqual(['Bonds, chosen for a connection drawn in the knowledge graph, is now Tags / list; it needs to be a Link to an entry or Links to several entries field.']);
    expect(missingFor(kind(FULL, FIELDS.filter((d) => d.id !== 'keeper')), 'ownership')).toEqual(['The field chosen for who holds it now no longer exists: choose another.']);
  });
});

describe('settings as stored', () => {
  it('keep only known settings naming fields the kind has (archived ones too); anything else is left out', () => {
    const raw = { timeline: { start: 'found', end: 7 }, map: { x: 'nowhere' }, rank: 'tier', ownership: { type: '  owns  ', field: 'keeper' }, graphLabel: 'code', graphLinks: ['bonds', 'bonds', 'ghost', 3], colour: 'red' };
    expect(cleanUses(raw, FIELDS)).toEqual({ timeline: { start: 'found' }, rank: 'tier', ownership: { type: 'owns', field: 'keeper' }, graphLabel: 'code', graphLinks: ['bonds'] });
    const archivedTier: FieldDef = { ...FIELDS[4], archived: true };
    expect(cleanUses({ rank: 'tier' }, [archivedTier])).toEqual({ rank: 'tier' });
    expect([cleanUses({}, FIELDS), cleanUses('junk', FIELDS), cleanUses(null, FIELDS)]).toEqual([undefined, undefined, undefined]);
    expect(cleanUses({ graphLinks: [] }, FIELDS)).toEqual({ graphLinks: [] });
  });

  it('follow their fields to new ids, and are only ever added to', () => {
    const ids: Record<string, string> = { found: 'f2', east: 'e2', north: 'n2', keeper: 'k2' };
    expect(remapUses(FULL, (id) => ids[id])).toEqual({ timeline: { start: 'f2' }, map: { x: 'e2', y: 'n2' }, ownership: { type: 'owns', field: 'k2' }, graphLinks: [] });
    expect(mergeUses({ rank: 'mine' }, { rank: 'theirs', graphLabel: 'code' })).toEqual({ rank: 'mine', graphLabel: 'code' });
    expect(mergeUses(undefined, undefined)).toBeUndefined();
  });
});
