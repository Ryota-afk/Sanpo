import type { LatLng } from '../types';

/**
 * OpenRouteService(foot-walking)による補助的なルート探索。
 *
 * 本体のルート生成は Overpass タグを反映した自前グラフ探索で行うため、
 * ORS は「大まかな経路の妥当性チェック」や「代替案の参考取得」の補助として扱う。
 * API キーは任意。未設定の場合はこの機能を単にスキップする。
 */

const ORS_ENDPOINT =
  'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

const ORS_API_KEY: string | undefined = import.meta.env.VITE_ORS_API_KEY;

export interface OrsAlternative {
  /** [lat, lng] のポリライン。 */
  geometry: [number, number][];
  distanceM: number;
}

/** ORS が利用可能(APIキー設定済み)かどうか。 */
export function isOrsAvailable(): boolean {
  return typeof ORS_API_KEY === 'string' && ORS_API_KEY.length > 0;
}

/**
 * ORS で代替ルートを取得する。APIキー未設定・エラー時は空配列を返す(補助機能のため握りつぶす)。
 */
export async function fetchOrsAlternatives(
  start: LatLng,
  end: LatLng,
): Promise<OrsAlternative[]> {
  if (!isOrsAvailable()) return [];

  try {
    const res = await fetch(ORS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: ORS_API_KEY as string,
      },
      body: JSON.stringify({
        coordinates: [
          [start.lng, start.lat],
          [end.lng, end.lat],
        ],
        alternative_routes: {
          target_count: 3,
          share_factor: 0.6,
          weight_factor: 1.6,
        },
      }),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number][] };
        properties: { summary: { distance: number } };
      }>;
    };

    return (json.features ?? []).map((f) => ({
      // GeoJSON は [lng, lat] なので [lat, lng] に変換する。
      geometry: f.geometry.coordinates.map(
        ([lng, lat]) => [lat, lng] as [number, number],
      ),
      distanceM: f.properties.summary.distance,
    }));
  } catch {
    return [];
  }
}
