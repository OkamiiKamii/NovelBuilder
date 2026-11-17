// Visualize › Factions (FEATURES.md #299): who belongs to each faction and leads it, its allies and rivals, what it
// controls and influences, where it is based, as of any point in the story; a faction map (the most tied when none is
// looked at, one faction's own web when one is); each faction's history; recording a tie and ending one, with how.
// Nothing is assumed to last. A port of flutter_app/lib/features/places/factions_page.dart; what is shown is
// src/domain/factions/ties.ts and src/domain/visualize/world/worldViews.ts.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { localeCompare } from '../../domain/collation';
import { type Tie, factionAt, factionTies, factionsOf, tieRoleLabel } from '../../domain/factions/ties';
import type { JsonMap } from '../../domain/json';
import { EntityRef } from '../../domain/model/entityRef';
import type { Anchor } from '../../domain/model/validity';
import { stableSorted } from '../../domain/reader/stableSort';
import { endTie, factionCard, factionMap, factionsNote, tieChange, tieKindLabel, tieKinds, tieStyle } from '../../domain/visualize/world/worldViews';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import type { OpenCast } from '../organize/useCast';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { usePlaces } from './usePlaces';
import { VizFrame, useVizSelection } from './VizFrame';
import { AsOfField, WhenField } from './WhenField';

export function FactionsView() {
  const [list, setList] = useState(false);
  const p = usePlaces();
  return (
    <VizFrame
      view="factions"
      title="Factions"
      subtitle={p?.open.cast.novelTitle}
      filters={false}
      actions={
        <View style={styles.row}>
          <Chip label="Map" icon="graph-outline" selected={!list} onPress={() => setList(false)} />
          <Chip label="Table" icon="table-large" selected={list} onPress={() => setList(true)} />
        </View>
      }
    >
      {p !== null && <FactionsBody open={p.open} list={list} />}
    </VizFrame>
  );
}

function FactionsBody({ open, list }: { open: OpenCast; list: boolean }) {
  const { selected: selection, select } = useVizSelection();
  const [at, setAt] = useState<Anchor | null>(null);
  const [faction, setFaction] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const model = open.cast.model;
  const factions = factionsOf(model);
  const focus = factions.find((f) => f.id === faction) ?? null;
  const toolbar = (
    <View style={styles.gap}>
      <AsOfField model={model} label="Factions as of" value={at} onChange={setAt} />
      {factions.length > 0 && (
        <ChooserField
          label="Faction looked at"
          value={focus?.id ?? ''}
          choices={[{ value: '', label: 'Every faction' }, ...factions.map((f) => ({ value: f.id, label: f.name }))]}
          onChoose={(v) => setFaction(v.length === 0 ? null : v)}
        />
      )}
      <GoldButton label="Record a tie" icon="link-variant-plus" compact onPress={() => setForm(true)} />
      {form && <TieForm open={open} faction={focus?.id ?? null} onClose={() => setForm(false)} />}
    </View>
  );
  if (factions.length === 0) {
    return (
      <View style={styles.gap}>
        {toolbar}
        <Panel style={styles.empty}>
          <Icon name="account-group-outline" size={36} />
          <Text style={styles.heading}>No factions yet</Text>
          <Muted style={styles.center}>
            Add factions under Organize → World, or record that someone is a member of something, or that something controls a place.
          </Muted>
        </Panel>
      </View>
    );
  }
  const selected = selection?.type === 'entry' ? selection.id : null;
  const shown = focus === null ? factions : [focus];
  return (
    <View style={styles.gap}>
      {toolbar}
      {!list && (
        <FactionMap
          open={open}
          at={at}
          around={focus?.id ?? null}
          selectedId={selected}
          onPick={(id) => {
            select(new EntityRef('entry', id));
            // A faction tapped is looked at: the map turns round it, its card and its history below.
            if (factions.some((f) => f.id === id)) setFaction(id);
          }}
          onEvery={() => setFaction(null)}
        />
      )}
      {shown.map((f) => {
        const { byRole, notNow } = factionAt(model, f.id, at);
        const card = factionCard(byRole, notNow);
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            onPress={() => select(new EntityRef('entry', f.id))}
            style={[styles.card, selected === f.id && styles.cardSelected]}
          >
            <Text style={styles.name} accessibilityRole="header">
              {f.name}
            </Text>
            {card.empty && <Muted>No ties hold here.</Muted>}
            {card.lines.map((l) => (
              <Text key={l.label} style={styles.body}>
                <Text style={styles.bold}>{`${l.label}: `}</Text>
                {l.ties}
              </Text>
            ))}
            {card.notNow !== null && <Muted>{card.notNow}</Muted>}
          </Pressable>
        );
      })}
      <Muted>{factionsNote(at, model)}</Muted>
      {focus !== null && <FactionHistory open={open} factionId={focus.id} name={focus.name} />}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the map

function FactionMap({
  open,
  at,
  around,
  selectedId,
  onPick,
  onEvery,
}: {
  open: OpenCast;
  at: Anchor | null;
  around: string | null;
  selectedId: string | null;
  onPick: (id: string) => void;
  onEvery: () => void;
}) {
  const { width: screen } = useWindowDimensions();
  const model = open.cast.model;
  const map = factionMap(model, at, around);
  if (map === null) return null;
  const box = Math.max(200, screen - space.md * 2 - 2);
  const scale = Math.min(1, box / map.width);
  const ties = map.edges
    .filter((e) => map.pos.has(e.link.fromId) && map.pos.has(e.link.toId))
    .map((e) => ({ from: map.pos.get(e.link.fromId)!, to: map.pos.get(e.link.toId)!, role: e.role, id: e.link.id }));
  return (
    <View style={styles.gap}>
      <View style={[styles.mapBox, { width: map.width * scale, height: map.height * scale }]} accessibilityLabel={map.label}>
        <Svg width={map.width * scale} height={map.height * scale} viewBox={`0 0 ${map.width} ${map.height}`} style={StyleSheet.absoluteFill}>
          {ties.map((t) => {
            const style = tieStyle[t.role] ?? tieStyle.other!;
            return (
              <Line
                key={t.id}
                x1={t.from.x}
                y1={t.from.y}
                x2={t.to.x}
                y2={t.to.y}
                stroke={style.color}
                strokeWidth={2.4}
                strokeDasharray={style.dash.length > 0 ? style.dash.join(' ') : undefined}
              />
            );
          })}
        </Svg>
        {[...map.pos].map(([id, at2]) => {
          const isFaction = map.factionIds.has(id);
          const on = selectedId === id;
          const size = isFaction ? 44 : 24;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={isFaction ? `${model.entries.get(id)?.name}, a faction` : `${model.entries.get(id)?.name}, held in sway`}
              onPress={() => onPick(id)}
              style={{ position: 'absolute', left: (at2.x - 60) * scale, top: (at2.y - 22) * scale, width: 120 * scale, alignItems: 'center' }}
            >
              <View
                style={{
                  width: size * scale,
                  height: size * scale,
                  borderRadius: isFaction ? (size * scale) / 2 : 3,
                  backgroundColor: isFaction ? 'rgba(243, 182, 58, 0.28)' : colors.elevated,
                  borderWidth: on ? 3 : 1,
                  borderColor: on ? colors.gold : colors.muted,
                }}
              />
              <Text style={[styles.mapName, { fontSize: Math.max(9, 13 * scale) }]} numberOfLines={2}>
                {model.entries.get(id)?.name ?? ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        {map.roles.map((role) => {
          const style = tieStyle[role] ?? tieStyle.other!;
          return (
            <View key={role} style={styles.key}>
              <Svg width={26} height={10}>
                <Line x1={0} y1={5} x2={26} y2={5} stroke={style.color} strokeWidth={2.4} strokeDasharray={style.dash.length > 0 ? style.dash.join(' ') : undefined} />
              </Svg>
              <Text style={styles.small}>{tieRoleLabel[role]}</Text>
            </View>
          );
        })}
      </View>
      {map.note !== null && (
        <View style={styles.row}>
          <Muted style={styles.flex}>{map.note}</Muted>
          {around !== null && <OutlineButton label="Every faction" icon="graph-outline" compact onPress={onEvery} />}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the history

function FactionHistory({ open, factionId, name }: { open: OpenCast; factionId: string; name: string }) {
  const toast = useToast();
  const [ending, setEnding] = useState<string | null>(null);
  const [at, setAt] = useState<JsonMap | null>(null);
  const [how, setHow] = useState('');
  const model = open.cast.model;
  const ties = factionTies(model, factionId);
  return (
    <View style={styles.gap}>
      <Text style={styles.heading} accessibilityRole="header">{`How ${name} changed`}</Text>
      {ties.length === 0 && <Muted>No ties recorded.</Muted>}
      {ties.map((t: Tie) => (
        <View key={t.link.id} style={styles.gapSm}>
          <View style={styles.line}>
            <View style={styles.flex}>
              <Text style={styles.body}>{t.words}</Text>
              <Muted>{`${t.when} · ${tieRoleLabel[t.role]}`}</Muted>
            </View>
            {(t.link.validity?.until ?? null) === null && ending !== t.link.id && (
              <OutlineButton
                label="End…"
                compact
                accessibilityLabel={`End: ${t.words}`}
                onPress={() => {
                  setEnding(t.link.id);
                  setAt(null);
                  setHow('');
                }}
              />
            )}
          </View>
          {ending === t.link.id && (
            <Panel style={styles.gapSm}>
              <WhenField model={model} label="Ends" value={at} onChange={setAt} />
              <TextInput
                value={how}
                onChangeText={setHow}
                placeholder="How it ends: left, expelled, dissolved, a truce…"
                placeholderTextColor={colors.muted}
                accessibilityLabel="How it ends"
                style={styles.input}
              />
              <View style={styles.row}>
                <GoldButton
                  label="End it"
                  compact
                  onPress={() => {
                    const change = endTie(t.link.id, at, how);
                    if (typeof change === 'string') return toast(change);
                    if (open.now(change) !== undefined) setEnding(null);
                  }}
                />
                <OutlineButton label="Cancel" compact tone="muted" onPress={() => setEnding(null)} />
              </View>
            </Panel>
          )}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the form

function TieForm({ open, faction, onClose }: { open: OpenCast; faction: string | null; onClose: () => void }) {
  const toast = useToast();
  const model = open.cast.model;
  const [from, setFrom] = useState<string | null>(null);
  const [type, setType] = useState('member-of');
  const [to, setTo] = useState<string | null>(faction);
  const [begins, setBegins] = useState<JsonMap | null>(null);
  const [own, setOwn] = useState('');
  const [how, setHow] = useState('');
  const entries = stableSorted([...model.entries.values()], (a, b) => localeCompare(a.name, b.name));
  const pick = (label: string, value: string | null, set: (v: string | null) => void) => (
    <ChooserField
      label={label}
      value={value ?? ''}
      choices={[{ value: '', label: 'Choose…' }, ...entries.map((e) => ({ value: e.id, label: e.name }))]}
      onChoose={(v) => set(v.length === 0 ? null : v)}
    />
  );
  const save = () => {
    const change = tieChange({ from, to, type, own, begins, how });
    if (typeof change === 'string') return toast(change);
    if (open.now(change) !== undefined) onClose();
  };
  return (
    <Sheet visible onClose={onClose} title="Record a tie" footer={<GoldButton label="Record the tie" onPress={save} />}>
      {pick('Who or what', from, setFrom)}
      <ChooserField
        label="Kind of tie"
        value={type}
        choices={[...tieKinds.map((k) => ({ value: k, label: tieKindLabel(k) })), { value: 'own', label: 'Your own…' }]}
        onChoose={setType}
      />
      {type === 'own' && (
        <TextInput
          value={own}
          onChangeText={setOwn}
          placeholder="Owes a debt to, Sworn to, Pays tribute to…"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Your own kind of tie"
          style={styles.input}
        />
      )}
      {pick('Tied to', to, setTo)}
      <WhenField model={model} label="Begins" value={begins} onChange={setBegins} />
      <TextInput
        value={how}
        onChangeText={setHow}
        placeholder="How it began: joined, elected, a treaty… (optional)"
        placeholderTextColor={colors.muted}
        accessibilityLabel="How it began"
        style={styles.input}
      />
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
  name: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  card: { padding: space.md, gap: 4, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardSelected: { borderColor: colors.gold, backgroundColor: 'rgba(243, 182, 58, 0.12)' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  mapBox: { alignSelf: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background },
  mapName: { fontFamily: fonts.ui, color: colors.text, textAlign: 'center' },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
});
