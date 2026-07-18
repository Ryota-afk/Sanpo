// OSM highway タグを、UI表示用の日本語ラベルにマッピングする。

export const HIGHWAY_LABELS: Record<string, string> = {
  footway: '歩道',
  path: '小道',
  pedestrian: '歩行者天国',
  steps: '階段',
  living_street: '生活道路',
  residential: '住宅街の道',
  unclassified: '一般道',
  service: '通路',
  tertiary: '三級道路',
  secondary: '幹線(二級)',
  primary: '幹線(一級)',
  trunk: '主要幹線',
  cycleway: '自転車道',
  track: '未舗装路',
};

export function highwayLabel(highway: string): string {
  return HIGHWAY_LABELS[highway] ?? highway;
}
