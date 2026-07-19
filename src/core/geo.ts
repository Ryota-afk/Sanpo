import type { LatLng } from '../types';

const EARTH_RADIUS_M = 6371000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** 2点間の大円距離(メートル)を Haversine 公式で算出する。 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 点aから点bへの方位角(度、0=北・時計回り)。 */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** ポリライン(座標列)の総距離(メートル)。 */
export function polylineLengthMeters(coords: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i]);
  }
  return total;
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * 2点を含むバウンディングボックスを、指定マージン(メートル)を加えて算出する。
 */
export function boundingBox(a: LatLng, b: LatLng, marginM: number): BBox {
  const south = Math.min(a.lat, b.lat);
  const north = Math.max(a.lat, b.lat);
  const west = Math.min(a.lng, b.lng);
  const east = Math.max(a.lng, b.lng);

  // 緯度1度 ≒ 111,320m。経度は緯度によって縮む。
  const latMargin = marginM / 111320;
  const midLat = (south + north) / 2;
  const lngMargin = marginM / (111320 * Math.cos(toRad(midLat)) || 1);

  return {
    south: south - latMargin,
    west: west - lngMargin,
    north: north + latMargin,
    east: east + lngMargin,
  };
}

/** メートルをkm表記(小数1桁)に整形する。 */
export function formatKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}
