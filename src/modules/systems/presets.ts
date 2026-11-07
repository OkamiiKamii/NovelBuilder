import type { BlueprintContent, Cost, Group, Matrix, Modifier, Named, Stage, SysItem, SysVariable, Track } from './types';
import { toKey } from './types';

export interface SystemPreset {
  id: string;
  name: string;
  description: string;
  content: BlueprintContent;
}

// Small builders, so each preset below reads like a design document. Ids only need to be unique within a preset: a blueprint made from one gets fresh ids.
const attribute = (name: string, base: number, unit = '', note = ''): SysVariable => ({ id: `v-${toKey(name)}`, name, key: toKey(name), kind: 'number', unit, base, formula: '', options: [], note });
const resource = (name: string, base: number, unit = '', note = ''): SysVariable => ({ ...attribute(name, base, unit, note), kind: 'resource' });
const formula = (name: string, text: string, unit = '', note = ''): SysVariable => ({ ...attribute(name, 0, unit, note), kind: 'derived', formula: text });
const choice = (name: string, options: string[], note = ''): SysVariable => ({ ...attribute(name, 0, '', note), kind: 'choice', options });
const levels = (name: string, cap: number, curve: string, curveUnit: string, points = 0, sources: string[] = []): Track => ({ id: `t-${toKey(name)}`, name, key: toKey(name), kind: 'levels', cap, curve, curveUnit, points, sources, stages: [] });
const stage = (name: string, requires = '', note = ''): Stage => ({ id: `s-${toKey(name)}`, name, requires, note });
const ladder = (name: string, stages: Stage[]): Track => ({ id: `t-${toKey(name)}`, name, key: toKey(name), kind: 'stages', cap: 0, curve: '', curveUnit: '', stages });
const group = (name: string, single = false): Group => ({ id: `g-${toKey(name)}`, name, single });
const mod = (target: string, op: Modifier['op'], value: string): Modifier => ({ id: `m-${target}-${op}-${toKey(value)}`, target, op, value });
const cost = (target: string, amount: string): Cost => ({ id: `c-${target}`, target, amount });
const ranks = (...names: string[]): Named[] => names.map((name) => ({ id: `r-${toKey(name)}`, name }));
const item = (groupName: string, name: string, more: Partial<Omit<SysItem, 'id' | 'groupId' | 'name' | 'parentId' | 'rankId'>> & { parent?: string; rank?: string } = {}): SysItem => {
  const { parent, rank, ...rest } = more;
  return { id: `i-${toKey(name)}`, groupId: `g-${toKey(groupName)}`, name, description: '', parentId: parent ? `i-${toKey(parent)}` : null, rankId: rank ? `r-${toKey(rank)}` : null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '', ...rest };
};
/** A table of the same labels against each other; cells are written `Row|Column` by name here and stored by id. */
const matrix = (name: string, labels: string[], cells: Record<string, string>): Matrix => {
  const id = (label: string) => `l-${toKey(label)}`;
  const named = labels.map((label) => ({ id: id(label), name: label }));
  return { id: `x-${toKey(name)}`, name, rows: named, columns: named.map((n) => ({ ...n })), cells: Object.fromEntries(Object.entries(cells).map(([key, value]) => [key.split('|').map(id).join('|'), value])) };
};

export const SYSTEM_PRESETS: SystemPreset[] = [
  {
    id: 'litrpg',
    name: 'LitRPG / Game System',
    description: 'Stat sheet, a level curve fed by logged experience, points to place each level, a class tree and ranked skills with costs and cooldowns.',
    content: {
      name: 'The System',
      description: 'A game-like system: stats grow with levels, a class shapes them, and skills spend mana or stamina.',
      variables: [
        attribute('Strength', 10), attribute('Agility', 10), attribute('Intelligence', 10), attribute('Vitality', 10),
        resource('Health', 100, 'HP'), resource('Mana', 50, 'MP'), resource('Stamina', 100, 'SP'),
        formula('Max Health', 'health + vitality * 10', 'HP'), formula('Max Mana', 'mana + intelligence * 5', 'MP'),
        formula('Damage', 'strength * 1.5', '', 'Base melee damage.'), formula('Mana Regen', 'intelligence / 10', 'per minute'),
        formula('Skill Slots', '3 + floor(level / 10)', 'slots'),
      ],
      tracks: [levels('Level', 100, '100 * level ^ 1.5', 'XP', 3, ['Combat', 'Quest', 'Discovery', 'Training'])],
      ranks: ranks('Common', 'Advanced', 'Unique', 'Legendary'),
      groups: [group('Classes', true), group('Skills'), group('Titles')],
      items: [
        item('Classes', 'Warrior', { description: 'Front-line fighter.', modifiers: [mod('strength', 'add', '5'), mod('vitality', 'add', '3')] }),
        item('Classes', 'Mage', { description: 'Shapes mana into spells.', modifiers: [mod('intelligence', 'add', '6'), mod('mana', 'add', '40')] }),
        item('Classes', 'Void Mage', { parent: 'Mage', description: 'A mage who has touched the space between.', requires: 'Class: Mage AND level >= 25', modifiers: [mod('intelligence', 'add', '12'), mod('mana', 'multiply', '2')], evolution: 'Evolves from Mage at level 25.' }),
        item('Skills', 'Power Strike', { rank: 'Common', costs: [cost('stamina', '15')], cooldown: '10 seconds', affinity: 'Physical' }),
        item('Skills', 'Fireball', { rank: 'Advanced', requires: 'intelligence >= 15', costs: [cost('mana', '20')], cooldown: '5 seconds', affinity: 'Fire', evolution: 'Becomes Inferno after 1,000 casts.' }),
        item('Skills', 'Void Step', { rank: 'Unique', requires: 'Class: Void Mage AND level >= 50', costs: [cost('mana', '40 + level')], cooldown: '30 seconds', affinity: 'Void' }),
        item('Titles', 'Giant Slayer', { rank: 'Unique', description: 'Passive: for felling something ten levels above you.', modifiers: [mod('damage', 'multiply', '1.1')] }),
      ],
      matrices: [],
    },
  },
  {
    id: 'cultivation',
    name: 'Progression / Cultivation',
    description: 'Realms with bottlenecks and breakthrough conditions, qi reserves, techniques, pills and artifacts.',
    content: {
      name: 'The Path of Cultivation',
      description: 'Cultivators gather qi, refine it, and break through realm by realm. Each breakthrough has a price.',
      variables: [
        resource('Qi', 100, 'qi', 'How much qi the dantian holds.'), attribute('Comprehension', 5), attribute('Body Tempering', 1, 'layers'), attribute('Spirit Root Purity', 40, '%'),
        choice('Spirit Root', ['Metal', 'Wood', 'Water', 'Fire', 'Earth', 'Heavenly']),
        formula('Qi Capacity', 'qi * cultivation_realm ^ 2', 'qi'), formula('Cultivation Speed', 'comprehension * spirit_root_purity / 100', 'qi per day'), formula('Lifespan', '80 * 2 ^ (cultivation_realm - 1)', 'years'),
      ],
      tracks: [
        ladder('Cultivation Realm', [
          stage('Qi Condensation', '', 'Sensing qi and drawing it into the body.'),
          stage('Foundation Establishment', 'qi >= 1000 AND Pill: Foundation Pill', 'Bottleneck: most never cross it. The foundation, once laid, cannot be relaid.'),
          stage('Core Formation', 'qi >= 10000 AND comprehension >= 20', 'Condensing qi into a golden core. Failure shatters the dantian.'),
          stage('Nascent Soul', 'qi >= 100000 AND Technique: Soul Nurturing Art', 'Tribulation lightning must be survived.'),
        ]),
      ],
      ranks: ranks('Mortal', 'Earth', 'Heaven', 'Divine'),
      groups: [group('Techniques'), group('Pills'), group('Artifacts'), group('Sects', true)],
      items: [
        item('Techniques', 'Azure Breathing', { rank: 'Mortal', description: 'A basic qi-gathering method.', modifiers: [mod('comprehension', 'add', '2')] }),
        item('Techniques', 'Soul Nurturing Art', { rank: 'Heaven', requires: 'Cultivation Realm: Core Formation', costs: [cost('qi', '500')], evolution: 'Completes at Nascent Soul.' }),
        item('Pills', 'Foundation Pill', { rank: 'Earth', description: 'Steadies the meridians for the first breakthrough. One use.' }),
        item('Pills', 'Qi Gathering Pill', { rank: 'Mortal', modifiers: [mod('qi', 'add', '200')] }),
        item('Artifacts', 'Spirit Sword', { rank: 'Earth', requires: 'cultivation_realm >= 2', costs: [cost('qi', '50')], affinity: 'Metal' }),
        item('Sects', 'Azure Cloud Sect', { description: 'An orthodox sect of the eastern ranges.' }),
      ],
      matrices: [],
    },
  },
  {
    id: 'hard-magic',
    name: 'Hard Magic / Elemental',
    description: 'Mana capacity, casting costs, an elemental interaction chart and limits on what can be cast.',
    content: {
      name: 'The Elemental Art',
      description: 'Magic with firm rules: every spell draws on capacity, every element answers to another, and chants cannot be skipped.',
      variables: [
        resource('Mana Capacity', 100, 'motes'), attribute('Control', 10), attribute('Chant Speed', 1, 'lines per breath'),
        choice('Affinity', ['Fire', 'Water', 'Earth', 'Air']),
        formula('Casting Efficiency', 'min(1, control / 50)', '', '1 means no mana is wasted.'), formula('Spells Before Exhaustion', 'floor(mana_capacity / 20)', 'spells'),
      ],
      tracks: [ladder('Circle', [stage('First Circle'), stage('Second Circle', 'control >= 20'), stage('Third Circle', 'control >= 35 AND mana_capacity >= 300'), stage('Archmage', 'control >= 50', 'Granted by the Conclave, never claimed.')])],
      ranks: ranks('Cantrip', 'Lesser', 'Greater', 'Grand'),
      groups: [group('Spells'), group('Restrictions')],
      items: [
        item('Spells', 'Ember', { rank: 'Cantrip', costs: [cost('mana_capacity', '5')], affinity: 'Fire', cooldown: 'One line of chant' }),
        item('Spells', 'Flame Lance', { rank: 'Lesser', requires: 'Affinity: Fire AND circle >= 2', costs: [cost('mana_capacity', '20 / casting_efficiency')], affinity: 'Fire', cooldown: 'Three lines of chant' }),
        item('Spells', 'Tidewall', { rank: 'Greater', requires: 'Affinity: Water AND circle >= 3', costs: [cost('mana_capacity', '60')], affinity: 'Water', cooldown: 'A full verse' }),
        item('Restrictions', 'Spoken Chant', { description: 'A spell must be spoken aloud. A gagged mage cannot cast.' }),
        item('Restrictions', 'Opposed Element', { description: 'A mage cannot cast the element opposed to their affinity.' }),
      ],
      matrices: [matrix('Elemental interactions', ['Fire', 'Water', 'Earth', 'Air'], {
        'Fire|Water': 'Quenched', 'Fire|Earth': 'Scorches', 'Fire|Air': 'Fed', 'Water|Fire': 'Douses', 'Water|Earth': 'Erodes', 'Water|Air': 'Scattered',
        'Earth|Fire': 'Smothers', 'Earth|Water': 'Dams', 'Earth|Air': 'Unmoved', 'Air|Fire': 'Fans', 'Air|Water': 'Whips', 'Air|Earth': 'Wears down',
      })],
    },
  },
  {
    id: 'superhero',
    name: 'Superhero / Mutant',
    description: 'Power origins and triggers, drawbacks, and a tier ranking.',
    content: {
      name: 'The Gifted',
      description: 'Powers come from somewhere, cost something, and are ranked by the people who fear them.',
      variables: [
        attribute('Power Output', 10, 'kilojoules'), attribute('Control', 5), resource('Endurance', 100, 'minutes'), attribute('Gene Stability', 80, '%'),
        choice('Origin', ['Mutation', 'Radiation', 'Experiment', 'Artifact', 'Inherited']),
        formula('Threat Score', 'power_output * control / 10'), formula('Burnout Risk', 'max(0, 100 - gene_stability)', '%'),
      ],
      tracks: [ladder('Threat Tier', [stage('Delta', '', 'Street level.'), stage('Gamma', 'threat_score >= 20'), stage('Beta', 'threat_score >= 100'), stage('Alpha', 'threat_score >= 500', 'City-level. Registered and watched.'), stage('Omega', 'threat_score >= 5000', 'There have been three.')])],
      ranks: ranks('Minor', 'Major', 'Signature'),
      groups: [group('Powers'), group('Triggers'), group('Drawbacks')],
      items: [
        item('Powers', 'Kinetic Absorption', { rank: 'Major', description: 'Stores the force of impacts.', modifiers: [mod('power_output', 'add', '40')], costs: [cost('endurance', '5')] }),
        item('Powers', 'Kinetic Release', { rank: 'Signature', parent: 'Kinetic Absorption', requires: 'Power: Kinetic Absorption AND control >= 8', costs: [cost('endurance', '20')], cooldown: 'Until recharged by impact', evolution: 'Unlocks once absorption is mastered.' }),
        item('Triggers', 'Gamma Exposure', { description: 'Powers surfaced after exposure to the reactor leak.', requires: 'Origin: Radiation' }),
        item('Triggers', 'Adrenal Surge', { description: 'Powers only wake under mortal threat.' }),
        item('Drawbacks', 'Cellular Burn', { description: 'Every use ages the body.', modifiers: [mod('gene_stability', 'add', '-15')] }),
        item('Drawbacks', 'Tell', { description: 'Eyes glow while the power is active. No hiding it.' }),
      ],
      matrices: [],
    },
  },
];

export const BLANK: BlueprintContent = { name: 'New system', description: '', variables: [], tracks: [], ranks: [], groups: [], items: [], matrices: [] };
