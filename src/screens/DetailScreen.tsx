import { useMemo, useState } from 'react';
import { MapView } from '../components/MapView';
import { highwayLabel } from '../core/wayTypes';
import { formatKm } from '../core/geo';
import {
  computeSteps,
  turnPoints,
  TURN_LABELS,
  TURN_ARROWS,
} from '../core/navigation';
import { useGeolocation } from '../hooks/useGeolocation';
import { markRouteCompleted } from '../db/db';
import type { LatLng, RouteCandidate } from '../types';

export interface DetailScreenProps {
  /** 候補選択時、または履歴からの再開時にすでに保存済みのレコードID。 */
  routeId: number;
  candidate: RouteCandidate;
  start: LatLng;
  end: LatLng;
  onCompleted: () => void;
  onBack: () => void;
  /** 戻るボタンのラベル(候補一覧からの遷移か、履歴からの再開かで変わる)。 */
  backLabel?: string;
}

function formatDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m)}m`;
}

export function DetailScreen({
  routeId,
  candidate,
  start,
  end,
  onCompleted,
  onBack,
  backLabel = '候補一覧に戻る',
}: DetailScreenProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 歩行中の現在地を継続取得する。
  const geo = useGeolocation(true);

  const steps = useMemo(
    () => computeSteps(candidate.geometry),
    [candidate.geometry],
  );
  const turns = useMemo(() => turnPoints(steps), [steps]);
  const crossings = candidate.crossings ?? [];

  const handleWalk = async () => {
    setSaving(true);
    setError(null);
    try {
      await markRouteCompleted(routeId);
      onCompleted();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '保存中にエラーが発生しました。',
      );
      setSaving(false);
    }
  };

  const entries = Object.entries(candidate.wayTypeBreakdown).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div className="notice">
        ✅ このルートは記録済みです。ブラウザを閉じても消えません。歩き終えたら
        下の「このルートを歩いた」を押して完了にしてください。
      </div>
      {geo.error && <div className="notice">{geo.error}</div>}
      {!geo.supported && (
        <div className="notice">
          この端末では現在地表示に対応していません。
        </div>
      )}

      <div className="card">
        <MapView
          center={geo.position ?? start}
          start={start}
          end={end}
          routes={[candidate.geometry]}
          turns={turns}
          crossings={crossings}
          currentLocation={geo.position}
          accuracyM={geo.accuracyM}
          showRecenter
          fitRoutes
        />
        <p className="hint">
          🔵 現在地(青い点)/ ↰↱ 曲がり角 / 🚸 横断歩道。
          {geo.position
            ? ' 「現在地へ」で自分の位置に地図を戻せます。'
            : ' 位置情報を許可すると現在地が表示されます。'}
        </p>
      </div>

      <div className="card">
        <div className="stat-row">
          <span className="stat">
            <b>{formatKm(candidate.distanceM)}</b>
            <span className="unit">km</span>
          </span>
          <span className="stat">
            <b>{Math.round(candidate.durationMin)}</b>
            <span className="unit">分</span>
          </span>
          <span className="stat">
            <b>{candidate.overlapRate.toFixed(0)}</b>
            <span className="unit">% 被り</span>
          </span>
          <span className="stat">
            <b>{crossings.length}</b>
            <span className="unit">横断歩道</span>
          </span>
        </div>
        <div className="breakdown">
          {entries.map(([hw, m]) => (
            <span key={hw} className="tag">
              {highwayLabel(hw)} {formatKm(m)}km
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>道順</h2>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i} className="step">
              <span className="step__arrow">{TURN_ARROWS[s.kind]}</span>
              <span className="step__text">
                {s.kind === 'start' ? (
                  'スタート'
                ) : s.kind === 'arrive' ? (
                  <>
                    <b>{formatDist(s.distanceFromPrevM)}</b> 進んでゴール
                  </>
                ) : (
                  <>
                    <b>{formatDist(s.distanceFromPrevM)}</b> 進んで
                    {TURN_LABELS[s.kind]}
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
        <p className="hint">
          ※ 道順は地図の形から自動計算した目安です。曲がり角の距離は前の手順からの距離です。
        </p>
      </div>

      <button className="btn" disabled={saving} onClick={handleWalk}>
        {saving ? '保存中…' : 'このルートを歩いた(記録する)'}
      </button>
      <button className="btn btn--secondary" onClick={onBack} disabled={saving}>
        {backLabel}
      </button>
    </div>
  );
}
