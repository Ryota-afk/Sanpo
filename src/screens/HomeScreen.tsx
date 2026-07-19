import { useState } from 'react';
import { MapView } from '../components/MapView';
import {
  ALL_MOODS,
  MOOD_LABELS,
  type LatLng,
  type MoodFilter,
  type Settings,
} from '../types';
import { proposeFromCoords } from '../core/proposalService';
import type { ProposalResult } from '../types';

// 初期地図中心(東京駅)。位置が未指定のときの表示用。
const DEFAULT_CENTER: LatLng = { lat: 35.681236, lng: 139.767125 };

export interface HomeScreenProps {
  settings: Settings;
  onProposed: (
    result: ProposalResult,
    context: {
      start: LatLng;
      end: LatLng;
      moods: MoodFilter[];
      timeLimitMin: number;
      overlapThreshold: number;
    },
  ) => void;
}

export function HomeScreen({ settings, onProposed }: HomeScreenProps) {
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [moods, setMoods] = useState<MoodFilter[]>([]);
  const [timeLimitMin, setTimeLimitMin] = useState(30);
  const [threshold, setThreshold] = useState(
    settings.defaultOverlapThreshold,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const handleMapClick = (coord: LatLng) => {
    // 1タップ目=スタート、2タップ目=ゴール、3タップ目でリセット。
    if (!start || (start && end)) {
      setStart(coord);
      setEnd(null);
    } else {
      setEnd(coord);
    }
  };

  const useCurrentAsStart = () => {
    if (!('geolocation' in navigator)) {
      setError('この端末では現在地を取得できません。');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setEnd(null);
        setLocating(false);
      },
      () => {
        setError(
          '現在地を取得できませんでした。位置情報の利用を許可してください。',
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const toggleMood = (m: MoodFilter) => {
    setMoods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  };

  const canPropose = start != null && end != null && !loading;

  const handlePropose = async () => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    try {
      const result = await proposeFromCoords({
        start,
        end,
        moods,
        paceMinPerKm: settings.paceMinPerKm,
        timeLimitMin,
        overlapThreshold: threshold,
      });
      onProposed(result, {
        start,
        end,
        moods,
        timeLimitMin,
        overlapThreshold: threshold,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'ルート取得中にエラーが発生しました。',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>スタート / ゴールを地図でタップ</h2>
        <MapView
          center={start ?? DEFAULT_CENTER}
          start={start}
          end={end}
          onMapClick={handleMapClick}
        />
        <p className="hint">
          {!start && '地図をタップしてスタート地点を指定してください。'}
          {start && !end && 'もう一度タップしてゴール地点を指定してください。'}
          {start && end && 'もう一度タップするとスタートから指定し直せます。'}
        </p>
        <button
          className="btn btn--secondary"
          onClick={useCurrentAsStart}
          disabled={locating}
        >
          {locating ? '現在地を取得中…' : '📍 現在地をスタートにする'}
        </button>
      </div>

      <div className="card">
        <h2>気分フィルター(複数選択可)</h2>
        <div className="mood-grid">
          {ALL_MOODS.map((m) => (
            <div
              key={m}
              className={`chip ${moods.includes(m) ? 'selected' : ''}`}
              onClick={() => toggleMood(m)}
              role="button"
              tabIndex={0}
            >
              {MOOD_LABELS[m]}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="time-limit">所要時間の上限(分)</label>
          <input
            id="time-limit"
            type="number"
            min={5}
            max={300}
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(Number(e.target.value))}
          />
          <p className="hint">
            登録ペース {settings.paceMinPerKm} 分/km で約{' '}
            {(timeLimitMin / settings.paceMinPerKm).toFixed(1)} km まで。
          </p>
        </div>

        <div className="field">
          <label htmlFor="threshold">
            被り率の上限: {threshold}%
          </label>
          <input
            id="threshold"
            type="range"
            min={10}
            max={50}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <p className="hint">
            直近10回のルートとの重複がこの割合以下の候補を提案します。
          </p>
        </div>
      </div>

      <button className="btn" disabled={!canPropose} onClick={handlePropose}>
        {loading ? (
          <>
            <span className="spinner" /> 探索中…
          </>
        ) : (
          '提案する'
        )}
      </button>
    </div>
  );
}
