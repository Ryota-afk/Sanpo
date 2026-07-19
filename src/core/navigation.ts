import type { LatLng } from '../types';
import { bearingDeg, haversineMeters } from './geo';

export type TurnKind =
  | 'start'
  | 'arrive'
  | 'straight'
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right';

export interface NavStep {
  /** この手順の種類(出発・右折・到着など)。 */
  kind: TurnKind;
  /** 直前の手順地点からこの地点までの距離(メートル)。 */
  distanceFromPrevM: number;
  /** 手順地点の座標 [lat, lng]。 */
  location: [number, number];
}

/** 曲がり角として地図に表示する地点。 */
export interface TurnPoint {
  location: [number, number];
  kind: TurnKind;
}

// これ以上の角度差を「曲がった」とみなす閾値(度)。小さな道なりのカーブは無視する。
const TURN_THRESHOLD_DEG = 30;
const SLIGHT_MAX_DEG = 55;
const SHARP_MIN_DEG = 115;

/** -180〜180 に正規化した角度差。正=右(時計回り)、負=左。 */
function turnAngle(inBearing: number, outBearing: number): number {
  let d = outBearing - inBearing;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function classifyTurn(angle: number): TurnKind {
  const abs = Math.abs(angle);
  if (abs < TURN_THRESHOLD_DEG) return 'straight';
  const right = angle > 0;
  if (abs >= SHARP_MIN_DEG) return right ? 'sharp-right' : 'sharp-left';
  if (abs <= SLIGHT_MAX_DEG) return right ? 'slight-right' : 'slight-left';
  return right ? 'right' : 'left';
}

/**
 * ルートのジオメトリから、曲がり角ベースの案内手順を生成する。
 * 連続する頂点の方位角の変化を見て、閾値を超えた地点を曲がり角とする。
 */
export function computeSteps(geometry: [number, number][]): NavStep[] {
  if (geometry.length < 2) return [];

  const pt = (i: number): LatLng => ({
    lat: geometry[i][0],
    lng: geometry[i][1],
  });

  const steps: NavStep[] = [
    { kind: 'start', distanceFromPrevM: 0, location: geometry[0] },
  ];

  // 直前の手順地点からの累積距離。
  let accum = haversineMeters(pt(0), pt(1));

  for (let i = 1; i < geometry.length - 1; i++) {
    const inB = bearingDeg(pt(i - 1), pt(i));
    const outB = bearingDeg(pt(i), pt(i + 1));
    const kind = classifyTurn(turnAngle(inB, outB));

    const segNext = haversineMeters(pt(i), pt(i + 1));
    if (kind !== 'straight') {
      steps.push({ kind, distanceFromPrevM: accum, location: geometry[i] });
      accum = segNext;
    } else {
      accum += segNext;
    }
  }

  steps.push({
    kind: 'arrive',
    distanceFromPrevM: accum,
    location: geometry[geometry.length - 1],
  });
  return steps;
}

/** 地図表示用の曲がり角地点(出発・到着・直進を除く)。 */
export function turnPoints(steps: NavStep[]): TurnPoint[] {
  return steps
    .filter(
      (s) =>
        s.kind !== 'start' && s.kind !== 'arrive' && s.kind !== 'straight',
    )
    .map((s) => ({ location: s.location, kind: s.kind }));
}

export const TURN_LABELS: Record<TurnKind, string> = {
  start: '出発',
  arrive: '到着',
  straight: '直進',
  left: '左折',
  right: '右折',
  'slight-left': '斜め左',
  'slight-right': '斜め右',
  'sharp-left': '鋭く左折',
  'sharp-right': '鋭く右折',
};

export const TURN_ARROWS: Record<TurnKind, string> = {
  start: '🚩',
  arrive: '🏁',
  straight: '↑',
  left: '↰',
  right: '↱',
  'slight-left': '↖',
  'slight-right': '↗',
  'sharp-left': '⤺',
  'sharp-right': '⤻',
};
