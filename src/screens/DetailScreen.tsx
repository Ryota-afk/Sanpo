import { useState } from 'react';
import { MapView } from '../components/MapView';
import { highwayLabel } from '../core/wayTypes';
import { formatKm } from '../core/geo';
import { saveRoute } from '../db/db';
import type {
  LatLng,
  MoodFilter,
  RouteCandidate,
  RouteRecord,
} from '../types';

export interface DetailScreenProps {
  candidate: RouteCandidate;
  start: LatLng;
  end: LatLng;
  moods: MoodFilter[];
  onSaved: () => void;
  onBack: () => void;
}

export function DetailScreen({
  candidate,
  start,
  end,
  moods,
  onSaved,
  onBack,
}: DetailScreenProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWalk = async () => {
    setSaving(true);
    setError(null);
    try {
      const record: RouteRecord = {
        date: new Date().toISOString(),
        startCoord: start,
        endCoord: end,
        wayIds: candidate.wayIds,
        geometry: candidate.geometry,
        distanceM: candidate.distanceM,
        durationMin: candidate.durationMin,
        moodFilters: moods,
        overlapRateAtSelection: candidate.overlapRate,
      };
      await saveRoute(record);
      onSaved();
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

      <div className="card">
        <MapView
          center={start}
          start={start}
          end={end}
          routes={[candidate.geometry]}
          fitRoutes
        />
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
        </div>
        <div className="breakdown">
          {entries.map(([hw, m]) => (
            <span key={hw} className="tag">
              {highwayLabel(hw)} {formatKm(m)}km
            </span>
          ))}
        </div>
      </div>

      <button className="btn" disabled={saving} onClick={handleWalk}>
        {saving ? '保存中…' : 'このルートを歩く(記録する)'}
      </button>
      <button className="btn btn--secondary" onClick={onBack} disabled={saving}>
        候補一覧に戻る
      </button>
    </div>
  );
}
