// Visualize › Places (FEATURES.md #293–#296): every location nested by what it is inside, with how much of the story
// happens there and what to look at (a place inside itself, a larger place inside a smaller); explore inside one
// place; the novel's own levels of place, with presets; maps over a grid or a picture from the device, with places
// pinned by typing coordinates or tapping the map; and the place panel (its level, what it is in, who and what is tied
// to it, the events and chapters there; tie more). A port of flutter_app/lib/features/places/places_page.dart and
// widgets/place_panels.dart; what is shown is src/domain/places/explore.ts and src/domain/visualize/world/worldViews.ts.

import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import type { PlaceRow } from '../../domain/places/explore';
import { mapPlaces, placeLinks, placeTree, placesWithin } from '../../domain/places/explore';
import { levelPresets, type WorldMap } from '../../domain/places/places';
import { plural } from '../../domain/desk/format';
import { EntityRef } from '../../domain/model/entityRef';
import { relatedIds } from '../../domain/model/navigate';
import { connectionType } from '../../domain/records/link';
import { nodeLabel } from '../../domain/timeline/narrative';
import { localeCompare } from '../../domain/collation';
import { relateIn } from '../../domain/characters/views/common';
import { stableSorted } from '../../domain/reader/stableSort';
import { frameFilter, matchingKeys, selectionWords } from '../../domain/visualize/screens/frame';
import { mapDrawing, n, pinWords, placeLine, placesScope, tapToMap, tieKindsForPlace } from '../../domain/visualize/world/worldViews';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { useTimeline } from '../plan/useTimeline';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { pickMapPicture } from './mapPicture';
import { type OpenPlaces, usePlaces } from './usePlaces';
import { VizFrame, useVizFilters, useVizSelection } from './VizFrame';

export function PlacesView() {
  const [list, setList] = useState(false);
  const p = usePlaces();
  return (
    <VizFrame
      view="places"
      title="Places"
      subtitle={p?.open.cast.novelTitle}
      actions={
        p !== null && p.data.maps.length > 0 ? (
          <View style={styles.row}>
            <Chip label="Map" icon="map-outline" selected={!list} onPress={() => setList(false)} />
            <Chip label="Tree" icon="file-tree-outline" selected={list} onPress={() => setList(true)} />
          </View>
        ) : undefined
      }
    >
      {p !== null && <PlacesBody p={p} list={list} />}
    </VizFrame>
  );
}

function PlacesBody({ p, list }: { p: OpenPlaces; list: boolean }) {
  const filters = useVizFilters();
  const { selected: selection, select } = useVizSelection();
  const [mapId, setMapId] = useState<string | null>(null);
  const [inside, setInside] = useState<string | null>(null);
  const [putting, setPutting] = useState<string | null>(null);
  const [levels, setLevels] = useState(false);
  const [maps, setMaps] = useState(false);
  const model = p.open.cast.model;
  const data = p.data;
  const rows = placeTree(model, { settings: data.settings, pins: data.pins });
  const tools = (
    <View style={styles.row}>
      <OutlineButton label="Levels of place…" icon="layers-outline" compact onPress={() => setLevels(true)} />
      <OutlineButton label="Maps…" icon="map-outline" compact onPress={() => setMaps(true)} />
    </View>
  );
  const sheets = (
    <>
      {levels && <LevelsSheet p={p} onClose={() => setLevels(false)} />}
      {maps && <MapsSheet p={p} onClose={() => setMaps(false)} />}
    </>
  );
  if (rows.length === 0) {
    return (
      <View style={styles.gap}>
        {tools}
        <Panel style={styles.empty}>
          <Icon name="map-marker-outline" size={36} />
          <Text style={styles.heading}>No places yet</Text>
          <Muted style={styles.center}>Add locations under Organize → World; places inside other places are nested here.</Muted>
        </Panel>
        {sheets}
      </View>
    );
  }
  const scope = placesScope(rows, inside);
  const keep = matchingKeys(model, frameFilter(filters.query, filters.involving), ['entry']);
  const shown = scope.scoped.filter((r) => keep === null || keep.has(`entry:${r.entry.id}`));
  const map = data.maps.find((m) => m.id === mapId) ?? data.maps[0] ?? null;
  const byId = new Map(rows.map((r) => [r.entry.id, r]));
  const baseDepth = scope.inside === null ? 0 : byId.get(scope.inside)!.depth;
  const mapNames = new Map(data.maps.map((m) => [m.id, m.name]));
  const related = selection === null ? null : relatedIds(model, selection);
  const selected = selection?.type === 'entry' && byId.has(selection.id) ? selection.id : null;
  const pick = (id: string) => select(new EntityRef('entry', id));
  return (
    <View style={styles.gap}>
      {data.maps.length > 1 && !list && map !== null && (
        <ChooserField label="Map shown" value={map.id} choices={data.maps.map((m) => ({ value: m.id, label: m.name }))} onChoose={setMapId} />
      )}
      {tools}
      {scope.inside !== null && (
        <View style={styles.row}>
          {scope.trail.map((r, i) => (
            <View key={r.entry.id} style={styles.row}>
              {i > 0 && <Text style={styles.body}>›</Text>}
              {i === scope.trail.length - 1 ? (
                <Text style={[styles.body, styles.bold]}>{r.entry.name}</Text>
              ) : (
                <OutlineButton label={r.entry.name} compact tone="muted" onPress={() => setInside(r.entry.id)} />
              )}
            </View>
          ))}
          <OutlineButton label="Show every place" compact onPress={() => setInside(null)} />
        </View>
      )}
      {!list && map !== null && (
        <PlaceMap
          p={p}
          rows={scope.scoped}
          map={map}
          keep={(id) => keep === null || keep.has(`entry:${id}`)}
          selectedId={selected}
          putting={putting}
          onPick={pick}
          onPut={(x, y) => {
            if (putting === null) return;
            const done = p.places((c) => c.pin(map.id, putting, x, y));
            if (done !== undefined) setPutting(null);
          }}
          onCancelPut={() => setPutting(null)}
        />
      )}
      {shown.length === 0 ? (
        <Muted>No place matches the filters.</Muted>
      ) : (
        shown.map((r) => {
          const said = selectionWords(selected, related, r.entry.id);
          return (
            <Pressable
              key={r.entry.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === r.entry.id }}
              onPress={() => pick(r.entry.id)}
              style={[
                styles.card,
                { marginLeft: 16 * (keep === null ? r.depth - baseDepth : 0) },
                said === 'Selected' ? styles.cardSelected : said !== null ? styles.cardRelated : null,
              ]}
            >
              <Text style={styles.name}>{r.entry.name}</Text>
              <Muted>{placeLine(r, mapNames, data.maps.length > 0, said)}</Muted>
            </Pressable>
          );
        })
      )}
      {selected !== null && (
        <PlaceDetails
          p={p}
          entryId={selected}
          rows={rows}
          onExplore={() => setInside(selected)}
          onPutOnMap={(id) => {
            setMapId(id);
            setPutting(selected);
          }}
        />
      )}
      {sheets}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------- the map

function PlaceMap({
  p,
  rows,
  map,
  keep,
  selectedId,
  putting,
  onPick,
  onPut,
  onCancelPut,
}: {
  p: OpenPlaces;
  rows: PlaceRow[];
  map: WorldMap;
  keep: (id: string) => boolean;
  selectedId: string | null;
  putting: string | null;
  onPick: (id: string) => void;
  onPut: (x: number, y: number) => void;
  onCancelPut: () => void;
}) {
  const { width: screen } = useWindowDimensions();
  const on = mapPlaces(rows, map, p.data.pins);
  const pinned = on.pinned.filter((x) => keep(x.entry.id));
  const d = mapDrawing(map);
  const box = Math.max(200, screen - space.md * 2 - 2);
  const scale = Math.min(box / d.width, 1);
  const puttingName = putting === null ? null : (p.open.cast.model.entries.get(putting)?.name ?? null);
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (d.step > 0) {
    for (let x = 0, i = 0; x <= d.w + 0.01 && i < 400; x += d.step, i++) lines.push({ x1: d.pad + x, y1: d.pad, x2: d.pad + x, y2: d.pad + d.h });
    for (let y = 0, i = 0; y <= d.h + 0.01 && i < 400; y += d.step, i++) lines.push({ x1: d.pad, y1: d.pad + y, x2: d.pad + d.w, y2: d.pad + y });
  }
  return (
    <View style={styles.gap}>
      {puttingName !== null && (
        <View style={styles.putting}>
          <Text style={[styles.body, styles.flex]}>{`Tap where ${puttingName} is on ${map.name}.`}</Text>
          <OutlineButton label="Cancel" compact tone="muted" onPress={onCancelPut} />
        </View>
      )}
      <View
        style={[styles.mapBox, { width: d.width * scale, height: d.height * scale }]}
        accessibilityLabel={
          `${map.name}: ${plural(pinned.length, 'place')} placed on it` +
          `${map.unit.length > 0 ? `, ${n(map.width)} by ${n(map.height)} ${map.unit}` : ''}. The tree below lists every place in words.`
        }
      >
        <Pressable
          disabled={puttingName === null}
          accessibilityRole="button"
          accessibilityLabel={puttingName === null ? undefined : `Tap the map where ${puttingName} goes`}
          onPress={(e) => {
            const at = tapToMap(e.nativeEvent.locationX / scale, e.nativeEvent.locationY / scale, map);
            onPut(at.x, at.y);
          }}
          style={StyleSheet.absoluteFill}
        >
          {map.image !== null ? (
            <Image
              source={{ uri: map.image }}
              style={{ position: 'absolute', left: d.pad * scale, top: d.pad * scale, width: d.w * scale, height: d.h * scale }}
              resizeMode="stretch"
            />
          ) : null}
          <Svg width={d.width * scale} height={d.height * scale} viewBox={`0 0 ${d.width} ${d.height}`}>
            {map.image === null && <Rect x={d.pad} y={d.pad} width={d.w} height={d.h} fill={colors.surface} />}
            {lines.map((l, i) => (
              <Line key={i} {...l} stroke={colors.border} strokeWidth={1} />
            ))}
            <Rect x={d.pad} y={d.pad} width={d.w} height={d.h} fill="none" stroke={colors.muted} strokeWidth={1.5} />
            {pinned.map((x) => {
              const cx = d.pad + x.pin.x * d.s;
              const cy = d.pad + x.pin.y * d.s;
              const on = selectedId === x.entry.id;
              return (
                <G key={x.entry.id}>
                  <Circle cx={cx} cy={cy} r={on ? 11 : 8} fill={on ? colors.gold : colors.sky} stroke={colors.background} strokeWidth={2} />
                  <SvgText x={cx} y={cy - 14} fill={colors.text} fontFamily={fonts.ui} fontSize={15} textAnchor="middle">
                    {x.entry.name}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </Pressable>
        {puttingName === null &&
          pinned.map((x) => (
            <Pressable
              key={`hit-${x.entry.id}`}
              accessibilityRole="button"
              accessibilityLabel={pinWords(x, map)}
              onPress={() => onPick(x.entry.id)}
              style={{
                position: 'absolute',
                left: (d.pad + x.pin.x * d.s) * scale - 22,
                top: (d.pad + x.pin.y * d.s) * scale - 22,
                width: 44,
                height: 44,
              }}
            />
          ))}
      </View>
      {on.missing.length > 0 && (
        <Muted>{`Not on this map (${on.missing.length}), still in the tree: ${on.missing.map((e) => e.name).join(', ')}`}</Muted>
      )}
    </View>
  );
}

// --------------------------------------------------------------------------------------------------- the panel

function PlaceDetails({
  p,
  entryId,
  rows,
  onExplore,
  onPutOnMap,
}: {
  p: OpenPlaces;
  entryId: string;
  rows: PlaceRow[];
  onExplore: () => void;
  onPutOnMap: (mapId: string) => void;
}) {
  const toast = useToast();
  const tl = useTimeline();
  const model = p.open.cast.model;
  const entry = model.entries.get(entryId)!;
  const row = rows.find((r) => r.entry.id === entryId)!;
  const levels = p.data.settings?.levels ?? [];
  const links = placeLinks(model, entryId);
  const inside = new Set(placesWithin(rows, entryId));
  const [record, setRecord] = useState<string | null>(null);
  const [kind, setKind] = useState('located-in');
  const [event, setEvent] = useState<string | null>(null);
  const tied = (t: { entry: { name: string }; how: string[] }) => `${t.entry.name}: ${t.how.join('; ')}`;
  const list = (title: string, items: string[]) =>
    items.length === 0 ? null : (
      <View style={styles.gapSm}>
        <Text style={styles.label}>{title}</Text>
        {items.map((i, k) => (
          <Text key={k} style={styles.body}>{`• ${i}`}</Text>
        ))}
      </View>
    );
  const others = stableSorted(
    [...model.entries.values()].filter((e) => e.id !== entryId && e.category !== 'location'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const events = stableSorted([...model.events.values()].filter((e) => e.locationId !== entryId), (a, b) => localeCompare(a.name, b.name));
  return (
    <Panel style={styles.gap}>
      <Text style={styles.heading} accessibilityRole="header">
        {entry.name}
      </Text>
      {levels.length > 0 ? (
        <ChooserField
          label="Level of place"
          value={entry.placeLevel ?? ''}
          choices={[{ value: '', label: 'Not set' }, ...levels.map((l) => ({ value: l.id, label: l.name }))]}
          onChoose={(v) => p.places((c) => c.setLevel(entryId, v.length === 0 ? null : v))}
        />
      ) : (
        <Muted>No levels of place yet: set them under “Levels of place…”.</Muted>
      )}
      <ChooserField
        label="Located in"
        value={row.parentId ?? ''}
        choices={[
          { value: '', label: 'Nothing (at the top)' },
          ...rows.filter((r) => r.entry.id !== entryId && !inside.has(r.entry.id)).map((r) => ({ value: r.entry.id, label: `${'  '.repeat(r.depth)}${r.entry.name}` })),
        ]}
        onChoose={(v) => p.places((c) => c.setParent(entryId, v.length === 0 ? null : v))}
      />
      {row.childIds.length > 0 && <OutlineButton label={`Explore what is inside ${entry.name}`} compact onPress={onExplore} />}
      {list('Characters', links.characters.map(tied))}
      {list('Factions', links.factions.map(tied))}
      {list('Other records', links.others.map(tied))}
      {list('Events here', links.events.map((e) => e.name))}
      {row.eventsWithin > 0 && <Muted>{`${plural(row.eventsWithin, 'event')} in places inside it.`}</Muted>}
      {list('Chapters and scenes', links.chapters.map((c) => `${nodeLabel(model, c.node.id)}: ${c.how.join('; ')}`))}

      <Text style={styles.label}>{`Tie something to ${entry.name}`}</Text>
      <ChooserField
        label="Record to tie"
        value={record ?? ''}
        choices={[{ value: '', label: 'A character, faction or other record…' }, ...others.map((e) => ({ value: e.id, label: e.name }))]}
        onChoose={(v) => setRecord(v.length === 0 ? null : v)}
      />
      <ChooserField
        label="How it is tied"
        value={kind}
        choices={tieKindsForPlace.map((t) => ({ value: t, label: `${connectionType(t).label} ${entry.name}` }))}
        onChoose={setKind}
      />
      <GoldButton
        label="Tie it"
        compact
        disabled={record === null}
        onPress={() => {
          if (record === null) return;
          const made = p.open.now((c) =>
            relateIn(c, (r) => r.createConnection({ from: new EntityRef('entry', record), to: new EntityRef('entry', entryId), type: kind })),
          );
          if (made !== undefined) {
            setRecord(null);
            toast('Tied.');
          }
        }}
      />
      {tl !== null && events.length > 0 && (
        <>
          <ChooserField
            label="Event that takes place here"
            value={event ?? ''}
            choices={[{ value: '', label: 'Choose…' }, ...events.map((e) => ({ value: e.id, label: e.name }))]}
            onChoose={(v) => setEvent(v.length === 0 ? null : v)}
          />
          <OutlineButton
            label="Set"
            compact
            disabled={event === null}
            onPress={() => {
              if (event === null) return;
              const done = tl.now((c) => c.updateEvent(event, () => ({ locationId: entryId })));
              if (done !== undefined) {
                setEvent(null);
                toast('The event now takes place here.');
              }
            }}
          />
        </>
      )}

      {p.data.maps.length > 0 && <Text style={styles.label}>On the maps</Text>}
      {p.data.maps.map((m) => (
        <Coordinates key={m.id} p={p} map={m} entryId={entryId} onTap={() => onPutOnMap(m.id)} />
      ))}
    </Panel>
  );
}

function Coordinates({ p, map, entryId, onTap }: { p: OpenPlaces; map: WorldMap; entryId: string; onTap: () => void }) {
  const pin = p.data.pins.find((x) => x.mapId === map.id && x.entryId === entryId) ?? null;
  const [x, setX] = useState(pin === null ? '' : n(pin.x));
  const [y, setY] = useState(pin === null ? '' : n(pin.y));
  return (
    <View style={styles.gapSm}>
      <Text style={styles.body}>{map.name}</Text>
      <View style={styles.row}>
        <TextInput value={x} onChangeText={setX} placeholder="Across" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" accessibilityLabel="Across" style={styles.number} />
        <TextInput value={y} onChangeText={setY} placeholder="Down" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" accessibilityLabel="Down" style={styles.number} />
        <OutlineButton
          label="Place"
          compact
          onPress={() => p.places((c) => c.pin(map.id, entryId, x.trim().length === 0 ? Number.NaN : Number(x), y.trim().length === 0 ? Number.NaN : Number(y)))}
        />
        <OutlineButton label="Tap the map" compact tone="muted" onPress={onTap} />
        {pin !== null && <OutlineButton label="Take it off" compact tone="muted" onPress={() => p.places((c) => c.unpin(map.id, entryId))} />}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the sheets

function LevelsSheet({ p, onClose }: { p: OpenPlaces; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const levels = p.data.settings?.levels ?? [];
  const using = (id: string) => [...p.open.cast.model.entries.values()].filter((e) => e.placeLevel === id).length;
  const save = (next: { id: string; name: string }[]) => p.places((c) => c.setLevels(next.map((l) => ({ id: l.id, name: l.name }))));
  return (
    <Sheet visible onClose={onClose} title="Levels of place" footer={<GoldButton label="Done" onPress={onClose} />}>
      <Muted>
        How large each kind of place is in this novel, largest first: a universe, a planet, a city, a room, or your own. A place’s level is set
        on it; nothing needs one.
      </Muted>
      <View style={styles.row}>
        {levelPresets.map((preset) => (
          <OutlineButton
            key={preset.id}
            label={levels.length === 0 ? `Start from “${preset.name}”` : `Add the levels of “${preset.name}”`}
            compact
            onPress={() => {
              const done = p.places((c) => c.applyPreset(preset.id));
              if (done !== undefined) toast(`Levels of “${preset.name}” added.`);
            }}
          />
        ))}
      </View>
      {levels.length === 0 && <Muted>No levels yet.</Muted>}
      {levels.map((level, i) => (
        <View key={level.id} style={styles.levelRow}>
          <TextInput
            defaultValue={level.name}
            onChangeText={(t) =>
              p.placesLater(`level:${level.id}`, (c) =>
                c.setLevels((c.settings()?.levels ?? []).map((l) => ({ id: l.id, name: l.id === level.id ? t : l.name }))),
              )
            }
            accessibilityLabel={`Level ${i + 1} name`}
            style={[styles.number, styles.flex]}
          />
          <Muted>{plural(using(level.id), 'place')}</Muted>
          <OutlineButton label="↑" compact tone="muted" disabled={i === 0} onPress={() => save([...levels.slice(0, i - 1), level, levels[i - 1], ...levels.slice(i + 1)])} />
          <OutlineButton
            label="↓"
            compact
            tone="muted"
            disabled={i === levels.length - 1}
            onPress={() => save([...levels.slice(0, i), levels[i + 1], level, ...levels.slice(i + 2)])}
          />
          <OutlineButton label="Remove" compact tone="danger" onPress={() => save(levels.filter((l) => l.id !== level.id))} />
        </View>
      ))}
      <View style={styles.levelRow}>
        <TextInput value={name} onChangeText={setName} placeholder="New level" placeholderTextColor={colors.muted} style={[styles.number, styles.flex]} />
        <GoldButton
          label="Add"
          compact
          disabled={name.trim().length === 0}
          onPress={() => {
            const done = p.places((c) => c.setLevels([...(c.settings()?.levels ?? []).map((l) => ({ id: l.id, name: l.name })), { id: null, name }]));
            if (done !== undefined) setName('');
          }}
        />
      </View>
    </Sheet>
  );
}

function MapsSheet({ p, onClose }: { p: OpenPlaces; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const places = stableSorted(
    [...p.open.cast.model.entries.values()].filter((e) => e.category === 'location'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const count = (id: string) => p.data.pins.filter((x) => x.mapId === id).length;
  // Deleting a map asks first, held to confirm (place_panels.dart's showConfirmDialog, destructive).
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  return (
    <Sheet visible onClose={onClose} title="Maps" footer={<GoldButton label="Done" onPress={onClose} />}>
      <Muted>
        A map is drawn over a grid, or over a picture from your device (kept in this novel, never sent anywhere). Places are pinned by
        coordinates in the map’s own units.
      </Muted>
      {p.data.maps.length === 0 && <Muted>No maps yet.</Muted>}
      {p.data.maps.map((map) => (
        <View key={map.id} style={styles.mapCard}>
          <TextInput
            defaultValue={map.name}
            onChangeText={(t) => {
              if (t.trim().length > 0) p.placesLater(`${map.id}:name`, (c) => c.saveMap(map.id, { name: t }));
            }}
            accessibilityLabel="Name"
            style={styles.number}
          />
          <ChooserField
            label={`What ${map.name} is a map of`}
            value={map.placeId ?? ''}
            choices={[{ value: '', label: 'The whole world' }, ...places.map((e) => ({ value: e.id, label: e.name }))]}
            onChoose={(v) => p.places((c) => c.saveMap(map.id, { placeId: { value: v.length === 0 ? null : v } }))}
          />
          <View style={styles.row}>
            {(
              [
                ['Width', map.width, 'w', (v: number) => ({ width: v })],
                ['Height', map.height, 'h', (v: number) => ({ height: v })],
                ['Grid every', map.grid, 'g', (v: number) => ({ grid: v })],
              ] as const
            ).map(([label, value, key, patch]) => (
              <TextInput
                key={key}
                defaultValue={n(value)}
                onChangeText={(t) => {
                  const v = Number(t);
                  if (t.trim().length > 0 && Number.isFinite(v)) p.placesLater(`${map.id}:${key}`, (c) => c.saveMap(map.id, patch(v)));
                }}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel={label}
                placeholder={label}
                placeholderTextColor={colors.muted}
                style={styles.number}
              />
            ))}
            <TextInput
              defaultValue={map.unit}
              onChangeText={(t) => p.placesLater(`${map.id}:unit`, (c) => c.saveMap(map.id, { unit: t }))}
              accessibilityLabel="Unit"
              placeholder="Unit"
              placeholderTextColor={colors.muted}
              style={styles.number}
            />
          </View>
          <View style={styles.row}>
            <OutlineButton
              label={map.image !== null ? 'Change the background image' : 'Choose a background image'}
              icon="image-outline"
              compact
              onPress={async () => {
                try {
                  const image = await pickMapPicture();
                  if (image === null) return;
                  const done = p.places((c) => {
                    c.setImage(map.id, image.url);
                    c.saveMap(map.id, { height: Math.round(map.width * (image.height / image.width) * 100) / 100 });
                    return true;
                  });
                  if (done === true) toast('Background image set. It stays in this novel, on this device.');
                } catch (e) {
                  toast(e instanceof Error ? e.message : String(e), { error: true });
                }
              }}
            />
            {map.image !== null && (
              <OutlineButton
                label="Remove the image"
                compact
                tone="muted"
                onPress={() => {
                  const done = p.places((c) => {
                    c.setImage(map.id, null);
                    return true;
                  });
                  if (done === true) toast('Background image removed.');
                }}
              />
            )}
            <OutlineButton
              label={`Delete ${map.name}`}
              compact
              tone="danger"
              onPress={() => setDeleting({ id: map.id, name: map.name })}
            />
          </View>
        </View>
      ))}
      <View style={styles.levelRow}>
        <TextInput value={name} onChangeText={setName} placeholder="New map name" placeholderTextColor={colors.muted} style={[styles.number, styles.flex]} />
        <GoldButton
          label="Make the map"
          compact
          disabled={name.trim().length === 0}
          onPress={() => {
            const made = p.places((c) => c.saveMap(null, { name }));
            if (made !== undefined) {
              toast(`Made the map “${name.trim()}”.`);
              setName('');
            }
          }}
        />
      </View>
      {deleting && (
        <ConfirmDelete
          visible
          title="Delete this map?"
          message={`Delete the map “${deleting.name}” and its ${plural(count(deleting.id), 'pin')}? The places themselves are kept, in the tree and on any other map.`}
          confirmLabel="Delete the map"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            const d = deleting;
            setDeleting(null);
            const done = p.places((c) => {
              c.removeMap(d.id);
              return true;
            });
            if (done === true) toast(`Deleted the map “${d.name}”. The places are kept.`);
          }}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  empty: { alignItems: 'center', gap: space.sm },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.gold },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  name: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text },
  card: { padding: space.md, gap: 2, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardSelected: { borderColor: colors.gold, backgroundColor: 'rgba(243, 182, 58, 0.12)' },
  cardRelated: { backgroundColor: colors.elevated },
  putting: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.field, backgroundColor: colors.elevated },
  mapBox: { alignSelf: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background },
  number: {
    minWidth: 90,
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
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mapCard: { gap: space.sm, padding: space.sm, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border },
});
