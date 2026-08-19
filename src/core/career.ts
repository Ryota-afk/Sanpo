// キャリアの進行(暦)と、適性のランク付け。
//
// 進行(何回目でレースか)と成果(強さ)を分離するのが設計上の要点。
// 「進行」は散歩の回数だけで決まり、距離やペースには一切左右されない。

import type { DistanceAptitude, Horse } from '../types';

/** 1キャリア = 12回の散歩。 */
export const CAREER_LENGTH_WALKS = 12;

/** 各回が調教かレースか。育成期3回→2歳3回(2走)→3歳4回(3走)→4歳2回(2走)。 */
export const CAREER_SCHEDULE: Array<'train' | 'race'> = [
  'train',
  'train',
  'train',
  'race',
  'race',
  'train',
  'race',
  'race',
  'race',
  'train',
  'race',
  'race',
];

export const STAGE_LABELS = ['育成期', '2歳', '3歳', '4歳'];

export function stageIndexForWalk(walkIndex: number): number {
  if (walkIndex <= 3) return 0;
  if (walkIndex <= 6) return 1;
  if (walkIndex <= 10) return 2;
  return 3;
}

export function stageLabelForWalk(walkIndex: number): string {
  return STAGE_LABELS[stageIndexForWalk(walkIndex)];
}

/**
 * walkIndex(1始まり)が、キャリア中何度目のレースかを返す(0始まり)。
 * レースの回でなければ -1。
 */
export function raceSlotIndex(walkIndex: number): number {
  if (CAREER_SCHEDULE[walkIndex - 1] !== 'race') return -1;
  let count = -1;
  for (let i = 0; i < walkIndex; i++) {
    if (CAREER_SCHEDULE[i] === 'race') count++;
  }
  return count;
}

const DISTANCE_CENTERS: Record<DistanceAptitude, number> = {
  sprint: 1200,
  mile: 1600,
  middle: 2000,
  long: 2600,
};

function trainedWalkCount(horse: Horse): number {
  return Math.max(1, horse.careerLog.filter((e) => e.kind === 'train').length);
}

/** これまでの調教の平均距離(m)。 */
export function averageTrainingDistanceM(horse: Horse): number {
  return horse.totalDistanceM / trainedWalkCount(horse);
}

export type AptitudeMark = '◎' | '○' | '△' | '✕';

/** 調教の平均距離から、距離適性4種のランクを算出する。 */
export function distanceAptitudeMarks(
  horse: Horse,
): Record<DistanceAptitude, AptitudeMark> {
  const avgM = averageTrainingDistanceM(horse);
  const order = (Object.keys(DISTANCE_CENTERS) as DistanceAptitude[])
    .map((k) => [k, Math.abs(DISTANCE_CENTERS[k] - avgM)] as const)
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
  if (total < 500) return { turf: '○', dirt: '○' };
  const turfRatio = horse.turfExposureM / total;
  if (turfRatio >= 0.7) return { turf: '◎', dirt: '✕' };
  if (turfRatio >= 0.55) return { turf: '○', dirt: '△' };
  if (turfRatio >= 0.45) return { turf: '○', dirt: '○' };
  if (turfRatio >= 0.3) return { turf: '△', dirt: '○' };
  return { turf: '✕', dirt: '◎' };
}
