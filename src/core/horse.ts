// 愛馬の誕生と、散歩1回分の調教反映。
//
// 能力(HorseParams)は数値のまま UI に出さない。調教師コメントを通してのみ伝わる。

import type {
  Coat,
  GrowthType,
  Horse,
  HorseCareerEntry,
  HorseParams,
  HorseSex,
  MoodFilter,
  RouteRecord,
  RunningStyle,
  Temperament,
} from '../types';
import { GROWTH_TYPE_LABELS } from '../types';
import { CAREER_LENGTH_WALKS, CAREER_SCHEDULE, stageIndexForWalk } from './career';
import { simulateRace, type RaceOutcome } from './race';

// ── 誕生 ──────────────────────────────────────────

/** 毛色の抽選テーブル(相対重み)。 */
const COAT_TABLE: [Coat, number][] = [
  ['kage', 32],
  ['kuroKage', 24],
  ['kuri', 21],
  ['tochiguri', 11],
  ['ao', 6],
  ['ashi', 5],
  ['shiro', 0.4],
];

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function rollCoat(): Coat {
  const total = COAT_TABLE.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [coat, w] of COAT_TABLE) {
    if (r < w) return coat;
    r -= w;
  }
  return COAT_TABLE[0][0];
}

export const TEMPERAMENTS: Temperament[] = ['calm', 'gentle', 'spirited', 'difficult', 'fierce'];
export const RUNNING_STYLES: RunningStyle[] = ['front', 'stalk', 'chase', 'closer'];
export const GROWTH_TYPES: GrowthType[] = ['early', 'normal', 'late', 'sustained'];

export function createHorse(name: string, sex: HorseSex): Horse {
  return {
    name,
    sex,
    coat: rollCoat(),
    temperament: pick(TEMPERAMENTS),
    runningStyle: pick(RUNNING_STYLES),
    growthType: pick(GROWTH_TYPES),
    growthRevealed: false,
    status: 'active',
    birthAt: new Date().toISOString(),
    ageWalks: 0,
    fatigue: 20,
    params: { speed: 8, stamina: 8, power: 8, guts: 8, wisdom: 8 },
    turfExposureM: 0,
    dirtExposureM: 0,
    totalDistanceM: 0,
    wins: 0,
    careerLog: [],
    origin: 'bred',
  };
}

// ── 調教 ──────────────────────────────────────────

// 成長型ごとの、各ステージ(育成期/2歳/3歳/4歳)での伸び方の倍率。
const GROWTH_MULT: Record<GrowthType, number[]> = {
  early: [1.4, 1.1, 0.8, 0.6],
  normal: [1.0, 1.0, 1.0, 1.0],
  late: [0.6, 0.8, 1.2, 1.5],
  sustained: [1.0, 1.05, 1.1, 1.15],
};

interface TrainingEffect {
  deltas: HorseParams;
  fatigueDelta: number;
  menuLabel: string;
  turfMeters: number;
  dirtMeters: number;
}

function pickMenuLabel(
  stepsRatio: number,
  trackRatio: number,
  avenueRatio: number,
  moods: Set<MoodFilter>,
  km: number,
): string {
  if (stepsRatio > 0.15) return '坂路調教';
  if (moods.has('waterside')) return 'プール調教';
  if (moods.has('green') && km < 2) return '放牧';
  if (trackRatio > 0.3) return 'ダートコース';
  if (avenueRatio > 0.3) return '芝コース追い';
  if (moods.has('residential')) return '周回コース';
  if (moods.has('quiet')) return '単走';
  if (moods.has('dark')) return '薄暮調教';
  return 'ウッドチップ調教';
}

// 既存の RouteRecord(気分フィルター・道タイプ内訳・横断歩道数)から、
// そのまま調教メニューの効果を計算する。新しい入力 UI は要らない。
function computeTrainingEffect(route: RouteRecord): TrainingEffect {
  const totalM = Math.max(route.distanceM, 1);
  const km = totalM / 1000;
  const bd = route.wayTypeBreakdown ?? {};
  const stepsRatio = (bd.steps ?? 0) / totalM;
  const trackRatio = ((bd.track ?? 0) + (bd.path ?? 0)) / totalM;
  const avenueRatio = ((bd.primary ?? 0) + (bd.secondary ?? 0) + (bd.trunk ?? 0)) / totalM;
  const moods = new Set(route.moodFilters);
  const crossings = route.crossings?.length ?? 0;

  const deltas: HorseParams = {
    speed: km * (0.5 + avenueRatio * 1.4),
    stamina: km * (0.6 + stepsRatio * 1.6),
    power: km * (0.4 + stepsRatio * 1.1 + trackRatio * 0.9),
    guts: km * 0.3 + (moods.has('dark') ? km * 0.5 : 0),
    wisdom:
      km * 0.25 +
      crossings * 0.15 +
      (moods.has('quiet') || moods.has('residential') ? km * 0.35 : 0),
  };

  let fatigueDelta = km * 4 + stepsRatio * 10;
  if (moods.has('green')) fatigueDelta -= km * 6; // 放牧: 短めなら正味回復になる
  if (moods.has('waterside')) fatigueDelta -= km * 3;

  const turfMeters =
    (bd.primary ?? 0) +
    (bd.secondary ?? 0) +
    (bd.tertiary ?? 0) +
    (bd.trunk ?? 0) +
    (bd.residential ?? 0) +
    (bd.unclassified ?? 0);
  const dirtMeters = (bd.track ?? 0) + (bd.path ?? 0);

  return {
    deltas,
    fatigueDelta,
    menuLabel: pickMenuLabel(stepsRatio, trackRatio, avenueRatio, moods, km),
    turfMeters,
    dirtMeters,
  };
}

const STAT_COMMENTS: Record<keyof HorseParams, string> = {
  speed: '最後の伸びが目立ちました',
  stamina: 'バテずに最後まで運べていました',
  power: '踏み込みがしっかりしてきました',
  guts: '苦しい場面でも脚を落としませんでした',
  wisdom: '落ち着いて折り合えていました',
};

function topStat(deltas: HorseParams): keyof HorseParams {
  return (Object.keys(deltas) as (keyof HorseParams)[]).reduce((a, b) =>
    deltas[b] > deltas[a] ? b : a,
  );
}

const TEMPERAMENT_ORDER: Temperament[] = [
  'calm',
  'gentle',
  'spirited',
  'difficult',
  'fierce',
];

function shiftTemperament(t: Temperament, dir: 1 | -1): Temperament {
  const idx = TEMPERAMENT_ORDER.indexOf(t);
  const next = Math.min(TEMPERAMENT_ORDER.length - 1, Math.max(0, idx + dir));
  return TEMPERAMENT_ORDER[next];
}

/** 調教を1回分反映する。ageWalks・careerLog への追加は呼び出し元(processWalk)が行う。 */
function applyTraining(
  horse: Horse,
  route: RouteRecord,
): { horse: Horse; comment: string } {
  const walkIndex = horse.ageWalks + 1;
  const mult = GROWTH_MULT[horse.growthType][stageIndexForWalk(walkIndex)];
  const effect = computeTrainingEffect(route);
  // 疲労が溜まっていると、調教の効果が半減する。
  const fatiguePenalty = horse.fatigue > 70 ? 0.5 : 1;
  const scale = mult * fatiguePenalty;

  const params: HorseParams = {
    speed: horse.params.speed + effect.deltas.speed * scale,
    stamina: horse.params.stamina + effect.deltas.stamina * scale,
    power: horse.params.power + effect.deltas.power * scale,
    guts: horse.params.guts + effect.deltas.guts * scale,
    wisdom: horse.params.wisdom + effect.deltas.wisdom * scale,
  };

  const fatigueBefore = horse.fatigue;
  const fatigue = Math.min(100, Math.max(0, horse.fatigue + effect.fatigueDelta));

  let temperament = horse.temperament;
  if (route.moodFilters.includes('dark') && Math.random() < 0.12) {
    temperament = shiftTemperament(temperament, 1);
  } else if (route.moodFilters.includes('green') && Math.random() < 0.12) {
    temperament = shiftTemperament(temperament, -1);
  }

  const fatiguePhrase =
    fatiguePenalty < 1
      ? ' 疲れが溜まっていて、本来の動きが出せていません。次は軽めにしましょう。'
      : fatigueBefore < 20
        ? ' 状態は良さそうです。'
        : '';
  const comment =
    `${effect.menuLabel}で調教しました。${STAT_COMMENTS[topStat(effect.deltas)]}。${fatiguePhrase}`.trim();

  return {
    horse: {
      ...horse,
      params,
      fatigue,
      temperament,
      turfExposureM: horse.turfExposureM + effect.turfMeters,
      dirtExposureM: horse.dirtExposureM + effect.dirtMeters,
      totalDistanceM: horse.totalDistanceM + route.distanceM,
    },
    comment,
  };
}

// ── 散歩1回分の反映(調教 or レース) ──────────────────

export interface WalkReport {
  horse: Horse;
  entry: HorseCareerEntry;
  race?: RaceOutcome;
  retired: boolean;
}

/** 散歩1回分を、愛馬のキャリアに反映する。 */
export function processWalk(horse: Horse, route: RouteRecord): WalkReport {
  const walkIndex = horse.ageWalks + 1;
  const isRace = CAREER_SCHEDULE[walkIndex - 1] === 'race';

  let updated: Horse;
  let entry: HorseCareerEntry;
  let race: RaceOutcome | undefined;

  if (isRace) {
    race = simulateRace(horse, walkIndex);
    updated = {
      ...horse,
      fatigue: Math.min(100, horse.fatigue + 6),
      wins: horse.wins + (race.placing === 1 ? 1 : 0),
    };
    entry = {
      walkIndex,
      date: new Date().toISOString(),
      kind: 'race',
      text: race.commentary,
      raceName: race.raceName,
      placing: race.placing,
      fieldSize: race.fieldSize,
    };
  } else {
    const trained = applyTraining(horse, route);
    updated = trained.horse;
    entry = {
      walkIndex,
      date: new Date().toISOString(),
      kind: 'train',
      text: trained.comment,
    };
  }

  updated = { ...updated, ageWalks: walkIndex, careerLog: [...updated.careerLog, entry] };

  let retired = false;
  if (walkIndex >= CAREER_LENGTH_WALKS) {
    retired = true;
    const revealEntry: HorseCareerEntry = {
      walkIndex,
      date: new Date().toISOString(),
      kind: 'retire',
      text: `現役を引退しました。成長型は「${GROWTH_TYPE_LABELS[updated.growthType]}」でした。通算 ${updated.wins}勝。`,
    };
    updated = {
      ...updated,
      status: 'retired',
      growthRevealed: true,
      careerLog: [...updated.careerLog, revealEntry],
    };
  }

  return { horse: updated, entry, race, retired };
}
