import { db, OVERPASS_CACHE_TTL_MS } from '../db/db';
import type { BBox } from '../core/geo';

/** Overpass の要素(node / way)を表す最小限の型。 */
export interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

export type OverpassElement = OverpassNode | OverpassWay;

export interface OverpassResponse {
  elements: OverpassElement[];
}

// 公開インスタンス(CORS対応のミラー)。混雑や 504/429 のときは順に切り替える。
// レート制限に配慮し、キャッシュを優先して呼び出しを抑える。
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// 1リクエストあたりのクライアント側タイムアウト(ミリ秒)。
// これを過ぎたら中断して次のミラーへ切り替える。
const REQUEST_TIMEOUT_MS = 30000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// クエリ内容(取得タグ)を変えたらこの版数を上げる。古いキャッシュを無効化して再取得させる。
const QUERY_SCHEMA_VERSION = 5;

/**
 * バウンディングボックスから安定したキャッシュキーを作る。
 * 座標を丸めることで、近いエリアの再取得を減らす(約11m 精度の 3 桁)。
 */
function cacheKey(bbox: BBox): string {
  const r = (n: number) => n.toFixed(3);
  return `v${QUERY_SCHEMA_VERSION}:${r(bbox.south)},${r(bbox.west)},${r(
    bbox.north,
  )},${r(bbox.east)}`;
}

/**
 * Overpass QL クエリを組み立てる。
 * 歩行に関連する道路に加え、気分フィルター判定用の周辺データを取得する:
 * - landuse=residential(住宅街)
 * - 街灯ノード highway=street_lamp(明るい/暗いの精度向上)
 * - 公園・緑地・並木(緑の多い道)
 * - 河川・水域(水辺の道)
 * - コンビニ・学校・神社仏閣・駅(ルート上のランドマーク判定用)
 */
function buildQuery(bbox: BBox): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:30];
(
  way["highway"~"^(footway|path|pedestrian|steps|living_street|residential|unclassified|service|tertiary|secondary|primary|trunk|cycleway|track)$"](${b});
  way["landuse"="residential"](${b});
  node["highway"="street_lamp"](${b});
  node["highway"="crossing"](${b});
  node["crossing"](${b});
  way["leisure"~"^(park|garden|nature_reserve|recreation_ground|common|village_green)$"](${b});
  way["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|greenfield|cemetery)$"](${b});
  way["natural"~"^(wood|scrub|heath|grassland|tree_row)$"](${b});
  way["natural"="water"](${b});
  way["waterway"~"^(river|stream|canal|riverbank)$"](${b});
  node["shop"="convenience"](${b});
  node["amenity"="school"](${b});
  way["amenity"="school"](${b});
  node["amenity"="place_of_worship"](${b});
  way["amenity"="place_of_worship"](${b});
  node["railway"="station"](${b});
  way["railway"="station"](${b});
);
(._;>;);
out body;`;
}

/**
 * 指定バウンディングボックスの道路データを取得する。
 * IndexedDB キャッシュ(TTL: 24h)を優先し、なければ Overpass API を呼ぶ。
 */
export async function fetchRoadNetwork(
  bbox: BBox,
): Promise<OverpassResponse> {
  const key = cacheKey(bbox);
  const cached = await db.overpassCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < OVERPASS_CACHE_TTL_MS) {
    return cached.json as OverpassResponse;
  }

  const query = buildQuery(bbox);
  const json = await requestWithFallback(query);
  await db.overpassCache.put({ key, json, fetchedAt: Date.now() });
  return json;
}

/** 一時的な混雑を表すHTTPステータス(次のミラーへ切り替える対象)。 */
function isRetriable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * 複数のミラーを順に試し、混雑(429/504等)やタイムアウト時は次へフォールバックする。
 * 各ミラーを2周まで試し、指数バックオフを挟む。
 */
async function requestWithFallback(query: string): Promise<OverpassResponse> {
  const body = `data=${encodeURIComponent(query)}`;
  let lastError: unknown = null;
  const totalAttempts = OVERPASS_ENDPOINTS.length * 2;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });

      if (isRetriable(res.status)) {
        lastError = new Error(`Overpass 混雑 (${res.status})`);
        await sleep(500 * 2 ** Math.floor(attempt / OVERPASS_ENDPOINTS.length));
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`Overpass エラー (${res.status})`);
        continue;
      }
      return (await res.json()) as OverpassResponse;
    } catch (e) {
      // タイムアウト(abort)やネットワークエラーは次のミラーへ。
      lastError = e;
      await sleep(300);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    '道路データの取得に失敗しました(サーバー混雑の可能性)。少し時間をおいて、もう一度お試しください。' +
      (lastError instanceof Error ? ` [${lastError.message}]` : ''),
  );
}
