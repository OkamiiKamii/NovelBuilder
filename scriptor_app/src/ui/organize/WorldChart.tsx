// THE CHART OF THE WORLD (FEATURES.md #203): the world as an old sea chart. Each place at the top of the world is an
// island, the places inside it within its shore (dashed, as a map draws a border); the more chapters, the larger. On
// each shore, as wax seals, what is linked to it; the rest adrift in the sea below, a press from "Where does it
// belong?". A press on a place or seal opens it. A port of flutter_app/lib/features/codex/widgets/world_chart.dart;
// what is on it, its layout, names, shores, sea and presses are src/domain/codex/screens/worldChart.ts.
//
// TEXT MEASUREMENT. React Native has no TextPainter, so the layout's `measure` and the names' `layout` estimate:
// - The heading face (Cinzel, whose letters are all capitals, so `caps` is true and nothing is put in capitals): a
//   character is 0.72 × the size wide (0.76 bold), plus the letter spacing; a space 0.3 × the size.
// - The book face (Merriweather, the cartouche's "The world of "): 0.52 × the size a character.
// - A name wraps greedily by words at its `maxWidth` (a word too long for a line is cut by characters), in at most
//   `maxLines` lines with an ellipsis; `exceeded` when it needed more. Lines are 1.1 × the size high.
// These run a little wide on purpose: a name drawn narrower than measured only leaves more sea round it.

import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { castTone } from '../../domain/characters/screens/library';
import { isDark } from '../../domain/characters/views/common';
import {
  belongSheet,
  belongTo,
  cartouche,
  type ChartLabel,
  chartLabels,
  chartColors,
  chartTargets,
  chartWords,
  type ChartTarget,
  layOutChart,
  type LayoutLabel,
  type MeasureLine,
  placeIt,
  type Seal,
  sealLook,
  seaMarks,
  seedOf,
  shorePath,
  swellPath,
  worldChartOf,
} from '../../domain/codex/screens/worldChart';
import { entryInitial, kindColor, kindOfEntry } from '../../domain/codex/screens/world';
import type { Entry } from '../../domain/records/entry';
import { Sheet } from '../dialogs';
import { Icon, Muted } from '../kit';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import type { OpenCast } from './useCast';

// The Flutter theme's colours, as the System Monolith has them (the app is dark).
const theme = {
  low: colors.surface, // surfaceContainerLow
  high: colors.elevated, // surfaceContainerHigh
  onSurface: colors.text,
  outlineVariant: colors.border,
  outline: colors.muted,
  accent: colors.gold,
};

// ---------------------------------------------------------------------------------------------------- measurement

const headingWidth = (text: string, size: number, letterSpacing: number, bold = true): number => {
  let w = 0;
  for (const ch of text) w += ch === ' ' ? size * 0.3 : size * (bold ? 0.76 : 0.72);
  return w + letterSpacing * text.length;
};

/** The width a line is DRAWN at: the estimate the layout used (less the spacing after its last letter), so the text
 * fills exactly the room the layout gave it. Cinzel's capitals run wider than any one estimate on some phones (seen
 * on the owner's phone, 2026-11-17: a name ran off the chart); drawing to the estimate keeps it inside. */
const fitted = (text: string, size: number, letterSpacing: number, bold: boolean): number =>
  Math.max(1, headingWidth(text, size, letterSpacing, bold) - letterSpacing);

const measure: MeasureLine = (text, size, letterSpacing) => headingWidth(text, size, letterSpacing);

/** A name wrapped at `maxWidth`, by words (cutting a word too long for a line), in at most `maxLines` lines. */
function wrap(text: string, size: number, letterSpacing: number, bold: boolean, maxWidth: number, maxLines: number): { lines: string[]; exceeded: boolean } {
  const fits = (s: string) => headingWidth(s, size, letterSpacing, bold) <= maxWidth;
  const lines: string[] = [];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  let line = '';
  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    const tried = line.length === 0 ? word : `${line} ${word}`;
    if (fits(tried)) {
      line = tried;
      continue;
    }
    if (line.length > 0) {
      lines.push(line);
      line = '';
    }
    // A word wider than a line: cut by characters (a counted loop: the word's length bounds it).
    for (let guard = 0; guard < word.length && !fits(word); guard++) {
      let cut = word.length - 1;
      for (; cut > 1 && !fits(word.substring(0, cut)); cut--);
      lines.push(word.substring(0, cut));
      word = word.substring(cut);
    }
    line = word;
  }
  if (line.length > 0) lines.push(line);
  if (lines.length <= maxLines) return { lines, exceeded: false };
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]}…`;
  for (let guard = last.length; guard > 1 && !fits(last); guard--) last = `${last.substring(0, last.length - 2)}…`;
  kept[maxLines - 1] = last;
  return { lines: kept, exceeded: true };
}

const layout: LayoutLabel = (text, style) => {
  const { lines, exceeded } = wrap(text, style.size, style.letterSpacing, style.weight === 700, style.maxWidth, style.maxLines);
  const width = Math.min(style.maxWidth, Math.max(0, ...lines.map((l) => headingWidth(l, style.size, style.letterSpacing, style.weight === 700))));
  return { width, height: lines.length * style.size * 1.1, exceeded };
};

// ---------------------------------------------------------------------------------------------------- the chart

export function WorldChart({ open, onOpen }: { open: OpenCast; onOpen: (entryId: string) => void }) {
  const toast = useToast();
  const [width, setWidth] = useState(0);
  const [list, setList] = useState<{ heading: string; entries: Entry[]; adrift: boolean } | null>(null);
  const [belonging, setBelonging] = useState<Entry | null>(null);
  const { cast } = open;

  const data = useMemo(() => worldChartOf(cast.model, cast.chaptersOf()), [cast]);
  const drawn = useMemo(() => {
    if (width === 0 || data.islands.length === 0) return null;
    const laid = layOutChart(width, data, { caps: true, measure });
    const labels = chartLabels(laid.drawn, { caps: true, layout });
    const targets = chartTargets(laid, data, (e) => kindOfEntry(cast, e), cast.model.order.chapters.length > 0);
    return { laid, labels, targets, marks: seaMarks(width, laid.height) };
  }, [width, data, cast]);

  if (data.islands.length === 0) return null;
  const words = chartWords(data);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const press = (t: ChartTarget) => {
    const p = t.press;
    if (p.kind === 'open') onOpen(p.entry.id);
    else if (p.kind === 'belong') setBelonging(p.entry);
    else setList({ heading: p.heading, entries: p.entries, adrift: p.kind === 'adrift' });
  };
  const sealColor = (e: Entry) => kindColor(kindOfEntry(cast, e));

  return (
    <View style={styles.gap}>
      <View onLayout={onLayout} style={styles.frame} accessibilityLabel={words.label}>
        {drawn && (
          <View style={{ height: drawn.laid.height }}>
            <Svg width={width} height={drawn.laid.height} style={StyleSheet.absoluteFill}>
              <Drawing width={width} title={cast.novelTitle} marks={drawn.marks} laid={drawn.laid} labels={drawn.labels} sealColor={sealColor} />
            </Svg>
            {drawn.targets.map((t, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                onPress={() => press(t)}
                style={{ position: 'absolute', left: t.at.x - t.r, top: t.at.y - t.r, width: t.r * 2, height: t.r * 2, borderRadius: t.r }}
              />
            ))}
          </View>
        )}
      </View>
      <Text style={styles.caption}>{words.caption}</Text>

      {list && (
        <Sheet visible onClose={() => setList(null)} title={list.heading}>
          {list.entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              kind={kindOfEntry(cast, e).singular}
              colour={sealColor(e)}
              action={list.adrift ? placeIt : null}
              onPress={() => {
                setList(null);
                if (list.adrift) setBelonging(e);
                else onOpen(e.id);
              }}
            />
          ))}
        </Sheet>
      )}
      {belonging && (
        <BelongSheet
          entry={belonging}
          data={data}
          onClose={() => setBelonging(null)}
          onOpen={() => {
            setBelonging(null);
            onOpen(belonging.id);
          }}
          onPlace={(place) => {
            const entry = belonging;
            setBelonging(null);
            const said = open.now((c) => belongTo(c, entry, place));
            if (said) toast(said.tell, { action: { label: said.action, run: () => onOpen(entry.id) } });
          }}
        />
      )}
    </View>
  );
}

type Laid = ReturnType<typeof layOutChart>;

/** The chart itself, in the header's order. */
function Drawing({
  width,
  title,
  marks,
  laid,
  labels,
  sealColor,
}: {
  width: number;
  title: string;
  marks: string[];
  laid: Laid;
  labels: ChartLabel[];
  sealColor: (e: Entry) => string;
}) {
  const { height, sea, compact } = laid;
  const c = cartouche(0, 0, compact, width);
  const leadWidth = c.lead.length * c.leadSize * 0.52;
  const titleLine = wrap(title.trim() || 'Untitled', c.titleSize, 1.6, true, Math.max(40, c.maxTextWidth - leadWidth), 1).lines[0] ?? '';
  const textWidth = Math.min(c.maxTextWidth, leadWidth + headingWidth(titleLine, c.titleSize, 1.6));
  const box = cartouche(textWidth, c.titleSize * 1.3, compact, width);
  const seaInk = chartColors.sea;
  return (
    <G>
      {/* 1. The sea and its marks. */}
      <Rect width={width} height={height} fill={theme.low} />
      <Rect width={width} height={height} fill={chartColors.sea} fillOpacity={chartColors.seaAlpha.dark} />
      {marks.map((d, i) => (
        <Path key={i} d={d} fill="none" stroke={seaInk} strokeOpacity={0.45} strokeWidth={1} strokeLinecap="round" />
      ))}
      {/* 2. The neat line. */}
      <Rect x={8} y={8} width={width - 16} height={height - 16} fill="none" stroke={theme.onSurface} strokeOpacity={0.25} strokeWidth={1} />
      {/* 3. The cartouche. */}
      <Rect x={box.box.x} y={box.box.y} width={box.box.width} height={box.box.height} rx={3} fill={theme.high} />
      <Rect x={box.box.x} y={box.box.y} width={box.box.width} height={box.box.height} rx={3} fill={chartColors.land} fillOpacity={0.2} stroke={theme.onSurface} strokeOpacity={0.45} strokeWidth={1} />
      <Rect x={box.box.x + 3} y={box.box.y + 3} width={box.box.width - 6} height={box.box.height - 6} rx={2} fill="none" stroke={theme.onSurface} strokeOpacity={0.45} strokeWidth={0.6} />
      <SvgText x={box.text.x} y={box.text.y + c.titleSize} fontSize={c.leadSize} fontFamily={fonts.bookItalic} fill={theme.onSurface} fillOpacity={0.7}>
        {c.lead}
      </SvgText>
      <SvgText
        x={box.text.x + leadWidth}
        y={box.text.y + c.titleSize}
        fontFamily={fonts.display}
        fontSize={c.titleSize}
        fontWeight="700"
        letterSpacing={1.6}
        fill={theme.onSurface}
        fillOpacity={0.9}
        textLength={fitted(titleLine, c.titleSize, 1.6, true)}
        lengthAdjust="spacingAndGlyphs"
      >
        {titleLine}
      </SvgText>
      {/* 4. The islands' ripples. */}
      {laid.drawn
        .filter((d) => d.place.depth === 0)
        .map((d) => (
          <G key={`ripple-${d.place.entry.id}`}>
            <Path d={shorePath(d.centre, d.r + 5, seedOf(d.place.entry.id), 0.06)} fill="none" stroke={seaInk} strokeOpacity={0.35 * 1.4} strokeWidth={1} />
            <Path d={shorePath(d.centre, d.r + 11, seedOf(d.place.entry.id), 0.06)} fill="none" stroke={seaInk} strokeOpacity={0.18 * 1.4} strokeWidth={1} />
          </G>
        ))}
      {/* 5. Every place: islands of land, the places inside tinted in their own colour, their borders dashed. */}
      {laid.drawn.map((d) => {
        const island = d.place.depth === 0;
        const path = shorePath(d.centre, d.r, seedOf(d.place.entry.id), island ? 0.06 : 0.035);
        return (
          <G key={`place-${d.place.entry.id}`}>
            {island && <Path d={path} fill={theme.high} />}
            <Path
              d={path}
              fill={island ? chartColors.land : castTone(d.place.entry.id)}
              fillOpacity={island ? 0.3 : 0.2}
              stroke={theme.onSurface}
              strokeOpacity={island ? 0.6 : 0.42}
              strokeWidth={island ? 1.6 : 1.1}
              strokeDasharray={island ? undefined : '5 4'}
            />
          </G>
        );
      })}
      {/* 6. Names, on a wash. */}
      {labels.map((l) => {
        const { lines } = wrap(l.text, l.size, l.letterSpacing, l.weight === 700, l.maxWidth, l.maxLines);
        // Kept inside the neat line: a name wider than its island is slid in from the edge rather than cut off by it
        // (the Flutter chart clips it; on a narrow phone "THE DROWNED ROAD" ran off the right, 2026-11-17).
        const left = Math.max(14, Math.min(l.at.x, width - 14 - l.width));
        const cx = left + l.width / 2;
        return (
          <G key={`label-${l.id}`}>
            <Rect x={left - 4} y={l.at.y - 1} width={l.width + 8} height={l.height + 2} rx={4} fill={theme.high} fillOpacity={0.55} />
            {lines.map((line, i) => (
              <SvgText
                key={i}
                x={cx}
                y={l.at.y + l.size * (0.9 + 1.1 * i)}
                fontFamily={fonts.display}
                fontSize={l.size}
                fontWeight={l.weight === 700 ? '700' : '600'}
                letterSpacing={l.letterSpacing}
                fill={theme.onSurface}
                fillOpacity={l.alpha}
                textAnchor="middle"
                textLength={fitted(line, l.size, l.letterSpacing, l.weight === 700)}
                lengthAdjust="spacingAndGlyphs"
              >
                {line}
              </SvgText>
            ))}
          </G>
        );
      })}
      {/* 7. The seals. */}
      {laid.seals.map((s, i) => (
        <WaxSeal key={`seal-${i}`} s={s} colour={s.more > 0 ? theme.outline : sealColor(s.entry)} />
      ))}
      {/* 8. Adrift. */}
      {laid.adrift.length > 0 && (
        <G>
          <Line x1={22} y1={height - sea - 4} x2={width - 22} y2={height - sea - 4} stroke={theme.onSurface} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="3 5" />
          {!compact && (
            <>
              <SvgText x={30} y={height - sea / 2 - 8} fontFamily={fonts.display} fontSize={13} fontWeight="700" letterSpacing={3} fill={theme.onSurface} fillOpacity={0.72}>
                ADRIFT
              </SvgText>
              <SvgText x={30} y={height - sea / 2 + 4 + 12} fontFamily={fonts.bookItalic} fontSize={12} fill={theme.onSurface} fillOpacity={0.6}>
                linked to no place
              </SvgText>
            </>
          )}
          {laid.adrift.map((s, i) => {
            const name = s.more > 0 ? `${s.more} more` : s.entry.name;
            const shown = wrap(name, 12, 0, false, 80, 1).lines[0] ?? '';
            return (
              <G key={`adrift-${i}`}>
                <Path d={swellPath(s)} fill="none" stroke={seaInk} strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" />
                <WaxSeal s={s} colour={s.more > 0 ? theme.outline : sealColor(s.entry)} />
                <SvgText x={s.at.x} y={s.at.y + s.r + 8 + 12} fontFamily={fonts.book} fontSize={12} fill={theme.onSurface} fillOpacity={0.82} textAnchor="middle">
                  {shown}
                </SvgText>
              </G>
            );
          })}
        </G>
      )}
    </G>
  );
}

/** A wax seal (`sealLook`): a shadow, a disc of its kind's colour, a ring 1.6 in, its initials or "+N". */
function WaxSeal({ s, colour }: { s: Seal; colour: string }) {
  const look = sealLook(s, null);
  const ink = isDark(colour) ? '#FFFFFF' : 'rgba(0, 0, 0, 0.87)';
  return (
    <G>
      <Circle cx={s.at.x} cy={s.at.y + 1.5} r={look.radius} fill="#000000" fillOpacity={0.18} />
      <Circle cx={s.at.x} cy={s.at.y} r={look.radius} fill={colour} />
      <Circle cx={s.at.x} cy={s.at.y} r={Math.max(0, look.radius - 1.6)} fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1} />
      <SvgText x={s.at.x} y={s.at.y + look.size * 0.36} fontFamily={fonts.book} fontWeight="700" fontSize={look.size} fill={ink} textAnchor="middle">
        {look.mark}
      </SvgText>
    </G>
  );
}

// ---------------------------------------------------------------------------------------------------- the sheets

function EntryRow({ entry, kind, colour, action, onPress }: { entry: Entry; kind: string; colour: string; action: string | null; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name}, ${kind}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}>
      <View style={[styles.thumb, { backgroundColor: colour }]}>
        <Text style={[styles.thumbText, { color: isDark(colour) ? '#FFFFFF' : 'rgba(0,0,0,0.87)' }]}>{entryInitial(entry)}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {entry.name}
        </Text>
        <Muted>{kind}</Muted>
      </View>
      {action && <Text style={styles.action}>{action}</Text>}
    </Pressable>
  );
}

function BelongSheet({
  entry,
  data,
  onClose,
  onOpen,
  onPlace,
}: {
  entry: Entry;
  data: ReturnType<typeof worldChartOf>;
  onClose: () => void;
  onOpen: () => void;
  onPlace: (place: Entry) => void;
}) {
  const sheet = belongSheet(entry, data);
  return (
    <Sheet visible onClose={onClose} title={sheet.title}>
      <Muted>{sheet.note}</Muted>
      {sheet.places.map(({ place, indent, top }) => (
        <Pressable
          key={place.entry.id}
          accessibilityRole="button"
          accessibilityLabel={place.entry.name}
          onPress={() => onPlace(place.entry)}
          style={({ pressed }) => [styles.place, { paddingLeft: indent }, pressed && { backgroundColor: colors.elevated }]}
        >
          <Icon name={top ? 'image-filter-hdr' : 'subdirectory-arrow-right'} size={20} color={top ? colors.gold : colors.muted} />
          <Text style={styles.rowTitle} numberOfLines={1}>
            {place.entry.name}
          </Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.place, pressed && { backgroundColor: colors.elevated }]}>
        <Icon name="open-in-new" size={20} />
        <Text style={[styles.rowTitle, { color: colors.gold }]}>{sheet.open}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.xs, marginBottom: space.md },
  frame: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(39, 46, 64, 0.7)', overflow: 'hidden', backgroundColor: colors.surface },
  caption: { fontFamily: fonts.bookItalic, fontSize: 12.5, lineHeight: 18, color: colors.muted, textAlign: 'center', paddingHorizontal: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: 8 },
  thumb: { width: 32, height: 32, borderRadius: 32 * 0.18, alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 32 * 0.42 },
  rowTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.text, flexShrink: 1 },
  action: { fontFamily: fonts.ui, fontSize: 13, color: colors.gold },
  place: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingRight: space.sm, borderRadius: 8 },
});
