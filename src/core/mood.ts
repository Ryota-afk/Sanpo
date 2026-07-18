import type { MoodFilter } from '../types';

/**
 * 気分フィルターの判定に必要な、1エッジ分の道路属性。
 */
export interface EdgeAttributes {
  highway: string;
  lit?: string; // OSM の lit タグ(yes/no/未定義)
  surface?: string; // OSM の surface タグ(舗装種別)
  sidewalk?: string; // OSM の sidewalk タグ
  foot?: string; // OSM の foot タグ(designated など)
  service?: string; // OSM の service タグ(alley など)
  width?: string; // OSM の width タグ(メートル)
  lanes?: string; // OSM の lanes タグ
  inResidentialLanduse: boolean;
  inGreen: boolean; // 公園・緑地・並木のそば
  nearWater: boolean; // 河川・水域のそば
  nearLamp: boolean; // 街灯のそば
}

const AVENUE_HIGHWAYS = new Set(['primary', 'secondary', 'trunk']);
const RESIDENTIAL_HIGHWAYS = new Set(['residential', 'living_street']);
const QUIET_HIGHWAYS = new Set(['footway', 'path', 'pedestrian']);
const PAVED_SURFACES = new Set([
  'paved',
  'asphalt',
  'concrete',
  'concrete:plates',
  'concrete:lanes',
  'paving_stones',
  'sett',
  'chipseal',
  'metal',
]);
const UNPAVED_SURFACES = new Set([
  'unpaved',
  'ground',
  'earth',
  'dirt',
  'grass',
  'gravel',
  'fine_gravel',
  'sand',
  'mud',
  'pebblestone',
  'compacted',
  'wood',
]);
// surface 未指定でも、これらの道は概ね舗装されているとみなす。
const LIKELY_PAVED_HIGHWAYS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'living_street',
  'pedestrian',
  'unclassified',
]);
const SIDEWALK_VALUES = new Set(['yes', 'both', 'left', 'right', 'separate']);
// 細い道とみなす highway。
const NARROW_HIGHWAYS = new Set([
  'living_street',
  'service',
  'track',
  'steps',
  'path',
]);

function isPaved(attr: EdgeAttributes): boolean {
  if (attr.surface) {
    if (PAVED_SURFACES.has(attr.surface)) return true;
    if (UNPAVED_SURFACES.has(attr.surface)) return false;
  }
  // surface 未指定は highway 種別から推定する。
  return LIKELY_PAVED_HIGHWAYS.has(attr.highway);
}

function hasSidewalk(attr: EdgeAttributes): boolean {
  if (attr.sidewalk && SIDEWALK_VALUES.has(attr.sidewalk)) return true;
  // 歩行者専用・歩道そのものは「歩道あり」の安全な道として扱う。
  if (attr.highway === 'footway' || attr.highway === 'pedestrian') return true;
  if (attr.foot === 'designated') return true;
  return false;
}

function isNarrow(attr: EdgeAttributes): boolean {
  if (attr.service === 'alley') return true;
  if (NARROW_HIGHWAYS.has(attr.highway)) return true;
  const width = attr.width ? parseFloat(attr.width) : NaN;
  if (!Number.isNaN(width) && width > 0 && width <= 3.5) return true;
  const lanes = attr.lanes ? parseInt(attr.lanes, 10) : NaN;
  if (attr.highway === 'residential' && lanes === 1) return true;
  return false;
}

/**
 * エッジが合致する気分フィルターの集合を返す。
 *
 * 精度向上ポイント:
 * - 明るい/暗いは lit タグに加え、近くの街灯(street_lamp)の有無を併用する。
 *   → lit タグが未整備でも街灯が地図にあれば「明るい」と判定できる。
 *   → 暗い道は「lit=no」または「lit未指定かつ街灯も無い」に限定し、過検出を抑える。
 */
export function classifyEdge(attr: EdgeAttributes): Set<MoodFilter> {
  const moods = new Set<MoodFilter>();

  // 明るい道: lit=yes、または近くに街灯がある
  if (attr.lit === 'yes' || attr.nearLamp) moods.add('bright');

  // 暗い道: lit=no、または(lit未指定 かつ 近くに街灯が無い)
  if (attr.lit === 'no' || (attr.lit == null && !attr.nearLamp)) {
    moods.add('dark');
  }

  // 大通り: highway ∈ {primary, secondary, trunk}
  if (AVENUE_HIGHWAYS.has(attr.highway)) moods.add('avenue');

  // 住宅街: landuse=residential 内、かつ highway ∈ {residential, living_street}
  if (attr.inResidentialLanduse && RESIDENTIAL_HIGHWAYS.has(attr.highway)) {
    moods.add('residential');
  }

  // 人の少ない道: highway ∈ {footway, path, pedestrian}
  if (QUIET_HIGHWAYS.has(attr.highway)) moods.add('quiet');

  // 緑の多い道: 公園・緑地・並木のそば
  if (attr.inGreen) moods.add('green');

  // 水辺の道: 河川・水域のそば
  if (attr.nearWater) moods.add('waterside');

  // 舗装された歩きやすい道
  if (isPaved(attr)) moods.add('paved');

  // 歩道がある安全な道
  if (hasSidewalk(attr)) moods.add('sidewalk');

  // 細い道
  if (isNarrow(attr)) moods.add('narrow');

  return moods;
}

/**
 * 選択された気分(OR条件)に、エッジがいずれか合致するか。
 */
export function edgeMatchesMoods(
  edgeMoods: Set<MoodFilter>,
  selected: MoodFilter[],
): boolean {
  return selected.some((m) => edgeMoods.has(m));
}
