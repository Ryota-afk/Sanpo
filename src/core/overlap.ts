import type { RouteRecord } from '../types';

/**
 * 直近ルート群の wayIds を和集合にした「使用済みway集合」を作る。
 */
export function buildUsedWaySet(recentRoutes: RouteRecord[]): Set<string> {
  const used = new Set<string>();
  for (const r of recentRoutes) {
    for (const w of r.wayIds) used.add(w);
  }
  return used;
}

/** ルートを構成する1エッジ分の最小情報。 */
export interface RouteEdge {
  wayId: string;
  lengthM: number;
}

/**
 * 被り率(%)を算出する(仕様 5.3)。
 * = 使用済みway集合と重複するway長の合計 ÷ 総距離 × 100
 */
export function computeOverlapRate(
  edges: RouteEdge[],
  usedWays: Set<string>,
): number {
  let total = 0;
  let overlap = 0;
  for (const e of edges) {
    total += e.lengthM;
    if (usedWays.has(e.wayId)) overlap += e.lengthM;
  }
  if (total === 0) return 0;
  return (overlap / total) * 100;
}
