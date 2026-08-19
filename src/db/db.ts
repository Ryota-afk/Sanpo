import Dexie, { type Table } from 'dexie';
import type {
  CoursePlan,
  Horse,
  HorseSex,
  Place,
  RaceCountPreference,
  RouteRecord,
  Settings,
} from '../types';
import { createHorse, simulateLifetime, type LifetimeResult } from '../core/horse';
import { createFoal, createIntroAncestor } from '../core/breeding';

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
  horses!: Table<Horse, number>;

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
    // v3: ルートに status(in_progress/completed)を追加。
    // 選択した時点で保存し、歩行中にブラウザを閉じても復帰できるようにする。
    // 既存レコードは全て歩行完了済みなので completed とみなす。
    this.version(3)
      .stores({
        routes: '++id, date, status',
      })
      .upgrade(async (tx) => {
        await tx
          .table('routes')
          .toCollection()
          .modify((r: RouteRecord) => {
            if (r.status == null) r.status = 'completed';
          });
      });
    // v4: サンポ牧場(愛馬育成)。愛馬テーブルを追加。
    this.version(4).stores({
      horses: '++id, status',
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

/** ルートを「完了」にする(候補選択時に保存済みのレコードを更新)。 */
export async function markRouteCompleted(id: number): Promise<void> {
  await db.routes.update(id, { status: 'completed' });
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

/** 現役の愛馬を取得する。いなければ undefined。 */
export async function getActiveHorse(): Promise<Horse | undefined> {
  return db.horses.where('status').equals('active').first();
}

/**
 * ルート完了時に呼ぶ。出走待ちの愛馬がいれば、歩き終えたルートを
 * まるごとその馬の生涯(誕生〜引退)として一気に解決する。
 * 愛馬がいなければ何もせず null を返す。
 */
export async function completeWalkForHorse(
  routeId: number,
): Promise<LifetimeResult | null> {
  const route = await db.routes.get(routeId);
  if (!route) return null;
  const horse = await getActiveHorse();
  if (!horse || horse.id == null) return null;
  const result = simulateLifetime(horse, route);
  await db.horses.put({ ...result.horse, id: horse.id });
  return result;
}

// ── 血統(祖先の自動生成・配合) ─────────────────────

/**
 * 血統表の穴埋め用に、祖先を depth+1 世代分連鎖生成する
 * (depth=2 なら 親・祖父母・曾祖父母の3世代=14頭)。
 */
async function createAncestorChain(
  sex: HorseSex,
  remainingDepth: number,
): Promise<number> {
  const sireId =
    remainingDepth > 0 ? await createAncestorChain('male', remainingDepth - 1) : undefined;
  const damId =
    remainingDepth > 0
      ? await createAncestorChain('female', remainingDepth - 1)
      : undefined;
  return db.horses.add({ ...createIntroAncestor(sex), sireId, damId });
}

/**
 * 血統の無い新しい愛馬を迎える。3世代分の祖先(導入血統)を自動生成して配る。
 * これにより、最初の一頭から血統表が意味を持つ。
 */
export async function addHorseWithPedigree(
  name: string,
  sex: HorseSex,
  coursePlan: CoursePlan,
  raceCountPreference: RaceCountPreference,
): Promise<number> {
  return db.transaction('rw', db.horses, async () => {
    const sireId = await createAncestorChain('male', 2);
    const damId = await createAncestorChain('female', 2);
    return db.horses.add({
      ...createHorse(name, sex),
      sireId,
      damId,
      planCourse: coursePlan,
      raceCountPreference,
    });
  });
}

/**
 * 配合相手として選べる引退馬を性別で取得する。
 * 血統表の穴埋め用に自動生成された祖先(origin: 'intro')は除く。
 */
export async function getBreedingCandidates(sex: HorseSex): Promise<Horse[]> {
  const retired = await db.horses.where('status').equals('retired').toArray();
  return retired.filter((h) => h.sex === sex && (h.origin ?? 'bred') === 'bred');
}

/** horseId から遡って depth 世代以内の祖先(自分自身を含む)の id 集合を返す。 */
async function ancestorIdSet(rootId: number, depth: number): Promise<Set<number>> {
  const result = new Set<number>([rootId]);
  let frontier = [rootId];
  for (let g = 0; g < depth && frontier.length > 0; g++) {
    const horses = await db.horses.bulkGet(frontier);
    const next: number[] = [];
    for (const h of horses) {
      if (!h) continue;
      if (h.sireId != null) {
        result.add(h.sireId);
        next.push(h.sireId);
      }
      if (h.damId != null) {
        result.add(h.damId);
        next.push(h.damId);
      }
    }
    frontier = next;
  }
  return result;
}

/** 2頭を配合し、仔馬を新しい現役馬として迎える。 */
export async function breedHorses(
  name: string,
  sireId: number,
  damId: number,
  coursePlan: CoursePlan,
  raceCountPreference: RaceCountPreference,
): Promise<number> {
  const [sire, dam] = await Promise.all([db.horses.get(sireId), db.horses.get(damId)]);
  if (!sire || !dam) throw new Error('親馬が見つかりませんでした。');
  const [sireAncestors, damAncestors] = await Promise.all([
    ancestorIdSet(sireId, 4),
    ancestorIdSet(damId, 4),
  ]);
  const inbred = [...sireAncestors].some((id) => damAncestors.has(id));
  const sex: HorseSex = Math.random() < 0.5 ? 'male' : 'female';
  const foal = createFoal(name, sex, sire, dam, inbred);
  return db.horses.add({ ...foal, planCourse: coursePlan, raceCountPreference });
}

/** 自動採番の id を除いたコピーを返す(取り込み時に id を振り直すため)。 */
function withoutId<T extends { id?: number }>(o: T): Omit<T, 'id'> {
  const copy = { ...o };
  delete copy.id;
  return copy;
}

/** バックアップ(書き出し/読み込み)用のデータ形式。 */
export interface BackupData {
  app: 'sanpo';
  version: number;
  exportedAt: string;
  settings: Settings | null;
  routes: RouteRecord[];
  places: Place[];
  horses: Horse[];
}

/** 履歴・場所・設定・愛馬をまとめて書き出す。 */
export async function exportData(): Promise<BackupData> {
  const [settings, routes, places, horses] = await Promise.all([
    db.settings.get('user'),
    db.routes.orderBy('date').toArray(),
    db.places.orderBy('createdAt').toArray(),
    db.horses.toArray(),
  ]);
  return {
    app: 'sanpo',
    version: 4,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    routes,
    places,
    horses,
  };
}

/**
 * バックアップを読み込む。既存の履歴・場所・愛馬を置き換える(復元用)。
 * id は振り直すため、書き出し時の id は無視する。
 */
export async function importData(data: BackupData): Promise<void> {
  if (data.app !== 'sanpo' || !Array.isArray(data.routes)) {
    throw new Error('このファイルは Sanpo のバックアップではありません。');
  }
  await db.transaction(
    'rw',
    db.routes,
    db.places,
    db.settings,
    db.horses,
    async () => {
      await db.routes.clear();
      await db.places.clear();
      await db.horses.clear();
      // 旧バージョンのバックアップ(status 未対応)は completed とみなす。
      await db.routes.bulkAdd(
        data.routes.map((r) => withoutId({ ...r, status: r.status ?? 'completed' })),
      );
      if (Array.isArray(data.places)) {
        await db.places.bulkAdd(data.places.map(withoutId));
      }
      // 旧バージョンのバックアップ(v3以前)には horses が無い。
      // horses は sireId/damId で互いの id を参照しあうため、
      // routes/places と違って id を振り直さず、そのまま復元する。
      if (Array.isArray(data.horses)) {
        await db.horses.bulkPut(data.horses);
      }
      if (data.settings) {
        await db.settings.put({ ...data.settings, id: 'user' });
      }
    },
  );
}
