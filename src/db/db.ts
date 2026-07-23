import Dexie, { type Table } from 'dexie';
import type { Place, RouteRecord, Settings } from '../types';

/** Overpass 取得結果のキャッシュエントリ。 */
export interface OverpassCacheEntry {
  /** バウンディングボックスを丸めて作ったキー。 */
  key: string;
  /** 取得した生JSON(OverpassのElementリスト)。 */
  json: unknown;
  /** 取得時刻(epoch ms)。 */
  fetchedAt: number;
}

export const HISTORY_LIMIT = 10;
export const DEFAULT_PACE_MIN_PER_KM = 12;
export const DEFAULT_OVERLAP_THRESHOLD = 30;
export const OVERPASS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24時間

class SanpoDB extends Dexie {
  routes!: Table<RouteRecord, number>;
  settings!: Table<Settings, string>;
  overpassCache!: Table<OverpassCacheEntry, string>;
  places!: Table<Place, number>;

  constructor() {
    super('sanpo-db');
    this.version(1).stores({
      routes: '++id, date',
      settings: 'id',
      overpassCache: 'key, fetchedAt',
    });
    // v2: 場所登録テーブルを追加(既存テーブルはそのまま引き継がれる)。
    this.version(2).stores({
      places: '++id, name, createdAt',
    });
  }
}

export const db = new SanpoDB();

/** 設定を取得する。未登録なら undefined。 */
export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get('user');
}

/** 設定を保存する。 */
export async function saveSettings(
  paceMinPerKm: number,
  defaultOverlapThreshold: number,
): Promise<void> {
  const record: Settings = {
    id: 'user',
    paceMinPerKm,
    defaultOverlapThreshold,
  };
  await db.settings.put(record);
}

/** 直近 HISTORY_LIMIT 件のルートを新しい順に取得する。 */
export async function getRecentRoutes(
  limit = HISTORY_LIMIT,
): Promise<RouteRecord[]> {
  return db.routes.orderBy('date').reverse().limit(limit).toArray();
}

/**
 * ルートを保存する。保存後、HISTORY_LIMIT を超える最古のレコードをFIFOで削除する。
 */
export async function saveRoute(record: RouteRecord): Promise<number> {
  return db.transaction('rw', db.routes, async () => {
    const id = await db.routes.add(record);
    const all = await db.routes.orderBy('date').toArray();
    if (all.length > HISTORY_LIMIT) {
      const excess = all.slice(0, all.length - HISTORY_LIMIT);
      await Promise.all(
        excess.map((r) => (r.id != null ? db.routes.delete(r.id) : undefined)),
      );
    }
    return id;
  });
}

/** ルートを削除する。 */
export async function deleteRoute(id: number): Promise<void> {
  await db.routes.delete(id);
}

/** 登録した場所を作成順(古い順)で取得する。 */
export async function getPlaces(): Promise<Place[]> {
  return db.places.orderBy('createdAt').toArray();
}

/** 場所を追加する。 */
export async function addPlace(
  name: string,
  coord: { lat: number; lng: number },
): Promise<number> {
  return db.places.add({
    name,
    coord,
    createdAt: new Date().toISOString(),
  });
}

/** 場所の名前・座標を更新する。 */
export async function updatePlace(
  id: number,
  changes: Partial<Pick<Place, 'name' | 'coord'>>,
): Promise<void> {
  await db.places.update(id, changes);
}

/** 場所を削除する。 */
export async function deletePlace(id: number): Promise<void> {
  await db.places.delete(id);
}
