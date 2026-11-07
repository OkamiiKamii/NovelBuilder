import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/widgets.dart' as pw;

void main() {
  test('the pdf package makes a PDF offline', () async {
    final doc = pw.Document()..addPage(pw.Page(build: (_) => pw.Text('Rain fell on the black gate.')));
    final bytes = await doc.save();
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
  });
}
