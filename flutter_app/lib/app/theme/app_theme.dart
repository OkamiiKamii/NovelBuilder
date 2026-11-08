import 'package:flutter/material.dart';

/// The palette of the original app (src/styles/global.css): parchment by day, midnight by night.
@immutable
class Palette {
  const Palette({
    required this.background,
    required this.surface,
    required this.sunken,
    required this.border,
    required this.text,
    required this.muted,
    required this.accent,
    required this.onAccent,
    required this.danger,
  });

  final Color background;
  final Color surface;
  final Color sunken;
  final Color border;
  final Color text;
  final Color muted;
  final Color accent;
  final Color onAccent;
  final Color danger;

  static const light = Palette(
    background: Color(0xFFF6F3EE),
    surface: Color(0xFFFFFDF9),
    sunken: Color(0xFFEDE8DF),
    border: Color(0xFFDDD5C8),
    text: Color(0xFF25211C),
    muted: Color(0xFF6F675C),
    accent: Color(0xFFB4532A),
    onAccent: Color(0xFFFFFFFF),
    danger: Color(0xFFB3261E),
  );

  /// The original dark theme reused the light accent; it is lightened here so accent text keeps at least 4.5:1 contrast.
  static const dark = Palette(
    background: Color(0xFF191714),
    surface: Color(0xFF22201C),
    sunken: Color(0xFF2B2823),
    border: Color(0xFF3A362F),
    text: Color(0xFFECE7DE),
    muted: Color(0xFFA0978A),
    accent: Color(0xFFE08A5F),
    onAccent: Color(0xFF1B0F08),
    danger: Color(0xFFF2867E),
  );
}

abstract final class AppTheme {
  static ThemeData light() => _build(Palette.light, Brightness.light);
  static ThemeData dark() => _build(Palette.dark, Brightness.dark);

  static ThemeData _build(Palette p, Brightness brightness) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: p.accent,
      onPrimary: p.onAccent,
      secondary: p.accent,
      onSecondary: p.onAccent,
      error: p.danger,
      onError: brightness == Brightness.light ? Colors.white : const Color(0xFF2B0B08),
      surface: p.surface,
      onSurface: p.text,
      onSurfaceVariant: p.muted,
      surfaceContainerLowest: p.background,
      surfaceContainerLow: p.background,
      surfaceContainer: p.sunken,
      surfaceContainerHigh: p.sunken,
      surfaceContainerHighest: p.sunken,
      outline: p.muted,
      outlineVariant: p.border,
    );
    final radius = BorderRadius.circular(10);
    final theme = _base(p, scheme, radius);
    // Page titles in the book's capitals (Cinzel, bundled), as the areas' own headings are; text stays in the UI face.
    TextStyle? capitals(TextStyle? s) =>
        s?.copyWith(fontFamily: 'Cinzel', fontWeight: FontWeight.w700, letterSpacing: (s.fontSize ?? 24) * 0.06);
    return _stationery(
      theme.copyWith(
        textTheme: theme.textTheme.copyWith(
          headlineLarge: capitals(theme.textTheme.headlineLarge),
          headlineMedium: capitals(theme.textTheme.headlineMedium),
          headlineSmall: capitals(theme.textTheme.headlineSmall),
        ),
      ),
      p,
      brightness,
    );
  }

  /// THE STATIONERY: what is pressed and what speaks, set like the rest of the book. Buttons are stamped labels
  /// (squared with softly rounded corners, lettered in the book's capitals; the main ones with a pressed, darker edge
  /// and a soft shadow), dialogs are cards of the book (paper with a thin edge, titled in capitals), and messages are
  /// slips of paper (ink on paper across the foot of the screen, under an accent rule).
  static ThemeData _stationery(ThemeData t, Palette p, Brightness brightness) {
    const label = RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(6)));
    const lettering = TextStyle(fontFamily: 'Cinzel', fontWeight: FontWeight.w700, letterSpacing: 0.7, fontSize: 14);
    final pressedEdge = Color.lerp(p.accent, Colors.black, 0.28)!;
    final dark = brightness == Brightness.dark;
    return t.copyWith(
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: label.copyWith(side: BorderSide(color: pressedEdge)),
          textStyle: lettering,
          elevation: 1.5,
          shadowColor: Colors.black.withValues(alpha: dark ? 0.6 : 0.35),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(shape: label, textStyle: lettering),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: label,
          textStyle: lettering,
          side: BorderSide(color: p.accent.withValues(alpha: 0.7)),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(shape: label, textStyle: lettering),
      ),
      dialogTheme: t.dialogTheme.copyWith(
        backgroundColor: p.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: p.border),
        ),
        titleTextStyle: TextStyle(
          fontFamily: 'Cinzel',
          fontWeight: FontWeight.w700,
          fontSize: 20,
          letterSpacing: 1.1,
          color: p.text,
        ),
      ),
      // THE SWITCHES AND TAGS OF THE BOOK: a choice between views (Covers / Spines, Cards / List / Ties, All /
      // Enabled) is a row of squared labels lettered in the book's capitals, the chosen one inked in the accent; a tag
      // is a small slip of paper with a thin edge, set in the book face; an on/off switch is brass when on.
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          shape: const WidgetStatePropertyAll(label),
          side: WidgetStatePropertyAll(BorderSide(color: p.accent.withValues(alpha: 0.7))),
          textStyle: const WidgetStatePropertyAll(
            TextStyle(fontFamily: 'Cinzel', fontWeight: FontWeight.w700, letterSpacing: 0.6, fontSize: 13),
          ),
          backgroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? p.accent : p.surface,
          ),
          foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? p.onAccent : p.text,
          ),
          iconColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.onAccent : p.accent),
          minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(3)),
          side: BorderSide(color: p.border),
        ),
        backgroundColor: p.surface,
        selectedColor: p.accent.withValues(alpha: 0.18),
        labelStyle: TextStyle(fontFamily: 'EB Garamond', fontSize: 15, color: p.text),
        side: BorderSide(color: p.border),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.onAccent : p.muted),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? const Color(0xFFC49A4C) : p.sunken,
        ),
        trackOutlineColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? const Color(0xFF8A6326) : p.border,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        // Fixed, so it always sits above the phone's bottom bar, even at the largest text sizes.
        behavior: SnackBarBehavior.fixed,
        backgroundColor: p.surface,
        elevation: 4,
        // A slip of paper across the foot, with an accent rule along its top edge.
        shape: Border(top: BorderSide(color: p.accent.withValues(alpha: 0.75), width: 2)),
        contentTextStyle: TextStyle(fontFamily: 'EB Garamond', fontSize: 15, height: 1.25, color: p.text),
        actionTextColor: p.accent,
        closeIconColor: p.muted,
      ),
    );
  }

  /// A ruled line along a field's foot, its top corners softly rounded where the slip of paper begins.
  static UnderlineInputBorder _rule(Color colour, {double width = 1}) => UnderlineInputBorder(
    borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
    borderSide: BorderSide(color: colour, width: width),
  );

  static ThemeData _base(Palette p, ColorScheme scheme, BorderRadius radius) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: p.background,
      dividerTheme: DividerThemeData(color: p.border, space: 1),
      cardTheme: CardThemeData(
        color: p.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: p.border),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: p.surface,
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: p.surface,
        indicatorColor: p.accent.withValues(alpha: 0.16),
        selectedIconTheme: IconThemeData(color: p.accent),
        selectedLabelTextStyle: TextStyle(color: p.accent, fontWeight: FontWeight.w600),
        unselectedLabelTextStyle: TextStyle(color: p.muted),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: p.surface,
        indicatorColor: p.accent.withValues(alpha: 0.16),
        // Material's default selected colour comes from a container colour this palette does not define,
        // which left the selected icon nearly invisible.
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(color: states.contains(WidgetState.selected) ? p.accent : p.muted),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 12,
            color: states.contains(WidgetState.selected) ? p.text : p.muted,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ),
      // THE LEDGER: a field is a line ruled on the paper, not a box: a slip of the page colour with a rule along its
      // foot (the accent, and heavier, while it is written in), its label in the book's capitals and its example in
      // the book's italic, as the margins of a ledger are lettered.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.surface,
        border: _rule(p.muted),
        enabledBorder: _rule(p.muted),
        focusedBorder: _rule(p.accent, width: 2),
        errorBorder: _rule(p.danger),
        focusedErrorBorder: _rule(p.danger, width: 2),
        disabledBorder: _rule(p.border),
        labelStyle: TextStyle(fontFamily: 'Cinzel', fontWeight: FontWeight.w600, letterSpacing: 0.8, color: p.muted),
        floatingLabelStyle: WidgetStateTextStyle.resolveWith(
          (states) => TextStyle(
            fontFamily: 'Cinzel',
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
            color: states.contains(WidgetState.error)
                ? p.danger
                : states.contains(WidgetState.focused)
                ? p.accent
                : p.muted,
          ),
        ),
        hintStyle: TextStyle(fontFamily: 'EB Garamond', fontStyle: FontStyle.italic, fontSize: 17, color: p.muted),
        prefixIconColor: WidgetStateColor.resolveWith(
          (states) => states.contains(WidgetState.focused) ? p.accent : p.muted,
        ),
      ),
      // A visible focus ring for keyboard users, in the accent colour.
      focusColor: p.accent.withValues(alpha: 0.24),
    );
  }
}
