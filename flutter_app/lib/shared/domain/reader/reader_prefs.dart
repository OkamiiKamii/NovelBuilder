import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../json.dart';
import 'book.dart';

/// How the reader looks: belongs to the person reading on this device, never to the novel. The same choices, ranges
/// and defaults as the original app. Only how text is shown: nothing here changes what is stored.
enum ReaderFlow { paged, scroll }

enum ReaderFont {
  book('Book serif'),
  garamond('Garamond'),
  charter('Charter'),
  georgia('Georgia'),
  sans('Clean sans'),
  humanist('Humanist sans');

  const ReaderFont(this.label);
  final String label;
}

enum ParagraphStyle {
  auto('As the format prints them'),
  indent('Indented'),
  spaced('Spaced apart');

  const ParagraphStyle(this.label);
  final String label;
}

enum ReaderScheme {
  white('Clean white', 0xFFFFFFFF, 0xFF1B1B1B),
  sepia('Sepia', 0xFFF4ECD8, 0xFF3B2F20),
  dark('Dark / OLED', 0xFF000000, 0xFFD6D6D6),
  custom('Custom contrast', 0, 0);

  const ReaderScheme(this.label, this.background, this.text);
  final String label;
  final int background;
  final int text;
}

enum ReaderDevice {
  phone('Phone', 360, 680),
  ereader('E-reader', 500, 700),
  tablet('Tablet', 700, 920);

  const ReaderDevice(this.label, this.width, this.height);
  final String label;
  final double width;
  final double height;
}

typedef ReaderRange = ({double min, double max, double step});

const readerSizeRange = (min: 13.0, max: 28.0, step: 1.0);
const readerLeadingRange = (min: 1.2, max: 2.2, step: 0.05);

/// The longest a line may be, in characters.
const readerMeasureRange = (min: 36.0, max: 90.0, step: 2.0);

/// First-line indent, in ems.
const readerIndentRange = (min: 0.0, max: 3.0, step: 0.25);

/// Space between paragraphs when they are spaced apart, in lines.
const readerSpacingRange = (min: 0.0, max: 2.0, step: 0.1);

@immutable
class ReaderPrefs {
  const ReaderPrefs({
    this.format = BookFormat.novel,
    this.flow = ReaderFlow.paged,
    this.font = ReaderFont.book,
    this.size = 18,
    this.leading = 1.55,
    this.measure = 66,
    this.paragraphs = ParagraphStyle.auto,
    this.indent = 1.5,
    this.spacing = 0.8,
    this.justify = true,
    this.scheme = ReaderScheme.white,
    this.customBg = '#fdf6e3',
    this.customText = '#073642',
    this.device = ReaderDevice.ereader,
  });

  /// Reads stored preferences defensively: anything missing or invalid falls back to its default.
  factory ReaderPrefs.fromJson(Object? json) {
    const base = ReaderPrefs();
    final m = mapOrNull(json) ?? const {};
    T one<T extends Enum>(List<T> values, Object? v, T fallback) =>
        values.where((x) => x.name == v).firstOrNull ?? fallback;
    double within(Object? v, ReaderRange r, double fallback) {
      final n = numOrNull(v);
      return n == null ? fallback : n.toDouble().clamp(r.min, r.max);
    }

    String colour(Object? v, String fallback) =>
        v is String && RegExp(r'^#[0-9a-f]{6}$', caseSensitive: false).hasMatch(v) ? v.toLowerCase() : fallback;
    return ReaderPrefs(
      format: one(BookFormat.values, m['format'], base.format),
      flow: one(ReaderFlow.values, m['flow'], base.flow),
      font: one(ReaderFont.values, m['font'], base.font),
      size: within(m['size'], readerSizeRange, base.size),
      leading: within(m['leading'], readerLeadingRange, base.leading),
      measure: within(m['measure'], readerMeasureRange, base.measure),
      paragraphs: one(ParagraphStyle.values, m['paragraphs'], base.paragraphs),
      indent: within(m['indent'], readerIndentRange, base.indent),
      spacing: within(m['spacing'], readerSpacingRange, base.spacing),
      justify: m['justify'] is bool ? m['justify']! as bool : base.justify,
      scheme: one(ReaderScheme.values, m['scheme'], base.scheme),
      customBg: colour(m['customBg'], base.customBg),
      customText: colour(m['customText'], base.customText),
      device: one(ReaderDevice.values, m['device'], base.device),
    );
  }

  final BookFormat format;

  /// Turn pages, or scroll one long column. A web serial always scrolls.
  final ReaderFlow flow;
  final ReaderFont font;

  /// In logical pixels.
  final double size;
  final double leading;
  final double measure;
  final ParagraphStyle paragraphs;
  final double indent;
  final double spacing;
  final bool justify;
  final ReaderScheme scheme;
  final String customBg;
  final String customText;
  final ReaderDevice device;

  JsonMap toJson() => {
    'format': format.name,
    'flow': flow.name,
    'font': font.name,
    'size': size,
    'leading': leading,
    'measure': measure,
    'paragraphs': paragraphs.name,
    'indent': indent,
    'spacing': spacing,
    'justify': justify,
    'scheme': scheme.name,
    'customBg': customBg,
    'customText': customText,
    'device': device.name,
  };

  ReaderPrefs copyWith({
    BookFormat? format,
    ReaderFlow? flow,
    ReaderFont? font,
    double? size,
    double? leading,
    double? measure,
    ParagraphStyle? paragraphs,
    double? indent,
    double? spacing,
    bool? justify,
    ReaderScheme? scheme,
    String? customBg,
    String? customText,
    ReaderDevice? device,
  }) => ReaderPrefs.fromJson({
    ...toJson(),
    'format': ?format?.name,
    'flow': ?flow?.name,
    'font': ?font?.name,
    'size': ?size,
    'leading': ?leading,
    'measure': ?measure,
    'paragraphs': ?paragraphs?.name,
    'indent': ?indent,
    'spacing': ?spacing,
    'justify': ?justify,
    'scheme': ?scheme?.name,
    'customBg': ?customBg,
    'customText': ?customText,
    'device': ?device?.name,
  });

  @override
  bool operator ==(Object other) => other is ReaderPrefs && jsonEquals(other.toJson(), toJson());

  @override
  int get hashCode => Object.hashAll(toJson().values);
}

/// What the reader actually draws with, once "auto" and the format have been worked out.
@immutable
class ResolvedLook {
  const ResolvedLook({
    required this.flow,
    required this.indented,
    required this.justify,
    required this.background,
    required this.text,
  });
  final ReaderFlow flow;
  final bool indented;
  final bool justify;

  /// `#rrggbb`.
  final String background;
  final String text;
}

ResolvedLook resolveLook(ReaderPrefs prefs) {
  final serial = prefs.format == BookFormat.serial;
  final indented = prefs.paragraphs == ParagraphStyle.auto ? !serial : prefs.paragraphs == ParagraphStyle.indent;
  String hex(int argb) => '#${(argb & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
  final custom = prefs.scheme == ReaderScheme.custom;
  return ResolvedLook(
    flow: serial ? ReaderFlow.scroll : prefs.flow,
    indented: indented,
    justify: prefs.justify && !serial,
    background: custom ? prefs.customBg : hex(prefs.scheme.background),
    text: custom ? prefs.customText : hex(prefs.scheme.text),
  );
}

double _channel(String hex, int at) {
  final value = int.parse(hex.substring(at, at + 2), radix: 16) / 255;
  return value <= 0.03928 ? value / 12.92 : math.pow((value + 0.055) / 1.055, 2.4).toDouble();
}

double _luminance(String hex) => 0.2126 * _channel(hex, 1) + 0.7152 * _channel(hex, 3) + 0.0722 * _channel(hex, 5);

/// The contrast between two `#rrggbb` colours as WCAG measures it, from 1 (none) to 21 (black on white), to one decimal.
double contrastOf(String a, String b) {
  final x = math.max(_luminance(a), _luminance(b));
  final y = math.min(_luminance(a), _luminance(b));
  return ((x + 0.05) / (y + 0.05) * 10).round() / 10;
}

String contrastVerdict(double ratio) =>
    ratio >= 7 ? 'comfortable for long reading' : (ratio >= 4.5 ? 'readable' : 'too faint to read comfortably');

/// Where someone had got to in a book, on this device.
@immutable
class Bookmark {
  const Bookmark({required this.sectionId, required this.fraction, required this.furthest});

  static Bookmark? fromJson(Object? json) {
    final m = mapOrNull(json);
    if (m == null || m['sectionId'] is! String) return null;
    return Bookmark(
      sectionId: m['sectionId']! as String,
      fraction: (numOrNull(m['fraction']) ?? 0).toDouble().clamp(0, 1),
      furthest: (numOrNull(m['furthest']) ?? 0).toDouble().clamp(0, 1),
    );
  }

  final String sectionId;
  final double fraction;

  /// The furthest they have read, as a share of the story.
  final double furthest;

  JsonMap toJson() => {'sectionId': sectionId, 'fraction': fraction, 'furthest': furthest};
}
