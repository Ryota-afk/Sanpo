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

// 公開インスタンス。レート制限に配慮し、キャッシュを優先して呼び出しを抑える。
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

// クエリ内容(取得タグ)を変えたらこの版数を上げる。古いキャッシュを無効化して再取得させる。
const QUERY_SCHEMA_VERSION = 2;

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
 */
function buildQuery(bbox: BBox): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:30];
(
  way["highway"~"^(footway|path|pedestrian|steps|living_street|residential|unclassified|service|tertiary|secondary|primary|trunk|cycleway|track)$"](${b});
  way["landuse"="residential"](${b});
  node["highway"="street_lamp"](${b});
  way["leisure"~"^(park|garden|nature_reserve|recreation_ground|common|village_green)$"](${b});
  way["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|greenfield|cemetery)$"](${b});
  way["natural"~"^(wood|scrub|heath|grassland|tree_row)$"](${b});
  way["natural"="water"](${b});
  way["waterway"~"^(river|stream|canal|riverbank)$"](${b});
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
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(
      `Overpass API エラー (${res.status})。時間をおいて再試行してください。`,
    );
  }

  const json = (await res.json()) as OverpassResponse;
  await db.overpassCache.put({ key, json, fetchedAt: Date.now() });
  return json;
}
