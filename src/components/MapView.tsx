import { useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Circle,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '../types';
import type { TurnPoint } from '../core/navigation';
import { TURN_ARROWS } from '../core/navigation';

/** Leaflet の画像アセット依存を避けるための divIcon マーカー。 */
function pinIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'sanpo-pin',
    html: `<div style="
      background:${color};
      width:26px;height:26px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);color:#fff;font-size:12px;font-weight:700;">${label}</span>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

const START_ICON = pinIcon('#2f855a', 'S');
const END_ICON = pinIcon('#c53030', 'G');

/** 現在地の青い点。 */
const LOCATION_ICON = L.divIcon({
  className: 'sanpo-loc',
  html: `<div style="
    width:18px;height:18px;border-radius:50%;
    background:#3182ce;border:3px solid #fff;
    box-shadow:0 0 0 2px rgba(49,130,206,0.5), 0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** 曲がり角マーカー(矢印)。 */
function turnIcon(kind: TurnPoint['kind']): L.DivIcon {
  return L.divIcon({
    className: 'sanpo-turn',
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:#fff;border:2px solid #dd6b20;color:#dd6b20;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;font-weight:700;
      box-shadow:0 1px 3px rgba(0,0,0,0.3);">${TURN_ARROWS[kind]}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** 横断歩道マーカー。 */
const CROSSING_ICON = L.divIcon({
  className: 'sanpo-crossing',
  html: `<div style="
    width:20px;height:20px;border-radius:4px;
    background:#fff;border:2px solid #2b6cb0;
    display:flex;align-items:center;justify-content:center;
    font-size:12px;box-shadow:0 1px 3px rgba(0,0,0,0.3);">🚸</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const ROUTE_COLORS = ['#2f855a', '#dd6b20', '#3182ce'];

export interface MapViewProps {
  center: LatLng;
  zoom?: number;
  start?: LatLng | null;
  end?: LatLng | null;
  /** 表示するルート群([lat,lng] のポリライン)。 */
  routes?: [number, number][][];
  /** 強調表示するルートのインデックス。 */
  activeRouteIndex?: number;
  onMapClick?: (coord: LatLng) => void;
  className?: string;
  /** ルート全体が収まるよう表示範囲を調整する。 */
  fitRoutes?: boolean;
  /** 現在地(青い点)。 */
  currentLocation?: LatLng | null;
  /** 現在地の精度(メートル)。円で表示する。 */
  accuracyM?: number | null;
  /** 曲がり角マーカー。 */
  turns?: TurnPoint[];
  /** 横断歩道マーカーの座標 [lat, lng]。 */
  crossings?: [number, number][];
  /** 「現在地へ」ボタンを表示する。 */
  showRecenter?: boolean;
}

function ClickHandler({
  onMapClick,
}: {
  onMapClick?: (coord: LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FitBounds({ routes }: { routes: [number, number][][] }) {
  const map = useMap();
  // 直近にフィットしたルートの署名。同じルートでは再フィットしない
  // (現在地更新などの再レンダーでズームが元に戻るのを防ぐ)。
  const lastSig = useRef<string>('');
  useEffect(() => {
    const pts = routes.flat();
    if (pts.length < 2) return;
    const last = pts[pts.length - 1];
    const sig = `${pts.length}:${pts[0][0]},${pts[0][1]}:${last[0]},${last[1]}`;
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    const bounds = L.latLngBounds(pts.map(([la, ln]) => L.latLng(la, ln)));
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, routes]);
  return null;
}

/** 地図上に重ねる「現在地へ」ボタン。 */
function RecenterButton({ target }: { target?: LatLng | null }) {
  const map = useMap();
  return (
    <button
      type="button"
      className="map-recenter"
      onClick={(e) => {
        e.preventDefault();
        if (target) map.setView([target.lat, target.lng], 17);
      }}
      aria-label="現在地へ移動"
    >
      📍 現在地へ
    </button>
  );
}

export function MapView({
  center,
  zoom = 15,
  start,
  end,
  routes = [],
  activeRouteIndex,
  onMapClick,
  className = 'map',
  fitRoutes = false,
  currentLocation,
  accuracyM,
  turns = [],
  crossings = [],
  showRecenter = false,
}: MapViewProps) {
  return (
    <div className={className}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onMapClick={onMapClick} />
        {routes.map((r, i) => (
          <Polyline
            key={i}
            positions={r}
            pathOptions={{
              color: ROUTE_COLORS[i % ROUTE_COLORS.length],
              weight:
                activeRouteIndex == null || activeRouteIndex === i ? 6 : 3,
              opacity:
                activeRouteIndex == null || activeRouteIndex === i ? 0.9 : 0.4,
            }}
          />
        ))}
        {crossings.map((c, i) => (
          <Marker key={`x${i}`} position={c} icon={CROSSING_ICON} />
        ))}
        {turns.map((t, i) => (
          <Marker key={`t${i}`} position={t.location} icon={turnIcon(t.kind)} />
        ))}
        {start && <Marker position={[start.lat, start.lng]} icon={START_ICON} />}
        {end && <Marker position={[end.lat, end.lng]} icon={END_ICON} />}
        {currentLocation && accuracyM != null && accuracyM > 0 && (
          <Circle
            center={[currentLocation.lat, currentLocation.lng]}
            radius={accuracyM}
            pathOptions={{
              color: '#3182ce',
              fillColor: '#3182ce',
              fillOpacity: 0.12,
              weight: 1,
            }}
          />
        )}
        {currentLocation && (
          <Marker
            position={[currentLocation.lat, currentLocation.lng]}
            icon={LOCATION_ICON}
          />
        )}
        {fitRoutes && routes.length > 0 && <FitBounds routes={routes} />}
        {showRecenter && <RecenterButton target={currentLocation} />}
      </MapContainer>
    </div>
  );
}

export { ROUTE_COLORS };
