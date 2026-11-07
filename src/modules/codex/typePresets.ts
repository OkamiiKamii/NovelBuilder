import { remapUses } from './capabilities';
import type { FieldDef, FieldType, KindUses, TemplateData } from './types';

/**
 * RECORD TYPE PRESETS
 * Starting points for a category of the author's own: a name and a field set
 * to begin from, every part of which can be renamed, retyped, made optional
 * or removed afterwards. Applying one only adds; a category or field that
 * already exists (by name) is left as it is. Some come set up for a view
 * (Spells by rank, Relics by who holds them): settings written here by
 * field name, stored by field id like any other, and changeable.
 */
type Spec = [name: string, type: FieldType, extra?: Partial<Pick<FieldDef, 'options' | 'required' | 'min' | 'max' | 'target' | 'help'>>];

const preset = (id: string, name: string, singular: string, color: string, description: string, fields: Spec[], uses?: KindUses) => {
  const byName = (fieldName: string) => {
    const i = fields.findIndex(([n]) => n === fieldName);
    return i < 0 ? undefined : `${id}-${i}`;
  };
  const named = remapUses(uses, byName);
  return {
    id,
    name,
    description,
    categories: [{ key: `preset-${id}`, name, singular, color, builtin: false, fields: fields.map(([fieldName, type, extra = {}], i) => ({ id: `${id}-${i}`, name: fieldName, type, options: extra.options ?? [], ...extra })), ...(named ? { uses: named } : {}) }],
  };
};

export const TYPE_PRESETS: ({ id: string; name: string; description: string } & TemplateData)[] = [
  preset('spells', 'Spells', 'Spell', '#7a4fa3', 'Magic: what it does, what it costs, who knows it.', [
    ['Effect', 'longtext', { required: true, help: 'What happens when it is cast.' }],
    ['School', 'select', { options: ['Fire', 'Water', 'Earth', 'Air', 'Mind', 'Other'] }],
    ['Rank', 'number', { min: 0, max: 10, help: '0 for a cantrip, 10 for the greatest.' }],
    ['Cost', 'text'],
    ['Known by', 'references', { target: 'character' }],
  ], { rank: 'Rank', tree: true }),
  preset('planets', 'Planets', 'Planet', '#2b7a8c', 'Worlds: climate, people, who rules.', [
    ['System', 'text', { required: true }],
    ['Climate', 'select', { options: ['Arid', 'Temperate', 'Frozen', 'Oceanic', 'Toxic', 'Other'] }],
    ['Population', 'number', { min: 0 }],
    ['Moons', 'number', { min: 0 }],
    ['Governed by', 'reference', { target: 'faction' }],
    ['First visited', 'date'],
  ], { timeline: { start: 'First visited' } }),
  preset('investigations', 'Investigations', 'Investigation', '#a8436b', 'Cases: who leads them, who is suspected, where they stand.', [
    ['Status', 'select', { required: true, options: ['Open', 'Stalled', 'Solved', 'Cold'] }],
    ['Opened', 'date'],
    ['Lead investigator', 'reference', { target: 'character' }],
    ['Suspects', 'references', { target: 'character' }],
    ['Solved', 'toggle'],
    ['Evidence so far', 'longtext'],
  ], { timeline: { start: 'Opened' } }),
  preset('techniques', 'Techniques', 'Technique', '#6b7a2b', 'Skills and martial arts: how hard, who can do them.', [
    ['Discipline', 'text', { required: true }],
    ['Difficulty', 'number', { min: 1, max: 10 }],
    ['Prerequisites', 'longtext'],
    ['Practitioners', 'references', { target: 'character' }],
    ['Signature move', 'toggle'],
  ], { rank: 'Difficulty', tree: true }),
  preset('organizations', 'Organizations', 'Organization', '#4f5fa3', 'Guilds, companies, orders: who leads, who belongs, where they sit.', [
    ['Kind', 'select', { required: true, options: ['Guild', 'Company', 'Order', 'Government', 'Cult', 'Other'] }],
    ['Leader', 'reference', { target: 'character' }],
    ['Members', 'references', { target: 'character' }],
    ['Headquarters', 'reference', { target: 'location' }],
    ['Founded', 'date'],
    ['Goals', 'longtext'],
  ], { timeline: { start: 'Founded' } }),
  preset('species', 'Species', 'Species', '#a3622b', 'Peoples and creatures: lifespan, home, traits.', [
    ['Lifespan', 'text'],
    ['Homeland', 'reference', { target: 'location' }],
    ['Sapient', 'toggle', { required: true }],
    ['Traits', 'tags'],
  ]),
  preset('technologies', 'Technologies', 'Technology', '#8c2b5a', 'Machines and inventions: who made them, whether they still work.', [
    ['Status', 'select', { required: true, options: ['Prototype', 'In use', 'Lost', 'Forbidden'] }],
    ['Inventor', 'reference', { target: 'character' }],
    ['Tech level', 'number', { min: 1, max: 10 }],
    ['Power source', 'text'],
  ], { rank: 'Tech level' }),
  preset('relics', 'Relics', 'Relic', '#2b8c6b', 'Artifacts of power: where from, who holds them, what they do.', [
    ['Powers', 'longtext', { required: true }],
    ['Current holder', 'reference', { target: 'character' }],
    ['Last seen', 'reference', { target: 'location' }],
    ['Cursed', 'toggle'],
    ['Age in years', 'number', { min: 0 }],
  ], { ownership: { type: 'owns', field: 'Current holder' } }),
];
