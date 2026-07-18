import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '../types';

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
  useEffect(() => {
    const pts = routes.flat();
    if (pts.length < 2) return;
    const bounds = L.latLngBounds(pts.map(([la, ln]) => L.latLng(la, ln)));
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, routes]);
  return null;
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
        {start && <Marker position={[start.lat, start.lng]} icon={START_ICON} />}
        {end && <Marker position={[end.lat, end.lng]} icon={END_ICON} />}
        {fitRoutes && routes.length > 0 && <FitBounds routes={routes} />}
      </MapContainer>
    </div>
  );
}

export { ROUTE_COLORS };
