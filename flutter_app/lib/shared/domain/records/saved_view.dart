import '../json.dart';
import '../json_record.dart';

/// A way of looking at the project that the author has named: a view, its filters, layers, scale and layout, and the
/// records it names by id. It never copies records, and turning its view off never deletes it.
class SavedView extends JsonRecord {
  SavedView(super.raw);

  /// The view it belongs to (`timeline`, `places`…), kept as written even if a later version renames views.
  String get view => str(raw['view']);
  String get name => str(raw['name']);
  JsonMap get filter => mapOrNull(raw['filter']) ?? const {};

  /// `visual` or `list`.
  String get mode => raw['mode'] == 'list' ? 'list' : 'visual';
  List<String> get layers => strings(raw['layers']);
  JsonMap? get scale => mapOrNull(raw['scale']);
  JsonMap get layout => mapOrNull(raw['layout']) ?? const {};

  SavedView withFields(JsonMap changes) => SavedView(merged(changes));
}
