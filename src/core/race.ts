// レースの発走。予想も馬券もなく、これまでの調教の答え合わせとして結果を出す。

import type { CoursePlan, Horse, RouteLandmarkKind } from '../types';
import { staminaSpeedRatio } from './career';

export interface RaceOutcome {
  raceName: string;
  distanceM: number;
  surface: 'turf' | 'dirt';
  placing: number;
  fieldSize: number;
  commentary: string;
}

const FIELD_SIZE = 8;

interface RaceDef {
  name: string;
  distanceM: number;
}

/** そのステージで走る1走を選ぶ候補群。複数あれば馬ごとにランダムに分岐する。 */
interface RaceTier {
  races: RaceDef[];
}

interface CourseSpec {
  surface: 'turf' | 'dirt';
  tiers: RaceTier[];
}

// 実在のJRAレース名(+概ねの距離)だけを使う。新馬戦〜クラス条件は実際の番組編成に
// 沿って1本道(全馬が通る)だが、オープン・重賞クラスに上がってからは複数の実在レースを
// 「候補プール」として持たせ、馬ごとにどのレースを使うかランダムに分岐させる
// (実際も、格上げされた馬がどの重賞を選ぶかは馬によって違う)。
// レース数がティア数を超えたら最後のティア(プール)を使い続ける。
// 重賞にはnetkeibaと同じ表記でグレード(GI/GII/GIII)を付す。
const COURSE_SPECS: Record<CoursePlan, CourseSpec> = {
  turf: {
    surface: 'turf',
    tiers: [
      { races: [{ name: '新馬戦', distanceM: 1600 }] },
      { races: [{ name: '未勝利戦', distanceM: 1800 }] },
      { races: [{ name: '1勝クラス', distanceM: 2000 }] },
      { races: [{ name: '2勝クラス', distanceM: 2000 }] },
      { races: [{ name: '3勝クラス', distanceM: 2200 }] },
      {
        races: [
          { name: '中山金杯(GIII)', distanceM: 2000 },
          { name: 'きさらぎ賞(GIII)', distanceM: 1800 },
          { name: '中山記念(GII)', distanceM: 1800 },
          { name: '京都記念(GII)', distanceM: 2200 },
          { name: '日経賞(GII)', distanceM: 2200 },
          { name: '目黒記念(GII)', distanceM: 2500 },
          { name: '京都大賞典(GII)', distanceM: 2400 },
          { name: '天皇賞(秋)(GI)', distanceM: 2000 },
          { name: 'オールカマー(GII)', distanceM: 2200 },
          { name: 'アルゼンチン共和国杯(GII)', distanceM: 2500 },
          { name: 'ジャパンカップ(GI)', distanceM: 2400 },
          { name: '有馬記念(GI)', distanceM: 2500 },
          { name: '阪神大賞典(GII)', distanceM: 3000 },
          { name: '大阪杯(GI)', distanceM: 2000 },
          { name: '宝塚記念(GI)', distanceM: 2200 },
        ],
      },
    ],
  },
  dirt: {
    surface: 'dirt',
    tiers: [
      { races: [{ name: 'ダート新馬', distanceM: 1200 }] },
      { races: [{ name: 'ダート未勝利', distanceM: 1400 }] },
      { races: [{ name: '1勝クラス', distanceM: 1400 }] },
      { races: [{ name: '2勝クラス', distanceM: 1600 }] },
      { races: [{ name: '3勝クラス', distanceM: 1800 }] },
      {
        races: [
          { name: 'ヒヤシンスステークス', distanceM: 1600 },
          { name: 'プロキオンステークス(GIII)', distanceM: 1400 },
          { name: 'エルムステークス(GIII)', distanceM: 1800 },
          { name: 'みやこステークス(GIII)', distanceM: 1800 },
          { name: '平安ステークス(GIII)', distanceM: 1800 },
          { name: 'かしわ記念(GII)', distanceM: 1600 },
          { name: 'JBCスプリント(GI)', distanceM: 1200 },
          { name: 'フェブラリーステークス(GI)', distanceM: 1600 },
          { name: 'チャンピオンズカップ(GI)', distanceM: 1800 },
          { name: '帝王賞(GI)', distanceM: 2000 },
          { name: 'JBCクラシック(GI)', distanceM: 2000 },
          { name: '川崎記念(GI)', distanceM: 2100 },
          { name: 'マイルチャンピオンシップ南部杯(GI)', distanceM: 1600 },
          { name: '東京大賞典(GI)', distanceM: 2000 },
          { name: 'ジャパンダートダービー(GI)', distanceM: 2000 },
        ],
      },
    ],
  },
  sprint: {
    surface: 'turf',
    tiers: [
      { races: [{ name: '新馬戦', distanceM: 1200 }] },
      { races: [{ name: '未勝利戦', distanceM: 1200 }] },
      { races: [{ name: '1勝クラス', distanceM: 1200 }] },
      { races: [{ name: '2勝クラス', distanceM: 1400 }] },
      { races: [{ name: '3勝クラス', distanceM: 1200 }] },
      {
        races: [
          { name: 'オーシャンステークス(GIII)', distanceM: 1200 },
          { name: 'シルクロードステークス(GIII)', distanceM: 1200 },
          { name: '阪急杯(GIII)', distanceM: 1400 },
          { name: '北九州記念(GIII)', distanceM: 1200 },
          { name: 'CBC賞(GIII)', distanceM: 1200 },
          { name: 'セントウルステークス(GII)', distanceM: 1200 },
          { name: 'スプリンターズステークス(GI)', distanceM: 1200 },
          { name: '高松宮記念(GI)', distanceM: 1200 },
          { name: 'キーンランドカップ(GIII)', distanceM: 1200 },
          { name: 'オパールステークス', distanceM: 1200 },
          { name: 'パーシモンステークス', distanceM: 1200 },
        ],
      },
    ],
  },
  classic: {
    surface: 'turf',
    // 皐月賞→ダービー→菊花賞の三冠路線はこの順で固定(実際もこの順でしか走れない)。
    // それ以外(トライアル・古馬になってからの大レース)は候補プールから分岐する。
    tiers: [
      { races: [{ name: '新馬戦', distanceM: 1800 }] },
      { races: [{ name: '未勝利戦', distanceM: 2000 }] },
      { races: [{ name: '1勝クラス', distanceM: 2000 }] },
      { races: [{ name: '2勝クラス', distanceM: 2000 }] },
      {
        races: [
          { name: '共同通信杯(GIII)', distanceM: 1800 },
          { name: '弥生賞(GII)', distanceM: 2000 },
          { name: 'スプリングステークス(GII)', distanceM: 1800 },
        ],
      },
      { races: [{ name: '皐月賞(GI)', distanceM: 2000 }] },
      {
        races: [
          { name: '京都新聞杯(GII)', distanceM: 2200 },
          { name: 'プリンシパルステークス(GIII)', distanceM: 2000 },
          { name: 'NHKマイルカップ(GI)', distanceM: 1600 },
        ],
      },
      { races: [{ name: '日本ダービー(GI)', distanceM: 2400 }] },
      {
        races: [
          { name: 'セントライト記念(GII)', distanceM: 2200 },
          { name: '神戸新聞杯(GII)', distanceM: 2400 },
        ],
      },
      { races: [{ name: '菊花賞(GI)', distanceM: 3000 }] },
      {
        races: [
          { name: '天皇賞(春)(GI)', distanceM: 3200 },
          { name: '大阪杯(GI)', distanceM: 2000 },
          { name: '宝塚記念(GI)', distanceM: 2200 },
          { name: '天皇賞(秋)(GI)', distanceM: 2000 },
          { name: 'ジャパンカップ(GI)', distanceM: 2400 },
          { name: '有馬記念(GI)', distanceM: 2500 },
        ],
      },
    ],
  },
};

function courseSpecFor(coursePlan: CoursePlan): CourseSpec {
  return COURSE_SPECS[coursePlan];
}

/**
 * slot(0始まり)のティアから1走を選ぶ。候補が複数あるティアでは、
 * 直近で使った実況済みのレース名をなるべく避けてランダムに選ぶ
 * ―― 同じ路線でも馬ごとに違うレースを歩ませ、キャリアに多様性を出す。
 */
function pickRaceForSlot(spec: CourseSpec, slot: number, recentRaceNames: string[]): RaceDef {
  const tier = spec.tiers[Math.min(slot, spec.tiers.length - 1)];
  const pool = tier.races;
  if (pool.length === 1) return pool[0];
  const fresh = pool.filter((r) => !recentRaceNames.includes(r.name));
  const candidates = fresh.length > 0 ? fresh : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
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
  school: '学校前の声援の中、',
  park: '公園沿いの直線で、',
  shrine: '神社前を駆け抜けて、',
  station: '駅前の喧騒の中、',
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

/**
 * slot(0始まり、レース中何走目か)のレースを発走する。landmarks は実況の演出のみに使う。
 * recentRaceNames は直近で使ったレース名(候補が複数あるティアで、連続して
 * 同じレースを選ばないようにするためのヒント)。
 */
export function simulateRace(
  horse: Horse,
  slot: number,
  coursePlan: CoursePlan,
  landmarks: RouteLandmarkKind[] = [],
  recentRaceNames: string[] = [],
): RaceOutcome {
  const spec = courseSpecFor(coursePlan);
  const { name: raceName, distanceM } = pickRaceForSlot(spec, slot, recentRaceNames);

  const distFit = fitForDistance(horse, distanceM);
  const surfFit = fitForSurface(horse, spec.surface);
  const base =
    horse.params.speed * 0.35 +
    horse.params.stamina * 0.3 +
    horse.params.power * 0.15 +
    horse.params.guts * 0.2;
  const fatiguePenalty = horse.fatigue > 70 ? 0.85 : 1;
  const score = base * distFit * surfFit * fatiguePenalty * (0.85 + Math.random() * 0.3);

  // 相手のレベルはクラスが上がるにつれて上がるが、最大30戦を走り切れるよう
  // オープン・重賞クラス相当で頭打ちにする(実際も、格上げされた古馬は
  // 同格の相手と走り続ける)。頭打ち値は、標準的に育った馬の実力(base の
  // 中央値、おおよそ13前後)と拮抗する水準に合わせてあり、平均的な馬でも
  // 勝ち負けが五分五分に近くなるようにしている。
  const rivalMean = 7 + Math.min(slot, 11) * 0.55;
  const rivals = Array.from({ length: FIELD_SIZE - 1 }, () =>
    rivalMean * (0.75 + Math.random() * 0.5),
  );
  const placing = [...rivals, score].sort((a, b) => b - a).indexOf(score) + 1;

  return {
    raceName,
    distanceM,
    surface: spec.surface,
    placing,
    fieldSize: FIELD_SIZE,
    commentary: buildCommentary(horse.name, placing, FIELD_SIZE, landmarks[0]),
  };
}
