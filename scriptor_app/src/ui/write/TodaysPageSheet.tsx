// TODAY'S PAGE (FEATURES.md #124): the day as a card to post, as writers share their counts: today's words against the
// goal, the days in a row, the last seven days, and the book; a line written today only when the author asks for it.
// Made on this device as a 1080 × 1350 picture and offered through the share sheet; nothing is stored. A port of
// flutter_app/lib/features/write/todays_page.dart; what is on the card is src/domain/goals/todaysPage.ts.

import { type ComponentRef, useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, type TextStyle, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { sharePicture } from '../../data/files';
import {
  type CardText,
  includeLineLabel,
  includeLineSubtitle,
  lastNodeKey,
  pictureFailed,
  todaysPageCardOf,
  todaysPageClose,
  todaysPageColors,
  todaysPageLayout as L,
  todaysPageOf,
  todaysPagePixelRatio,
  todaysPagePreview,
  todaysPageShare,
  todaysPageSize,
  todaysPageTitle,
} from '../../domain/goals/todaysPage';
import { Sheet } from '../dialogs';
import { GoldButton, Muted, OutlineButton } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';

const faces = { heading: fonts.ui, text: fonts.book } as const;

function textStyle(t: CardText): TextStyle {
  return {
    fontFamily: t.face === 'text' && t.italic ? fonts.bookItalic : faces[t.face],
    fontWeight: t.face === 'heading' ? '700' : '400',
    fontSize: t.size,
    lineHeight: t.size * t.lineHeight,
    letterSpacing: t.letterSpacing,
    color: todaysPageColors[t.color],
    textAlign: t.align === 'start' ? 'left' : 'center',
  };
}

function CardLine({ t }: { t: CardText }) {
  return (
    <Text style={textStyle(t)} numberOfLines={t.maxLines ?? undefined}>
      {t.text}
    </Text>
  );
}

export function TodaysPageSheet({ visible, novelId, onClose }: { visible: boolean; novelId: string; onClose: () => void }) {
  const lib = useLibrary();
  const [withLine, setWithLine] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const card = useRef<ComponentRef<typeof View>>(null);

  const page = useMemo(() => {
    if (!visible) return null;
    return todaysPageOf({
      project: lib.library.novel(novelId)?.raw ?? null,
      nodes: lib.manuscript.nodes(novelId),
      sessionRows: lib.novels.rowsIn(novelId, 'writingSessions'),
      goalRows: lib.novels.rowsIn(novelId, 'goals'),
      remembered: lib.settings.read(lastNodeKey(novelId)),
      withLine,
      nowMs: Date.now(),
      rowsFor: (id) => ({
        node: lib.novels.row(novelId, 'chapters', id),
        saved: lib.novels.row(novelId, 'chapterContents', id),
        revisions: lib.manuscript.revisions(novelId, id),
      }),
    });
  }, [visible, withLine, lib, novelId]);

  const share = async () => {
    if (!card.current || !page) return;
    setWorking(true);
    setMessage(null);
    try {
      const uri = await captureRef(card.current, {
        format: 'png',
        result: 'tmpfile',
        width: todaysPageSize.width * todaysPagePixelRatio,
        height: todaysPageSize.height * todaysPagePixelRatio,
      });
      await sharePicture(uri, todaysPageTitle);
    } catch (e) {
      setMessage(pictureFailed(e));
    } finally {
      setWorking(false);
    }
  };

  const scale = todaysPagePreview.maxWidth / todaysPageSize.width;
  const c = page ? todaysPageCardOf(page) : null;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={todaysPageTitle}
      footer={
        <>
          <OutlineButton label={todaysPageClose} onPress={onClose} tone="muted" style={styles.flex} />
          <GoldButton label={todaysPageShare} icon="share-variant" onPress={() => void share()} disabled={working || !c} style={styles.flex} />
        </>
      }
    >
      {c && page && (
        <View style={[styles.preview, { width: todaysPageSize.width * scale, height: todaysPageSize.height * scale }]}>
          <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>
            <View ref={card} collapsable={false} style={styles.card}>
              <Svg style={StyleSheet.absoluteFill} width={todaysPageSize.width} height={todaysPageSize.height}>
                <Defs>
                  <RadialGradient id="glow" cx="180" cy="146.25" r="396" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={todaysPageColors.glow} />
                    <Stop offset="1" stopColor={todaysPageColors.paper} />
                  </RadialGradient>
                </Defs>
                <Rect width={todaysPageSize.width} height={todaysPageSize.height} fill="url(#glow)" />
              </Svg>
              <CardLine t={c.kicker} />
              <View style={{ height: L.afterKicker }} />
              <CardLine t={c.date} />
              <View style={styles.grow} />
              <View style={styles.ringBox}>
                <Svg width={L.ring.size} height={L.ring.size} style={StyleSheet.absoluteFill}>
                  {(() => {
                    const r = L.ring.size / 2 - L.ring.inset;
                    const circ = 2 * Math.PI * r;
                    const mid = L.ring.size / 2;
                    return (
                      <>
                        <Circle cx={mid} cy={mid} r={r} stroke={todaysPageColors.gold} strokeOpacity={c.ring.trackOpacity} strokeWidth={c.ring.trackWidth} fill="none" />
                        {c.ring.arcSweep > 0 && (
                          <Circle
                            cx={mid}
                            cy={mid}
                            r={r}
                            stroke={todaysPageColors.gold}
                            strokeWidth={c.ring.arcWidth}
                            strokeLinecap="round"
                            strokeDasharray={`${circ * c.ring.arcSweep} ${circ}`}
                            transform={`rotate(-90 ${mid} ${mid})`}
                            fill="none"
                          />
                        )}
                      </>
                    );
                  })()}
                </Svg>
                <View style={{ paddingHorizontal: L.ring.numberPadding, alignItems: 'center' }}>
                  <Text style={textStyle(c.number)} numberOfLines={1} adjustsFontSizeToFit>
                    {c.number.text}
                  </Text>
                  <CardLine t={c.under} />
                </View>
              </View>
              <View style={{ height: L.afterRing }} />
              <CardLine t={c.streak} />
              <View style={{ height: L.afterStreak }} />
              <View style={styles.days}>
                {c.days.map((d) => (
                  <View key={d.key} style={{ paddingHorizontal: L.day.padding, alignItems: 'center' }}>
                    <Svg width={L.day.blot} height={L.day.blot}>
                      {d.blot.kind === 'ring' ? (
                        <Circle cx={9} cy={9} r={d.blot.radius} stroke={todaysPageColors.gold} strokeOpacity={d.blot.opacity} strokeWidth={d.blot.strokeWidth} fill="none" />
                      ) : (
                        <Circle cx={9} cy={9} r={d.blot.radius} fill={todaysPageColors.gold} fillOpacity={d.blot.opacity} />
                      )}
                    </Svg>
                    <View style={{ height: L.day.afterBlot }} />
                    <CardLine t={d.initial} />
                  </View>
                ))}
              </View>
              <View style={styles.grow} />
              {c.line && (
                <>
                  <CardLine t={c.line} />
                  <View style={{ height: L.afterLine }} />
                </>
              )}
              <View style={{ height: L.rule.height, backgroundColor: todaysPageColors.gold, opacity: L.rule.opacity }} />
              <View style={{ height: L.afterRule }} />
              <CardLine t={c.novel} />
              <View style={{ height: L.afterNovel }} />
              <CardLine t={c.footer} />
              <View style={{ height: L.afterFooter }} />
              <CardLine t={c.tag} />
            </View>
          </View>
        </View>
      )}
      <View style={styles.toggle}>
        <View style={styles.flex}>
          <Text style={styles.toggleTitle}>{includeLineLabel}</Text>
          <Muted>{includeLineSubtitle(withLine, page?.line ?? null)}</Muted>
        </View>
        <Switch value={withLine} onValueChange={setWithLine} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} accessibilityLabel={includeLineLabel} />
      </View>
      {message && <Muted style={styles.message}>{message}</Muted>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  preview: { alignSelf: 'center', borderRadius: todaysPagePreview.radius, overflow: 'hidden' },
  card: {
    width: todaysPageSize.width,
    height: todaysPageSize.height,
    paddingLeft: L.padding.left,
    paddingTop: L.padding.top,
    paddingRight: L.padding.right,
    paddingBottom: L.padding.bottom,
    backgroundColor: todaysPageColors.paper,
    overflow: 'hidden',
  },
  grow: { flex: 1 },
  ringBox: { alignSelf: 'center', width: L.ring.size, height: L.ring.size, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  toggleTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  message: { textAlign: 'center', marginTop: space.sm },
});
