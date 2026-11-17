// FOUND IN YOUR PAGES (FEATURES.md #144–#148): what the book says about the cast, kept with the cast. At the top a strip
// of notes, how many of each (a press scrolls to that panel); then the panels: TOGETHER ON THE PAGE (pairs the book
// keeps side by side with no tie: record one in a press, or "Not tied"), THE CAST, CHECKED (what an editor would ask),
// WAITING FOR A NAME (people the pages keep coming back to without a name: name them), and IN YOUR MANUSCRIPT (names
// written but not in the cast: add them). And on a character's profile: THEIR VOICE, IN THEIR OWN WORDS and CHECKED
// AGAINST YOUR PAGES. Nothing changes until a press. Ports of together_on_page.dart, cast_check.dart,
// waiting_for_a_name.dart, manuscript_names.dart, page_notes.dart, their_voice.dart, in_their_words.dart and
// against_your_pages.dart; the logic is src/domain/characters/views/*.
//
// Whatever reads the whole book is read a moment after the screen is drawn, and kept (KeptReadings) by what it is
// made of and the count of writes to the text, so it is read again only when one of those changes.

import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Image, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CharacterProfile } from '../../domain/characters/characterRecords';
import { looksJob } from '../../domain/characters/looks';
import { characterPath } from '../../domain/characters/screens/create';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import { type UnnamedRole, unnamedRolesJob } from '../../domain/characters/unnamedRoles';
import { againstYourPages, looksInputs, recordPageLook } from '../../domain/characters/views/againstYourPages';
import { castCheckAfter, castCheckKey, castCheckPanel } from '../../domain/characters/views/castCheck';
import { inTheirWords, wordsInputs } from '../../domain/characters/views/inTheirWords';
import { firstReading, KeptReadings, readingKey } from '../../domain/characters/views/keptReadings';
import {
  addFromManuscript,
  manuscriptNamesPanel,
  namesInManuscript,
  namesShown,
  notCharacterAfter,
  notCharactersKey,
} from '../../domain/characters/views/manuscriptNames';
import { counted, notesStrip, type PageNote } from '../../domain/characters/views/pageNotes';
import { readingTheBook } from '../../domain/characters/views/readings';
import { theirVoice, voiceInputs } from '../../domain/characters/views/theirVoice';
import { notTiedAfter, notTiedKey, type PairCard, type PairFace, tiePair, togetherOnPage } from '../../domain/characters/views/togetherOnPage';
import {
  nameGiven,
  nameRole,
  unnamedAsideAfter,
  unnamedAsideKey,
  waitingForAName,
  waitingInputs,
  writeNamePrompt,
} from '../../domain/characters/views/waitingForAName';
import { spokenJob } from '../../domain/characters/voice';
import { voicePrintsJob } from '../../domain/characters/voicePrint';
import type { Entry } from '../../domain/records/entry';
import { lastNodeSetting } from '../write/WriteScreen';
import { PromptSheet, Sheet } from '../dialogs';
import { Icon, type IconName, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { NameForgeSheet } from './AidsSheets';
import { Face } from './CastPane';
import type { OpenCast } from './useCast';

// ------------------------------------------------------------------------------------------------------ shared parts

/** The Material icon names the domain gives, as the app's icon set has them. */
const icons: Record<string, IconName> = {
  people_outline: 'account-multiple-outline',
  fact_check_outlined: 'clipboard-check-outline',
  person_search_outlined: 'account-search-outline',
  badge_outlined: 'card-account-details-outline',
  balance: 'scale-balance',
  visibility_off_outlined: 'eye-off-outline',
  hourglass_bottom: 'timer-sand-complete',
  content_cut: 'content-cut',
  record_voice_over: 'account-voice',
  hearing: 'ear-hearing',
  error_outline: 'alert-circle-outline',
  auto_awesome_outlined: 'creation',
  check_circle_outline: 'check-circle-outline',
};
const iconOf = (name: string): IconName => icons[name] ?? 'circle-small';

/** The readings of the whole book, shared by every panel and profile (the last 64). */
const kept = new KeptReadings();

/** A reading of the book under `key`: `nothing` when there is nothing to read (a null key); kept when it was read
 * already; else undefined while it is read, a moment after the screen is drawn. */
function useReading<T>(key: string | null, job: () => T, nothing: T): T | undefined {
  const [read, setRead] = useState<{ key: string; value: T } | null>(null);
  const jobRef = useRef(job);
  useEffect(() => {
    jobRef.current = job;
  });
  useEffect(() => {
    if (key === null || kept.has(key)) return;
    let live = true;
    const t = setTimeout(() => {
      kept.read(key, () => Promise.resolve().then(() => jobRef.current())).then(
        (value) => {
          if (live) setRead({ key, value });
        },
        () => {},
      );
    }, 30);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  if (key !== null && read?.key === key) return read.value;
  return firstReading(kept, key, nothing);
}

/** Writes a setting of this device (a list set aside) at once, and tells the screens. */
function useStoreSetting() {
  const lib = useLibrary();
  return (key: string, value: unknown) =>
    lib.saves.saveNow(`setting:${key}`, () => {
      lib.settings.write(key, value);
      lib.novels.touchSettings();
    });
}

/** Opens a chapter or scene in Write. */
function useOpenChapter(open: OpenCast) {
  const lib = useLibrary();
  const router = useRouter();
  return (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(open.novelId)}`, () => lib.settings.write(lastNodeSetting(open.novelId), nodeId));
    router.navigate('/write');
  };
}

/** A change made now, said in a toast with **Open** to what it made. */
function useMade() {
  const toast = useToast();
  const router = useRouter();
  return (tell: string, label: string, path: string) => toast(tell, { action: { label, run: () => router.navigate(path) } });
}

function Head({ icon, heading, caption }: { icon: string; heading: string; caption?: string }) {
  return (
    <>
      <View style={styles.head}>
        <Icon name={iconOf(icon)} size={18} />
        <Text style={styles.kicker}>{heading}</Text>
      </View>
      {caption ? <Muted>{caption}</Muted> : null}
    </>
  );
}

/** Cards in columns: as many of `min` wide as fit, 1 to `most`, 12 apart. */
function Grid({ min, most, children }: { min: number; most: number; children: ReactNode[] }) {
  const [width, setWidth] = useState(0);
  const columns = Math.max(1, Math.min(most, Math.floor((width + 12) / min)));
  const cell = width > 0 ? (width - 12 * (columns - 1)) / columns : undefined;
  return (
    <View style={styles.grid} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {children.map((c, i) => (
        <View key={i} style={{ width: cell ?? '100%' }}>
          {c}
        </View>
      ))}
    </View>
  );
}

// --------------------------------------------------------------------------------------- the panels under the cast

/** The strip of notes and the four panels. Put it straight in the cast's scrolling content: a note pressed calls
 * `scrollTo` with where its panel is in that content (brought up a little below the top). */
/** The strip of notes, then `children` (the cast itself, which comes first), then the panels the notes scroll to. */
export function CastPagePanels({ open, scrollTo, children }: { open: OpenCast; scrollTo?: (y: number) => void; children?: ReactNode }) {
  const lib = useLibrary();
  useLibraryRevision();
  const store = useStoreSetting();
  const [top, setTop] = useState(0);
  const [places] = useState(() => new Map<PageNote, number>());
  const { cast, novelId } = open;
  const textVersion = lib.novels.versionOf(novelId, ['chapterContents']);

  // Together on the page, and the cast checked: from the cast as it is.
  const [allPairs, setAllPairs] = useState(false);
  const notTied = lib.settings.read(notTiedKey(novelId));
  const together = togetherOnPage(cast, notTied, allPairs);
  const checkStored = lib.settings.read(castCheckKey(novelId));
  const check = castCheckPanel(cast, checkStored);

  // Waiting for a name: read from the book.
  const asideStored = lib.settings.read(unnamedAsideKey(novelId));
  const inputs = waitingInputs(cast, asideStored, textVersion);
  const roles = useReading<UnnamedRole[]>(
    `waiting\u0000${novelId}\u0000${inputs.key}\u0000${[...inputs.setAside].join('|')}`,
    () => unnamedRolesJob(open.service.storedChapters(novelId), inputs.order, { taken: inputs.taken, setAside: inputs.setAside })(),
    [],
  );
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const waiting = waitingForAName(roles ?? null, done);

  // In your manuscript: read from the chapters' rows.
  const [allNames, setAllNames] = useState(false);
  const known = cast.entries.map((e) => e.name).join('|') + [...cast.profiles.values()].map((p) => `${p.epithet}|${p.aliases.join('|')}`).join('|');
  const found = useReading(
    `names\u0000${novelId}\u0000${textVersion}\u0000${known}\u0000${cast.model.order.chapters.map((c) => c.id).join(',')}`,
    () => namesInManuscript(cast, open.service.store.rowsIn(novelId, 'chapterContents')),
    [],
  );
  const namesStored = lib.settings.read(notCharactersKey(novelId));
  const names = manuscriptNamesPanel(namesShown(found ?? [], namesStored), allNames);

  let counts: ReadonlyMap<PageNote, number> = new Map();
  counts = counted(counts, 'together', together?.count ?? 0);
  counts = counted(counts, 'check', check?.count ?? 0);
  counts = counted(counts, 'waiting', waiting?.count ?? 0);
  counts = counted(counts, 'names', names?.count ?? 0);
  const strip = notesStrip(counts);
  if (!strip) return <>{children}</>;

  const place = (note: PageNote) => (e: LayoutChangeEvent) => places.set(note, e.nativeEvent.layout.y);
  const go = (note: PageNote) => {
    const y = places.get(note);
    if (y !== undefined && scrollTo) scrollTo(Math.max(0, top + y - 24));
  };

  return (
    <View style={styles.panels} onLayout={(e) => setTop(e.nativeEvent.layout.y)}>
      <Text style={styles.stripHeading}>{strip.heading}</Text>
      <View style={styles.row}>
        {strip.chips.map((c) => (
          <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={c.label} onPress={() => go(c.note)} style={({ pressed }) => [styles.note, pressed && { borderColor: colors.gold }]}>
            <Icon name={iconOf(c.icon)} size={16} />
            <Text style={styles.noteText}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      {children}
      {together && (
        <View onLayout={place('together')}>
          <TogetherPanel open={open} view={together} onAll={() => setAllPairs(!allPairs)} onNotTied={(card) => store(notTiedKey(novelId), notTiedAfter(notTied, card.pair))} />
        </View>
      )}
      {check && (
        <View onLayout={place('check')}>
          <Panel style={styles.panel}>
            <Head icon={check.icon} heading={check.heading} caption={check.caption} />
            {check.notes.map((n) => (
              <CheckNote key={`${n.note.kind}:${n.note.who.join(',')}`} n={n} onNotNow={() => store(castCheckKey(novelId), castCheckAfter(checkStored, n.note))} />
            ))}
          </Panel>
        </View>
      )}
      {waiting && (
        <View onLayout={place('waiting')}>
          <WaitingPanel
            open={open}
            view={waiting}
            onDone={(role) => setDone(new Set([...done, role.role]))}
            onAside={(role) => {
              setDone(new Set([...done, role.role]));
              store(unnamedAsideKey(novelId), unnamedAsideAfter(asideStored, role));
            }}
          />
        </View>
      )}
      {names && (
        <View onLayout={place('names')}>
          <NamesPanel open={open} view={names} onAll={() => setAllNames(!allNames)} onAside={(n) => store(notCharactersKey(novelId), notCharacterAfter(namesStored, n))} />
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------- together on the page

function PairFaceView({ face, style }: { face: PairFace; style?: object }) {
  return (
    <View style={[styles.pairFace, style]}>
      {isUploadedImage(face.image) ? (
        <Image source={{ uri: face.image ?? undefined }} style={styles.pairImage} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.pairImage, { backgroundColor: face.tone, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontFamily: fonts.display, fontSize: 16, color: face.ink }}>{face.monogram}</Text>
        </View>
      )}
    </View>
  );
}

function TogetherPanel({
  open,
  view,
  onAll,
  onNotTied,
}: {
  open: OpenCast;
  view: NonNullable<ReturnType<typeof togetherOnPage>>;
  onAll: () => void;
  onNotTied: (card: PairCard) => void;
}) {
  const made = useMade();
  const [asking, setAsking] = useState<PairCard | null>(null);
  const tie = (card: PairCard, preset: string) => {
    setAsking(null);
    const r = open.now((c) => tiePair(c, card.pair, preset, { a: card.a.name, b: card.b.name }));
    if (r) made(r.tell, r.action.label, r.action.path);
  };
  return (
    <Panel style={styles.panel}>
      <Head icon="people_outline" heading={view.title.toUpperCase()} caption={view.caption} />
      <Grid min={300} most={3}>
        {view.cards.map((card) => (
          <View key={`${card.pair.a}|${card.pair.b}`} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.pair}>
                <PairFaceView face={card.a} />
                <PairFaceView face={card.b} style={{ left: 30 }} />
                <View style={styles.pairAsk}>
                  <Text style={styles.pairAskText}>?</Text>
                </View>
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {card.title}
                </Text>
                <Text style={styles.cardSaid}>{card.said}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <OutlineButton label={card.tie.label} icon="link-variant" compact accessibilityLabel={card.tie.semanticsLabel} onPress={() => setAsking(card)} />
              <OutlineButton label={card.notTied} compact tone="muted" onPress={() => onNotTied(card)} />
            </View>
          </View>
        ))}
      </Grid>
      {view.toggle && <OutlineButton label={view.toggle} compact tone="muted" onPress={onAll} style={styles.start} />}
      {asking && (
        <Sheet visible onClose={() => setAsking(null)} title={asking.tie.tooltip}>
          {asking.tie.choices.map((c) => (
            <Pressable key={c.value} accessibilityRole="button" onPress={() => tie(asking, c.value)} style={({ pressed }) => [styles.choice, pressed && { backgroundColor: colors.elevated }]}>
              <Text style={styles.choiceText}>{c.label}</Text>
            </Pressable>
          ))}
        </Sheet>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------------------------------------- the cast, checked

function CheckNote({ n, onNotNow }: { n: NonNullable<ReturnType<typeof castCheckPanel>>['notes'][number]; onNotNow: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.checkNote}>
      <View style={styles.head}>
        <Icon name={iconOf(n.icon)} size={14} />
        <Text style={styles.noteHeading}>{n.heading}</Text>
      </View>
      <Text style={styles.says}>{n.says}</Text>
      <View style={styles.row}>
        {n.who.map((w) => (
          <Pressable key={w.listed.entry.id} accessibilityRole="button" accessibilityLabel={w.label} onPress={() => router.navigate(characterPath(w.listed.entry.id))} style={styles.who}>
            <Face l={w.listed} size={36} />
            <Text style={styles.whoName} numberOfLines={1}>
              {w.listed.entry.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <OutlineButton label={n.notNow} compact tone="muted" onPress={onNotNow} style={styles.start} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------- waiting for a name

function WaitingPanel({
  open,
  view,
  onDone,
  onAside,
}: {
  open: OpenCast;
  view: NonNullable<ReturnType<typeof waitingForAName>>;
  onDone: (role: UnnamedRole) => void;
  onAside: (role: UnnamedRole) => void;
}) {
  const made = useMade();
  const [forging, setForging] = useState<UnnamedRole | null>(null);
  const [writing, setWriting] = useState<UnnamedRole | null>(null);
  const name = (role: UnnamedRole, given: string | null) => {
    setForging(null);
    setWriting(null);
    if (!nameGiven(given)) return;
    const r = open.now((c) => nameRole(c, role, given));
    if (!r) return;
    onDone(role);
    made(r.tell, r.action, characterPath(r.made.id));
  };
  const prompt = writing ? writeNamePrompt(writing) : null;
  return (
    <Panel style={styles.panel}>
      <Head icon={view.icon} heading={view.heading} caption={view.caption} />
      {view.cards.map((card) => (
        <View key={card.role.role} style={[styles.card, styles.waitCard]}>
          <View style={styles.cardTop}>
            <View style={styles.unknown}>
              <Text style={styles.unknownText}>?</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSaid}>{card.where}</Text>
            </View>
          </View>
          <Text style={styles.said} numberOfLines={2}>
            {card.said}
          </Text>
          <View style={styles.row}>
            <OutlineButton label={card.nameThem} icon="auto-fix" compact onPress={() => setForging(card.role)} />
            <OutlineButton label={card.writeName} icon="pencil-outline" compact onPress={() => setWriting(card.role)} />
            <OutlineButton label={card.notOne} compact tone="muted" onPress={() => onAside(card.role)} />
          </View>
        </View>
      ))}
      {forging && <NameForgeSheet open={open} onPick={(n) => name(forging, n)} onClose={() => setForging(null)} />}
      {writing && prompt && (
        <PromptSheet visible title={prompt.title} label={prompt.label} confirmLabel={prompt.confirmLabel} onSubmit={(n) => name(writing, n)} onClose={() => setWriting(null)} />
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------------------------- in your manuscript

function NamesPanel({
  open,
  view,
  onAll,
  onAside,
}: {
  open: OpenCast;
  view: NonNullable<ReturnType<typeof manuscriptNamesPanel>>;
  onAll: () => void;
  onAside: (n: NonNullable<ReturnType<typeof manuscriptNamesPanel>>['cards'][number]['name']) => void;
}) {
  const made = useMade();
  const add = (name: string) => {
    const r = open.now((c) => addFromManuscript(c, name));
    if (r) made(r.tell, r.action, characterPath(r.made.id));
  };
  return (
    <Panel style={styles.panel}>
      <Head icon="badge_outlined" heading={view.title.toUpperCase()} />
      <Grid min={262} most={4}>
        {view.cards.map((card) => (
          <View key={card.name.name} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.mono, { backgroundColor: card.tone }]}>
                <Text style={[styles.monoText, { color: card.ink }]}>{card.monogram}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {card.name.name}
                </Text>
                <Text style={styles.italic}>{card.said}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <OutlineButton label={card.add} icon="account-plus-outline" compact onPress={() => add(card.name.name)} />
              <OutlineButton label={card.notOne} compact tone="muted" onPress={() => onAside(card.name)} />
            </View>
          </View>
        ))}
      </Grid>
      {view.toggle && <OutlineButton label={view.toggle} compact tone="muted" onPress={onAll} style={styles.start} />}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------- the profile's boxes

/** On a character's profile (Overview): their voice, the lines they say, and their looks checked against the pages. */
export function ProfilePageBoxes({ open, entry, profile }: { open: OpenCast; entry: Entry; profile: CharacterProfile | null }) {
  void profile;
  const lib = useLibrary();
  const openChapter = useOpenChapter(open);
  const { cast, novelId } = open;
  const textVersion = lib.novels.versionOf(novelId, ['chapterContents']);
  const stored = () => open.service.storedChapters(novelId);

  const v = voiceInputs(cast, entry.id);
  const prints = useReading(readingKey(v.inputs, textVersion), () => voicePrintsJob(stored(), cast.documentIds, v.people)(), []);
  const w = wordsInputs(cast, entry.id);
  const lines = useReading(readingKey(w.inputs, textVersion), () => spokenJob(stored(), cast.documentIds, w.names)(), []);
  const l = looksInputs(cast, entry.id);
  const seen = useReading(readingKey(l.inputs, textVersion), () => looksJob(stored(), cast.documentIds, l.names, l.others)(), []);
  const [all, setAll] = useState(false);

  const voice = theirVoice(cast, entry.id, prints ?? null);
  const words = inTheirWords(cast, lines ?? null, all);
  const looks = againstYourPages(cast, entry.id, seen ?? null);
  const reading = prints === undefined || lines === undefined || seen === undefined;

  return (
    <>
      {reading && <Muted>{readingTheBook}</Muted>}
      {voice && (
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{voice.title.toUpperCase()}</Text>
          <Muted>{voice.caption}</Muted>
          {voice.meters.map((m) => (
            <View key={m.label} style={styles.meter} accessible accessibilityLabel={m.semanticsLabel}>
              <Text style={styles.meterLabel}>{m.label}</Text>
              <View style={styles.bar}>
                <View style={[styles.barPart, { width: `${m.part * 100}%` }]} />
                {m.mark !== null && <View style={[styles.tick, { left: `${m.mark * 100}%` }]} />}
              </View>
              <Text style={styles.meterValue}>{m.said}</Text>
            </View>
          ))}
          {voice.key && (
            <View style={styles.head}>
              <View style={[styles.tick, styles.keyTick]} />
              <Text style={styles.italic}>{voice.key}</Text>
            </View>
          )}
          {voice.traits.map((t) => (
            <Text key={t} style={styles.says}>
              {t}
            </Text>
          ))}
          {voice.signature && (
            <>
              <Text style={styles.signature}>{voice.signature.heading}</Text>
              <View style={styles.row}>
                {voice.signature.words.map((s) => (
                  <View key={s} style={styles.word}>
                    <Text style={styles.wordText}>{s}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
          {voice.soundsLike && (
            <View style={[styles.like, voice.soundsLike.alike && styles.alike]}>
              <Icon name={iconOf(voice.soundsLike.icon)} size={20} color={voice.soundsLike.alike ? colors.danger : colors.gold} />
              <Text style={[styles.text, styles.flex]}>{voice.soundsLike.text}</Text>
            </View>
          )}
        </Panel>
      )}
      {words && (
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{words.title.toUpperCase()}</Text>
          <Muted>{words.caption}</Muted>
          {words.lines.map((line, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${line.semanticsLabel}. ${line.chapter}`}
              onPress={() => openChapter(line.read.nodeId)}
              style={({ pressed }) => [styles.line, pressed && { backgroundColor: colors.elevated }]}
            >
              <Text style={styles.bigQuote}>“</Text>
              <View style={styles.flex}>
                <Text style={styles.spoken} numberOfLines={6}>
                  {line.text}
                </Text>
                <Text style={styles.chapter}>{line.chapter}</Text>
              </View>
              <Icon name="chevron-right" size={18} />
            </Pressable>
          ))}
          {words.toggle && <OutlineButton label={words.toggle} compact tone="muted" onPress={() => setAll(!all)} style={styles.start} />}
        </Panel>
      )}
      {looks && (
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{looks.title.toUpperCase()}</Text>
          <Muted>{looks.caption}</Muted>
          {looks.rows.map((r) => (
            <View key={r.check.feature} style={styles.lookRow}>
              <View style={styles.cardTop}>
                <Icon name={iconOf(r.icon)} size={20} color={r.tint === 'error' ? colors.danger : r.tint === 'primary' ? colors.gold : colors.success} />
                <Text style={[styles.lookLine, styles.flex]}>{r.line}</Text>
              </View>
              {r.presses && (
                <View style={[styles.row, styles.lookPresses]}>
                  <OutlineButton label={r.presses.read.label} icon="book-open-variant" compact tone="muted" onPress={() => openChapter(r.presses!.read.there.nodeId)} />
                  <OutlineButton label={r.presses.record.label} compact onPress={() => open.now((c) => recordPageLook(c, entry.id, r.check))} />
                </View>
              )}
            </View>
          ))}
        </Panel>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  panels: { gap: space.md, marginBottom: space.sm },
  panel: { gap: space.sm },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  stripHeading: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.gold },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  noteText: { fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { gap: space.sm, paddingTop: 14, paddingHorizontal: 12, paddingBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  waitCard: { borderRadius: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cardTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  cardSaid: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted },
  italic: { fontFamily: fonts.bookItalic, fontSize: 13, color: colors.muted },
  pair: { width: 72, height: 50 },
  pairFace: { position: 'absolute', top: 0, left: 0, width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.background, overflow: 'hidden' },
  pairImage: { width: 42, height: 42, borderRadius: 21 },
  pairAsk: { position: 'absolute', left: 26, top: 30, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.background, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  pairAskText: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '800', color: colors.onGold },
  choice: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.field },
  choiceText: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  checkNote: { gap: space.sm, padding: space.md, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.background },
  noteHeading: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.gold },
  says: { fontFamily: fonts.ui, fontSize: 15.5, lineHeight: 22, color: colors.text },
  who: { width: 72, alignItems: 'center', gap: 2 },
  whoName: { fontFamily: fonts.ui, fontSize: 12, color: colors.text, textAlign: 'center' },
  unknown: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  unknownText: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '700', color: colors.gold },
  said: { fontFamily: fonts.bookItalic, fontSize: 14, lineHeight: 21, color: colors.text },
  mono: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  monoText: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700' },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  meter: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 },
  meterLabel: { width: 104, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  bar: { flex: 1, height: 14, justifyContent: 'center' },
  barPart: { position: 'absolute', left: 0, top: 4, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  tick: { position: 'absolute', top: 0, width: 2, height: 14, marginLeft: -1, backgroundColor: colors.muted },
  keyTick: { position: 'relative', height: 12, marginLeft: 0 },
  meterValue: { width: 76, fontFamily: fonts.ui, fontSize: 14, color: colors.text, textAlign: 'right' },
  signature: { fontFamily: fonts.ui, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.6, color: colors.gold, marginTop: space.xs },
  word: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.border },
  wordText: { fontFamily: fonts.bookItalic, fontSize: 13, color: colors.text },
  like: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(28,32,45,0.4)' },
  alike: { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.5)' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  bigQuote: { alignSelf: 'flex-start', fontFamily: fonts.book, fontSize: 40, lineHeight: 40, color: colors.gold },
  spoken: { fontFamily: fonts.bookItalic, fontSize: 18, lineHeight: 26, color: colors.text },
  chapter: { fontFamily: fonts.ui, fontSize: 11.5, fontWeight: '700', color: colors.gold, marginTop: 2 },
  lookRow: { gap: space.xs, paddingVertical: space.xs },
  lookLine: { fontFamily: fonts.ui, fontSize: 16, lineHeight: 23, color: colors.text },
  lookPresses: { marginLeft: 32 },
});
