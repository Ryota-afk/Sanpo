import type { LatLng, MoodFilter, ProposalResult } from '../types';
import { boundingBox } from './geo';
import { buildGraph } from './graph';
import { proposeRoutes } from './routing';
import { fetchRoadNetwork } from '../api/overpass';
import { getRecentRoutes } from '../db/db';

// バウンディングボックスに加えるマージン(メートル)。
// 直線から外れた迂回ルートも探索できるよう、ある程度広めに取る。
const BBOX_MARGIN_M = 700;

export interface ProposeInput {
  start: LatLng;
  end: LatLng;
  moods: MoodFilter[];
  paceMinPerKm: number;
  timeLimitMin: number;
  overlapThreshold: number;
}

/**
 * 座標入力から、道路データ取得→グラフ構築→候補生成までを一括で行う。
 */
export async function proposeFromCoords(
  input: ProposeInput,
): Promise<ProposalResult> {
  const bbox = boundingBox(input.start, input.end, BBOX_MARGIN_M);
  const data = await fetchRoadNetwork(bbox);
  const road = buildGraph(data);
  const recentRoutes = await getRecentRoutes();

  return proposeRoutes({
    road,
    start: input.start,
    end: input.end,
    moods: input.moods,
    recentRoutes,
    paceMinPerKm: input.paceMinPerKm,
    timeLimitMin: input.timeLimitMin,
    overlapThreshold: input.overlapThreshold,
  });
}
