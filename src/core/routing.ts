import { aStar } from 'ngraph.path';
import type { Link, Node } from 'ngraph.graph';
import type {
  MoodFilter,
  ProposalResult,
  RouteCandidate,
  RouteLandmark,
  RouteLandmarkKind,
  LatLng,
} from '../types';
import type { EdgeData, NodeData, RoadGraph } from './graph';
import { nearestNodeId } from './graph';
import { edgeMatchesMoods } from './mood';
import {
  buildUsedWaySet,
  computeOverlapRate,
  type RouteEdge,
} from './overlap';
import { haversineMeters } from './geo';
import type { RouteRecord } from '../types';

// 気分に合致するエッジの重みをどれだけ軽減するか。
const MOOD_DISCOUNT = 0.55;
// 履歴で使用済みの way にかける弱いペナルティ(避けやすくするが禁止はしない)。
const HISTORY_PENALTY = 2.0;
// 反復ペナルティ法で、前候補が使った way の重みを増やす倍率(仕様例: ×3)。
const ITERATION_PENALTY = 3.0;
// 生成する最大候補数。
const MAX_CANDIDATES = 3;
// 被り率緩和の1ステップ(ポイント)。
const RELAX_STEP = 10;

export interface ProposeParams {
  road: RoadGraph;
  start: LatLng;
  end: LatLng;
  moods: MoodFilter[];
  recentRoutes: RouteRecord[];
  paceMinPerKm: number;
  timeLimitMin: number;
  overlapThreshold: number; // %
}

interface RawCandidate {
  geometry: [number, number][];
  edges: RouteEdge[];
  wayIds: string[];
  distanceM: number;
  wayTypeBreakdown: Record<string, number>;
  crossings: [number, number][];
  moodBreakdown: Partial<Record<MoodFilter, number>>;
  landmarks: RouteLandmark[];
}

/** リンクのメタデータへ安全にアクセスする。 */
function linkData(link: Link<EdgeData>): EdgeData {
  return link.data;
}

/**
 * 2ノード間のリンクを取得する(無向のためどちらの向きでも探す)。
 */
function getEdge(
  road: RoadGraph,
  aId: string | number,
  bId: string | number,
): Link<EdgeData> | null {
  return (
    road.graph.getLink(aId, bId) ?? road.graph.getLink(bId, aId) ?? null
  );
}

/**
 * ノード列(goal→start の順)から候補ルートを組み立てる。
 */
function buildRawCandidate(
  road: RoadGraph,
  pathNodes: Node<NodeData>[],
): RawCandidate | null {
  if (pathNodes.length < 2) return null;

  // find は goal から start の順で返すため、反転して start→goal にする。
  const nodes = [...pathNodes].reverse();

  const geometry: [number, number][] = [];
  const edges: RouteEdge[] = [];
  const wayIdSet = new Set<string>();
  const breakdown: Record<string, number> = {};
  const crossings: [number, number][] = [];
  const moodBreakdown: Partial<Record<MoodFilter, number>> = {};
  const landmarks: RouteLandmark[] = [];
  // ランドマークは「近接圏に入った瞬間」だけ記録する(同じコンビニ沿いの
  // 複数エッジで何度も重複記録しないため、立ち上がりエッジのみ検出する)。
  const wasNear: Record<RouteLandmarkKind, boolean> = {
    convenience: false,
    river: false,
  };
  let distanceM = 0;

  const addCrossingIfAny = (node: Node<NodeData>) => {
    if (road.crossings.has(node.id as number) && node.data) {
      crossings.push([node.data.lat, node.data.lng]);
    }
  };

  const first = nodes[0].data;
  if (first) geometry.push([first.lat, first.lng]);
  addCrossingIfAny(nodes[0]);

  for (let i = 1; i < nodes.length; i++) {
    const link = getEdge(road, nodes[i - 1].id, nodes[i].id);
    const coord = nodes[i].data;
    if (coord) geometry.push([coord.lat, coord.lng]);
    addCrossingIfAny(nodes[i]);
    if (!link) continue;
    const data = linkData(link);

    const registerLandmark = (kind: RouteLandmarkKind, near: boolean) => {
      if (near && !wasNear[kind]) {
        landmarks.push({ atDistanceM: distanceM, kind });
      }
      wasNear[kind] = near;
    };
    registerLandmark('convenience', data.nearConvenience);
    registerLandmark('river', data.nearRiver);

    distanceM += data.lengthM;
    edges.push({ wayId: data.wayId, lengthM: data.lengthM });
    wayIdSet.add(data.wayId);
    breakdown[data.highway] = (breakdown[data.highway] ?? 0) + data.lengthM;
    for (const mood of data.moods) {
      moodBreakdown[mood] = (moodBreakdown[mood] ?? 0) + data.lengthM;
    }
  }

  return {
    geometry,
    edges,
    wayIds: [...wayIdSet],
    distanceM,
    wayTypeBreakdown: breakdown,
    crossings,
    moodBreakdown,
    landmarks,
  };
}

/** 2つのジオメトリがほぼ同一かどうか(重複候補の除外用)。 */
function sameGeometry(
  a: [number, number][],
  b: [number, number][],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

/**
 * ルート候補を最大3件生成する(仕様 5.4 反復ペナルティ法)。
 * 気分による重み軽減・履歴ペナルティ・反復ペナルティを反映した重み付き A* を繰り返す。
 */
export function proposeRoutes(params: ProposeParams): ProposalResult {
  const {
    road,
    start,
    end,
    moods,
    recentRoutes,
    paceMinPerKm,
    timeLimitMin,
    overlapThreshold,
  } = params;

  const startNode = nearestNodeId(road, start);
  const goalNode = nearestNodeId(road, end);

  if (startNode == null || goalNode == null || startNode === goalNode) {
    return {
      candidates: [],
      usedThreshold: overlapThreshold,
      relaxed: false,
      message:
        '道路データが少ないエリア、または距離が短すぎる可能性があります。',
    };
  }

  const usedWays = buildUsedWaySet(recentRoutes);

  // way ごとの反復ペナルティ倍率(初期値1)。候補生成のたびに更新する。
  const iterationPenalty = new Map<string, number>();

  const distance = (
    _from: Node<NodeData>,
    _to: Node<NodeData>,
    link: Link<EdgeData>,
  ): number => {
    const data = linkData(link);
    let w = data.lengthM;
    if (moods.length > 0 && edgeMatchesMoods(data.moods, moods)) {
      w *= MOOD_DISCOUNT;
    }
    if (usedWays.has(data.wayId)) {
      w *= HISTORY_PENALTY;
    }
    const pen = iterationPenalty.get(data.wayId);
    if (pen) w *= pen;
    return w;
  };

  // 気分割引で重みが素の距離未満になり得るため、下限係数を掛けて許容的ヒューリスティックにする。
  const heuristic = (from: Node<NodeData>, to: Node<NodeData>): number => {
    const a = from.data;
    const b = to.data;
    if (!a || !b) return 0;
    return haversineMeters(a, b) * MOOD_DISCOUNT;
  };

  const rawCandidates: RawCandidate[] = [];

  for (let k = 0; k < MAX_CANDIDATES; k++) {
    const finder = aStar<NodeData, EdgeData>(road.graph, {
      distance,
      heuristic,
    });
    const pathNodes = finder.find(startNode, goalNode);
    if (!pathNodes || pathNodes.length < 2) break;

    const raw = buildRawCandidate(road, pathNodes);
    if (!raw) break;

    // 直前までの候補と同一なら破棄(ペナルティで差が出なかったケース)。
    const isDup = rawCandidates.some((c) =>
      sameGeometry(c.geometry, raw.geometry),
    );
    if (!isDup) rawCandidates.push(raw);

    // この候補が使った way の重みを増やし、次回は別の道を通りやすくする。
    for (const wid of raw.wayIds) {
      const cur = iterationPenalty.get(wid) ?? 1;
      iterationPenalty.set(wid, cur * ITERATION_PENALTY);
    }
  }

  if (rawCandidates.length === 0) {
    return {
      candidates: [],
      usedThreshold: overlapThreshold,
      relaxed: false,
      message:
        '道路データが少ないエリア、または距離が短すぎる可能性があります。',
    };
  }

  // 各候補の被り率・所要時間を確定させる。
  const scored: RouteCandidate[] = rawCandidates.map((c) => {
    const overlapRate = computeOverlapRate(c.edges, usedWays);
    const durationMin = (c.distanceM / 1000) * paceMinPerKm;
    return {
      geometry: c.geometry,
      wayIds: c.wayIds,
      distanceM: c.distanceM,
      durationMin,
      overlapRate,
      wayTypeBreakdown: c.wayTypeBreakdown,
      crossings: c.crossings,
      moodBreakdown: c.moodBreakdown,
      landmarks: c.landmarks,
    };
  });

  // 時間上限は緩和不可の必須条件として先に絞る。
  const timeValid = scored.filter((c) => c.durationMin <= timeLimitMin);
  if (timeValid.length === 0) {
    return {
      candidates: [],
      usedThreshold: overlapThreshold,
      relaxed: false,
      message:
        '指定時間内に歩けるルートが見つかりませんでした。時間上限を延ばすか、地点を近づけてください。',
    };
  }

  // 被り率は閾値を +10 ずつ緩和しながら、条件を満たす候補を探す(仕様 5.4-6)。
  for (
    let threshold = overlapThreshold;
    threshold <= 100 + RELAX_STEP;
    threshold += RELAX_STEP
  ) {
    const capped = Math.min(threshold, 100);
    const valid = timeValid
      .filter((c) => c.overlapRate <= capped)
      .sort((a, b) => a.overlapRate - b.overlapRate)
      .slice(0, MAX_CANDIDATES);
    if (valid.length > 0) {
      return {
        candidates: valid,
        usedThreshold: capped,
        relaxed: capped > overlapThreshold,
      };
    }
  }

  // 論理上ここには到達しない(閾値100%で全候補が通過するため)が、保険として返す。
  return {
    candidates: timeValid.slice(0, MAX_CANDIDATES),
    usedThreshold: 100,
    relaxed: true,
  };
}
