import { useLiveQuery } from 'dexie-react-hooks';
import { MapView } from '../components/MapView';
import { db, deleteRoute, HISTORY_LIMIT } from '../db/db';
import { formatKm } from '../core/geo';
import { MOOD_LABELS, type RouteRecord } from '../types';

export interface HistoryScreenProps {
  /** 「続ける」で進行中のルートを再開する。 */
  onContinue: (route: RouteRecord) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d
    .getHours()
    .toString()
    .padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function HistoryItem({
  route,
  onContinue,
}: {
  route: RouteRecord;
  onContinue: (route: RouteRecord) => void;
}) {
  // 旧データは status 未設定の場合があるため completed とみなす。
  const inProgress = route.status === 'in_progress';

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
        <div className="history-item__date">
          {formatDate(route.date)}
          {inProgress && <span className="status-badge">進行中</span>}
        </div>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {inProgress && (
          <button className="btn" onClick={() => onContinue(route)}>
            続ける
          </button>
        )}
        <button
          className="btn btn--danger"
          onClick={() => route.id != null && deleteRoute(route.id)}
        >
          削除
        </button>
      </div>
    </div>
  );
}

export function HistoryScreen({ onContinue }: HistoryScreenProps) {
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
        候補ルートを選ぶと、その場でここに記録されます。歩き終えたら
        「このルートを歩いた」で完了にしてください(直近 {HISTORY_LIMIT} 件を保存)。
      </div>
    );
  }

  return (
    <div className="card">
      <h2>履歴(直近 {HISTORY_LIMIT} 件)</h2>
      {routes.map((r) => (
        <HistoryItem key={r.id} route={r} onContinue={onContinue} />
      ))}
    </div>
  );
}
