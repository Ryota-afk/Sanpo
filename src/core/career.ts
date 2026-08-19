// 生涯の進行(1回の散歩=1頭の生涯)と、適性・ランクの算出。
//
// レース数は「ルートの総距離から出る自動値」を基準に、raceCountPreference で
// 少なめ/標準/多め の傾向だけを事前に指定できる。距離が決まる前(牧場タブで
// 次の生涯を用意する時点)でも選べるようにするための設計。

import type { DistanceAptitude, Horse, RaceCountPreference, Rank } from '../types';

export const STAGE_LABELS = ['育成期', '2歳', '3歳', '4歳'];

/** チェックポイント総数のうち、idx(1始まり)がどのステージか(0〜3)。 */
export function stageIndexForCheckpoint(idx: number, total: number): number {
  const frac = idx / total;
  if (frac <= 0.25) return 0;
  if (frac <= 0.5) return 1;
  if (frac <= 0.833) return 2;
  return 3;
}

export function stageLabelForCheckpoint(idx: number, total: number): string {
  return STAGE_LABELS[stageIndexForCheckpoint(idx, total)];
}

// ── レース数(距離ベースの自動値 + 傾向による補正) ──────────

export function minRaceCount(distanceM: number): number {
  if (distanceM < 800) return 2;
  if (distanceM < 1500) return 3;
  if (distanceM < 2500) return 4;
  return 5;
}

export function maxRaceCount(distanceM: number): number {
  if (distanceM < 800) return 4;
  if (distanceM < 1500) return 6;
  if (distanceM < 2500) return 9;
  return 12;
}

export function defaultRaceCount(distanceM: number): number {
  return Math.round((minRaceCount(distanceM) + maxRaceCount(distanceM)) / 2);
}

const PREFERENCE_OFFSET: Record<RaceCountPreference, number> = {
  few: -2,
  normal: 0,
  many: 2,
};

/** 距離と傾向(少なめ/標準/多め)から、実際に走らせるレース数を決める。 */
export function resolveRaceCount(
  distanceM: number,
  preference: RaceCountPreference = 'normal',
): number {
  const base = defaultRaceCount(distanceM) + PREFERENCE_OFFSET[preference];
  return Math.min(maxRaceCount(distanceM), Math.max(minRaceCount(distanceM), base));
}

/**
 * レース数から、調教とレースのスケジュールを組む。
 * 最初に育成期の調教ブロックを置き、以降はレースの合間に調教を散らして
 * 最後はレースで締める。
 */
export function buildLifeSchedule(raceCount: number): Array<'train' | 'race'> {
  const trainCount = Math.max(2, Math.round(raceCount * 0.6));
  const initialTrain = Math.max(1, Math.ceil(trainCount / 2));
  const laterTrain = trainCount - initialTrain;

  const schedule: Array<'train' | 'race'> = Array(initialTrain).fill('train');

  const gap = laterTrain > 0 ? Math.max(2, Math.round(raceCount / (laterTrain + 1))) : Infinity;
  let sinceTrain = 0;
  let trainInserted = 0;
  for (let i = 0; i < raceCount; i++) {
    const isLast = i === raceCount - 1;
    if (!isLast && trainInserted < laterTrain && sinceTrain >= gap) {
      schedule.push('train');
      trainInserted++;
      sinceTrain = 0;
    }
    schedule.push('race');
    sinceTrain++;
  }
  return schedule;
}

// ── 適性(stamina/speed の比で決める。距離そのものは使わない) ──
//
// チェックポイントは1つのルートを細切れにしたものなので、1回あたりの
// 「距離」は数百mしかなく、実際のレース距離(1000m台〜)とは桁が違う。
// 絶対距離を比較する代わりに、育った結果の stamina/speed バランスで
// 距離適性を決める(現実の血統評論の考え方に近い)。

const DISTANCE_RATIO_CENTERS: Record<DistanceAptitude, number> = {
  sprint: 0.6,
  mile: 0.85,
  middle: 1.05,
  long: 1.3,
};

export function staminaSpeedRatio(horse: Horse): number {
  return horse.params.stamina / Math.max(1, horse.params.speed);
}

export type AptitudeMark = '◎' | '○' | '△' | '✕';

/** stamina/speed バランスから、距離適性4種のランクを算出する。 */
export function distanceAptitudeMarks(
  horse: Horse,
): Record<DistanceAptitude, AptitudeMark> {
  const ratio = staminaSpeedRatio(horse);
  const order = (Object.keys(DISTANCE_RATIO_CENTERS) as DistanceAptitude[])
    .map((k) => [k, Math.abs(DISTANCE_RATIO_CENTERS[k] - ratio)] as const)
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
  const marks: AptitudeMark[] = ['◎', '○', '△', '✕'];
  const result = {} as Record<DistanceAptitude, AptitudeMark>;
  order.forEach((k, i) => {
    result[k] = marks[i];
  });
  return result;
}

/** 調教で通った道のり(芝系/ダート系)の比率から、馬場適性のランクを算出する。 */
export function surfaceAptitudeMarks(
  horse: Horse,
): Record<'turf' | 'dirt', AptitudeMark> {
  const total = horse.turfExposureM + horse.dirtExposureM;
  if (total < 100) return { turf: '○', dirt: '○' };
  const turfRatio = horse.turfExposureM / total;
  if (turfRatio >= 0.7) return { turf: '◎', dirt: '✕' };
  if (turfRatio >= 0.55) return { turf: '○', dirt: '△' };
  if (turfRatio >= 0.45) return { turf: '○', dirt: '○' };
  if (turfRatio >= 0.3) return { turf: '△', dirt: '○' };
  return { turf: '✕', dirt: '◎' };
}

// ── ランク(S〜G) ──────────────────────────────────

// 閾値は core/horse.ts のシミュレーション結果に合わせて調整したもの。
const RANK_THRESHOLDS: [Rank, number][] = [
  ['S', 20],
  ['A', 16],
  ['B', 13],
  ['C', 11],
  ['D', 9.5],
  ['E', 8.5],
  ['F', 7.5],
  ['G', 0],
];

export function paramRank(value: number): Rank {
  for (const [rank, min] of RANK_THRESHOLDS) {
    if (value >= min) return rank;
  }
  return 'G';
}
