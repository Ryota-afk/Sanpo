import type { LatLng } from '../types';
import { haversineMeters } from './geo';

/**
 * 点が近くにあるか(半径内)を高速に判定するグリッド索引。
 * 街灯・水辺など「近さ」で気分を判定する用途に使う。
 */
export class PointGrid {
  private cells = new Map<string, LatLng[]>();
  private readonly cellLatDeg: number;
  private readonly cellLngDeg: number;
  private readonly radiusM: number;
  private empty = true;

  /**
   * @param radiusM 近いとみなす距離(メートル)。セルサイズも兼ねる。
   * @param refLat 経度→メートル換算の基準緯度(バウンディングボックス中心など)。
   */
  constructor(radiusM: number, refLat: number) {
    this.radiusM = radiusM;
    this.cellLatDeg = radiusM / 111320;
    const cosLat = Math.cos((refLat * Math.PI) / 180) || 1;
    this.cellLngDeg = radiusM / (111320 * cosLat);
  }

  private cellKey(latIdx: number, lngIdx: number): string {
    return `${latIdx}:${lngIdx}`;
  }

  add(p: LatLng): void {
    const latIdx = Math.floor(p.lat / this.cellLatDeg);
    const lngIdx = Math.floor(p.lng / this.cellLngDeg);
    const key = this.cellKey(latIdx, lngIdx);
    const arr = this.cells.get(key);
    if (arr) arr.push(p);
    else this.cells.set(key, [p]);
    this.empty = false;
  }

  isEmpty(): boolean {
    return this.empty;
  }

  /** 指定点の半径内に登録済みの点があるか。周囲3×3セルのみを調べる。 */
  hasWithin(p: LatLng): boolean {
    if (this.empty) return false;
    const latIdx = Math.floor(p.lat / this.cellLatDeg);
    const lngIdx = Math.floor(p.lng / this.cellLngDeg);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const arr = this.cells.get(this.cellKey(latIdx + di, lngIdx + dj));
        if (!arr) continue;
        for (const q of arr) {
          if (haversineMeters(p, q) <= this.radiusM) return true;
        }
      }
    }
    return false;
  }
}

/** バウンディングボックス付きのポリゴン(内外判定の枝刈り用)。 */
export interface PolygonWithBBox {
  polygon: LatLng[];
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** 座標列からバウンディングボックス付きポリゴンを作る(頂点3未満は null)。 */
export function makePolygon(coords: LatLng[]): PolygonWithBBox | null {
  if (coords.length < 3) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }
  return { polygon: coords, minLat, maxLat, minLng, maxLng };
}

/** レイキャスティングによる点in多角形判定。 */
function pointInPolygon(pt: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** ポリゴン群のいずれかに点が含まれるか(バウンディングボックスで枝刈り)。 */
export function polygonsContain(
  pt: LatLng,
  polys: PolygonWithBBox[],
): boolean {
  for (const p of polys) {
    if (
      pt.lat < p.minLat ||
      pt.lat > p.maxLat ||
      pt.lng < p.minLng ||
      pt.lng > p.maxLng
    ) {
      continue;
    }
    if (pointInPolygon(pt, p.polygon)) return true;
  }
  return false;
}
