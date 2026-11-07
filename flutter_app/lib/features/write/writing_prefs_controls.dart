import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'writing_prefs.dart';

/// The writing preferences of this kind of device, with a live sample. Used in the editor's "Aa" panel and in Settings.
class WritingPrefsControls extends ConsumerWidget {
  const WritingPrefsControls({super.key});

  static String formName(DeviceForm form) => switch (form) {
    DeviceForm.phone => 'phone',
    DeviceForm.tablet => 'tablet',
    DeviceForm.desktop => 'computer',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final form = deviceFormOf(context);
    final prefs = ref.watch(writingPrefsProvider)[form]!;
    final notifier = ref.read(writingPrefsProvider.notifier);
    void set(WritingPrefs Function(WritingPrefs) change) => notifier.update(form, change);
    final theme = Theme.of(context);
    final colors = pageColors(prefs.page);
    final font = fontFor(prefs.font, theme.platform);

    Widget chips<T>(String label, List<T> values, T selected, String Function(T) name, void Function(T) onSelected) =>
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: theme.textTheme.labelLarge),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final v in values)
                  ChoiceChip(label: Text(name(v)), selected: v == selected, onSelected: (_) => onSelected(v)),
              ],
            ),
          ],
        );

    Widget slider(String label, double value, Range range, String shown, void Function(double) onChanged) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: theme.textTheme.labelLarge)),
            Text(shown),
          ],
        ),
        Slider(
          value: value,
          min: range.min,
          max: range.max,
          divisions: ((range.max - range.min) / range.step).round(),
          label: shown,
          semanticFormatterCallback: (_) => shown,
          onChanged: (v) => onChanged(double.parse(v.toStringAsFixed(1))),
        ),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'These settings are for this ${formName(form)}. Each kind of device keeps its own. They change only how your '
          'text looks, never the text itself.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        // A sample of the page as it will look.
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colors?.background ?? theme.colorScheme.surface,
            border: Border.all(color: theme.colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            'The gate stood open, and nobody guarded it.',
            semanticsLabel: 'Sample of the writing page',
            style: TextStyle(
              fontFamily: font.family,
              fontFamilyFallback: font.fallback,
              fontSize: prefs.fontSize,
              height: prefs.lineHeight,
              color: colors?.text ?? theme.colorScheme.onSurface,
            ),
          ),
        ),
        const SizedBox(height: 12),
        chips('Font', WritingFont.values, prefs.font, (f) => f.label, (f) => set((p) => p.copyWith(font: f))),
        const SizedBox(height: 8),
        slider(
          'Text size',
          prefs.fontSize,
          fontSizeRange,
          '${prefs.fontSize.round()}',
          (v) => set((p) => p.copyWith(fontSize: v)),
        ),
        slider(
          'Line spacing',
          prefs.lineHeight,
          lineHeightRange,
          prefs.lineHeight.toStringAsFixed(1),
          (v) => set((p) => p.copyWith(lineHeight: v)),
        ),
        slider(
          'Space between paragraphs',
          prefs.paragraphSpacing,
          paragraphSpacingRange,
          prefs.paragraphSpacing == 0 ? 'None' : '${prefs.paragraphSpacing.toStringAsFixed(1)} lines',
          (v) => set((p) => p.copyWith(paragraphSpacing: v)),
        ),
        chips('Text width', WritingWidth.values, prefs.width, (w) => w.label, (w) => set((p) => p.copyWith(width: w))),
        const SizedBox(height: 12),
        chips('Page', WritingPage.values, prefs.page, (pg) => pg.label, (pg) => set((p) => p.copyWith(page: pg))),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(onPressed: () => notifier.reset(form), child: const Text('Back to the defaults')),
        ),
      ],
    );
  }
}
