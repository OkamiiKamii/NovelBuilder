import type { CharacterTemplate, FieldSuggestion, Section, TemplateSection } from './types';

const f = (name: string, type: FieldSuggestion['type'] = 'text', options?: string[]): FieldSuggestion => ({ name, type, ...(options ? { options } : {}) });
const long = (name: string) => f(name, 'longtext');
const tags = (name: string) => f(name, 'tags');
const num = (name: string) => f(name, 'number');
const ref = (name: string) => f(name, 'reference');
const section = (name: string, tab: TemplateSection['tab'], ...fields: FieldSuggestion[]): TemplateSection => ({ name, tab, fields });

const IDENTITY = section('Core Identity', 'overview', f('Full Name'), f('Age'), f('Date of Birth'), f('Gender'), f('Pronouns'), f('Species'), f('Nationality'), ref('Place of Origin'), f('Occupation'), f('Alignment'), num('Loyalty'), num('Ambition'), long('Physical Appearance'));
const PSYCHOLOGY = section('Personality & Psychology', 'overview', tags('Core Traits'), tags('Secondary Traits'), tags('Strengths'), tags('Weaknesses'), tags('Fears'), long('Motivations'), tags('Values'), long('Beliefs'), tags('Habits'), long('Behavioral Patterns'), long('Emotional Triggers'), long('Coping Mechanisms'), long('Internal Conflicts'));
const ARC = section('Character Arc', 'overview', long('Starting Point'), long('Initial Beliefs'), long('Initial Goals'), long('Internal Conflict'), long('External Conflict'), long('Major Turning Points'), long('Development Milestones'), long('Current State'), long('Intended Resolution'));
const POSITION = section('Resources & Position', 'overview', f('Rank'), f('Organization'), num('Political Influence'), f('Wealth'), long('Resources'), f('Social Standing'), long('Reputation'));
const BIOGRAPHY = section('Biography & History', 'details', long('Childhood'), long('Family Background'), long('Education'), long('Important Past Events'), long('Previous Occupations'), long('Personal History'), long('Cultural Background'), long('Major Life Experiences'));
const APPEARANCE = section('Appearance', 'details', f('Height'), f('Build'), f('Hair'), f('Eyes'), f('Skin'), long('Distinguishing Features'), long('Scars'), long('Tattoos'), long('Clothing'), f('Voice'), long('Mannerisms'));
const GENERAL = [IDENTITY, PSYCHOLOGY, ARC, POSITION, BIOGRAPHY, APPEARANCE];
const make = (id: string, name: string, description: string, sections: TemplateSection[]): CharacterTemplate => ({ id, projectId: null, name, description, sections, createdAt: 0 });

/** The layouts that come with the app. Each is only a starting point: every section and field can be renamed, moved, added to or removed. */
export const BUILTIN_TEMPLATES: CharacterTemplate[] = [
  make('general', 'General Character', 'Identity, personality, arc, position, biography and appearance.', GENERAL),
  make('protagonist', 'Protagonist', 'The general layout with room for the want, the need and what stands in the way.', [IDENTITY, PSYCHOLOGY, section('Goals & Stakes', 'overview', long('What they want'), long('What they need'), long('What stands in the way'), long('What they stand to lose'), long('The lie they believe')), ARC, POSITION, BIOGRAPHY, APPEARANCE]),
  make('antagonist', 'Antagonist', 'Why they oppose the protagonist, how, and what would make them stop.', [IDENTITY, PSYCHOLOGY, section('Opposition', 'overview', long('What they want'), long('Why they believe they are right'), long('Methods'), long('Resources and reach'), long('Lines they will not cross'), long('What would make them stop')), ARC, POSITION, BIOGRAPHY, APPEARANCE]),
  make('supporting', 'Supporting Character', 'A lighter layout: who they are, and what they are to the story.', [section('Core Identity', 'overview', f('Age'), f('Occupation'), f('Species'), long('Physical Appearance')), section('Role in the Story', 'overview', long('What they are to the protagonist'), long('What they want'), long('How they change, if they do')), section('Personality', 'overview', tags('Core Traits'), tags('Strengths'), tags('Weaknesses')), BIOGRAPHY]),
  make('fantasy', 'Fantasy Character', 'Adds lineage, magic and allegiances.', [IDENTITY, section('Lineage & Magic', 'overview', f('Bloodline'), f('Magical Lineage'), f('School of Magic'), long('Gifts'), long('Limits and cost'), ref('Patron or Deity')), PSYCHOLOGY, ARC, section('Allegiances', 'overview', ref('Faction'), f('Rank'), ref('Sworn to'), long('Oaths')), BIOGRAPHY, APPEARANCE]),
  // Level, class, attributes, skills and gear are not here on purpose: they are kept once, on the character's system sheet and progression snapshots, and shown on the profile from there.
  make('progression', 'Progression Fantasy Character', 'Goals, path and growth. Level, class, attributes and skills live on their system sheet.', [IDENTITY, PSYCHOLOGY, section('Goals', 'overview', long('Immediate goal'), long('Long-term goal'), long('What drives the climb')), section('Path', 'overview', f('Path or Realm'), long('How they fight'), long('Signature technique'), long('Limits and cost')), section('Evolution History', 'details', long('Breakthroughs'), long('Evolutions'), long('Setbacks')), ARC]),
  make('suspect', 'Mystery Suspect', 'Motive, means, opportunity and alibi, and what is yet to come out.', [section('Identity', 'overview', f('Age'), f('Occupation'), long('Connection to the victim'), long('Physical Appearance')), section('The Case', 'overview', long('Motive'), long('Means'), long('Opportunity'), long('Alibi'), f('Alibi holds?', 'toggle'), long('Evidence for'), long('Evidence against')), section('Reveal', 'overview', f('Reveal status', 'select', ['Unsuspected', 'Suspected', 'Cleared', 'Exposed']), long('What they are hiding'), long('How it comes out')), PSYCHOLOGY, BIOGRAPHY]),
  make('romance', 'Romance Character', 'What they want from love, what they fear from it, and what keeps them apart.', [IDENTITY, PSYCHOLOGY, section('Heart', 'overview', long('What they want from love'), long('What they fear from it'), long('Past relationships'), long('Wound'), tags('What attracts them'), long('What keeps them apart')), ARC, BIOGRAPHY, APPEARANCE]),
  make('scifi', 'Science Fiction Character', 'Origin, augmentation, affiliation and clearance.', [IDENTITY, section('Origin & Body', 'overview', ref('Homeworld or Habitat'), f('Species or Strain'), long('Augmentations'), long('Implants'), f('Lifespan')), section('Affiliation', 'overview', ref('Faction'), f('Rank'), f('Clearance'), ref('Ship or Posting'), long('Specialisation')), PSYCHOLOGY, ARC, BIOGRAPHY, APPEARANCE]),
];

export const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';

/** The sections a template gives a new profile: all of them empty. Ids are worked out from the names, so they are the same every time. */
export const sectionsOf = (template: CharacterTemplate): Section[] => template.sections.map((s, i) => ({ id: `${template.id}-${slug(s.name)}-${i}`, name: s.name, tab: s.tab, hidden: false, fieldIds: [] }));

/** What a section offers to add: the fields its name has in any template the project can use, less any the character already has (in this section or another: a field is kept once). */
export function suggestionsFor(sectionName: string, templates: CharacterTemplate[], have: string[]): FieldSuggestion[] {
  const taken = new Set(have.map((name) => name.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: FieldSuggestion[] = [];
  for (const template of templates) {
    for (const section of template.sections) {
      if (section.name.trim().toLowerCase() !== sectionName.trim().toLowerCase()) continue;
      for (const field of section.fields) {
        const key = field.name.toLowerCase();
        if (taken.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push(field);
      }
    }
  }
  return out;
}
