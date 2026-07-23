import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapView } from '../components/MapView';
import { db, addPlace, updatePlace, deletePlace } from '../db/db';
import type { LatLng, Place } from '../types';

// 初期地図中心(東京駅)。
const DEFAULT_CENTER: LatLng = { lat: 35.681236, lng: 139.767125 };

export function PlacesScreen() {
  const places = useLiveQuery(
    () => db.places.orderBy('createdAt').toArray(),
    [],
  );

  const [name, setName] = useState('');
  const [coord, setCoord] = useState<LatLng | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setCoord(null);
    setEditingId(null);
    setError(null);
  };

  const startEdit = (p: Place) => {
    setEditingId(p.id ?? null);
    setName(p.name);
    setCoord(p.coord);
    setError(null);
  };

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setError('この端末では現在地を取得できません。');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('現在地を取得できませんでした。位置情報を許可してください。');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('場所の名前を入力してください。');
      return;
    }
    if (!coord) {
      setError('地図をタップするか「現在地を使う」で場所を指定してください。');
      return;
    }
    if (editingId != null) {
      await updatePlace(editingId, { name: trimmed, coord });
    } else {
      await addPlace(trimmed, coord);
    }
    resetForm();
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>{editingId != null ? '場所を編集' : '場所を登録'}</h2>
        <div className="field">
          <label htmlFor="place-name">名前(例: 自宅、バイト先)</label>
          <input
            id="place-name"
            type="text"
            value={name}
            placeholder="自宅"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <MapView
          center={coord ?? DEFAULT_CENTER}
          start={coord}
          onMapClick={(c) => setCoord(c)}
        />
        <p className="hint">
          地図をタップして場所を指定できます。
          {coord
            ? ` 選択中: ${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`
            : ''}
        </p>

        <button
          className="btn btn--secondary"
          onClick={useCurrentLocation}
          disabled={locating}
        >
          {locating ? '現在地を取得中…' : '📍 現在地を使う'}
        </button>

        <button className="btn" onClick={handleSave}>
          {editingId != null ? '更新する' : '登録する'}
        </button>
        {editingId != null && (
          <button className="btn btn--secondary" onClick={resetForm}>
            編集をやめる
          </button>
        )}
      </div>

      <div className="card">
        <h2>登録済みの場所</h2>
        {places == null ? (
          <div className="loading-overlay">読込中…</div>
        ) : places.length === 0 ? (
          <p className="empty">
            まだ登録がありません。よく使う場所(自宅・バイト先など)を登録すると、
            ホーム画面からワンタップでスタート/ゴールに設定できます。
          </p>
        ) : (
          places.map((p) => (
            <div key={p.id} className="place-item">
              <div className="place-item__main">
                <div className="place-item__name">📍 {p.name}</div>
                <div className="place-item__coord">
                  {p.coord.lat.toFixed(5)}, {p.coord.lng.toFixed(5)}
                </div>
              </div>
              <button
                className="btn btn--secondary place-item__btn"
                onClick={() => startEdit(p)}
              >
                編集
              </button>
              <button
                className="btn btn--danger place-item__btn"
                onClick={() => p.id != null && deletePlace(p.id)}
              >
                削除
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
