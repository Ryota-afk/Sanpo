import type { MoodFilter } from '../types';

/**
 * 気分フィルターの判定に必要な、1エッジ分の道路属性。
 */
export interface EdgeAttributes {
  highway: string;
  lit?: string; // OSM の lit タグ(yes/no/未定義)
  inResidentialLanduse: boolean;
}

const AVENUE_HIGHWAYS = new Set(['primary', 'secondary', 'trunk']);
const RESIDENTIAL_HIGHWAYS = new Set(['residential', 'living_street']);
const QUIET_HIGHWAYS = new Set(['footway', 'path', 'pedestrian']);

/**
 * 仕様 5.2 のマッピングに従い、エッジが合致する気分フィルターの集合を返す。
 */
export function classifyEdge(attr: EdgeAttributes): Set<MoodFilter> {
  const moods = new Set<MoodFilter>();

  // 明るい道: lit=yes
  if (attr.lit === 'yes') moods.add('bright');

  // 暗い道: lit=no または lit タグなし
  if (attr.lit === 'no' || attr.lit == null) moods.add('dark');

  // 大通り: highway ∈ {primary, secondary, trunk}
  if (AVENUE_HIGHWAYS.has(attr.highway)) moods.add('avenue');

  // 住宅街: landuse=residential 内、かつ highway ∈ {residential, living_street}
  if (attr.inResidentialLanduse && RESIDENTIAL_HIGHWAYS.has(attr.highway)) {
    moods.add('residential');
  }

  // 人の少ない道: highway ∈ {footway, path, pedestrian}
  if (QUIET_HIGHWAYS.has(attr.highway)) moods.add('quiet');

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
