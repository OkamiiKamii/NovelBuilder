import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:super_editor/super_editor.dart';

import '../../shared/data/providers.dart';
import '../../shared/domain/text/book_setting.dart';

/// SET LIKE A BOOK on the page (`shared/domain/text/book_setting.dart` has the rules): the chapter opens with a raised
/// initial in the book's heading face and its accent, the first words in small capitals, and every scene break the
/// writer types (`***`, `#`) is centred and spaced as a printer's ornament. Drawn by the editor's layout (a style
/// phase), never put in the text; the words stay exactly as typed, and the export is untouched.

/// The setting that remembers it, on this device.
const bookSettingKey = 'write.bookSetting';

/// Whether the page is set like a book. On unless turned off, on this device.
class BookSettingOn extends Notifier<bool> {
  @override
  bool build() => ref.watch(settingsStoreProvider).read(bookSettingKey) != false;

  void set(bool on) {
    state = on;
    ref.read(settingsStoreProvider).write(bookSettingKey, on);
  }
}

final bookSettingProvider = NotifierProvider<BookSettingOn, bool>(BookSettingOn.new);

/// The chapter's raised initial.
class InitialAttribution implements Attribution {
  const InitialAttribution();

  @override
  String get id => 'book-initial';

  @override
  bool canMergeWith(Attribution other) => other is InitialAttribution;
}

/// The opening words, in small capitals.
class SmallCapsAttribution implements Attribution {
  const SmallCapsAttribution();

  @override
  String get id => 'book-small-caps';

  @override
  bool canMergeWith(Attribution other) => other is SmallCapsAttribution;
}

/// The look of the page as a book: what to draw with.
typedef BookLook = ({Color accent, String? initialFamily, bool on});

/// Sets the page like a book, by the layout only.
class BookSetter extends SingleColumnLayoutStylePhase {
  BookLook? _look;

  set look(BookLook value) {
    if (value == _look) return;
    _look = value;
    markDirty();
  }

  @override
  SingleColumnLayoutViewModel style(Document document, SingleColumnLayoutViewModel viewModel) {
    final look = _look;
    if (look == null || !look.on) return viewModel;
    var opened = false;
    var changed = false;
    final out = <SingleColumnLayoutComponentViewModel>[];
    for (final vm in viewModel.componentViewModels) {
      if (vm is ParagraphComponentViewModel) {
        final plain = vm.text.toPlainText();
        final paragraph = vm.blockType == null || vm.blockType == paragraphAttribution;
        if (paragraph && isSceneBreak(plain)) {
          out.add(_ornament(vm.copy(), look));
          changed = true;
          continue;
        }
        if (!opened && paragraph && plain.trim().isNotEmpty) {
          opened = true;
          final opening = chapterOpening(plain);
          if (opening != null) {
            out.add(_opening(vm.copy(), opening, look));
            changed = true;
            continue;
          }
        }
      }
      out.add(vm);
    }
    if (!changed) return viewModel;
    return SingleColumnLayoutViewModel(padding: viewModel.padding, componentViewModels: out);
  }

  /// A scene break: centred, its marks spaced wide and in the accent.
  SingleColumnLayoutComponentViewModel _ornament(ParagraphComponentViewModel vm, BookLook look) {
    vm.textAlignment = TextAlign.center;
    // Room above and below, as a break in a book has.
    vm.padding = vm.padding.add(const EdgeInsets.symmetric(vertical: 10));
    final base = vm.textStyleBuilder;
    vm.textStyleBuilder = (attributions) {
      final style = base(attributions);
      final size = style.fontSize ?? 16;
      return style.copyWith(color: look.accent, fontSize: size * 1.3, letterSpacing: size * 0.9);
    };
    return vm;
  }

  /// The chapter's opening: the raised initial and the small capitals.
  SingleColumnLayoutComponentViewModel _opening(
    ParagraphComponentViewModel vm,
    ({int initialEnd, int capsEnd}) opening,
    BookLook look,
  ) {
    final text = vm.text.copy()..addAttribution(const InitialAttribution(), SpanRange(0, opening.initialEnd - 1));
    if (opening.capsEnd > opening.initialEnd) {
      text.addAttribution(const SmallCapsAttribution(), SpanRange(opening.initialEnd, opening.capsEnd - 1));
    }
    vm.text = text;
    final base = vm.textStyleBuilder;
    vm.textStyleBuilder = (attributions) {
      final style = base(attributions);
      if (attributions.any((a) => a is InitialAttribution)) {
        final size = style.fontSize ?? 16;
        return style.copyWith(
          fontSize: size * 2.6,
          height: 1.0,
          color: look.accent,
          fontFamily: look.initialFamily ?? style.fontFamily,
          fontWeight: FontWeight.w600,
        );
      }
      if (attributions.any((a) => a is SmallCapsAttribution)) {
        return style.copyWith(
          letterSpacing: (style.fontSize ?? 16) * 0.06,
          fontFeatures: const [FontFeature.enable('smcp'), FontFeature.enable('c2sc')],
        );
      }
      return style;
    };
    return vm;
  }
}
