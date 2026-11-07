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
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      ),
      // A visible focus ring for keyboard users, in the accent colour.
      focusColor: p.accent.withValues(alpha: 0.24),
    );
  }
}
