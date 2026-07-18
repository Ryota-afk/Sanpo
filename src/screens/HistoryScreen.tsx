import { useLiveQuery } from 'dexie-react-hooks';
import { MapView } from '../components/MapView';
import { db, deleteRoute, HISTORY_LIMIT } from '../db/db';
import { formatKm } from '../core/geo';
import { MOOD_LABELS, type RouteRecord } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d
    .getHours()
    .toString()
    .padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function HistoryItem({ route }: { route: RouteRecord }) {
  // wayTypeBreakdown は履歴に保存していないため、代表的な道タイプは省略し距離/時間を表示する。
  return (
    <div className="history-item">
      <div style={{ width: 120, flexShrink: 0 }}>
        <MapView
          className="map map--small"
          center={route.startCoord}
          start={route.startCoord}
          end={route.endCoord}
          routes={[route.geometry]}
          fitRoutes
        />
      </div>
      <div className="history-item__main">
        <div className="history-item__date">{formatDate(route.date)}</div>
        <div className="history-item__stats">
          {formatKm(route.distanceM)}km / {Math.round(route.durationMin)}分 /
          被り {route.overlapRateAtSelection.toFixed(0)}%
        </div>
        <div className="breakdown" style={{ marginTop: 4 }}>
          {route.moodFilters.length === 0 ? (
            <span className="tag">気分指定なし</span>
          ) : (
            route.moodFilters.map((m) => (
              <span key={m} className="tag">
                {MOOD_LABELS[m]}
              </span>
            ))
          )}
        </div>
      </div>
      <button
        className="btn btn--danger"
        style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}
        onClick={() => route.id != null && deleteRoute(route.id)}
      >
        削除
      </button>
    </div>
  );
}

export function HistoryScreen() {
  const routes = useLiveQuery(
    () => db.routes.orderBy('date').reverse().toArray(),
    [],
  );

  if (routes == null) {
    return <div className="loading-overlay">読込中…</div>;
  }

  if (routes.length === 0) {
    return (
      <div className="empty">
        まだ記録がありません。
        <br />
        ルートを提案して「このルートを歩く」を押すと、ここに直近{' '}
        {HISTORY_LIMIT} 件が記録されます。
      </div>
    );
  }

  return (
    <div className="card">
      <h2>履歴(直近 {HISTORY_LIMIT} 件)</h2>
      {routes.map((r) => (
        <HistoryItem key={r.id} route={r} />
      ))}
    </div>
  );
}
