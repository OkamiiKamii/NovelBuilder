import 'package:flutter/widgets.dart';

/// Window size classes. One place decides them, so every screen switches layout at the same widths.
enum WindowSize {
  /// Phones in portrait: bottom navigation, panels open as sheets.
  compact,

  /// Small tablets and narrow windows: a navigation rail without labels.
  medium,

  /// Desktops and large tablets: a labelled navigation rail and side panels.
  expanded;

  static const double mediumMin = 600;
  static const double expandedMin = 1000;

  static WindowSize ofWidth(double width) {
    if (width >= expandedMin) return expanded;
    if (width >= mediumMin) return medium;
    return compact;
  }

  static WindowSize of(BuildContext context) => ofWidth(MediaQuery.sizeOf(context).width);
}
