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
  RouteLandmarkKind,
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
  /** このチェックポイントの区間で実際に通過したランドマーク(位置つき)。 */
  landmarks: RouteLandmarkKind[];
}

/**
 * 道タイプ内訳(wayTypeBreakdown)は区間ごとの正確な内訳が無いため、
 * 全体の比率にランダムなブレを加えて割り振る近似のまま。
 *
 * 気分(moodBreakdown)は、実際に通った道路タグから来る実測の構成比なので、
 * 「その気分に触れていた割合」に応じてチェックポイントごと確率的に割り振る。
 * moodBreakdown が無い旧データ(この改修前に保存されたルート)は、
 * これまで通りユーザーが選んだ moodFilters をそのまま流用する。
 *
 * ランドマーク(コンビニ・川沿い)は実座標での近接判定から来る位置つきの
 * 事実なので、近似せず、通過した累積距離がそのチェックポイントの区間に
 * 収まるかどうかで厳密に割り振る。
 */
function sliceRouteIntoCheckpoints(route: RouteRecord, n: number): CheckpointInput[] {
  const bd = route.wayTypeBreakdown ?? {};
  const totalCrossings = route.crossings?.length ?? 0;
  const totalM = Math.max(route.distanceM, 1);
  const perCheckpointDistance = route.distanceM / n;
  const moodBd = route.moodBreakdown;
  const landmarks = route.landmarks ?? [];

  const checkpoints: CheckpointInput[] = [];
  for (let i = 0; i < n; i++) {
    const jitter = 0.7 + Math.random() * 0.6; // 0.7〜1.3
    const wayTypeBreakdown: Record<string, number> = {};
    for (const [k, v] of Object.entries(bd)) {
      wayTypeBreakdown[k] = (v / n) * jitter;
    }

    let moodFilters: MoodFilter[];
    if (moodBd && Object.keys(moodBd).length > 0) {
      moodFilters = (Object.entries(moodBd) as [MoodFilter, number][])
        .filter(([, meters]) => Math.random() < Math.min(1, (meters / totalM) * 1.3))
        .map(([mood]) => mood);
    } else {
      moodFilters = route.moodFilters.filter(() => Math.random() < 0.7);
    }

    const rangeStart = i * perCheckpointDistance;
    const rangeEnd = (i + 1) * perCheckpointDistance;
    const hitLandmarks = landmarks
      .filter((l) => l.atDistanceM >= rangeStart && l.atDistanceM < rangeEnd)
      .map((l) => l.kind);

    checkpoints.push({
      distanceM: perCheckpointDistance,
      wayTypeBreakdown,
      moodFilters,
      crossingsCount: Math.round((totalCrossings / n) * (0.5 + Math.random())),
      landmarks: hitLandmarks,
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
  landmarks: RouteLandmarkKind[];
}

// ルート上で実際に通過したランドマークの効果。統計的な近似ではなく、
// 実座標での近接判定に基づく確定イベント。
const LANDMARK_PHRASES: Record<RouteLandmarkKind, string> = {
  convenience: 'コンビニの前でひと息つきました',
  river: '河川敷を気持ちよく走りました',
  school: '下校時刻の学校前を通り、賑わいの中で気合が入りました',
  park: '公園の中を伸び伸びと駆け抜けました',
  shrine: '神社の前で一礼、気持ちが引き締まりました',
  station: '駅前の賑わいの中を駆け抜けました',
};

function applyLandmarkEffect(
  deltas: HorseParams,
  fatigueDelta: number,
  kind: RouteLandmarkKind,
  km: number,
): { deltas: HorseParams; fatigueDelta: number } {
  switch (kind) {
    case 'convenience':
      return {
        deltas: { ...deltas, wisdom: deltas.wisdom + km * 0.4 },
        fatigueDelta: fatigueDelta - km * 3,
      };
    case 'river':
      return {
        deltas: { ...deltas, stamina: deltas.stamina + km * 0.5 },
        fatigueDelta: fatigueDelta - km * 2,
      };
    case 'school':
      // 声援を受けたような賑わい。気合は入るが、多少気が張って疲れる。
      return {
        deltas: { ...deltas, guts: deltas.guts + km * 0.4 },
        fatigueDelta: fatigueDelta + km * 1,
      };
    case 'park':
      // 放牧に近い、正味回復寄りのひととき。
      return {
        deltas: { ...deltas, stamina: deltas.stamina + km * 0.3 },
        fatigueDelta: fatigueDelta - km * 4,
      };
    case 'shrine':
      // 一礼して気持ちを整える。賢さ・根性の両方に少し効く。
      return {
        deltas: {
          ...deltas,
          wisdom: deltas.wisdom + km * 0.3,
          guts: deltas.guts + km * 0.2,
        },
        fatigueDelta,
      };
    case 'station':
      // 人混みを縫って走る、活気はあるが騒々しい区間。
      return {
        deltas: { ...deltas, speed: deltas.speed + km * 0.4 },
        fatigueDelta: fatigueDelta + km * 1.5,
      };
  }
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

  let deltas: HorseParams = {
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

  // 実際に通過したランドマークは、統計的な気分よりさらに上乗せで効く。
  for (const kind of checkpoint.landmarks) {
    const applied = applyLandmarkEffect(deltas, fatigueDelta, kind, km);
    deltas = applied.deltas;
    fatigueDelta = applied.fatigueDelta;
  }

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
    landmarks: checkpoint.landmarks,
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
  // 実際に通過したランドマークがあれば、そのエピソードを主役にする。
  const opening = effect.landmarks[0]
    ? LANDMARK_PHRASES[effect.landmarks[0]]
    : `${effect.menuLabel}で調教しました`;
  const comment =
    `${opening}。${STAT_COMMENTS[topStat(effect.deltas)]}。${fatiguePhrase}`.trim();

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
      const race = simulateRace(
        current,
        raceSlot,
        raceCount,
        coursePlan,
        checkpoints[i].landmarks,
      );
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
