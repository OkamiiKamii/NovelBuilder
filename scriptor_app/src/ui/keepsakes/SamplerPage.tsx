// THE SAMPLER (FEATURES.md #346): the opening of the book as a reader's sample: a title page (the title, the author, a
// pull quote and the blurb), then the opening chapters to about 1,500 words, then how much more there is; shown as
// pages, and **Make the PDF** makes it a PDF to send to a beta reader, a writing group or an agent (Times on US
// Letter, as the Flutter app's PDF export sets it: src/domain/exchange/renderPdf.ts). A port of
// flutter_app/lib/features/progress/sampler_page.dart.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { shareBytesFile } from '../../data/files';
import { type Block, DividerBlock, HeadingBlock, ParagraphBlock } from '../../domain/exchange/compile';
import { PdfCannotDraw, renderPdf } from '../../domain/exchange/renderPdf';
import { samplerJob } from '../../domain/exchange/sampler';
import { samplerEndPage, samplerFile, samplerPageSize, samplerPages, whatIsInIt } from '../../domain/keepsakes/pages';
import { GoldButton, IconButton } from '../kit';
import { fonts, space } from '../theme';
import { Empty, KeepsakePage, Note, Waiting, useKeepsake, useReading } from './parts';

const ground = '#1B1916';
const light = '#F4EEDF';
const ink = '#221D17';
const paper = '#FBF8F1';

const textOf = (b: ParagraphBlock) => b.runs.map((r) => r.text).join('');

function PageBlock({ b }: { b: Block }) {
  if (b instanceof HeadingBlock) {
    if (b.role === 'title') return <Text style={[styles.body, styles.titleText]}>{b.text}</Text>;
    if (b.role === 'subtitle') return <Text style={[styles.body, styles.subtitle]}>{b.text}</Text>;
    return <Text style={[styles.body, styles.heading]}>{b.text}</Text>;
  }
  if (b instanceof DividerBlock) return <View style={styles.divider} />;
  if (b instanceof ParagraphBlock) {
    const centre = b.align === 'center';
    const italic = b.runs.length > 0 && b.runs[0].italic;
    return (
      <Text style={[styles.body, italic && styles.italic, centre ? styles.centred : styles.prose]}>
        {centre ? '' : ' '}
        {textOf(b)}
      </Text>
    );
  }
  return null;
}

function SamplePage({ blocks, number }: { blocks: Block[]; number: number | null }) {
  return (
    <View style={styles.page} accessible accessibilityLabel={number === null ? 'The title page' : `Page ${number} of the sample`}>
      <View style={[styles.flex, styles.clip, { justifyContent: samplerEndPage(blocks) ? 'center' : 'flex-start' }]}>
        {blocks.map((b, i) => (
          <PageBlock key={i} b={b} />
        ))}
      </View>
      <Text style={styles.number}>{number === null ? '' : `${number}`}</Text>
    </View>
  );
}

export function SamplerPage() {
  const open = useKeepsake('sampler');
  const sample = useReading(open, (b) =>
    samplerJob(b.stored, b.order, b.titles, { title: b.novel.title, author: b.novel.author, synopsis: b.novel.synopsis })(),
  ).value;
  const [at, setAt] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (open === null || sample === null) {
    return (
      <KeepsakePage title="The sampler" ground={ground} ink={light}>
        <Waiting ink={light} text={open === null ? 'No novel is open.' : undefined} />
      </KeepsakePage>
    );
  }
  if (sample.chapterCount === 0) {
    return (
      <KeepsakePage title="The sampler" ground={ground} ink={light}>
        <Empty ink={light} text="Nothing to sample yet. Once a chapter has words in it, its opening is set here as pages." />
      </KeepsakePage>
    );
  }
  const pages = samplerPages(sample);
  const i = Math.min(at, pages.length - 1);
  const make = async () => {
    setWorking(true);
    setMessage(null);
    try {
      // Laid out a moment after the button shows it is working.
      await new Promise((r) => setTimeout(r, 30));
      await shareBytesFile(samplerFile(sample.title), renderPdf(sample), 'application/pdf');
    } catch (e) {
      setMessage(e instanceof PdfCannotDraw ? e.message : `The sampler could not be made: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setWorking(false);
    }
  };
  return (
    <KeepsakePage title="The sampler" ground={ground} ink={light}>
      <Note ink={light} text="The opening of your book as a reader’s sample, to send to a beta reader, a writing group or an agent." />
      <SamplePage blocks={pages[i]} number={i === 0 ? null : i + 1} />
      <View style={styles.turns}>
        <IconButton icon="chevron-left" label="The page before" color={light} onPress={() => setAt(Math.max(0, i - 1))} />
        <Note ink={light} text={`${i + 1} of ${pages.length}`} />
        <IconButton icon="chevron-right" label="The next page" color={light} onPress={() => setAt(Math.min(pages.length - 1, i + 1))} />
      </View>
      <Note ink={light} text={whatIsInIt(sample)} />
      <GoldButton label="Make the PDF" icon="file-pdf-box" disabled={working} onPress={() => void make()} />
      {message ? <Note ink={light} text={message} /> : null}
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  clip: { overflow: 'hidden' },
  page: { width: samplerPageSize.width, height: samplerPageSize.height, maxWidth: '100%', backgroundColor: paper, borderRadius: 2, paddingHorizontal: 36, paddingTop: 30, paddingBottom: 18, elevation: 8 },
  body: { fontFamily: fonts.book, fontSize: 7.5, lineHeight: 11, color: ink },
  italic: { fontFamily: fonts.bookItalic },
  titleText: { fontSize: 17, lineHeight: 24, fontWeight: '700', textAlign: 'center', marginTop: 44, marginBottom: 6 },
  subtitle: { fontFamily: fonts.bookItalic, fontSize: 9, lineHeight: 13, textAlign: 'center', marginBottom: 8 },
  heading: { fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center', marginTop: 30, marginBottom: 14 },
  divider: { width: 40, height: 0.6, backgroundColor: '#221D1788', alignSelf: 'center', marginVertical: 10 },
  centred: { textAlign: 'center', marginBottom: 8 },
  prose: { textAlign: 'justify', marginBottom: 3 },
  number: { height: 12, fontFamily: fonts.book, fontSize: 7, color: ink, opacity: 0.6, textAlign: 'center' },
  turns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
