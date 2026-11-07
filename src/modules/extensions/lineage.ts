import type { StoryOrder } from '@/modules/relationships/timeline';
import { stageAt } from '@/modules/relationships/timeline';
import type { CharacterRelation } from '@/modules/relationships/types';

export interface Kin {
  id: string;
  parents: string[];
  children: string[];
  partners: string[];
  siblings: string[];
  relatives: string[];
}

/**
 * A family tree read off the Character Relationship Manager: every family
 * relationship as it stands at the end of the story, arranged in
 * generations. It is a way of looking at those relationships and keeps
 * nothing of its own, so changing a relationship changes the tree.
 *
 * A generation is worked out from parent and child: a child sits one below
 * the lowest of their parents, and partners and siblings share a row.
 */
export function buildLineage(relations: CharacterRelation[], order: StoryOrder, known: (id: string) => boolean): Kin[][] {
  const people = new Map<string, Kin>();
  const kin = (id: string): Kin => people.get(id) ?? (people.set(id, { id, parents: [], children: [], partners: [], siblings: [], relatives: [] }), people.get(id)!);
  const add = (list: string[], id: string) => void (list.includes(id) || list.push(id));
  for (const relation of relations) {
    if (!known(relation.fromId) || !known(relation.toId) || relation.fromId === relation.toId) continue;
    const stage = stageAt(relation, null, order);
    if (!stage || stage.category !== 'family') continue;
    const [a, b] = [kin(relation.fromId), kin(relation.toId)];
    const [from, to] = [stage.fromRole.trim().toLowerCase(), stage.toRole.trim().toLowerCase()];
    const parentish = (role: string) => ['parent', 'mother', 'father', 'ancestor', 'grandparent'].includes(role);
    const childish = (role: string) => ['child', 'son', 'daughter', 'descendant', 'heir', 'grandchild'].includes(role);
    if (stage.preset === 'parent-child' || (parentish(from) && !parentish(to)) || (childish(to) && !childish(from))) {
      add(a.children, b.id);
      add(b.parents, a.id);
    } else if (parentish(to) || childish(from)) {
      add(b.children, a.id);
      add(a.parents, b.id);
    } else if (stage.preset === 'spouses' || ['spouse', 'husband', 'wife', 'consort'].includes(from)) {
      add(a.partners, b.id);
      add(b.partners, a.id);
    } else if (stage.preset === 'siblings' || ['sibling', 'brother', 'sister'].includes(from)) {
      add(a.siblings, b.id);
      add(b.siblings, a.id);
    } else {
      add(a.relatives, b.id);
      add(b.relatives, a.id);
    }
  }
  // Generations: settle by repetition; a loop in the data (someone their own ancestor) simply stops moving after enough rounds.
  const depth = new Map([...people.keys()].map((id) => [id, 0]));
  for (let round = 0; round < people.size + 2; round++) {
    let moved = false;
    const raise = (id: string, to: number) => {
      if (to > depth.get(id)! && to <= people.size) {
        depth.set(id, to);
        moved = true;
      }
    };
    for (const person of people.values()) {
      for (const child of person.children) raise(child, depth.get(person.id)! + 1);
      for (const other of [...person.partners, ...person.siblings]) raise(other, depth.get(person.id)!);
    }
    if (!moved) break;
  }
  const rows: Kin[][] = [];
  for (const person of people.values()) (rows[depth.get(person.id)!] ??= []).push(person);
  return rows.filter(Boolean);
}
