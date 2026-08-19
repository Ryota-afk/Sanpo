import type { RouteCandidate, RouteRecord } from '../types';

/**
 * 保存済みルート(RouteRecord)を、DetailScreen 表示用の RouteCandidate 形式に変換する。
 * 履歴タブから「続ける」で再開する際に使う。
 */
export function routeRecordToCandidate(record: RouteRecord): RouteCandidate {
  return {
    geometry: record.geometry,
    wayIds: record.wayIds,
    distanceM: record.distanceM,
    durationMin: record.durationMin,
    overlapRate: record.overlapRateAtSelection,
    wayTypeBreakdown: record.wayTypeBreakdown ?? {},
    crossings: record.crossings ?? [],
    moodBreakdown: record.moodBreakdown ?? {},
    landmarks: record.landmarks ?? [],
  };
}
