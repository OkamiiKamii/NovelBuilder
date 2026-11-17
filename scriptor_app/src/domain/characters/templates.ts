// The profile layouts that come with the app, the sections a layout gives a new profile, and what a section offers to
// add. A port of flutter_app/lib/shared/domain/characters/templates.dart.

import { type JsonMap } from '../json';
import { type FieldType } from '../records/category';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { CharacterTemplate, FieldSuggestion, type ProfileTab, TemplateSection } from './characterRecords';

const f = (name: string, type: FieldType = 'text', options: readonly string[] = []) =>
  new FieldSuggestion(name, type, options);
const long = (name: string) => f(name, 'longtext');
const tags = (name: string) => f(name, 'tags');
const num = (name: string) => f(name, 'number');
const ref = (name: string) => f(name, 'reference');
const section = (name: string, tab: ProfileTab, fields: FieldSuggestion[]) => new TemplateSection(name, tab, fields);

const o: ProfileTab = 'overview';
const d: ProfileTab = 'details';

const identity = section('Core Identity', o, [
  f('Full Name'),
  f('Age'),
  f('Date of Birth'),
  f('Gender'),
  f('Pronouns'),
  f('Species'),
  f('Nationality'),
  ref('Place of Origin'),
  f('Occupation'),
  f('Alignment'),
  num('Loyalty'),
  num('Ambition'),
  long('Physical Appearance'),
]);
const psychology = section('Personality & Psychology', o, [
  tags('Core Traits'),
  tags('Secondary Traits'),
  tags('Strengths'),
  tags('Weaknesses'),
  tags('Fears'),
  long('Motivations'),
  tags('Values'),
  long('Beliefs'),
  tags('Habits'),
  long('Behavioral Patterns'),
  long('Emotional Triggers'),
  long('Coping Mechanisms'),
  long('Internal Conflicts'),
]);
const arc = section('Character Arc', o, [
  long('Starting Point'),
  long('Initial Beliefs'),
  long('Initial Goals'),
  long('Internal Conflict'),
  long('External Conflict'),
  long('Major Turning Points'),
  long('Development Milestones'),
  long('Current State'),
  long('Intended Resolution'),
]);
const position = section('Resources & Position', o, [
  f('Rank'),
  f('Organization'),
  num('Political Influence'),
  f('Wealth'),
  long('Resources'),
  f('Social Standing'),
  long('Reputation'),
]);
const biography = section('Biography & History', d, [
  long('Childhood'),
  long('Family Background'),
  long('Education'),
  long('Important Past Events'),
  long('Previous Occupations'),
  long('Personal History'),
  long('Cultural Background'),
  long('Major Life Experiences'),
]);
const appearance = section('Appearance', d, [
  f('Height'),
  f('Build'),
  f('Hair'),
  f('Eyes'),
  f('Skin'),
  long('Distinguishing Features'),
  long('Scars'),
  long('Tattoos'),
  long('Clothing'),
  f('Voice'),
  long('Mannerisms'),
]);

const make = (id: string, name: string, description: string, sections: TemplateSection[]) =>
  new CharacterTemplate({ id, projectId: null, name, description, sections });

/** The layouts that come with the app, the same as the original's. Each is only a starting point: every section and
 * field can be renamed, moved, added to or removed. */
export const builtinTemplates: readonly CharacterTemplate[] = [
  make('general', 'General Character', 'Identity, personality, arc, position, biography and appearance.', [
    identity,
    psychology,
    arc,
    position,
    biography,
    appearance,
  ]),
  make('protagonist', 'Protagonist', 'The general layout with room for the want, the need and what stands in the way.', [
    identity,
    psychology,
    section('Goals & Stakes', o, [
      long('What they want'),
      long('What they need'),
      long('What stands in the way'),
      long('What they stand to lose'),
      long('The lie they believe'),
    ]),
    arc,
    position,
    biography,
    appearance,
  ]),
  make('antagonist', 'Antagonist', 'Why they oppose the protagonist, how, and what would make them stop.', [
    identity,
    psychology,
    section('Opposition', o, [
      long('What they want'),
      long('Why they believe they are right'),
      long('Methods'),
      long('Resources and reach'),
      long('Lines they will not cross'),
      long('What would make them stop'),
    ]),
    arc,
    position,
    biography,
    appearance,
  ]),
  make('supporting', 'Supporting Character', 'A lighter layout: who they are, and what they are to the story.', [
    section('Core Identity', o, [f('Age'), f('Occupation'), f('Species'), long('Physical Appearance')]),
    section('Role in the Story', o, [
      long('What they are to the protagonist'),
      long('What they want'),
      long('How they change, if they do'),
    ]),
    section('Personality', o, [tags('Core Traits'), tags('Strengths'), tags('Weaknesses')]),
    biography,
  ]),
  make('fantasy', 'Fantasy Character', 'Adds lineage, magic and allegiances.', [
    identity,
    section('Lineage & Magic', o, [
      f('Bloodline'),
      f('Magical Lineage'),
      f('School of Magic'),
      long('Gifts'),
      long('Limits and cost'),
      ref('Patron or Deity'),
    ]),
    psychology,
    arc,
    section('Allegiances', o, [ref('Faction'), f('Rank'), ref('Sworn to'), long('Oaths')]),
    biography,
    appearance,
  ]),
  // Level, class, attributes, skills and gear are not here on purpose: they are kept once, on the character's system
  // sheet and progression snapshots, and shown on the profile from there.
  make(
    'progression',
    'Progression Fantasy Character',
    'Goals, path and growth. Level, class, attributes and skills live on their system sheet.',
    [
      identity,
      psychology,
      section('Goals', o, [long('Immediate goal'), long('Long-term goal'), long('What drives the climb')]),
      section('Path', o, [f('Path or Realm'), long('How they fight'), long('Signature technique'), long('Limits and cost')]),
      section('Evolution History', d, [long('Breakthroughs'), long('Evolutions'), long('Setbacks')]),
      arc,
    ],
  ),
  make('suspect', 'Mystery Suspect', 'Motive, means, opportunity and alibi, and what is yet to come out.', [
    section('Identity', o, [f('Age'), f('Occupation'), long('Connection to the victim'), long('Physical Appearance')]),
    section('The Case', o, [
      long('Motive'),
      long('Means'),
      long('Opportunity'),
      long('Alibi'),
      f('Alibi holds?', 'toggle'),
      long('Evidence for'),
      long('Evidence against'),
    ]),
    section('Reveal', o, [
      f('Reveal status', 'select', ['Unsuspected', 'Suspected', 'Cleared', 'Exposed']),
      long('What they are hiding'),
      long('How it comes out'),
    ]),
    psychology,
    biography,
  ]),
  make('romance', 'Romance Character', 'What they want from love, what they fear from it, and what keeps them apart.', [
    identity,
    psychology,
    section('Heart', o, [
      long('What they want from love'),
      long('What they fear from it'),
      long('Past relationships'),
      long('Wound'),
      tags('What attracts them'),
      long('What keeps them apart'),
    ]),
    arc,
    biography,
    appearance,
  ]),
  make('scifi', 'Science Fiction Character', 'Origin, augmentation, affiliation and clearance.', [
    identity,
    section('Origin & Body', o, [
      ref('Homeworld or Habitat'),
      f('Species or Strain'),
      long('Augmentations'),
      long('Implants'),
      f('Lifespan'),
    ]),
    section('Affiliation', o, [ref('Faction'), f('Rank'), f('Clearance'), ref('Ship or Posting'), long('Specialisation')]),
    psychology,
    arc,
    biography,
    appearance,
  ]),
];

/** A section name as a piece of an id: lower case, runs of anything else one dash. */
export function slug(text: string): string {
  const s = dartToLowerCase(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s.length === 0 ? 'section' : s;
}

/** The sections a template gives a new profile, all empty. Ids are worked out from the names, so they are the same
 * every time. */
export function sectionsOf(template: CharacterTemplate): JsonMap[] {
  return template.sections.map((s, i) => ({
    id: `${template.id}-${slug(s.name)}-${i}`,
    name: s.name,
    tab: s.tab,
    hidden: false,
    fieldIds: [],
  }));
}

/** What a section offers to add: the fields its name has in any template the novel can use, less any the character
 * already has (in this section or another: a field is kept once). */
export function suggestionsFor(
  sectionName: string,
  templates: readonly CharacterTemplate[],
  have: readonly string[],
): FieldSuggestion[] {
  const taken = new Set(have.map((name) => dartToLowerCase(dartTrim(name))));
  const seen = new Set<string>();
  const wanted = dartToLowerCase(dartTrim(sectionName));
  const out: FieldSuggestion[] = [];
  for (const template of templates) {
    for (const s of template.sections) {
      if (dartToLowerCase(dartTrim(s.name)) !== wanted) continue;
      for (const field of s.fields) {
        const key = dartToLowerCase(field.name);
        if (taken.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push(field);
      }
    }
  }
  return out;
}
