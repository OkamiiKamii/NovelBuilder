import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/editor/find_replace.dart';
import 'package:novel_builder/features/write/writing_prefs.dart';
import 'package:super_editor/super_editor.dart';

double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  return (la > lb ? la + 0.05 : lb + 0.05) / (la > lb ? lb + 0.05 : la + 0.05);
}

void main() {
  group('writing preferences', () {
    test('defaults as in the original app: phones smaller and full width', () {
      final phone = WritingPrefs.defaults(DeviceForm.phone);
      final desktop = WritingPrefs.defaults(DeviceForm.desktop);
      expect((phone.fontSize, phone.lineHeight, phone.width), (17.0, 1.6, WritingWidth.full));
      expect((desktop.fontSize, desktop.lineHeight, desktop.width), (18.0, 1.7, WritingWidth.medium));
      expect(desktop.font, WritingFont.serif);
      expect(desktop.paragraphSpacing, 0);
    });

    test('stored values out of range or unknown fall back safely; round trip keeps them', () {
      final p = WritingPrefs.fromJson({
        'fontSize': 99,
        'lineHeight': 0.2,
        'paragraphSpacing': 'lots',
        'width': 'giant',
        'font': 'mono',
      }, DeviceForm.desktop);
      expect(
        (p.fontSize, p.lineHeight, p.paragraphSpacing, p.width, p.font),
        (28.0, 1.2, 0.0, WritingWidth.medium, WritingFont.mono),
      );
      expect(WritingPrefs.fromJson(p.toJson(), DeviceForm.desktop), p);
      expect(WritingPrefs.fromJson('not a map', DeviceForm.phone), WritingPrefs.defaults(DeviceForm.phone));
    });

    test('every page colour is readable (WCAG AA, 4.5:1)', () {
      for (final page in WritingPage.values) {
        final c = pageColors(page);
        if (c == null) continue;
        expect(contrast(c.text, c.background), greaterThanOrEqualTo(4.5), reason: page.name);
        expect(contrast(c.muted, c.background), greaterThanOrEqualTo(4.5), reason: '${page.name} muted');
      }
    });

    test('fonts are ones already on the device: nothing is downloaded', () {
      expect(fontFor(WritingFont.serif, TargetPlatform.iOS).family, 'Georgia');
      expect(fontFor(WritingFont.mono, TargetPlatform.macOS).family, 'Menlo');
      expect(fontFor(WritingFont.serif, TargetPlatform.android).family, 'serif');
      expect(fontFor(WritingFont.sans, TargetPlatform.android).family, isNull);
    });
  });

  group('find and replace', () {
    MutableDocument doc() => MutableDocument(
      nodes: [
        ParagraphNode(id: 'a', text: AttributedText('The gate. The Gatekeeper opened the gate.')),
        ParagraphNode(
          id: 'b',
          text: AttributedText('No gates here; İstanbul gate.')
            ..addAttribution(boldAttribution, const SpanRange(24, 27)),
        ),
      ],
    );

    test('finds every place, in reading order, by case and whole words', () {
      final d = doc();
      expect(findInDocument(d, 'gate').length, 5);
      expect(findInDocument(d, 'Gate', matchCase: true), [const TextMatch('a', 14, 18)]);
      expect(findInDocument(d, 'gate', wholeWords: true).map((m) => (m.nodeId, m.start)), [
        ('a', 4),
        ('a', 36),
        ('b', 24),
      ]);
      expect(findInDocument(d, ''), isEmpty);
    });

    test('positions stay right after characters that grow when lower-cased', () {
      final m = findInDocument(doc(), 'gate', wholeWords: true).last;
      expect('No gates here; İstanbul gate.'.substring(m.start, m.end), 'gate');
    });

    test('replace all keeps formatting and one Undo reverts every replacement', () {
      final d = doc();
      final composer = MutableDocumentComposer();
      final editor = Editor(
        editables: {Editor.documentKey: d, Editor.composerKey: composer},
        requestHandlers: List.of(defaultRequestHandlers.cast<EditRequestHandler>()),
        isHistoryEnabled: true,
      );
      editor.execute(replaceRequests(d, findInDocument(d, 'gate', wholeWords: true), 'door'));
      final a = (d.getNodeById('a')! as TextNode).text;
      final b = (d.getNodeById('b')! as TextNode).text;
      expect(a.toPlainText(), 'The door. The Gatekeeper opened the door.');
      expect(b.toPlainText(), 'No gates here; İstanbul door.');
      expect(b.getAllAttributionsAt(24), contains(boldAttribution), reason: 'the replaced word stays bold');
      editor.undo();
      expect((d.getNodeById('a')! as TextNode).text.toPlainText(), 'The gate. The Gatekeeper opened the gate.');
      expect((d.getNodeById('b')! as TextNode).text.toPlainText(), 'No gates here; İstanbul gate.');
    });
  });
}
