import createGraph, { type Graph } from 'ngraph.graph';
import type { LatLng, MoodFilter } from '../types';
import type { OverpassResponse, OverpassWay } from '../api/overpass';
import { classifyEdge } from './mood';
import { haversineMeters } from './geo';

/** グラフの各リンク(道路セグメント)に付与するメタデータ。 */
export interface EdgeData {
  wayId: string;
  highway: string;
  lengthM: number;
  moods: Set<MoodFilter>;
}

/** ノード id -> 座標。ngraph ノードの data にも保持する。 */
export interface NodeData extends LatLng {}

export interface RoadGraph {
  graph: Graph<NodeData, EdgeData>;
  /** ノード id -> 座標(最近傍探索・座標復元に使用)。 */
  nodeCoords: Map<number, LatLng>;
}

/** 閉じたポリゴン(landuse=residential)内かどうかをレイキャスティングで判定。 */
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

interface PolygonWithBBox {
  polygon: LatLng[];
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function buildResidentialPolygons(
  ways: OverpassWay[],
  nodeCoords: Map<number, LatLng>,
): PolygonWithBBox[] {
  const polys: PolygonWithBBox[] = [];
  for (const way of ways) {
    if (way.tags?.landuse !== 'residential') continue;
    const coords: LatLng[] = [];
    for (const nid of way.nodes) {
      const c = nodeCoords.get(nid);
      if (c) coords.push(c);
    }
    if (coords.length < 3) continue;
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
    polys.push({ polygon: coords, minLat, maxLat, minLng, maxLng });
  }
  return polys;
}

function isInResidentialLanduse(
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

/**
 * Overpass の取得結果を、ルーティング可能なグラフに変換する。
 * 各 way を連続ノード間のセグメント(無向エッジ)に分解し、気分フィルターを分類する。
 */
export function buildGraph(data: OverpassResponse): RoadGraph {
  const nodeCoords = new Map<number, LatLng>();
  const ways: OverpassWay[] = [];

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodeCoords.set(el.id, { lat: el.lat, lng: el.lon });
    } else if (el.type === 'way') {
      ways.push(el);
    }
  }

  const residentialPolys = buildResidentialPolygons(ways, nodeCoords);

  const graph = createGraph<NodeData, EdgeData>();

  for (const way of ways) {
    const highway = way.tags?.highway;
    if (!highway) continue; // landuse などの非道路 way は骨組みに使わない

    const lit = way.tags?.lit;
    const wayId = String(way.id);

    for (let i = 1; i < way.nodes.length; i++) {
      const aId = way.nodes[i - 1];
      const bId = way.nodes[i];
      const a = nodeCoords.get(aId);
      const b = nodeCoords.get(bId);
      if (!a || !b) continue;

      // 既に同じ向きのリンクがある場合は重複追加しない。
      if (graph.getLink(aId, bId) || graph.getLink(bId, aId)) continue;

      if (!graph.getNode(aId)) graph.addNode(aId, a);
      if (!graph.getNode(bId)) graph.addNode(bId, b);

      const lengthM = haversineMeters(a, b);
      const mid: LatLng = {
        lat: (a.lat + b.lat) / 2,
        lng: (a.lng + b.lng) / 2,
      };
      const inResidentialLanduse = isInResidentialLanduse(
        mid,
        residentialPolys,
      );

      const moods = classifyEdge({ highway, lit, inResidentialLanduse });

      // 無向グラフとして扱うため、両方向にリンクを張る。
      const edgeData: EdgeData = { wayId, highway, lengthM, moods };
      graph.addLink(aId, bId, edgeData);
    }
  }

  return { graph, nodeCoords };
}

/** 座標に最も近いグラフノードの id を返す。ノードが無ければ null。 */
export function nearestNodeId(
  road: RoadGraph,
  target: LatLng,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  road.graph.forEachNode((node) => {
    const c = node.data;
    if (!c) return;
    const d = haversineMeters(c, target);
    if (d < bestDist) {
      bestDist = d;
      best = node.id as number;
    }
  });
  return best;
}
