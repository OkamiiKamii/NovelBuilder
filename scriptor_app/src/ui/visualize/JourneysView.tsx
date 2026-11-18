// Visualize › Journeys (FEATURES.md #297–#298): who travels from where to where and when, by what method, with route
// maps (a line through each journey's places, one colour a traveller) and each traveller's route (in story time, as
// the reader meets them, when not known); and the travel checks, said and never fixed: arriving before leaving, too
// fast for the distance, two journeys at once, events elsewhere mid-journey. A port of
// flutter_app/lib/features/places/journeys_page.dart; what is shown is src/domain/travel/routes.ts and
// src/domain/visualize/world/worldViews.ts.

import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { localeCompare } from '../../domain/collation';
import type { JsonMap } from '../../domain/json';
import type { WorldMap } from '../../domain/places/places';
import { stableSorted } from '../../domain/reader/stableSort';
import { type TimeUnit, timeUnits } from '../../domain/records/event';
import type { Journey } from '../../domain/records/journey';
import { journeyRecord, routeOf, travelProblems } from '../../domain/travel/routes';
import { TravelMethod, perLabels } from '../../domain/travel/travel';
import {
  journeyInput,
  journeysInOrder,
  mapDrawing,
  n,
  otherColor,
  problemsFor,
  routeLine,
  routeParts,
  travellerColors,
  travellersOf,
} from '../../domain/visualize/world/worldViews';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, radius, space } from '../theme';
import { type OpenPlaces, usePlaces } from './usePlaces';
import { VizFrame } from './VizFrame';
import { PinchBox } from './PinchBox';
import { WhenField } from './WhenField';

export function JourneysView() {
  const [list, setList] = useState(false);
  const p = usePlaces();
  return (
    <VizFrame
      view="journeys"
      title="Journeys"
      subtitle={p?.open.cast.novelTitle}
      filters={false}
      actions={
        <View style={styles.row}>
          <Chip label="Map" icon="map-outline" selected={!list} onPress={() => setList(false)} />
          <Chip label="List" icon="format-list-bulleted" selected={list} onPress={() => setList(true)} />
        </View>
      }
    >
      {p !== null && <JourneysBody p={p} list={list} />}
    </VizFrame>
  );
}

function JourneysBody({ p, list }: { p: OpenPlaces; list: boolean }) {
  const [who, setWho] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);
  const [form, setForm] = useState<{ journey: Journey | null } | null>(null);
  const [methods, setMethods] = useState(false);
  const [deleting, setDeleting] = useState<Journey | null>(null);
  const model = p.open.cast.model;
  const data = p.data;
  const journeys = data.journeys;
  const record = (j: Journey) => journeyRecord(model, j, data.travel, data.maps, data.pins);
  const travellers = travellersOf(model, journeys);
  const chosen = who !== null && model.entries.has(who) ? who : null;
  const theirs = chosen === null ? journeys : journeys.filter((j) => j.travellerIds.includes(chosen));
  const problems = problemsFor(model, travelProblems(model, journeys, data.travel, data.maps, data.pins), chosen, theirs);
  const usable = data.maps.filter((m) => data.pins.some((x) => x.mapId === m.id));
  const map = usable.find((m) => m.id === mapId) ?? usable[0] ?? null;
  const toolbar = (
    <View style={styles.gap}>
      {travellers.length > 0 && (
        <ChooserField
          label="Whose journeys"
          value={chosen ?? ''}
          choices={[{ value: '', label: 'Everyone’s' }, ...travellers.map((id) => ({ value: id, label: model.entries.get(id)!.name }))]}
          onChoose={(v) => setWho(v.length === 0 ? null : v)}
        />
      )}
      {!list && usable.length > 1 && map !== null && (
        <ChooserField label="Map shown" value={map.id} choices={usable.map((m) => ({ value: m.id, label: m.name }))} onChoose={setMapId} />
      )}
      <View style={styles.row}>
        <GoldButton label="Record a journey" icon="plus" compact onPress={() => setForm({ journey: null })} />
        <OutlineButton label="Travel methods…" compact onPress={() => setMethods(true)} />
      </View>
    </View>
  );
  const sheets = (
    <>
      {form !== null && <JourneyForm p={p} initial={form.journey} traveller={chosen} onClose={() => setForm(null)} />}
      {methods && <MethodsSheet p={p} onClose={() => setMethods(false)} />}
      <ConfirmDelete
        visible={deleting !== null}
        title="Delete this journey?"
        confirmLabel="Delete"
        message={deleting === null ? '' : `Delete the journey “${record(deleting).words}”? The travellers, places and events are not changed.`}
        onConfirm={() => {
          if (deleting !== null) p.places((c) => c.removeJourney(deleting.id));
          setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
  if (journeys.length === 0) {
    return (
      <View style={styles.gap}>
        {toolbar}
        <Panel style={styles.empty}>
          <Icon name="map-marker-path" size={36} />
          <Text style={styles.heading}>No journeys yet</Text>
          <Muted style={styles.center}>Record who travels from where to where, and when, as far as you know it.</Muted>
        </Panel>
        {sheets}
      </View>
    );
  }
  const actions = (j: Journey) => (
    <View style={styles.row}>
      <IconButton icon="pencil-outline" label="Change this journey" onPress={() => setForm({ journey: j })} />
      <IconButton icon="delete-outline" label="Delete this journey" onPress={() => setDeleting(j)} color={colors.danger} />
    </View>
  );
  const route = chosen === null ? null : routeOf(model, chosen, journeys, data.travel, data.maps, data.pins);
  return (
    <View style={styles.gap}>
      {toolbar}
      <Text style={styles.heading} accessibilityRole="header">
        Possible conflicts
      </Text>
      {problems.length === 0 && <Text style={styles.body}>None.</Text>}
      {problems.map((x) => (
        <View key={x.key} style={styles.problem}>
          <Text style={[styles.badge, x.severity === 'problem' ? styles.badgeProblem : styles.badgeNote]}>{x.severity === 'problem' ? 'Conflict' : 'Note'}</Text>
          <Text style={[styles.body, styles.flex]}>{x.message}</Text>
        </View>
      ))}
      {!list && map !== null && <RouteMap p={p} journeys={journeysInOrder(model, theirs, data.travel)} map={map} words={(j) => record(j).words} />}
      {route !== null ? (
        <>
          <Text style={styles.heading} accessibilityRole="header">{`${model.entries.get(chosen!)!.name}’s route`}</Text>
          {routeParts(route).map((part) => (
            <View key={part.title} style={styles.gapSm}>
              <Text style={styles.label}>{part.title.toUpperCase()}</Text>
              {part.items.map((i) => {
                const j = i.journeyId === null ? null : (journeys.find((x) => x.id === i.journeyId) ?? null);
                return (
                  <View key={i.key} style={styles.line}>
                    <View style={styles.flex}>
                      <Text style={styles.name}>{i.title}</Text>
                      <Muted>{routeLine(i)}</Muted>
                    </View>
                    {j !== null && actions(j)}
                  </View>
                );
              })}
            </View>
          ))}
        </>
      ) : (
        <>
          <Text style={styles.heading} accessibilityRole="header">
            Every journey
          </Text>
          {journeysInOrder(model, journeys, data.travel).map((j) => {
            const r = record(j);
            return (
              <View key={j.id} style={styles.line}>
                <View style={styles.flex}>
                  <Text style={styles.name}>{r.words}</Text>
                  <Muted>{`leaves ${r.leavesWords}, arrives ${r.arrivesWords}`}</Muted>
                </View>
                {actions(j)}
              </View>
            );
          })}
        </>
      )}
      {sheets}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- route map

function RouteMap({ p, journeys, map, words }: { p: OpenPlaces; journeys: Journey[]; map: WorldMap; words: (j: Journey) => string }) {
  const { width: screen } = useWindowDimensions();
  const d = mapDrawing(map);
  const scale = Math.min(Math.max(200, screen - space.md * 2 - 2) / d.width, 1);
  const at = (id: string | null) => {
    const pin = id === null ? null : (p.data.pins.find((x) => x.mapId === map.id && x.entryId === id) ?? null);
    return pin === null ? null : { x: d.pad + pin.x * d.s, y: d.pad + pin.y * d.s };
  };
  const travellers: string[] = [];
  for (const j of journeys) for (const t of j.travellerIds) if (!travellers.includes(t)) travellers.push(t);
  const colour = (j: Journey) => {
    const i = travellers.indexOf(j.travellerIds[0] ?? '');
    return i >= 0 && i < travellerColors.length ? travellerColors[i] : otherColor;
  };
  const drawable = journeys.filter((j) => [j.fromId, ...j.via, j.toId].every((id) => at(id) !== null));
  const missing = journeys.filter((j) => !drawable.includes(j));
  const stops = new Set(drawable.flatMap((j) => [j.fromId!, ...j.via, j.toId!]));
  const model = p.open.cast.model;
  return (
    <View style={styles.gap}>
      <PinchBox
        width={d.width * scale}
        height={d.height * scale}
        style={styles.mapBox}
        accessibilityLabel={`${map.name}: ${drawable.length} ${drawable.length === 1 ? 'journey' : 'journeys'} drawn. The list below gives every journey in words.`}
      >
        {map.image !== null && (
          <Image
            source={{ uri: map.image }}
            style={{ position: 'absolute', left: d.pad * scale, top: d.pad * scale, width: d.w * scale, height: d.h * scale }}
            resizeMode="stretch"
          />
        )}
        <Svg width={d.width * scale} height={d.height * scale} viewBox={`0 0 ${d.width} ${d.height}`}>
          {map.image === null && <Rect x={d.pad} y={d.pad} width={d.w} height={d.h} fill={colors.surface} />}
          <Rect x={d.pad} y={d.pad} width={d.w} height={d.h} fill="none" stroke={colors.muted} strokeWidth={1.5} />
          {drawable.map((j, i) => {
            const points = [j.fromId, ...j.via, j.toId].map((id) => at(id)!);
            const mid = points[Math.floor(points.length / 2)];
            return (
              <G key={j.id}>
                <Polyline points={points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={colour(j)} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx={mid.x} cy={mid.y} r={13} fill={colour(j)} />
                <SvgText x={mid.x} y={mid.y + 5} fill="#ffffff" fontFamily={fonts.ui} fontSize={14} fontWeight="700" textAnchor="middle">
                  {`${i + 1}`}
                </SvgText>
              </G>
            );
          })}
          {[...stops].map((id) => {
            const q = at(id)!;
            return (
              <G key={id}>
                <Circle cx={q.x} cy={q.y} r={7} fill={colors.text} stroke={colors.background} strokeWidth={2} />
                <SvgText x={q.x} y={q.y - 12} fill={colors.text} fontFamily={fonts.ui} fontSize={15} textAnchor="middle">
                  {model.entries.get(id)?.name ?? ''}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </PinchBox>
      <View style={styles.row}>
        {travellers.map((t, i) => (
          <View key={t} style={styles.key}>
            <View style={[styles.swatch, { backgroundColor: i < travellerColors.length ? travellerColors[i] : otherColor }]} />
            <Text style={styles.small}>{model.entries.get(t)?.name ?? 'someone deleted'}</Text>
          </View>
        ))}
      </View>
      {drawable.map((j, i) => (
        <Text key={j.id} style={styles.small}>{`${i + 1}. ${words(j)}`}</Text>
      ))}
      {missing.length > 0 && (
        <Muted>{`Not drawn on ${map.name} (a place on the way has no coordinates on it): ${missing.map(words).join('; ')}.`}</Muted>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the form

function JourneyForm({ p, initial, traveller, onClose }: { p: OpenPlaces; initial: Journey | null; traveller: string | null; onClose: () => void }) {
  const model = p.open.cast.model;
  const data = p.data;
  const d = initial?.duration ?? null;
  const [f, setF] = useState(() => ({
    travellerIds: initial?.travellerIds ?? (traveller !== null ? [traveller] : []),
    fromId: initial?.fromId ?? null,
    toId: initial?.toId ?? null,
    via: initial?.via ?? [],
    departure: (initial?.raw['departure'] as JsonMap | null | undefined) ?? null,
    arrival: (initial?.raw['arrival'] as JsonMap | null | undefined) ?? null,
    afterId: initial?.afterId ?? null,
    methodId: initial?.methodId ?? null,
    ownMethod: initial !== null && initial.methodId === null && initial.method.length > 0 ? initial.method : null,
    duration: d === null ? '' : n(d.amount),
    unit: (d?.unit ?? 'days') as TimeUnit,
    distance: initial?.distance === null || initial === null ? '' : n(initial.distance),
    distanceUnit: initial?.distanceUnit ?? '',
    eventIds: initial?.eventIds ?? [],
    note: initial?.note ?? '',
  }));
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const byName = <T extends { name: string }>(list: T[]) => stableSorted(list, (a, b) => localeCompare(a.name, b.name));
  const people = byName([...model.entries.values()].filter((e) => e.category !== 'location'));
  const places = byName([...model.entries.values()].filter((e) => e.category === 'location'));
  const events = byName([...model.events.values()]);
  const methods = data.travel?.methods ?? [];
  const placeChoice = (label: string, value: string | null, onChoose: (v: string | null) => void) => (
    <ChooserField
      label={label}
      value={value ?? ''}
      choices={[{ value: '', label: 'Not recorded' }, ...places.map((e) => ({ value: e.id, label: e.name }))]}
      onChoose={(v) => onChoose(v.length === 0 ? null : v)}
    />
  );
  const save = () => {
    const saved = p.places((c) => c.saveJourney(initial?.id ?? null, journeyInput(f)));
    if (saved !== undefined) onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={initial === null ? 'Record a journey' : 'Change the journey'} wide footer={<GoldButton label="Save the journey" onPress={save} />}>
      <Text style={styles.label}>WHO TRAVELS</Text>
      <View style={styles.row}>
        {people.map((e) => (
          <Chip
            key={e.id}
            label={e.name}
            selected={f.travellerIds.includes(e.id)}
            onPress={() => set({ travellerIds: f.travellerIds.includes(e.id) ? f.travellerIds.filter((t) => t !== e.id) : [...f.travellerIds, e.id] })}
          />
        ))}
      </View>
      {placeChoice('From', f.fromId, (v) => set({ fromId: v }))}
      {placeChoice('To', f.toId, (v) => set({ toId: v }))}
      <Text style={styles.label}>BY WAY OF</Text>
      <View style={styles.row}>
        {f.via.map((id, i) => (
          <Chip key={`${id}-${i}`} label={`${model.entries.get(id)?.name ?? 'a place that is gone'} ×`} selected onPress={() => set({ via: f.via.filter((_, k) => k !== i) })} />
        ))}
      </View>
      <ChooserField
        label="Add a place on the way…"
        value=""
        choices={[{ value: '', label: 'Choose…' }, ...places.map((e) => ({ value: e.id, label: e.name }))]}
        onChoose={(v) => {
          if (v.length > 0) set({ via: [...f.via, v] });
        }}
      />
      <WhenField model={model} label="Leaves" value={f.departure} onChange={(v) => set({ departure: v })} />
      <WhenField model={model} label="Arrives" value={f.arrival} onChange={(v) => set({ arrival: v })} />
      <ChooserField
        label="Comes after (when only the order is known)"
        value={f.afterId ?? ''}
        choices={[
          { value: '', label: 'No journey in particular' },
          ...data.journeys.filter((j) => j.id !== initial?.id).map((j) => ({ value: j.id, label: journeyRecord(model, j, data.travel).words })),
        ]}
        onChoose={(v) => set({ afterId: v.length === 0 ? null : v })}
      />
      <ChooserField
        label="Travel method"
        value={f.ownMethod !== null ? 'own' : (f.methodId ?? '')}
        choices={[
          { value: '', label: 'Not said' },
          ...methods.map((m) => ({
            value: m.id,
            label: m.speed !== null ? `${m.name} (${n(m.speed)} ${m.distanceUnit} ${perLabels[m.per]})` : m.name,
          })),
          { value: 'own', label: 'In your own words…' },
        ]}
        onChoose={(v) => (v === 'own' ? set({ ownMethod: f.ownMethod ?? '', methodId: null }) : set({ ownMethod: null, methodId: v.length === 0 ? null : v }))}
      />
      {f.ownMethod !== null && (
        <TextInput
          value={f.ownMethod}
          onChangeText={(t) => set({ ownMethod: t })}
          placeholder="Travel method, in your own words"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      )}
      <View style={styles.row}>
        <TextInput
          value={f.duration}
          onChangeText={(t) => set({ duration: t })}
          placeholder="Duration (optional)"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={[styles.input, styles.flex]}
        />
        <View style={styles.flex}>
          <ChooserField label="Duration unit" value={f.unit} choices={timeUnits.map((u) => ({ value: u, label: u }))} onChoose={(v) => set({ unit: v })} />
        </View>
      </View>
      <View style={styles.row}>
        <TextInput
          value={f.distance}
          onChangeText={(t) => set({ distance: t })}
          placeholder="Distance (optional)"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={[styles.input, styles.flex]}
        />
        <TextInput
          value={f.distanceUnit}
          onChangeText={(t) => set({ distanceUnit: t })}
          placeholder="Distance unit"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.flex]}
        />
      </View>
      {events.length > 0 && (
        <>
          <Text style={styles.label}>PART OF THESE EVENTS (OPTIONAL)</Text>
          <View style={styles.row}>
            {events.map((e) => (
              <Chip
                key={e.id}
                label={e.name}
                selected={f.eventIds.includes(e.id)}
                onPress={() => set({ eventIds: f.eventIds.includes(e.id) ? f.eventIds.filter((x) => x !== e.id) : [...f.eventIds, e.id] })}
              />
            ))}
          </View>
        </>
      )}
      <TextInput
        value={f.note}
        onChangeText={(t) => set({ note: t })}
        placeholder="Note (optional)"
        placeholderTextColor={colors.muted}
        multiline
        style={[styles.input, styles.note]}
      />
    </Sheet>
  );
}

// -------------------------------------------------------------------------------------------------- the methods

function MethodsSheet({ p, onClose }: { p: OpenPlaces; onClose: () => void }) {
  const [name, setName] = useState('');
  const methods = p.data.travel?.methods ?? [];
  const change = (id: string, edit: (m: TravelMethod) => TravelMethod, later = false) => {
    const next = (all: readonly TravelMethod[]) => all.map((m) => (m.id === id ? edit(m) : m));
    if (later) p.placesLater(`method:${id}`, (c) => c.setMethods(next(c.travelSettings()?.methods ?? [])));
    else p.places((c) => c.setMethods(next(c.travelSettings()?.methods ?? [])));
  };
  const copy = (m: TravelMethod, patch: { name?: string; speed?: number | null; distanceUnit?: string; per?: TimeUnit }) =>
    new TravelMethod({
      id: m.id,
      name: patch.name ?? m.name,
      speed: patch.speed !== undefined ? patch.speed : m.speed,
      distanceUnit: patch.distanceUnit ?? m.distanceUnit,
      per: patch.per ?? m.per,
    });
  return (
    <Sheet visible onClose={onClose} title="Travel methods" wide footer={<GoldButton label="Done" onPress={onClose} />}>
      <Muted>
        A method has a speed only when you give it one: nothing is assumed. With a speed and a distance in the same unit, the least time a
        journey takes is worked out, and a journey too fast for it is said.
      </Muted>
      {methods.length === 0 && <Muted>No travel methods yet.</Muted>}
      {methods.map((m) => (
        <View key={m.id} style={styles.methodCard}>
          <TextInput defaultValue={m.name} onChangeText={(t) => change(m.id, (x) => copy(x, { name: t }), true)} accessibilityLabel={`Name of ${m.name}`} style={styles.input} />
          <View style={styles.row}>
            <TextInput
              defaultValue={m.speed === null ? '' : n(m.speed)}
              onChangeText={(t) => {
                const v = Number(t);
                change(m.id, (x) => copy(x, { speed: t.trim().length === 0 || !Number.isFinite(v) ? null : v }), true);
              }}
              placeholder="Speed"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              accessibilityLabel={`Speed of ${m.name}`}
              style={[styles.input, styles.flex]}
            />
            <TextInput
              defaultValue={m.distanceUnit}
              onChangeText={(t) => change(m.id, (x) => copy(x, { distanceUnit: t }), true)}
              placeholder="Distance unit"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Distance unit"
              style={[styles.input, styles.flex]}
            />
          </View>
          <ChooserField
            label={`${m.name}: per`}
            value={m.per}
            choices={timeUnits.map((u) => ({ value: u, label: perLabels[u] }))}
            onChoose={(v) => change(m.id, (x) => copy(x, { per: v }))}
          />
          <OutlineButton
            label="Remove"
            compact
            tone="danger"
            onPress={() => p.places((c) => c.setMethods((c.travelSettings()?.methods ?? []).filter((x) => x.id !== m.id)))}
          />
        </View>
      ))}
      <View style={styles.row}>
        <TextInput value={name} onChangeText={setName} placeholder="New travel method" placeholderTextColor={colors.muted} style={[styles.input, styles.flex]} />
        <GoldButton
          label="Add"
          compact
          disabled={name.trim().length === 0}
          onPress={() => {
            const done = p.places((c) => c.setMethods([...(c.travelSettings()?.methods ?? []), new TravelMethod({ id: '', name })]));
            if (done !== undefined) setName('');
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: space.sm },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.gold },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  name: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  problem: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  badge: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.chip, overflow: 'hidden' },
  badgeProblem: { color: colors.background, backgroundColor: colors.danger },
  badgeNote: { color: colors.text, backgroundColor: colors.elevated },
  mapBox: { alignSelf: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 22, height: 6, borderRadius: 3 },
  input: {
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
  note: { minHeight: 80, textAlignVertical: 'top', paddingTop: space.sm },
  methodCard: { gap: space.sm, padding: space.sm, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border },
});
