import { describe, expect, it } from 'vitest';
import { EDGE_GROUP_SWATCH, shapeOf, typeCodes } from './components/KnowledgeMap';

const LABELS: Record<string, string> = {
  'entry:character': 'Characters',
  'entry:creature': 'Creatures',
  'entry:location': 'Locations',
  'entry:faction': 'Factions & Species',
  chapter: 'Chapters',
  scene: 'Scenes',
  part: 'Volumes, acts & arcs',
  event: 'Events',
  thread: 'Plot threads',
  ability: 'Abilities',
};
const label = (type: string) => LABELS[type];

describe('nothing in the knowledge graph is told by colour alone', () => {
  it('kinds of record that share a shape carry a letter code: one letter, or as many as tell them apart', () => {
    const codes = typeCodes(Object.keys(LABELS), label);
    // Circles: Characters and Creatures both start with C, so the circles get two letters each.
    expect(['entry:character', 'entry:creature', 'entry:location', 'entry:faction'].map((t) => codes.get(t))).toEqual(['Ch', 'Cr', 'Lo', 'Fa']);
    // Squares: one letter tells chapters, scenes and parts apart.
    expect(['chapter', 'scene', 'part'].map((t) => codes.get(t))).toEqual(['C', 'S', 'V']);
    expect(['thread', 'ability'].map((t) => codes.get(t))).toEqual(['P', 'A']);
    // An event is the only diamond: its shape is enough.
    expect(codes.has('event')).toBe(false);
    // Every kind that shares its shape has a code no other kind of that shape has.
    for (const shape of ['circle', 'square', 'triangle'] as const) {
      const mine = Object.keys(LABELS).filter((t) => shapeOf(t) === shape).map((t) => codes.get(t));
      expect(new Set(mine).size).toBe(mine.length);
    }
  });

  it('a code does not depend on what a filter leaves drawn: the same kinds give the same codes in any order', () => {
    const types = ['entry:location', 'entry:character', 'chapter', 'scene'];
    expect([...typeCodes(types, label)]).toEqual([...typeCodes([...types].reverse(), label)]);
    expect(typeCodes(['entry:character'], label).size).toBe(0);
  });

  it('every kind of connection has a line of its own, not just a colour', () => {
    const swatches = Object.values(EDGE_GROUP_SWATCH);
    expect(new Set(swatches).size).toBe(swatches.length);
  });
});
