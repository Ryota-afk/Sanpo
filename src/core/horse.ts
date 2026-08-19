// 愛馬の誕生と、1回の散歩=1頭の生涯 のシミュレーション。
//
// 能力(HorseParams)は数値のまま UI に出さない。調教師コメントを通してのみ伝わる。

import type {
  Coat,
  CoursePlan,
  GrowthType,
  Horse,
  HorseCareerEntry,
  HorseParams,
  HorseSex,
  MoodFilter,
  RaceCountPreference,
  RouteRecord,
  RunningStyle,
  Temperament,
} from '../types';
import { GROWTH_TYPE_LABELS } from '../types';
import { buildLifeSchedule, resolveRaceCount, stageIndexForCheckpoint } from './career';
import { simulateRace } from './race';

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

// ── ルートをチェックポイントに分割する ───────────────────

/** 1チェックポイント分の「調教材料」。ルートを均等割りした近似値。 */
interface CheckpointInput {
  distanceM: number;
  wayTypeBreakdown: Record<string, number>;
  moodFilters: MoodFilter[];
  crossingsCount: number;
}

/**
 * ルート全体の集計値(道タイプ内訳・気分・横断歩道数)しか無いので、
 * 区間ごとの正確な内訳は再現できない。代わりに、全体の比率をベースに
 * チェックポイントごとランダムなブレを加えて割り振る近似で「今日はこの
 * あたりが調教のメインだった」感を出す。
 */
function sliceRouteIntoCheckpoints(route: RouteRecord, n: number): CheckpointInput[] {
  const bd = route.wayTypeBreakdown ?? {};
  const totalCrossings = route.crossings?.length ?? 0;
  const perCheckpointDistance = route.distanceM / n;

  const checkpoints: CheckpointInput[] = [];
  for (let i = 0; i < n; i++) {
    const jitter = 0.7 + Math.random() * 0.6; // 0.7〜1.3
    const wayTypeBreakdown: Record<string, number> = {};
    for (const [k, v] of Object.entries(bd)) {
      wayTypeBreakdown[k] = (v / n) * jitter;
    }
    checkpoints.push({
      distanceM: perCheckpointDistance,
      wayTypeBreakdown,
      moodFilters: route.moodFilters.filter(() => Math.random() < 0.7),
      crossingsCount: Math.round((totalCrossings / n) * (0.5 + Math.random())),
    });
  }
  return checkpoints;
}

// ── 調教 ──────────────────────────────────────────

// 成長型ごとの、各ステージ(育成期/2歳/3歳/4歳)での伸び方の倍率。
const GROWTH_MULT: Record<GrowthType, number[]> = {
  early: [1.4, 1.1, 0.8, 0.6],
  normal: [1.0, 1.0, 1.0, 1.0],
  late: [0.6, 0.8, 1.2, 1.5],
  sustained: [1.0, 1.05, 1.1, 1.15],
};

// 1回の調教チェックポイントあたりの基準運動量(旧: 1回の散歩相当)。
// チェックポイントは1ルートを細切れにしたもので距離が数百mしかないため、
// 「質」(道タイプ比率・気分)だけを反映し、量はこの固定値を基準にする。
// これによりレース数(=チェックポイント数)を増減しても、生涯トータルの
// 成長量が距離だけで理不尽に薄まらない。
const CHECKPOINT_TRAINING_BUDGET_KM = 1.6;

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
): string {
  if (stepsRatio > 0.15) return '坂路調教';
  if (moods.has('waterside')) return 'プール調教';
  if (moods.has('green')) return '放牧';
  if (trackRatio > 0.3) return 'ダートコース';
  if (avenueRatio > 0.3) return '芝コース追い';
  if (moods.has('residential')) return '周回コース';
  if (moods.has('quiet')) return '単走';
  if (moods.has('dark')) return '薄暮調教';
  return 'ウッドチップ調教';
}

function computeTrainingEffect(checkpoint: CheckpointInput): TrainingEffect {
  const totalM = Math.max(checkpoint.distanceM, 1);
  const km = CHECKPOINT_TRAINING_BUDGET_KM;
  const bd = checkpoint.wayTypeBreakdown;
  const stepsRatio = (bd.steps ?? 0) / totalM;
  const trackRatio = ((bd.track ?? 0) + (bd.path ?? 0)) / totalM;
  const avenueRatio = ((bd.primary ?? 0) + (bd.secondary ?? 0) + (bd.trunk ?? 0)) / totalM;
  const moods = new Set(checkpoint.moodFilters);

  const deltas: HorseParams = {
    speed: km * (0.5 + avenueRatio * 1.4),
    stamina: km * (0.6 + stepsRatio * 1.6),
    power: km * (0.4 + stepsRatio * 1.1 + trackRatio * 0.9),
    guts: km * 0.3 + (moods.has('dark') ? km * 0.5 : 0),
    wisdom:
      km * 0.25 +
      checkpoint.crossingsCount * 0.15 +
      (moods.has('quiet') || moods.has('residential') ? km * 0.35 : 0),
  };

  let fatigueDelta = km * 4 + stepsRatio * 10;
  if (moods.has('green')) fatigueDelta -= km * 6; // 放牧: 正味回復になる
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
    menuLabel: pickMenuLabel(stepsRatio, trackRatio, avenueRatio, moods),
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

/** 調教を1回分反映する。ageWalks・careerLog への追加は呼び出し元が行う。 */
function applyTraining(
  horse: Horse,
  checkpoint: CheckpointInput,
  stage: number,
): { horse: Horse; comment: string } {
  const mult = GROWTH_MULT[horse.growthType][stage];
  const effect = computeTrainingEffect(checkpoint);
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
  if (checkpoint.moodFilters.includes('dark') && Math.random() < 0.12) {
    temperament = shiftTemperament(temperament, 1);
  } else if (checkpoint.moodFilters.includes('green') && Math.random() < 0.12) {
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
      totalDistanceM: horse.totalDistanceM + checkpoint.distanceM,
    },
    comment,
  };
}

// ── 生涯シミュレーション(散歩1回=1頭の生涯) ──────────────

export interface LifetimeResult {
  /** 引退済みの最終状態。 */
  horse: Horse;
  /** 今回の生涯で起きた出来事(誕生後〜引退まで、時系列)。 */
  timeline: HorseCareerEntry[];
}

/**
 * 完了したルート1本ぶんを、愛馬の生涯まるごとに変換する。
 * horse は誕生直後(ageWalks: 0, status: 'active')の状態を渡す。
 */
export function simulateLifetime(horse: Horse, route: RouteRecord): LifetimeResult {
  const coursePlan: CoursePlan = horse.planCourse ?? 'turf';
  const preference: RaceCountPreference = horse.raceCountPreference ?? 'normal';
  const raceCount = resolveRaceCount(route.distanceM, preference);
  const schedule = buildLifeSchedule(raceCount);
  const checkpoints = sliceRouteIntoCheckpoints(route, schedule.length);

  let current = horse;
  let raceSlot = 0;
  const timeline: HorseCareerEntry[] = [];

  schedule.forEach((kind, i) => {
    const walkIndex = i + 1;
    if (kind === 'race') {
      const race = simulateRace(current, raceSlot, raceCount, coursePlan);
      raceSlot += 1;
      current = {
        ...current,
        fatigue: Math.min(100, current.fatigue + 6),
        wins: current.wins + (race.placing === 1 ? 1 : 0),
      };
      timeline.push({
        walkIndex,
        date: new Date().toISOString(),
        kind: 'race',
        text: race.commentary,
        raceName: race.raceName,
        placing: race.placing,
        fieldSize: race.fieldSize,
      });
    } else {
      const stage = stageIndexForCheckpoint(walkIndex, schedule.length);
      const trained = applyTraining(current, checkpoints[i], stage);
      current = trained.horse;
      timeline.push({
        walkIndex,
        date: new Date().toISOString(),
        kind: 'train',
        text: trained.comment,
      });
    }
  });

  current = {
    ...current,
    ageWalks: schedule.length,
    careerLog: [...current.careerLog, ...timeline],
  };

  const revealEntry: HorseCareerEntry = {
    walkIndex: schedule.length,
    date: new Date().toISOString(),
    kind: 'retire',
    text: `現役を引退しました。成長型は「${GROWTH_TYPE_LABELS[current.growthType]}」でした。通算 ${current.wins}勝。`,
  };
  timeline.push(revealEntry);
  current = {
    ...current,
    status: 'retired',
    growthRevealed: true,
    careerLog: [...current.careerLog, revealEntry],
  };

  return { horse: current, timeline };
}
