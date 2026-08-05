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
