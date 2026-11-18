// A novel's cover: its own picture when it has one (stored in the novel), otherwise a designed jacket in the System
// Monolith look: the book's own colour, a fine gold line pattern from its genre, a double gold rule with diamond
// corners (the editor's ornament), a shaded spine fold, and a medallion with the title's initial in Cinzel. A picture
// given as a web address is kept in the novel but never fetched (the app makes no network requests), so it shows the
// designed jacket.

import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Image, type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, Rect, Stop, LinearGradient as SvgGradient } from 'react-native-svg';

import { coverInitial, coverLines, coverPatternOf, coverPatternStrength, coverSeed } from '../../domain/coverArt';
import type { Novel } from '../../domain/novel';
import { colors, fonts, tints } from '../theme';

/** Darkens a #rrggbb colour toward black. */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

function Jacket({ novel, width, height }: { novel: Novel; width: number; height: number }) {
  const art = useMemo(() => {
    const pattern = coverPatternOf(novel.primaryGenre, novel.secondaryGenres);
    return { ...coverLines(pattern, width, height, coverSeed(novel.id + novel.title)), strength: coverPatternStrength[pattern] };
  }, [novel, width, height]);
  const unit = Math.min(width, height);
  const scale = Math.max(0.45, Math.min(1.6, unit / 180));
  const inset = Math.max(3, Math.round(unit * 0.045));
  const gap = Math.max(2, Math.round(3 * scale));
  const diamond = Math.max(2.5, 4 * scale);
  const spine = Math.max(4, width * 0.07);
  const innerX = inset + gap;
  const corners: [number, number][] = [
    [innerX, innerX],
    [width - innerX, innerX],
    [innerX, height - innerX],
    [width - innerX, height - innerX],
  ];
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgGradient id="spine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.background} stopOpacity={0.55} />
          <Stop offset="0.7" stopColor={colors.text} stopOpacity={0.07} />
          <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
        </SvgGradient>
        <SvgGradient id="light" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.text} stopOpacity={0.1} />
          <Stop offset="0.45" stopColor={colors.text} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <G opacity={art.strength}>
        <Path d={art.d} stroke={colors.gold} strokeWidth={Math.max(0.6, 0.9 * scale)} fill="none" />
        {art.dots.map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={Math.max(0.6, (i % 3 === 0 ? 1.4 : 0.8) * scale)} fill={colors.gold} />
        ))}
      </G>
      <Rect x={0} y={0} width={width} height={height} fill="url(#light)" />
      <Rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx={2} fill="none" stroke={colors.gold} strokeOpacity={0.6} strokeWidth={Math.max(0.75, scale)} />
      {unit >= 90 && (
        <Rect x={innerX} y={innerX} width={width - innerX * 2} height={height - innerX * 2} fill="none" stroke={colors.gold} strokeOpacity={0.3} strokeWidth={0.75} />
      )}
      {unit >= 90 &&
        corners.map(([x, y], i) => (
          <Path key={i} d={`M${x} ${y - diamond}L${x + diamond} ${y}L${x} ${y + diamond}L${x - diamond} ${y}Z`} fill={colors.gold} fillOpacity={0.75} />
        ))}
      <Rect x={0} y={0} width={spine} height={height} fill="url(#spine)" />
      <Ellipse cx={spine} cy={height / 2} rx={0.5} ry={height / 2} fill={colors.text} fillOpacity={0.08} />
    </Svg>
  );
}

export function NovelCover({ novel, height, showTitle = true }: { novel: Novel; height: number; showTitle?: boolean }) {
  const [width, setWidth] = useState(0);
  const cover = novel.cover;
  if (cover && cover.startsWith('data:image/')) {
    return (
      <Image
        source={{ uri: cover }}
        style={[styles.image, { height }]}
        resizeMode="cover"
        accessibilityLabel={`Cover of ${novel.title}`}
      />
    );
  }
  const accent = /^#[0-9a-fA-F]{6}$/.test(novel.accent) ? novel.accent : '#b4532a';
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const unit = Math.min(width || height * 0.7, height);
  const medal = Math.round(unit * (showTitle ? 0.3 : 0.36));
  const ring = medal >= 36;
  const title = novel.title || 'Untitled novel';
  const author = showTitle && height >= 160 ? novel.author.trim() : '';
  return (
    <LinearGradient
      colors={[shade(accent, 0.1), shade(accent, 0.6), colors.background]}
      locations={[0, 0.62, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.jacket, { height }]}
      onLayout={onLayout}
      accessible
      accessibilityLabel={`Cover of ${title}`}
    >
      {width > 0 && <Jacket novel={novel} width={width} height={height} />}
      <View style={[styles.medalOuter, ring && styles.medalRing, { width: medal + (ring ? 8 : 0), height: medal + (ring ? 8 : 0), borderRadius: medal }]}>
        <View style={[styles.medal, { width: medal, height: medal, borderRadius: medal / 2, borderWidth: medal >= 28 ? 1.5 : 1 }]}>
          <Text style={[styles.initial, { fontSize: Math.round(medal * 0.52), lineHeight: Math.round(medal * 0.66) }]} allowFontScaling={false}>
            {coverInitial(novel.title)}
          </Text>
        </View>
      </View>
      {showTitle && (
        <Text style={[styles.title, { fontSize: Math.max(13, Math.round(height / 12)), lineHeight: Math.max(17, Math.round(height / 9)) }]} numberOfLines={3}>
          {title}
        </Text>
      )}
      {author.length > 0 && (
        <Text style={[styles.author, { fontSize: Math.max(9, Math.round(height / 26)) }]} numberOfLines={1}>
          {author.toUpperCase()}
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', backgroundColor: colors.elevated },
  jacket: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  medalOuter: { alignItems: 'center', justifyContent: 'center' },
  medalRing: { borderWidth: 0.75, borderColor: tints.goldRule },
  medal: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.gold,
    backgroundColor: tints.veil,
  },
  initial: { fontFamily: fonts.display, fontWeight: '700', color: colors.gold, textAlign: 'center', includeFontPadding: false },
  title: {
    marginTop: 10,
    paddingHorizontal: 18,
    textAlign: 'center',
    fontFamily: fonts.display,
    fontWeight: '700',
    color: colors.text,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
  author: { marginTop: 6, paddingHorizontal: 18, fontFamily: fonts.ui, fontWeight: '500', letterSpacing: 2, color: colors.gold, opacity: 0.9 },
});
