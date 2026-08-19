// レースの発走。予想も馬券もなく、これまでの調教の答え合わせとして結果を出す。

import type { CoursePlan, Horse, RouteLandmarkKind } from '../types';
import { staminaSpeedRatio } from './career';

export interface RaceOutcome {
  raceName: string;
  distanceM: number;
  placing: number;
  fieldSize: number;
  commentary: string;
}

const FIELD_SIZE = 8;

interface CourseSpec {
  surface: 'turf' | 'dirt';
  names: string[];
  distanceForSlot: (slot: number, total: number) => number;
}

function rampDistance(min: number, max: number, slot: number, total: number): number {
  const frac = total <= 1 ? 0 : slot / (total - 1);
  return Math.round((min + (max - min) * frac) / 100) * 100;
}

const COURSE_SPECS: Record<CoursePlan, CourseSpec> = {
  sprint: {
    surface: 'turf',
    names: [
      '新馬戦(短距離)',
      '未勝利戦(短距離)',
      'アイビースプリント',
      '若葉スプリントT',
      'シルクロードT',
      '高松宮記念トライアル',
      'スプリンターズS',
      '当地スプリント王座決定戦',
    ],
    distanceForSlot: (slot, total) => rampDistance(1000, 1400, slot, total),
  },
  turf: {
    surface: 'turf',
    names: [
      '新馬戦',
      '未勝利戦',
      'すみれ賞',
      '若駒ステークス',
      '毎日王冠トライアル',
      '天皇賞トライアル',
      '当地大賞典',
      '古馬混合ステークス',
    ],
    distanceForSlot: (slot, total) => rampDistance(1400, 2000, slot, total),
  },
  dirt: {
    surface: 'dirt',
    names: [
      'ダート新馬戦',
      'ダート未勝利戦',
      '平安ステークストライアル',
      'ダート重賞シリーズ第1戦',
      'ダート重賞シリーズ第2戦',
      'JBCトライアル',
      'チャンピオンズC路線',
      '当地ダート王座決定戦',
    ],
    distanceForSlot: (slot, total) => rampDistance(1200, 1800, slot, total),
  },
  classic: {
    surface: 'turf',
    names: ['新馬戦', '未勝利戦', '共同通信杯', '皐月賞', '日本ダービー', '神戸新聞杯', '菊花賞', '古馬との対決戦'],
    distanceForSlot: (slot) => {
      // 皐月賞→ダービー→菊花賞を模した、距離が伸びていく王道路線。
      const stops = [1600, 1800, 2000, 2000, 2400, 2400, 3000, 3000];
      return stops[Math.min(slot, stops.length - 1)];
    },
  },
};

function courseSpecFor(coursePlan: CoursePlan): CourseSpec {
  return COURSE_SPECS[coursePlan];
}

// レース距離に対して、stamina/speed 比がどれだけ噛み合っているか。
function fitForDistance(horse: Horse, raceDistanceM: number): number {
  const ratio = staminaSpeedRatio(horse);
  // 短距離(1000m)≈0.55、長距離(3000m)≈1.45 が理想比率になるよう線形補間。
  const idealRatio = 0.55 + (raceDistanceM / 3000) * 0.9;
  const diff = Math.abs(ratio - idealRatio);
  if (diff < 0.12) return 1.15;
  if (diff < 0.3) return 1.0;
  return 0.85;
}

// 馬場(芝/ダート)への適性。
function fitForSurface(horse: Horse, surface: 'turf' | 'dirt'): number {
  const total = horse.turfExposureM + horse.dirtExposureM;
  if (total < 100) return 1.0;
  const turfRatio = horse.turfExposureM / total;
  const matchRatio = surface === 'turf' ? turfRatio : 1 - turfRatio;
  return 0.85 + matchRatio * 0.3;
}

// レース経路が実際に通ったランドマーク。能力には影響させず、実況の一言だけに使う。
const LANDMARK_RACE_PHRASES: Record<RouteLandmarkKind, string> = {
  convenience: 'コンビニの前を走り抜けて、',
  river: '河川敷の直線で、',
};

function buildCommentary(
  name: string,
  placing: number,
  fieldSize: number,
  landmark?: RouteLandmarkKind,
): string {
  const prefix = landmark ? LANDMARK_RACE_PHRASES[landmark] : '';
  if (placing === 1) {
    return `${prefix}最後の直線、${name}が一頭だけ違う脚を使った! そのまま押し切って一着!`;
  }
  if (placing <= 3) {
    return `${prefix}${name}、直線でよく伸びました。あと一歩及ばず${placing}着。`;
  }
  if (placing <= Math.ceil(fieldSize / 2)) {
    return `${prefix}${name}は中団のまま。届かず${placing}着でレースを終えました。`;
  }
  return `${prefix}${name}、今日は流れに乗れませんでした。${placing}着。次走に期待です。`;
}

/** slot(0始まり、レース中何走目か)のレースを発走する。landmarks は実況の演出のみに使う。 */
export function simulateRace(
  horse: Horse,
  slot: number,
  totalRaces: number,
  coursePlan: CoursePlan,
  landmarks: RouteLandmarkKind[] = [],
): RaceOutcome {
  const spec = courseSpecFor(coursePlan);
  const distanceM = spec.distanceForSlot(slot, totalRaces);
  const raceName = spec.names[Math.min(slot, spec.names.length - 1)];

  const distFit = fitForDistance(horse, distanceM);
  const surfFit = fitForSurface(horse, spec.surface);
  const base =
    horse.params.speed * 0.35 +
    horse.params.stamina * 0.3 +
    horse.params.power * 0.15 +
    horse.params.guts * 0.2;
  const fatiguePenalty = horse.fatigue > 70 ? 0.85 : 1;
  const score = base * distFit * surfFit * fatiguePenalty * (0.85 + Math.random() * 0.3);

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
    commentary: buildCommentary(horse.name, placing, FIELD_SIZE, landmarks[0]),
  };
}
