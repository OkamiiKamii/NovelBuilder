// Visualize › Ownership (FEATURES.md #300): who held an item, in order, how it passed, the stretches nobody is known
// to hold it, who made it, and where it stands at any point; and recording what happens to it next (it passes to
// someone, or nobody has it after), each holding kept as history. A port of
// flutter_app/lib/features/places/ownership_page.dart; what is shown is src/domain/factions/ownership.ts and
// src/domain/visualize/world/worldViews.ts.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { localeCompare } from '../../domain/collation';
import { ownedItems, ownershipOf } from '../../domain/factions/ownership';
import type { JsonMap } from '../../domain/json';
import { EntityRef } from '../../domain/model/entityRef';
import type { Anchor } from '../../domain/model/validity';
import { stableSorted } from '../../domain/reader/stableSort';
import { heldNowNote, holdingLines, itemShown, ownershipChange, ownershipChoices, ownershipEnds } from '../../domain/visualize/world/worldViews';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, Muted, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { type OpenCast, useCast } from '../organize/useCast';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { VizFrame, useVizSelection } from './VizFrame';
import { AsOfField, WhenField } from './WhenField';

export function OwnershipView() {
  const [table, setTable] = useState(false);
  const open = useCast();
  return (
    <VizFrame
      view="ownership"
      title="Ownership"
      subtitle={open?.cast.novelTitle}
      filters={false}
      actions={
        <View style={styles.row}>
          <Chip label="Chain" icon="arrow-right-bold-outline" selected={!table} onPress={() => setTable(false)} />
          <Chip label="Table" icon="table-large" selected={table} onPress={() => setTable(true)} />
        </View>
      }
    >
      {open !== null && <OwnershipBody open={open} table={table} />}
    </VizFrame>
  );
}

function OwnershipBody({ open, table }: { open: OpenCast; table: boolean }) {
  const { select } = useVizSelection();
  const [chosen, setChosen] = useState<string | null>(null);
  const [at, setAt] = useState<Anchor | null>(null);
  const [form, setForm] = useState(false);
  const model = open.cast.model;
  const items = ownedItems(model);
  if (items.length === 0) {
    return (
      <Panel style={styles.empty}>
        <Icon name="treasure-chest" size={36} />
        <Text style={styles.heading}>No items yet</Text>
        <Muted style={styles.center}>Add items under Organize → World, or record that someone owns something.</Muted>
      </Panel>
    );
  }
  const item = itemShown(model, items, chosen);
  const o = ownershipOf(model, item.id, at)!;
  return (
    <View style={styles.gap}>
      <ChooserField label="Item" value={item.id} choices={items.map((i) => ({ value: i.id, label: i.name }))} onChoose={setChosen} />
      <AsOfField model={model} label="Ownership as of" value={at} onChange={setAt} />
      <GoldButton label="Record what happens to it" icon="note-edit-outline" compact onPress={() => setForm(true)} />
      <Panel style={styles.gapSm}>
        <Text style={styles.body}>{o.now.words}</Text>
        {o.makers.length > 0 && <Muted>{`Made by ${o.makers.map((m) => `${m.name} (${m.when})`).join(', ')}.`}</Muted>}
      </Panel>
      {o.holdings.length === 0 ? (
        <Muted>No holding recorded: who has had it is not known.</Muted>
      ) : table ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View accessibilityLabel={`Who has held ${item.name}, in order`}>
            <View style={styles.tableRow}>
              {['Holder', 'From', 'How', 'Until', 'How it ended'].map((h) => (
                <Text key={h} style={[styles.cell, styles.head]}>
                  {h}
                </Text>
              ))}
            </View>
            {o.holdings.map((h) => (
              <View key={h.link.id} style={styles.tableRow}>
                <Text style={styles.cell}>{`${h.holderName}${h.inThisTimeline ? '' : ' (does not happen in this timeline)'}`}</Text>
                <Text style={styles.cell}>{h.began}</Text>
                <Text style={styles.cell}>{h.how.length === 0 ? '—' : h.how}</Text>
                <Text style={styles.cell}>{h.ended ?? 'still'}</Text>
                <Text style={styles.cell}>{h.endHow.length === 0 ? '—' : h.endHow}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.chain} accessibilityLabel={`Who has held ${item.name}, in order`}>
          {o.holdings.map((h, i) => (
            <View key={h.link.id} style={styles.chainStep}>
              {i > 0 && <Icon name="arrow-right" size={20} color={colors.muted} />}
              <Pressable
                accessibilityRole="button"
                onPress={() => select(new EntityRef('entry', h.holderId))}
                style={[styles.holding, !h.inThisTimeline && styles.holdingElsewhere]}
              >
                <Text style={styles.name}>{h.holderName}</Text>
                {holdingLines(h).map((l) => (
                  <Text key={l} style={[styles.small, l === 'does not happen in this timeline' && { color: colors.danger }]}>
                    {l}
                  </Text>
                ))}
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {o.unknown.map((u) => (
        <Muted key={u}>{`${u}.`}</Muted>
      ))}
      {form && <OwnershipForm open={open} itemId={item.id} onClose={() => setForm(false)} />}
    </View>
  );
}

function OwnershipForm({ open, itemId, onClose }: { open: OpenCast; itemId: string; onClose: () => void }) {
  const toast = useToast();
  const model = open.cast.model;
  const [what, setWhat] = useState('given');
  const [holder, setHolder] = useState<string | null>(null);
  const [which, setWhich] = useState<string | null>(null);
  const [when, setWhen] = useState<JsonMap | null>(null);
  const [own, setOwn] = useState('');
  const name = model.entries.get(itemId)?.name ?? 'it';
  const o = ownershipOf(model, itemId);
  const stillOpen = (o?.holdings ?? []).filter((h) => h.inThisTimeline && (h.link.validity?.until ?? null) === null);
  const whose = stillOpen.some((h) => h.link.id === which) ? which : (stillOpen[0]?.link.id ?? null);
  const ends = ownershipEnds(what);
  const others = stableSorted([...model.entries.values()].filter((e) => e.id !== itemId), (a, b) => localeCompare(a.name, b.name));
  const save = () => {
    const change = ownershipChange({ itemId, what, own, holder, open: stillOpen, which: whose, when });
    if (typeof change === 'string') return toast(change);
    if (open.now(change) !== undefined) onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={`What happens to ${name}`} footer={<GoldButton label="Record it" onPress={save} />}>
      <ChooserField label="What happens" value={what} choices={ownershipChoices} onChoose={setWhat} />
      {(what === 'own' || what === 'own-end') && (
        <TextInput
          value={own}
          onChangeText={setOwn}
          placeholder="pawned, buried with him, melted down…"
          placeholderTextColor={colors.muted}
          accessibilityLabel="What happens, in your own words"
          style={styles.input}
        />
      )}
      {!ends && (
        <ChooserField
          label="Who has it next"
          value={holder ?? ''}
          choices={[{ value: '', label: 'Choose…' }, ...others.map((e) => ({ value: e.id, label: e.name }))]}
          onChoose={(v) => setHolder(v.length === 0 ? null : v)}
        />
      )}
      {stillOpen.length > 1 && (
        <ChooserField label="Whose holding" value={whose ?? ''} choices={stillOpen.map((h) => ({ value: h.link.id, label: h.holderName }))} onChoose={setWhich} />
      )}
      <WhenField model={model} label="When" value={when} onChange={setWhen} />
      <Muted>{heldNowNote(stillOpen)}</Muted>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  gapSm: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: space.sm },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  name: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  chain: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  chainStep: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  holding: { maxWidth: 220, padding: 10, gap: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.muted, backgroundColor: colors.surface },
  holdingElsewhere: { borderColor: colors.danger, borderStyle: 'dashed' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  cell: { width: 150, padding: space.sm, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  head: { fontWeight: '700', color: colors.gold },
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
