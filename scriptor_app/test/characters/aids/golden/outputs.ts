// Scriptor's outputs for the character writing aids, keyed and shaped exactly as dump.dart makes the Flutter app's (see
// there), hashed the same way (../../golden/outputs.ts). The order of appearance and the lines each character says
// come from the golden's `inputs` (made by the Flutter app's entrances.dart and voice.dart, which another port owns).

import { CastData } from '../../../../src/domain/characters/castData';
import { CharacterChanges } from '../../../../src/domain/characters/characterChanges';
import { type Likeness, painted, wordsFor } from '../../../../src/domain/characters/aids/likeness';
import { cameoLookOf, cameoMeasures } from '../../../../src/domain/characters/aids/cameo';
import { castPhotoRows } from '../../../../src/domain/characters/aids/castPhoto';
import { cardLine, characterCardOf } from '../../../../src/domain/characters/aids/characterCard';
import { dramatisPeople } from '../../../../src/domain/characters/aids/dramatisPage';
import { acquaintance, interviewFor, saveInterviewAnswer, storedAnswer } from '../../../../src/domain/characters/aids/interview';
import { journalOthers } from '../../../../src/domain/characters/aids/journalPage';
import { playbillMore, playbillParts, raiseTheCurtain } from '../../../../src/domain/characters/aids/playbill';
import {
  WriteThemInState,
  updatePlan,
  writeThemInDocuments,
  writeThemInView,
} from '../../../../src/domain/characters/aids/writeThemInPage';
import { castGroupings, castOrders, composeDramatis } from '../../../../src/domain/characters/dramatis';
import { chairsLead, emptyChairs } from '../../../../src/domain/characters/emptyChairs';
import { journalPages, journalPrompts, journalTag, journalTitlePrefix, promptOf, wordsIn } from '../../../../src/domain/characters/journal';
import {
  type Feature,
  checkLooks,
  featureFieldNames,
  features,
  looksIn,
  looksJob,
  recordAs,
} from '../../../../src/domain/characters/looks';
import { namedInJob, namesToFind } from '../../../../src/domain/characters/namedIn';
import { forgeNames, learnableNames } from '../../../../src/domain/characters/nameForge';
import { recordFace, recordLook, recordTraits } from '../../../../src/domain/characters/recordLook';
import { stakesOf } from '../../../../src/domain/characters/stakes';
import { askOf, sidesOf, traitAxes, traitsAfter, traitsIn } from '../../../../src/domain/characters/thisOrThat';
import { placesFor, sparksFor } from '../../../../src/domain/characters/writeThemIn';
import { DartRandom } from '../../../../src/domain/desk/dartRandom';
import { str } from '../../../../src/domain/json';
import { createNode } from '../../../../src/domain/outline';
import { blockTexts } from '../../../../src/domain/prose';
import { CharacterRelation } from '../../../../src/domain/records/relation';
import { type Entry } from '../../../../src/domain/records/entry';
import { type NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';
import { dartToLowerCase, dartTrim } from '../../../../src/domain/text/dartString';
import { RecordChanges } from '../../../../src/domain/codex/codexChanges';
import { hashOf } from '../../golden/outputs';

export { hashOf };

export type Inputs = { appearance: Record<string, number>; lines: Record<string, string[]>; ids: number };

const collectionsOf = (s: NovelSnapshot) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.collections)) if (v.length > 0) out[k] = v;
  return out;
};

const fieldsOf = (e: Entry) => {
  const m = new Map<string, string>();
  for (const f of e.fields) m.set(dartToLowerCase(dartTrim(f.key)), f.value);
  return m;
};

const likenessJson = (l: Likeness) => ({ ...l });

function cameoDraws(look: ReturnType<typeof cameoLookOf>, w: number, h: number, bare: boolean) {
  const m = cameoMeasures(look, w, h, bare);
  // The freckles' draws, as the painter makes them (ten, x then y, from seed + 7).
  const r = new DartRandom(look.seed + 7);
  return { shoulders: m.shoulders, headRx: m.headRx, part: m.part, freckles: Array.from({ length: 10 }, () => r.nextDouble()) };
}

export function reads(s: NovelSnapshot, inputs: Inputs): { reads: Record<string, unknown>; ids: number } {
  const plainCast = new CastData('novel', s);
  const names = namesToFind(plainCast.entries, plainCast.profiles);
  const stored = s.rows('chapterContents').map((r) => JSON.stringify(r));
  const named = namedInJob(stored, names)();
  const cast = new CastData('novel', s, { named });
  const list = cast.list;
  const templates = cast.templates;
  const relations = s.rows('characterRelations').map((r) => new CharacterRelation(r));
  const active = list.filter((l) => !l.profile.archived);
  const appearance = new Map(Object.entries(inputs.appearance));
  const docs = writeThemInDocuments(cast);
  const pages = new Map(s.rows('chapterContents').map((r) => [str(r['id']), blockTexts(r['doc'])]));
  const allNames = list.flatMap((l) => names[l.entry.id] ?? []);

  const out: Record<string, unknown> = {};
  out['interview'] = list.map((l) => {
    const a = acquaintance(l.entry, l.profile, templates);
    return {
      id: l.entry.id,
      steps: interviewFor(l.entry, l.profile, templates).map((st) => ({
        ask: st.ask,
        hint: st.hint,
        fieldName: st.fieldName,
        type: st.type,
        fieldId: st.fieldId,
        sectionId: st.sectionId,
        sectionName: st.sectionName,
        suggestion: st.suggestion === null ? null : [st.suggestion.name, st.suggestion.type],
      })),
      acquaintance: [a.known, a.of],
    };
  });
  out['cameo'] = list.map((l) => {
    const look = cameoLookOf(l.entry, l.profile);
    const w = wordsFor(look.likeness);
    return {
      id: l.entry.id,
      hair: look.hair,
      silver: look.silver,
      pointedEars: look.pointedEars,
      gone: look.gone,
      seed: look.seed,
      likeness: likenessJson(look.likeness),
      painted: painted(look.likeness),
      words: [w.hair, w.eyes, w.skin, w.marks],
      bare: cameoDraws(look, 100, 126, true),
      boxed: cameoDraws(look, 48, 58, false),
    };
  });
  out['journal'] = list.map((l) => ({
    id: l.entry.id,
    prompts: journalPrompts(l.entry.name, {
      others: journalOthers(cast, l.entry.id),
      wants: stakesOf(fieldsOf(l.entry)).get('wants') ?? '',
    }).map((p) => [p.id, p.ask]),
    pages: journalPages(cast.notes(l.entry.id)).map((p) => [p.id, promptOf(p), wordsIn(p.content)]),
  }));
  const places = list.length > 0 ? writeThemInView(cast, list[0].entry.id)!.places : null;
  out['places'] = (places ?? placesOnly(cast)).map((p) => [p.kind, p.nodeId, p.label]);
  out['writeThemIn'] = list.map((l) => {
    const view = writeThemInView(cast, l.entry.id)!;
    return {
      id: l.entry.id,
      sparks: view.sparks.map((sp) => [sp.from, sp.text]),
      others: view.others.map((o) => (o.tie.length === 0 ? o.name : `${o.id}|${o.name} · ${o.tie}`)),
    };
  });
  out['thisOrThat'] = list.map((l) => {
    const field = l.entry.fields.find((f) =>
      ['core traits', 'traits', 'personality traits', 'personality'].includes(dartToLowerCase(dartTrim(f.key))),
    );
    const storedTraits = field?.value ?? '';
    const sides = sidesOf(traitsIn(storedTraits));
    const chosen = new Map<string, number | null>(sides);
    chosen.set('room', 1);
    chosen.set('fight', -1);
    chosen.set('head', null);
    return {
      id: l.entry.id,
      traits: traitsIn(storedTraits),
      sides: Object.fromEntries(sides),
      after: traitsAfter(storedTraits, chosen),
      asks: traitAxes.map((a) => askOf(a, l.entry.name)),
    };
  });
  out['chairs'] = {
    lead: chairsLead(list)?.entry.id ?? null,
    activeLead: chairsLead(active)?.entry.id ?? null,
    each: list.map((l) => [l.entry.id, ...emptyChairs(l, list, relations).map((c) => [c.key, c.question, c.line])]),
  };
  out['looks'] = list.map((l) => {
    const mine = names[l.entry.id] ?? [];
    const others = allNames.filter((n) => !mine.includes(n));
    const seen = looksIn(pages, docs.map((n) => n.id), mine, { others });
    const fields = fieldsOf(l.entry);
    const recorded = (f: Feature) =>
      featureFieldNames[f].map((n) => dartTrim(fields.get(n) ?? '')).find((v) => v.length > 0) ?? '';
    const checks = checkLooks(seen, new Map(features.map((f) => [f, recorded(f)])));
    return {
      id: l.entry.id,
      seen: seen.map((x) => [x.feature, x.family, x.said, x.nodeId, x.block, x.sentence]),
      checks: checks.map((c) => [c.feature, c.recorded, c.family, c.verdict, c.sightings.length, recordAs(c.family)]),
      job: looksJob(stored, docs.map((n) => n.id), mine, others)().length,
    };
  });
  out['card'] = cast.entries
    .filter((e) => e.category === 'character')
    .map((e) => {
      const g = characterCardOf(cast, e.id)!.card;
      const said = inputs.lines[e.id];
      return {
        id: e.id,
        card: [g.name, g.what, g.epithet, g.facts.map((f) => [f.label, f.value]), g.ties, g.summary],
        line: said === undefined ? null : cardLine(said.map((words) => ({ words }))),
      };
    });
  const people = dramatisPeople(cast);
  const dramatis: Record<string, unknown> = { about: people.map((p) => p.about) };
  for (const by of castGroupings) {
    for (const order of castOrders) {
      for (const only of [true, false]) {
        dramatis[`${by}|${order}|${only}`] = composeDramatis(people, { by, order, appearance, onlyOnPage: only });
      }
    }
  }
  out['dramatis'] = dramatis;
  const rows = castPhotoRows(active);
  const all = castPhotoRows(list);
  out['photo'] = {
    front: rows.front.map((l) => l.entry.id),
    back: rows.back.map((l) => l.entry.id),
    more: rows.more,
    all: [all.front.map((l) => l.entry.id), all.back.map((l) => l.entry.id), all.more],
  };
  const bookPeople = learnableNames(cast.entries.filter((e) => e.category === 'character').map((e) => e.name));
  const bookPlaces = learnableNames(cast.entries.filter((e) => e.category === 'location').map((e) => e.name));
  const forge: Record<string, unknown> = { people: bookPeople, places: bookPlaces };
  for (const seed of [0, 1, 42]) {
    for (const start of ['', 'k', 'Th']) {
      forge[`${seed}|${start}`] = [
        forgeNames({ source: bookPeople, seed, start }),
        forgeNames({ source: bookPlaces, seed, start }),
      ];
    }
  }
  out['forge'] = forge;

  let ids = 0;
  const fresh = () => new CharacterChanges(s, { now: 5000, createId: () => `id-${++ids}` });
  const changes: Record<string, unknown> = {};
  for (const l of list.slice(0, 25)) {
    const traits = fresh();
    recordTraits(
      traits,
      l.entry.id,
      new Map<string, number | null>([
        ['room', 1],
        ['fight', -1],
        ['head', null],
        ['hour', -1],
      ]),
    );
    const face = fresh();
    const was = cameoLookOf(l.entry, l.profile).likeness;
    const now: Likeness = {
      ...was,
      hair: 'red',
      cut: 'braid',
      curly: !was.curly,
      eyes: 'green',
      skin: 'olive',
      skinFamily: null,
      glasses: true,
      freckles: true,
      crown: true,
    };
    recordFace(face, l.entry.id, was, now);
    const look = fresh();
    recordLook(look, l.entry.id, 'eyes', 'Grey');
    recordLook(look, l.entry.id, 'hair', 'Black');
    const answer = fresh();
    interviewFor(l.entry, l.profile, templates)
      .slice(0, 3)
      .forEach((st, i) => saveInterviewAnswer(answer, l.entry.id, st, storedAnswer(st.type, `answer ${i}, and more,\nthen`)));
    const journal = fresh();
    const note = journal.saveNote(l.entry.id, null, {
      title: `${journalTitlePrefix}The night before.`,
      content: 'I could not sleep.',
      tags: [journalTag],
    });
    journal.saveNote(l.entry.id, note.id, { content: 'I could not sleep. The door hums.' });
    changes[l.entry.id] = [
      hashOf(collectionsOf(traits.snapshot)),
      hashOf(collectionsOf(face.snapshot)),
      hashOf(collectionsOf(look.snapshot)),
      hashOf(collectionsOf(answer.snapshot)),
      hashOf(collectionsOf(journal.snapshot)),
      face.character(l.entry.id).fields.map((f) => `${f.key}=${f.value}`),
      traits.character(l.entry.id).fields.map((f) => `${f.key}=${f.value}`),
    ];
  }
  const curtain = fresh();
  const made = raiseTheCurtain(curtain, [
    [playbillParts[0], ' Ilse '],
    [playbillParts[1], 'Corvan'],
    [playbillParts[2], ''],
    [playbillMore, 'Brannoc'],
  ]);
  changes['curtain'] = [made, hashOf(collectionsOf(curtain.snapshot))];
  const noHero = fresh();
  changes['curtain-no-hero'] = [
    raiseTheCurtain(noHero, [
      [playbillParts[0], ''],
      [playbillParts[2], 'Tamsin'],
    ]),
    hashOf(collectionsOf(noHero.snapshot)),
  ];
  if (list.length > 0) {
    const me = list[0];
    const view = writeThemInView(cast, me.entry.id)!;
    const sparks = sparksFor(me.entry.name, stakesOf(fieldsOf(me.entry)), []);
    view.places.forEach((p, i) => {
      let snap = s;
      let id: string;
      if (p.kind === 'blank') {
        id = p.nodeId!;
      } else {
        const state = new WriteThemInState();
        state.place = i;
        const start = state.start({ ...view, sparks }, docs);
        const r = createNode(snap, start.create!.kind, {
          parentId: start.create!.parentId,
          now: 7000,
          createId: () => `id-${++ids}`,
        });
        snap = r.snapshot;
        id = r.node.id;
      }
      const others = list.slice(1, 3).map((o) => o.entry.id);
      for (const eyes of [true, false]) {
        const state = new WriteThemInState();
        state.place = i;
        state.eyes = eyes;
        for (const o of others) state.toggle(o, true);
        const start = state.start({ ...view, sparks }, docs);
        const plot = new RecordChanges(snap, { now: 8000, createId: () => `id-${++ids}` });
        updatePlan(plot, id, start.edit);
        changes[`write:${p.kind}:${eyes}`] = [id, hashOf(collectionsOf(plot.snapshot))];
      }
    });
  }
  out['changes'] = changes;
  return { reads: out, ids };
}

/** The places of a book with no cast (no character to write in), as the page would offer them. */
function placesOnly(cast: CastData) {
  return placesFor(
    writeThemInDocuments(cast).map((n) => ({
      id: n.id,
      kind: n.kindKey,
      parentId: n.parentId,
      title: n.title,
      words: n.wordCount,
      planned: dartTrim(cast.model.plans.get(n.id)?.objective ?? '').length > 0,
    })),
  );
}

