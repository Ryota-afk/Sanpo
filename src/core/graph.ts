import createGraph, { type Graph } from 'ngraph.graph';
import type { LatLng, MoodFilter } from '../types';
import type {
  OverpassElement,
  OverpassResponse,
  OverpassWay,
} from '../api/overpass';
import { classifyEdge } from './mood';
import { haversineMeters } from './geo';
import {
  makePolygon,
  polygonsContain,
  PointGrid,
  type PolygonWithBBox,
} from './spatial';

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
  /** 横断歩道のノード id 集合(ルート上の横断歩道検出に使用)。 */
  crossings: Set<number>;
}

// 近いとみなす距離(メートル)。
const LAMP_RADIUS_M = 30; // 街灯がこの範囲にあれば「明るい」
const WATER_RADIUS_M = 45; // 水辺がこの範囲にあれば「水辺の道」

const GREEN_LEISURE = new Set([
  'park',
  'garden',
  'nature_reserve',
  'recreation_ground',
  'common',
  'village_green',
]);
const GREEN_LANDUSE = new Set([
  'forest',
  'grass',
  'meadow',
  'recreation_ground',
  'village_green',
  'greenfield',
  'cemetery',
]);
const GREEN_NATURAL = new Set(['wood', 'scrub', 'heath', 'grassland']);
const WATER_WATERWAY = new Set(['river', 'stream', 'canal', 'riverbank']);

function isGreenWay(way: OverpassWay): boolean {
  const t = way.tags;
  if (!t) return false;
  if (t.leisure && GREEN_LEISURE.has(t.leisure)) return true;
  if (t.landuse && GREEN_LANDUSE.has(t.landuse)) return true;
  if (t.natural && GREEN_NATURAL.has(t.natural)) return true;
  return false;
}

function isWaterWay(way: OverpassWay): boolean {
  const t = way.tags;
  if (!t) return false;
  if (t.natural === 'water') return true;
  if (t.waterway && WATER_WATERWAY.has(t.waterway)) return true;
  return false;
}

function wayCoords(
  way: OverpassWay,
  nodeCoords: Map<number, LatLng>,
): LatLng[] {
  const coords: LatLng[] = [];
  for (const nid of way.nodes) {
    const c = nodeCoords.get(nid);
    if (c) coords.push(c);
  }
  return coords;
}

/** 分類に使う周辺データ(住宅街/緑/水辺/街灯)をまとめて構築する。 */
interface FeatureContext {
  residentialPolys: PolygonWithBBox[];
  greenPolys: PolygonWithBBox[];
  greenLine: PointGrid; // 並木(tree_row)など線状の緑
  water: PointGrid;
  lamps: PointGrid;
}

function buildFeatureContext(
  ways: OverpassWay[],
  elements: OverpassElement[],
  nodeCoords: Map<number, LatLng>,
  refLat: number,
): FeatureContext {
  const residentialPolys: PolygonWithBBox[] = [];
  const greenPolys: PolygonWithBBox[] = [];
  const greenLine = new PointGrid(WATER_RADIUS_M, refLat);
  const water = new PointGrid(WATER_RADIUS_M, refLat);
  const lamps = new PointGrid(LAMP_RADIUS_M, refLat);

  for (const way of ways) {
    const t = way.tags;
    if (!t) continue;

    if (t.landuse === 'residential') {
      const poly = makePolygon(wayCoords(way, nodeCoords));
      if (poly) residentialPolys.push(poly);
    }

    if (isGreenWay(way)) {
      const coords = wayCoords(way, nodeCoords);
      const poly = makePolygon(coords);
      if (poly) greenPolys.push(poly);
      else for (const c of coords) greenLine.add(c); // 閉じていない緑地は点として扱う
    }

    // 並木(線状の緑)は点グリッドに入れて「近さ」で判定する。
    if (t.natural === 'tree_row') {
      for (const c of wayCoords(way, nodeCoords)) greenLine.add(c);
    }

    if (isWaterWay(way)) {
      for (const c of wayCoords(way, nodeCoords)) water.add(c);
    }
  }

  // 街灯は独立ノードとして取得される。
  for (const el of elements) {
    if (el.type === 'node' && el.tags?.highway === 'street_lamp') {
      lamps.add({ lat: el.lat, lng: el.lon });
    }
  }

  return { residentialPolys, greenPolys, greenLine, water, lamps };
}

/**
 * Overpass の取得結果を、ルーティング可能なグラフに変換する。
 * 各 way を連続ノード間のセグメント(無向エッジ)に分解し、気分フィルターを分類する。
 */
export function buildGraph(data: OverpassResponse): RoadGraph {
  const nodeCoords = new Map<number, LatLng>();
  const ways: OverpassWay[] = [];
  const crossings = new Set<number>();

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodeCoords.set(el.id, { lat: el.lat, lng: el.lon });
      const t = el.tags;
      if (t && (t.highway === 'crossing' || t.crossing != null)) {
        crossings.add(el.id);
      }
    } else if (el.type === 'way') {
      ways.push(el);
    }
  }

  // 経度→メートル換算の基準緯度(取得データの代表点)。
  const refLat = nodeCoords.size
    ? [...nodeCoords.values()][0].lat
    : 35.681236;

  const features = buildFeatureContext(ways, data.elements, nodeCoords, refLat);

  const graph = createGraph<NodeData, EdgeData>();

  for (const way of ways) {
    const highway = way.tags?.highway;
    if (!highway) continue; // landuse などの非道路 way は骨組みに使わない

    const tags = way.tags ?? {};
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

      const moods = classifyEdge({
        highway,
        lit: tags.lit,
        surface: tags.surface,
        sidewalk: tags.sidewalk,
        foot: tags.foot,
        service: tags.service,
        width: tags.width,
        lanes: tags.lanes,
        inResidentialLanduse: polygonsContain(mid, features.residentialPolys),
        inGreen:
          polygonsContain(mid, features.greenPolys) ||
          features.greenLine.hasWithin(mid),
        nearWater: features.water.hasWithin(mid),
        nearLamp: features.lamps.hasWithin(mid),
      });

      // 無向グラフとして扱うため、両方向にリンクを張る。
      const edgeData: EdgeData = { wayId, highway, lengthM, moods };
      graph.addLink(aId, bId, edgeData);
    }
  }

  return { graph, nodeCoords, crossings };
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
