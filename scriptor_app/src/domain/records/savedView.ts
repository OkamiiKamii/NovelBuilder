// Views the author has named (`savedViews`). A port of flutter_app/lib/shared/domain/records/saved_view.dart.

import { type JsonMap, mapOrNull, str } from '../json';
import { JsonRecord, strings } from './jsonRecord';

/** A way of looking at the project that the author has named: a view, its filters, layers, scale and layout, and the
 * records it names by id. It never copies records, and turning its view off never deletes it. */
export class SavedView extends JsonRecord {
  /** The view it belongs to (`timeline`, `places`…), kept as written even if a later version renames views. */
  get view(): string {
    return str(this.raw['view']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get filter(): JsonMap {
    return mapOrNull(this.raw['filter']) ?? {};
  }
  /** `visual` or `list`. */
  get mode(): 'visual' | 'list' {
    return this.raw['mode'] === 'list' ? 'list' : 'visual';
  }
  get layers(): string[] {
    return strings(this.raw['layers']);
  }
  get scale(): JsonMap | null {
    return mapOrNull(this.raw['scale']);
  }
  get layout(): JsonMap {
    return mapOrNull(this.raw['layout']) ?? {};
  }

  withFields(changes: JsonMap): SavedView {
    return new SavedView(this.merged(changes));
  }
}
