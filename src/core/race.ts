// レースの発走。予想も馬券もなく、これまでの調教の答え合わせとして結果を出す。

import type { Horse } from '../types';
import { averageTrainingDistanceM, raceSlotIndex } from './career';

export interface RaceOutcome {
  raceName: string;
  distanceM: number;
  placing: number;
  fieldSize: number;
  commentary: string;
}

const RACE_DISTANCES = [1400, 1600, 1800, 2000, 2000, 2200, 2400];
const RACE_NAMES = [
  '新馬戦',
  '未勝利戦',
  'すみれ賞',
  '若駒ステークス',
  '皐月賞トライアル',
  '菊花賞トライアル',
  '当地大賞典',
];
const FIELD_SIZE = 8;

// 調教の平均距離とレース距離が近いほど得意なレースとみなす。
function fitForDistance(avgTrainingM: number, raceDistanceM: number): number {
  const diff = Math.abs(avgTrainingM - raceDistanceM);
  if (diff < 250) return 1.15;
  if (diff < 600) return 1.0;
  return 0.85;
}

function buildCommentary(name: string, placing: number, fieldSize: number): string {
  if (placing === 1) {
    return `最後の直線、${name}が一頭だけ違う脚を使った! そのまま押し切って一着!`;
  }
  if (placing <= 3) {
    return `${name}、直線でよく伸びました。あと一歩及ばず${placing}着。`;
  }
  if (placing <= Math.ceil(fieldSize / 2)) {
    return `${name}は中団のまま。届かず${placing}着でレースを終えました。`;
  }
  return `${name}、今日は流れに乗れませんでした。${placing}着。次走に期待です。`;
}

/** walkIndex(1始まり)のレースを発走する。 */
export function simulateRace(horse: Horse, walkIndex: number): RaceOutcome {
  const slot = Math.max(0, raceSlotIndex(walkIndex));
  const distanceM = RACE_DISTANCES[Math.min(slot, RACE_DISTANCES.length - 1)];
  const raceName = RACE_NAMES[Math.min(slot, RACE_NAMES.length - 1)];

  const fit = fitForDistance(averageTrainingDistanceM(horse), distanceM);
  const base =
    horse.params.speed * 0.35 +
    horse.params.stamina * 0.3 +
    horse.params.power * 0.15 +
    horse.params.guts * 0.2;
  const fatiguePenalty = horse.fatigue > 70 ? 0.85 : 1;
  const score = base * fit * fatiguePenalty * (0.85 + Math.random() * 0.3);

  // 相手のレベルは回を追うごとに上がっていく。
  const rivalMean = 8 + slot * 2.2;
  const rivals = Array.from({ length: FIELD_SIZE - 1 }, () =>
    rivalMean * (0.75 + Math.random() * 0.5),
  );
  const placing = [...rivals, score].sort((a, b) => b - a).indexOf(score) + 1;

  return {
    raceName,
    distanceM,
    placing,
    fieldSize: FIELD_SIZE,
    commentary: buildCommentary(horse.name, placing, FIELD_SIZE),
  };
}
