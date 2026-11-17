// Five of the ways to see the cast (FEATURES.md #145–#149), each a board of the cast as found: the ROLL CALL (the
// basics as a table, written in place), the NAME BOARD (every name under its letter, the look-alikes, the free
// letters), the TIES (every pair, who they are to each other, one press to record it), the STAKES (what drives each,
// where their wants collide) and the COMPASS (their temperaments, the foils and the twins). The logic is
// src/domain/characters/views/*; the drawn ones that read the pages are CastViewsDrawn.tsx.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import type { Listed } from '../../domain/characters/cast';
import { characterPath } from '../../domain/characters/screens/create';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import { castCompass } from '../../domain/characters/views/castCompass';
import { castStakes, stakeAnswered, stakePrompt } from '../../domain/characters/views/castStakes';
import { addTie, castTies, tiesNarrow, type TieCell } from '../../domain/characters/views/castTies';
import { addForged, boardGold, kindColour as nameColour, lettersAcross, letterPressed, nameBoard } from '../../domain/characters/views/nameBoard';
import { type RollCell, rollCall, rollColumns, rollNameWidth, rollRowHeight, rollWrite } from '../../domain/characters/views/rollCall';
import { withAlpha } from '../../domain/characters/views/common';
import { ActionSheet, PromptSheet } from '../dialogs';
import { Icon, Muted, OutlineButton, ProgressBar } from '../kit';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { NameForgeSheet, ThisOrThatSheet } from './AidsSheets';
import { Cameo } from './Cameo';
import { ChooserField } from './parts';
import type { OpenCast } from './useCast';

type ViewProps = { open: OpenCast; found: Listed[] };

function Face({ l, width, height, round = 8 }: { l: Listed; width: number; height: number; round?: number }) {
  if (isUploadedImage(l.entry.image)) {
    return <Image source={{ uri: l.entry.image ?? undefined }} style={{ width, height, borderRadius: round }} resizeMode="cover" />;
  }
  return (
    <View style={{ width, height, borderRadius: round, overflow: 'hidden' }}>
      <Cameo entry={l.entry} profile={l.profile} width={width} height={height} bare />
    </View>
  );
}

const fade = (hex: string, alpha: number) => withAlpha(hex, alpha);

// ------------------------------------------------------------------------------------------------------ roll call

export function RollCallView({ open, found }: ViewProps) {
  const router = useRouter();
  const table = rollCall(found);
  return (
    <View style={styles.gap}>
      <Muted>{table.said}</Muted>
      <ProgressBar value={table.part} showPercent={false} />
      <View style={styles.rollFrame}>
        <View style={{ width: rollNameWidth }}>
          <View style={[styles.rollHead, styles.rollCellPad]}>
            <Text style={styles.headText}>{table.heading}</Text>
          </View>
          {table.rows.map((r) => (
            <Pressable
              key={r.listed.entry.id}
              accessibilityRole="button"
              accessibilityLabel={r.name}
              onPress={() => router.navigate(characterPath(r.listed.entry.id))}
              style={({ pressed }) => [styles.rollRow, styles.rollCellPad, styles.rollName, pressed && { backgroundColor: colors.elevated }]}
            >
              <Face l={r.listed} width={32} height={40} />
              <View style={styles.flex}>
                <Text style={styles.rollNameText} numberOfLines={1}>
                  {r.name}
                </Text>
                {r.roles && (
                  <Text style={styles.rollRoles} numberOfLines={1}>
                    {r.roles}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled">
          <View>
            <View style={[styles.flexRow, styles.rollHead]}>
              {table.columns.map((c) => (
                <View key={c.label} style={[styles.rollCellPad, { width: c.width, justifyContent: 'center' }]}>
                  <Text style={styles.headText}>{c.heading}</Text>
                </View>
              ))}
            </View>
            {table.rows.map((r) => (
              <View key={r.listed.entry.id} style={[styles.flexRow, styles.rollRow]}>
                {r.cells.map((cell) => (
                  <RollCellView key={cell.key} open={open} entryId={r.listed.entry.id} cell={cell} />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function RollCellView({ open, entryId, cell }: { open: OpenCast; entryId: string; cell: RollCell }) {
  const [text, setText] = useState(cell.value);
  const [focused, setFocused] = useState(false);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    if (!focused) setText(cell.value);
  }, [cell.value, focused]);
  const column = rollColumns.find((c) => c.label === cell.column.label)!;
  const width = column.width;
  if (cell.input.kind === 'choice') {
    const input = cell.input;
    return (
      <View style={[styles.rollCellPad, { width, justifyContent: 'center' }]} accessibilityLabel={cell.semanticsLabel}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${cell.semanticsLabel}: ${input.value ?? '—'}`} onPress={() => setChoosing(true)} style={styles.rollChoice}>
          <Text style={styles.rollInput} numberOfLines={1}>
            {input.value ?? '—'}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        <ActionSheet
          visible={choosing}
          title={cell.semanticsLabel}
          onClose={() => setChoosing(false)}
          actions={['', ...input.choices].map((v) => ({
            label: v === '' ? '—' : v,
            icon: v === (input.value ?? '') ? 'radiobox-marked' : 'radiobox-blank',
            onPress: () => {
              if (v !== (input.value ?? '')) open.now((c) => rollWrite(c, entryId, column, v));
            },
          }))}
        />
      </View>
    );
  }
  const blank = text.length === 0;
  return (
    <View style={[styles.rollCellPad, { width, justifyContent: 'center' }, blank && { backgroundColor: fade(colors.gold, 0.06) }]}>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          open.later(cell.key, (c) => rollWrite(c, entryId, column, v));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="—"
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        keyboardType={cell.input.number ? 'numeric' : 'default'}
        accessibilityLabel={cell.semanticsLabel}
        style={styles.rollInput}
      />
    </View>
  );
}

// ----------------------------------------------------------------------------------------------------- name board

export function NameBoardView({ open }: ViewProps) {
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<string | null>(null);
  const [forging, setForging] = useState(false);
  const board = nameBoard(open.cast, picked);
  const across = lettersAcross(width - space.md * 2);
  const tile = (width - space.md * 2 - 6 * (across - 1)) / across;
  return (
    <View style={styles.gap}>
      <Muted>{board.caption}</Muted>
      <View style={styles.tiles}>
        {board.tiles.map((t) => {
          const empty = t.count === 0;
          const fill = t.fill.kind === 'none' ? 'transparent' : fade(t.fill.kind === 'gold' ? boardGold : colors.gold, t.fill.alpha);
          const border = t.picked ? colors.text : empty ? fade(colors.border, 0.5) : t.crowded ? boardGold : fade(colors.gold, 0.3);
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={t.semanticsLabel}
              accessibilityState={{ selected: t.picked }}
              onPress={() => setPicked(letterPressed(picked, t.letter))}
              style={[styles.tile, { width: tile, backgroundColor: fill, borderColor: border, borderWidth: t.picked ? 2 : 1 }]}
            >
              <View style={styles.tileTop}>
                <Text style={[styles.tileLetter, empty && { color: fade(colors.muted, 0.5) }]}>{t.letter}</Text>
                {!empty && <Text style={[styles.tileCount, { color: t.crowded ? boardGold : colors.gold }]}>{t.count}</Text>}
              </View>
              {t.first.map((n) => (
                <View key={n.id} style={styles.tileName}>
                  <View style={[styles.dot, { backgroundColor: nameColour(n) ?? colors.border }]} />
                  <Text style={styles.tileNameText} numberOfLines={1}>
                    {n.name}
                  </Text>
                </View>
              ))}
              {t.more && <Text style={styles.tileMore}>{t.more}</Text>}
            </Pressable>
          );
        })}
      </View>
      {board.picked && (
        <View style={styles.gapSm}>
          <Text style={styles.heading}>{board.picked.heading}</Text>
          <View style={styles.wrap}>
            {board.picked.names.map((n) => (
              <Pressable key={n.name.id} accessibilityRole="button" accessibilityLabel={n.tooltip} onPress={() => router.navigate(n.path as never)} style={styles.nameChip}>
                <View style={[styles.dot, { backgroundColor: nameColour(n.name) ?? colors.border }]} />
                <Text style={styles.nameChipText}>{n.name.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <View style={styles.gapSm}>
        <Text style={styles.heading}>{board.lookAlikes.heading}</Text>
        {board.lookAlikes.line && <Muted>{board.lookAlikes.line}</Muted>}
        {board.lookAlikes.shown.map((a) => (
          <View key={a.names} style={styles.alike} accessibilityLabel={`${a.words}, ${a.why}`}>
            <Text style={styles.alikeWords}>{a.words}</Text>
            <Text style={styles.alikeWhy}>{a.why}</Text>
          </View>
        ))}
      </View>
      <View style={styles.gapSm}>
        <Text style={styles.heading}>{board.free.heading}</Text>
        <Muted>{board.free.line}</Muted>
        <View style={styles.wrap}>
          {board.free.letters.map((l) => (
            <View key={l} style={styles.free}>
              <Text style={styles.freeText}>{l}</Text>
            </View>
          ))}
        </View>
        {board.free.forge && <OutlineButton label={board.free.forge} icon="auto-fix" compact onPress={() => setForging(true)} style={styles.start} />}
      </View>
      {forging && (
        <NameForgeSheet
          open={open}
          onClose={() => setForging(false)}
          onPick={(name) => {
            setForging(false);
            const made = open.now((c) => addForged(c, name));
            if (made) toast(made.tell, { action: { label: made.action, run: () => router.navigate(characterPath(made.made.id)) } });
          }}
        />
      )}
    </View>
  );
}

// ----------------------------------------------------------------------------------------------------------- ties

export function TiesView({ open, found }: ViewProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [asking, setAsking] = useState<Extract<TieCell, { kind: 'none' }> | null>(null);
  const table = castTies(open.cast, found, tiesNarrow(width));
  if ('empty' in table) return <Muted>{table.empty}</Muted>;
  const { cell } = table;
  return (
    <View style={styles.tiesFrame}>
      <View style={{ width: table.head }}>
        <View style={{ height: 56 }} />
        {table.people.map((p) => (
          <View key={p.id} style={[styles.tieRowHead, { height: cell.height }]}>
            <Monogram tone={p.tone} ink={p.ink} text={p.monogram} />
            <Text style={styles.tieRowName} numberOfLines={2}>
              {p.name}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={[styles.flexRow, { minHeight: 56 }]}>
            {table.people.map((p) => (
              <View key={p.id} style={[styles.tieColHead, { width: cell.width }]}>
                <Monogram tone={p.tone} ink={p.ink} text={p.monogram} />
                <Text style={styles.tieColName} numberOfLines={1}>
                  {p.name}
                </Text>
              </View>
            ))}
          </View>
          {table.rows.map((row, i) => (
            <View key={i} style={styles.flexRow}>
              {row.map((c, j) => (
                <View key={j} style={{ width: cell.width, height: cell.height, padding: 3 }}>
                  {c.kind === 'self' ? (
                    <View style={[styles.tieBox, { backgroundColor: fade(colors.border, 0.25) }]} />
                  ) : c.kind === 'tie' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={c.semanticsLabel}
                      onPress={() => router.navigate(c.path as never)}
                      style={[styles.tieBox, { backgroundColor: fade(c.colour ?? colors.muted, 0.14), borderColor: fade(c.colour ?? colors.border, 0.7), borderWidth: 1 }]}
                    >
                      <Text style={styles.tieLabel} numberOfLines={2}>
                        {c.label}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={c.semanticsLabel}
                      onPress={() => setAsking(c)}
                      style={({ pressed }) => [styles.tieBox, { borderColor: fade(colors.border, 0.7), borderWidth: 1 }, pressed && { backgroundColor: colors.elevated }]}
                    >
                      <Text style={[styles.tiePlus, c.shown !== null && { color: colors.gold, fontSize: 16 }]}>+</Text>
                      {c.shown && <Text style={styles.tieTogether}>{c.shown}</Text>}
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {asking && (
        <ActionSheet
          visible
          title={asking.tooltip}
          onClose={() => setAsking(null)}
          actions={asking.choices.map((ch) => ({
            label: ch.label,
            icon: 'link-variant',
            onPress: () => open.now((c) => addTie(c, asking.rowId, asking.colId, ch.value)),
          }))}
        />
      )}
    </View>
  );
}

function Monogram({ tone, ink, text, size = 30 }: { tone: string; ink: string; text: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: ink, fontFamily: fonts.ui, fontWeight: '700', fontSize: size * 0.4 }}>{text}</Text>
    </View>
  );
}

// --------------------------------------------------------------------------------------------------------- stakes

export function StakesView({ open, found }: ViewProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [asking, setAsking] = useState<{ l: Listed; stake: Parameters<typeof stakePrompt>[1]; current: string } | null>(null);
  const board = castStakes(found);
  const columns = Math.max(1, Math.min(4, Math.trunc((width - space.md * 2) / 340)));
  const cardWidth = (width - space.md * 2 - 12 * (columns - 1)) / columns;
  const prompt = asking ? stakePrompt(asking.l, asking.stake, asking.current) : null;
  return (
    <View style={styles.gap}>
      <Muted>{board.said}</Muted>
      <ProgressBar value={board.part} showPercent={false} />
      {board.collide && (
        <View style={styles.gapSm}>
          <Text style={styles.heading}>{board.collide.heading}</Text>
          {board.collide.clashes.map((k) => (
            <View key={`${k.a.entry.id}-${k.b.entry.id}`} style={styles.clash}>
              <View style={styles.clashFaces}>
                <Pressable accessibilityRole="button" accessibilityLabel={k.a.entry.name} onPress={() => router.navigate(characterPath(k.a.entry.id))}>
                  <Face l={k.a} width={36} height={36} round={18} />
                </Pressable>
                <Icon name="lightning-bolt" size={22} color={colors.danger} />
                <Pressable accessibilityRole="button" accessibilityLabel={k.b.entry.name} onPress={() => router.navigate(characterPath(k.b.entry.id))}>
                  <Face l={k.b} width={36} height={36} round={18} />
                </Pressable>
              </View>
              <Text style={styles.clashWhy}>{k.why}</Text>
              {[k.a, k.b].map((l, i) => (
                <Text key={l.entry.id} style={styles.clashWant} numberOfLines={3}>
                  <Text style={styles.bold}>{l.entry.name}: </Text>
                  {k.wants[i]}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
      <View style={styles.cards}>
        {board.cards.map((card) => (
          <View key={card.listed.entry.id} style={[styles.stakeCard, { width: cardWidth }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={card.openLabel} onPress={() => router.navigate(characterPath(card.listed.entry.id))} style={styles.stakeHead}>
              <Face l={card.listed} width={44} height={52.8} round={44 * 0.22} />
              <View style={styles.flex}>
                <Text style={styles.stakeName} numberOfLines={1}>
                  {card.name}
                </Text>
                {card.roles && (
                  <Text style={styles.stakeRoles} numberOfLines={1}>
                    {card.roles}
                  </Text>
                )}
              </View>
              <View style={styles.marks}>
                {card.marks.map((m, i) => (
                  <View key={i} style={[styles.mark, { backgroundColor: m ? colors.gold : colors.border }]} />
                ))}
              </View>
            </Pressable>
            {card.lines.map((line) => (
              <Pressable
                key={line.stake}
                accessibilityRole="button"
                accessibilityLabel={line.semanticsLabel}
                onPress={() => setAsking({ l: card.listed, stake: line.stake, current: line.text ?? '' })}
                style={({ pressed }) => [styles.stakeLine, pressed && { backgroundColor: colors.elevated }]}
              >
                <Text style={[styles.stakeLabel, line.text !== null && { color: colors.gold }]}>{line.heading}</Text>
                {line.text !== null ? (
                  <Text style={styles.stakeText} numberOfLines={3}>
                    {line.text}
                  </Text>
                ) : (
                  <View style={[styles.flexRow, styles.flex, { gap: 4 }]}>
                    <Icon name="plus" size={16} />
                    <Text style={styles.stakeAsk}>{line.ask}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {asking && prompt && (
        <PromptSheet
          visible
          title={prompt.title}
          label={`${prompt.label} · ${prompt.hint}`}
          initial={prompt.initial}
          confirmLabel={prompt.confirmLabel}
          allowEmpty
          onClose={() => setAsking(null)}
          onSubmit={(text) => {
            const change = stakeAnswered(asking.l.entry.id, asking.stake, asking.current, text);
            setAsking(null);
            if (change) open.now(change);
          }}
        />
      )}
    </View>
  );
}

// -------------------------------------------------------------------------------------------------------- compass

export function CompassView({ open, found }: ViewProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [chosen, setChosen] = useState<{ x: string | null; y: string | null }>({ x: null, y: null });
  const [asking, setAsking] = useState<Listed | null>(null);
  const c = castCompass(found, chosen);
  const boardWidth = Math.min(560, width - space.md * 2);
  const cellWidth = (boardWidth - 74) / 3;
  const pair = (p: { key: string; a: Listed; b: Listed; said: string; chips: string[] }) => (
    <View key={p.key} style={styles.pair}>
      <View style={{ width: 60, height: 42 }}>
        <Face l={p.a} width={36} height={36} round={18} />
        <View style={{ position: 'absolute', left: 24, top: 6 }}>
          <Face l={p.b} width={36} height={36} round={18} />
        </View>
      </View>
      <View style={[styles.flex, styles.gapXs]}>
        <Text style={styles.pairNames}>
          {p.a.entry.name} & {p.b.entry.name}
        </Text>
        <Text style={styles.pairSaid}>{p.said}</Text>
        <View style={styles.wrap}>
          {p.chips.map((t) => (
            <Text key={t} style={styles.pairChip}>
              {t}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
  return (
    <View style={styles.gap}>
      <Muted>{c.caption}</Muted>
      {c.none ? (
        <Muted>{c.none}</Muted>
      ) : (
        <>
          <View style={styles.axes}>
            {[c.across, c.down].map((a, i) => (
              <View key={a.label} style={styles.flex}>
                <ChooserField
                  label={a.label}
                  value={a.value}
                  choices={a.choices}
                  onChoose={(v) => setChosen(i === 0 ? { ...chosen, x: v } : { ...chosen, y: v })}
                />
              </View>
            ))}
          </View>
          <View style={{ width: boardWidth, alignSelf: 'center' }} accessibilityLabel={c.board.semanticsLabel}>
            <View style={styles.flexRow}>
              <View style={{ width: 74 }} />
              {c.board.across.map((t, i) => (
                <Text key={i} style={[styles.axisLabel, { width: cellWidth, textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {t.toUpperCase()}
                </Text>
              ))}
            </View>
            {[0, 1, 2].map((row) => (
              <View key={row} style={[styles.flexRow, { height: 104 }]}>
                <Text style={[styles.axisLabel, { width: 74, textAlign: 'right', paddingRight: 6, alignSelf: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {c.board.down[row].toUpperCase()}
                </Text>
                {[0, 1, 2].map((col) => {
                  const cell = c.board.cells.find((k) => k.row === row && k.col === col)!;
                  const corner = row !== 1 && col !== 1;
                  return (
                    <View
                      key={col}
                      style={[
                        styles.compassCell,
                        { width: cellWidth - 2, backgroundColor: cell.middle ? fade(colors.text, 0.03) : corner ? fade(colors.gold, 0.08) : 'transparent' },
                      ]}
                    >
                      {cell.people.map((p) => (
                        <Pressable key={p.listed.entry.id} accessibilityRole="button" accessibilityLabel={p.listed.entry.name} onPress={() => router.navigate(p.path as never)} style={styles.compassPerson}>
                          <Face l={p.listed} width={26} height={31.2} round={6.5} />
                          <Text style={styles.compassName} numberOfLines={1}>
                            {p.first}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          {[c.foils, c.twins].map(
            (group) =>
              group && (
                <View key={group.heading} style={styles.gapSm}>
                  <Text style={styles.heading}>{group.heading}</Text>
                  <Muted>{group.caption}</Muted>
                  {group.pairs.map(pair)}
                </View>
              ),
          )}
          {c.shared.map((s) => (
            <Muted key={s}>{s}</Muted>
          ))}
        </>
      )}
      {c.unasked && (
        <View style={styles.gapSm}>
          <Text style={styles.heading}>{c.unasked.heading}</Text>
          <View style={styles.wrap}>
            {c.unasked.people.map((p) => (
              <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`${p.ask}: ${p.listed.entry.name}`} onPress={() => setAsking(p.listed)} style={styles.nameChip}>
                <Face l={p.listed} width={22} height={26} round={5} />
                <Text style={styles.nameChipText}>{p.listed.entry.name}</Text>
                <Text style={styles.askChip}>{p.ask}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {asking && <ThisOrThatSheet open={open} entry={asking.entry} onClose={() => setAsking(null)} />}
    </View>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexRow: { flexDirection: 'row' },
  bold: { fontWeight: '700' },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.gold },
  // roll call
  rollFrame: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  rollHead: { height: 36, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: fade(colors.border, 0.6) },
  rollRow: { height: rollRowHeight, borderBottomWidth: 1, borderBottomColor: fade(colors.border, 0.6) },
  rollCellPad: { paddingHorizontal: 8 },
  rollName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rollNameText: { fontFamily: fonts.ui, fontSize: 13.5, fontWeight: '700', color: colors.text },
  rollRoles: { fontFamily: fonts.bookItalic, fontSize: 13, color: colors.muted },
  rollChoice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  rollInput: { color: colors.text, fontFamily: fonts.ui, fontSize: 14, paddingVertical: 6 },
  headText: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.gold },
  // name board
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { height: 84, borderRadius: 10, padding: 6, overflow: 'hidden' },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileLetter: { fontFamily: fonts.ui, fontSize: 20, fontWeight: '700', color: colors.text },
  tileCount: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700' },
  tileName: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileNameText: { flex: 1, fontFamily: fonts.ui, fontSize: 11, color: colors.text },
  tileMore: { fontFamily: fonts.ui, fontSize: 10.5, color: colors.muted },
  dot: { width: 6, height: 6, borderRadius: 3 },
  nameChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  nameChipText: { fontFamily: fonts.ui, fontSize: 13.5, color: colors.text },
  askChip: { fontFamily: fonts.ui, fontSize: 12, color: colors.gold },
  alike: { padding: space.sm, borderRadius: 8, backgroundColor: colors.surface, gap: 2 },
  alikeWords: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  alikeWhy: { fontFamily: fonts.bookItalic, fontSize: 13, color: colors.muted },
  free: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: fade(boardGold, 0.6), alignItems: 'center', justifyContent: 'center' },
  freeText: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  // ties
  tiesFrame: { flexDirection: 'row' },
  tieRowHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  tieRowName: { flex: 1, fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.text },
  tieColHead: { alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingBottom: 4 },
  tieColName: { maxWidth: '96%', fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', color: colors.text },
  tieBox: { flex: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tieLabel: { fontFamily: fonts.ui, fontSize: 14.5, color: colors.text, textAlign: 'center' },
  tiePlus: { fontFamily: fonts.ui, fontSize: 18, color: fade(colors.muted, 0.7) },
  tieTogether: { fontFamily: fonts.bookItalic, fontSize: 13, color: colors.gold },
  // stakes
  clash: { padding: space.md, gap: 6, borderRadius: 14, borderWidth: 1, borderColor: fade(colors.danger, 0.35), backgroundColor: fade(colors.danger, 0.1) },
  clashFaces: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clashWhy: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.danger },
  clashWant: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.text },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stakeCard: { padding: space.md, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stakeHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  stakeName: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text },
  stakeRoles: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted },
  marks: { flexDirection: 'row', gap: 3 },
  mark: { width: 7, height: 7, borderRadius: 3.5 },
  stakeLine: { flexDirection: 'row', gap: 6, paddingVertical: 6, minHeight: 40, alignItems: 'flex-start', borderRadius: 6 },
  stakeLabel: { width: 78, paddingTop: 3, fontFamily: fonts.ui, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.muted },
  stakeText: { flex: 1, fontFamily: fonts.ui, fontSize: 15.5, color: colors.text },
  stakeAsk: { flex: 1, fontFamily: fonts.bookItalic, fontSize: 15, color: colors.gold },
  // compass
  axes: { flexDirection: 'row', gap: space.sm },
  axisLabel: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.muted, paddingVertical: 4 },
  compassCell: { margin: 1, padding: 4, borderRadius: 8, borderWidth: 1, borderColor: fade(colors.border, 0.5), flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignContent: 'center', justifyContent: 'center' },
  compassPerson: { width: 34, alignItems: 'center' },
  compassName: { fontFamily: fonts.ui, fontSize: 10.5, color: colors.text },
  pair: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 10, backgroundColor: colors.surface },
  pairNames: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  pairSaid: { fontFamily: fonts.ui, fontSize: 13.5, color: colors.muted },
  pairChip: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.text, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: fade(colors.gold, 0.1), overflow: 'hidden' },
});
