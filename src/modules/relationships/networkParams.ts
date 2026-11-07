import { LAYERS, type Layer, type When } from './network';

/**
 * The relationship map's own filters in the page address, so a reload, Back,
 * a shared link or a saved view brings the same map back:
 *  rwhen    at | range | ever (absent: current); rat, rfrom, rto: chapters
 *  rtype    one relationship type
 *  rfaction a faction (any entry) whose people the map is about
 *  rfocus   the character the map is focused on; rdepth 2 for two steps
 *  rhide    hidden layers, comma separated; rall 1 to show characters with no ties
 */
export const NETWORK_PARAMS = ['rwhen', 'rat', 'rfrom', 'rto', 'rtype', 'rfaction', 'rfocus', 'rdepth', 'rhide', 'rall'] as const;

export interface NetworkState {
  when: When;
  type: string | null;
  factionId: string | null;
  focus: { id: string; depth: 1 | 2 } | null;
  hidden: Layer[];
  isolated: boolean;
}

export function readNetwork(params: URLSearchParams): NetworkState {
  const kind = params.get('rwhen');
  const when: When = kind === 'at' && params.get('rat') ? { kind: 'at', nodeId: params.get('rat')! } : kind === 'range' ? { kind: 'range', from: params.get('rfrom'), to: params.get('rto') } : kind === 'ever' ? { kind: 'ever' } : { kind: 'current' };
  const focus = params.get('rfocus');
  return {
    when,
    type: params.get('rtype'),
    factionId: params.get('rfaction'),
    focus: focus ? { id: focus, depth: params.get('rdepth') === '2' ? 2 : 1 } : null,
    hidden: (params.get('rhide') ?? '').split(',').filter((l): l is Layer => LAYERS.includes(l as Layer)),
    isolated: params.get('rall') === '1',
  };
}

/** The address changes for a state: every map parameter, set or cleared. */
export function networkAddress(state: NetworkState): Record<string, string | null> {
  const w = state.when;
  return {
    rwhen: w.kind === 'current' ? null : w.kind,
    rat: w.kind === 'at' ? w.nodeId : null,
    rfrom: w.kind === 'range' ? w.from : null,
    rto: w.kind === 'range' ? w.to : null,
    rtype: state.type,
    rfaction: state.factionId,
    rfocus: state.focus?.id ?? null,
    rdepth: state.focus?.depth === 2 ? '2' : null,
    rhide: state.hidden.length ? state.hidden.join(',') : null,
    rall: state.isolated ? '1' : null,
  };
}

/** What a saved view keeps of the map: the parameters that are set. Ids are kept as plain values, so copies of the novel re-point them. */
export const networkLayout = (state: NetworkState): Record<string, string> => Object.fromEntries(Object.entries(networkAddress(state)).filter((e): e is [string, string] => e[1] !== null));
