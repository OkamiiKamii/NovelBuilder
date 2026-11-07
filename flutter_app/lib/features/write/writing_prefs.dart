import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';
import '../../shared/domain/json.dart';

/// How the page looks while writing: font, size, spacing, width and page colour. Only how text is shown: nothing here
/// changes the stored text. The same choices, ranges and defaults as the original app.
enum WritingFont {
  serif('Serif'),
  sans('Sans'),
  mono('Mono');

  const WritingFont(this.label);
  final String label;
}

enum WritingWidth {
  narrow('Narrow', 560),
  medium('Medium', 720),
  wide('Wide', 920),
  full('Full', double.infinity);

  const WritingWidth(this.label, this.maxWidth);
  final String label;
  final double maxWidth;
}

/// The page's colours: the app's own theme, or a page of its own.
enum WritingPage {
  app('As the app'),
  light('Light'),
  sepia('Sepia'),
  dark('Dark');

  const WritingPage(this.label);
  final String label;
}

/// Which kind of device the preferences belong to. Each keeps its own, as in the original app: a phone's comfortable
/// text size is not a desktop's.
enum DeviceForm { phone, tablet, desktop }

DeviceForm deviceFormOf(BuildContext context) {
  final platform = Theme.of(context).platform;
  final desktop =
      platform == TargetPlatform.macOS || platform == TargetPlatform.windows || platform == TargetPlatform.linux;
  if (desktop) return DeviceForm.desktop;
  return MediaQuery.sizeOf(context).shortestSide >= 600 ? DeviceForm.tablet : DeviceForm.phone;
}

typedef Range = ({double min, double max, double step});

const fontSizeRange = (min: 14.0, max: 28.0, step: 1.0);
const lineHeightRange = (min: 1.2, max: 2.4, step: 0.1);

/// Space between paragraphs, in lines of text.
const paragraphSpacingRange = (min: 0.0, max: 2.0, step: 0.1);

@immutable
class WritingPrefs {
  const WritingPrefs({
    required this.font,
    required this.fontSize,
    required this.lineHeight,
    required this.paragraphSpacing,
    required this.width,
    required this.page,
  });

  factory WritingPrefs.defaults(DeviceForm form) => form == DeviceForm.phone
      ? const WritingPrefs(
          font: WritingFont.serif,
          fontSize: 17,
          lineHeight: 1.6,
          paragraphSpacing: 0,
          width: WritingWidth.full,
          page: WritingPage.app,
        )
      : const WritingPrefs(
          font: WritingFont.serif,
          fontSize: 18,
          lineHeight: 1.7,
          paragraphSpacing: 0,
          width: WritingWidth.medium,
          page: WritingPage.app,
        );

  /// Reads stored preferences defensively: anything missing, unknown or out of range falls back to its default.
  factory WritingPrefs.fromJson(Object? json, DeviceForm form) {
    final base = WritingPrefs.defaults(form);
    final m = mapOrNull(json) ?? const {};
    T one<T extends Enum>(List<T> values, Object? v, T fallback) =>
        values.where((x) => x.name == v).firstOrNull ?? fallback;
    double clamp(Object? v, Range r, double fallback) {
      final n = numOrNull(v);
      return n == null ? fallback : n.toDouble().clamp(r.min, r.max);
    }

    return WritingPrefs(
      font: one(WritingFont.values, m['font'], base.font),
      fontSize: clamp(m['fontSize'], fontSizeRange, base.fontSize),
      lineHeight: clamp(m['lineHeight'], lineHeightRange, base.lineHeight),
      paragraphSpacing: clamp(m['paragraphSpacing'], paragraphSpacingRange, base.paragraphSpacing),
      width: one(WritingWidth.values, m['width'], base.width),
      page: one(WritingPage.values, m['page'], base.page),
    );
  }

  final WritingFont font;
  final double fontSize;
  final double lineHeight;
  final double paragraphSpacing;
  final WritingWidth width;
  final WritingPage page;

  JsonMap toJson() => {
    'font': font.name,
    'fontSize': fontSize,
    'lineHeight': lineHeight,
    'paragraphSpacing': paragraphSpacing,
    'width': width.name,
    'page': page.name,
  };

  WritingPrefs copyWith({
    WritingFont? font,
    double? fontSize,
    double? lineHeight,
    double? paragraphSpacing,
    WritingWidth? width,
    WritingPage? page,
  }) => WritingPrefs(
    font: font ?? this.font,
    fontSize: fontSize ?? this.fontSize,
    lineHeight: lineHeight ?? this.lineHeight,
    paragraphSpacing: paragraphSpacing ?? this.paragraphSpacing,
    width: width ?? this.width,
    page: page ?? this.page,
  );

  @override
  bool operator ==(Object other) => other is WritingPrefs && jsonEquals(other.toJson(), toJson());

  @override
  int get hashCode => Object.hash(font, fontSize, lineHeight, paragraphSpacing, width, page);
}

/// Fonts already on every device: nothing is downloaded. Apple devices have Georgia and Menlo; Android has its own
/// serif and monospace faces.
({String? family, List<String> fallback}) fontFor(WritingFont font, TargetPlatform platform) {
  final apple = platform == TargetPlatform.iOS || platform == TargetPlatform.macOS;
  return switch (font) {
    WritingFont.serif => (
      family: apple ? 'Georgia' : 'serif',
      fallback: const ['Times New Roman', 'Noto Serif', 'serif'],
    ),
    WritingFont.mono => (family: apple ? 'Menlo' : 'monospace', fallback: const ['Courier New', 'monospace']),
    WritingFont.sans => (family: null, fallback: const []),
  };
}

/// The page's background and text colours, or null to follow the app's theme.
({Color background, Color text, Color muted})? pageColors(WritingPage page) => switch (page) {
  WritingPage.app => null,
  WritingPage.light => (
    background: const Color(0xFFFFFDF9),
    text: const Color(0xFF25211C),
    muted: const Color(0xFF6F675C),
  ),
  WritingPage.sepia => (
    background: const Color(0xFFF4ECD8),
    text: const Color(0xFF4A3A28),
    muted: const Color(0xFF6E5B43),
  ),
  WritingPage.dark => (
    background: const Color(0xFF191714),
    text: const Color(0xFFECE7DE),
    muted: const Color(0xFFA0978A),
  ),
};

String _key(DeviceForm form) => 'writing.prefs.${form.name}';

/// The preferences of each kind of device, remembered on it. Saved through autosave, so a failure shows.
class WritingPrefsNotifier extends Notifier<Map<DeviceForm, WritingPrefs>> {
  @override
  Map<DeviceForm, WritingPrefs> build() {
    final settings = ref.watch(settingsStoreProvider);
    return {for (final f in DeviceForm.values) f: WritingPrefs.fromJson(settings.read(_key(f)), f)};
  }

  void set(DeviceForm form, WritingPrefs prefs) {
    state = {...state, form: prefs};
    final settings = ref.read(settingsStoreProvider);
    ref
        .read(saveControllerProvider)
        .schedule('setting:${_key(form)}', () => settings.write(_key(form), prefs.toJson()));
  }

  /// Changes the preferences as they are now (not as they were when a control was drawn), so quick changes in a row
  /// all count.
  void update(DeviceForm form, WritingPrefs Function(WritingPrefs current) change) => set(form, change(state[form]!));

  void reset(DeviceForm form) => set(form, WritingPrefs.defaults(form));
}

final writingPrefsProvider = NotifierProvider<WritingPrefsNotifier, Map<DeviceForm, WritingPrefs>>(
  WritingPrefsNotifier.new,
);

/// Focus mode: only the text, no outline, toolbar or navigation. Not remembered: it is for the moment.
class FocusModeNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void set(bool on) => state = on;

  void toggle() => state = !state;
}

final focusModeProvider = NotifierProvider<FocusModeNotifier, bool>(FocusModeNotifier.new);
