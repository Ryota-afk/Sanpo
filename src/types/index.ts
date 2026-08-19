// アプリ全体で共有する型定義。

/** 緯度経度。 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** 気分フィルターの識別子。 */
export type MoodFilter =
  | 'bright' // 明るい道
  | 'avenue' // 大通り
  | 'dark' // 暗い道
  | 'residential' // 住宅街
  | 'quiet' // 人の少ない道
  | 'green' // 緑・自然の多い道
  | 'waterside' // 水辺の道
  | 'paved' // 舗装された歩きやすい道
  | 'sidewalk' // 歩道がある安全な道
  | 'narrow'; // 細い道

export const MOOD_LABELS: Record<MoodFilter, string> = {
  bright: '明るい道',
  avenue: '大通り',
  dark: '暗い道',
  residential: '住宅街',
  quiet: '人の少ない道',
  green: '緑の多い道',
  waterside: '水辺の道',
  paved: '舗装路',
  sidewalk: '歩道あり',
  narrow: '細い道',
};

export const ALL_MOODS: MoodFilter[] = [
  'bright',
  'dark',
  'avenue',
  'residential',
  'quiet',
  'green',
  'waterside',
  'paved',
  'sidewalk',
  'narrow',
];

/**
 * ルートの状態。
 * - in_progress: 候補として選択し、これから(または現在)歩いている途中。
 *   選択した時点で保存されるため、ブラウザを閉じても消えない。
 * - completed: 「このルートを歩いた」で完了にしたもの。
 */
export type RouteStatus = 'in_progress' | 'completed';

/** 保存済みルート(履歴の1件)。 */
export interface RouteRecord {
  id?: number;
  date: string; // ISO8601(選択した日時)
  status: RouteStatus;
  startCoord: LatLng;
  endCoord: LatLng;
  wayIds: string[]; // 通過したOSM way IDのリスト(被り率計算に使用)
  geometry: [number, number][]; // 表示用ポリライン座標列 [lat, lng]
  distanceM: number;
  durationMin: number;
  moodFilters: MoodFilter[];
  overlapRateAtSelection: number; // 選択時点の被り率(%)
  crossings?: [number, number][]; // ルート上の横断歩道の座標 [lat, lng]
  wayTypeBreakdown?: Record<string, number>; // 通過した道タイプの内訳(道タイプ→距離m)
}

/** 登録した場所(自宅・バイト先など)。 */
export interface Place {
  id?: number;
  name: string;
  coord: LatLng;
  createdAt: string; // ISO8601
}

/** ユーザー設定(単一レコード)。 */
export interface Settings {
  id: 'user';
  paceMinPerKm: number;
  defaultOverlapThreshold: number; // %
}

/** 提案された候補ルート(未保存)。 */
export interface RouteCandidate {
  /** 表示用ポリライン座標列 [lat, lng]。 */
  geometry: [number, number][];
  /** 通過したOSM way IDのリスト。 */
  wayIds: string[];
  distanceM: number;
  durationMin: number;
  /** 被り率(%)。 */
  overlapRate: number;
  /** 通過した道タイプの内訳(道タイプ→距離m)。 */
  wayTypeBreakdown: Record<string, number>;
  /** ルート上の横断歩道の座標 [lat, lng]。 */
  crossings: [number, number][];
}

/** ルート提案の結果。 */
export interface ProposalResult {
  candidates: RouteCandidate[];
  /** 被り率の閾値を緩和した場合の、実際に採用した閾値(%)。 */
  usedThreshold: number;
  /** 閾値を緩和したかどうか。 */
  relaxed: boolean;
  /** 候補が生成できなかった場合の説明メッセージ。 */
  message?: string;
}

// ── サンポ牧場(愛馬育成) ──────────────────────────────

export type HorseSex = 'male' | 'female';

export type Coat =
  | 'kage' // 鹿毛
  | 'kuroKage' // 黒鹿毛
  | 'kuri' // 栗毛
  | 'tochiguri' // 栃栗毛
  | 'ao' // 青毛
  | 'ashi' // 芦毛
  | 'shiro'; // 白毛

export const COAT_LABELS: Record<Coat, string> = {
  kage: '鹿毛',
  kuroKage: '黒鹿毛',
  kuri: '栗毛',
  tochiguri: '栃栗毛',
  ao: '青毛',
  ashi: '芦毛',
  shiro: '白毛',
};

export const COAT_COLORS: Record<Coat, string> = {
  kage: '#6B4A2F',
  kuroKage: '#3E2A1C',
  kuri: '#9A5C2C',
  tochiguri: '#6E3A22',
  ao: '#1C1A19',
  ashi: '#C9C6C0',
  shiro: '#F2F0EA',
};

/** 成長型。引退して開示されるまでは非公開。 */
export type GrowthType = 'early' | 'normal' | 'late' | 'sustained';

export const GROWTH_TYPE_LABELS: Record<GrowthType, string> = {
  early: '早熟',
  normal: '普通',
  late: '晩成',
  sustained: '持続',
};

export type Temperament = 'calm' | 'gentle' | 'spirited' | 'difficult' | 'fierce';

export const TEMPERAMENT_LABELS: Record<Temperament, string> = {
  calm: 'おとなしい',
  gentle: '素直',
  spirited: '勝気',
  difficult: '気難しい',
  fierce: '激しい',
};

export type RunningStyle = 'front' | 'stalk' | 'chase' | 'closer';

export const RUNNING_STYLE_LABELS: Record<RunningStyle, string> = {
  front: '逃げ',
  stalk: '先行',
  chase: '差し',
  closer: '追込',
};

export type DistanceAptitude = 'sprint' | 'mile' | 'middle' | 'long';

export const DISTANCE_APTITUDE_LABELS: Record<DistanceAptitude, string> = {
  sprint: '短距離',
  mile: 'マイル',
  middle: '中距離',
  long: '長距離',
};

/** 五能力。ユーザーには数値のまま見せず、調教師コメント経由で伝える。 */
export interface HorseParams {
  speed: number;
  stamina: number;
  power: number;
  guts: number;
  wisdom: number;
}

export type CareerEntryKind = 'train' | 'race' | 'retire';

/** キャリア中の1回分の出来事(調教・レース・引退)。 */
export interface HorseCareerEntry {
  walkIndex: number; // キャリア中の何回目の散歩か(1〜12)
  date: string; // ISO8601
  kind: CareerEntryKind;
  text: string; // 調教師コメント、または実況テキスト
  raceName?: string;
  placing?: number;
  fieldSize?: number;
}

export type HorseStatus = 'active' | 'retired';

/** 愛馬(競走馬)。 */
export interface Horse {
  id?: number;
  name: string;
  sex: HorseSex;
  coat: Coat;
  temperament: Temperament;
  runningStyle: RunningStyle;
  /** 成長型。内部的には常に保持するが、引退まで UI には出さない。 */
  growthType: GrowthType;
  growthRevealed: boolean;
  status: HorseStatus;
  birthAt: string; // ISO8601
  /** キャリア中の散歩回数(0〜12)。歩くたびに進む、この馬固有の暦。 */
  ageWalks: number;
  fatigue: number; // 0〜100
  params: HorseParams;
  /** 調教で通った芝系・ダート系の道のりの累計(m)。適性の判定材料。 */
  turfExposureM: number;
  dirtExposureM: number;
  totalDistanceM: number;
  wins: number;
  careerLog: HorseCareerEntry[];
}
