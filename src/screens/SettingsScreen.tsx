import { useState } from 'react';
import { saveSettings } from '../db/db';
import type { Settings } from '../types';

export interface SettingsScreenProps {
  /** 既存設定。初回起動時は null。 */
  current: Settings | null;
  onSaved: () => void;
  /** 初回起動時(設定必須)は true。戻るボタンを出さない。 */
  firstRun?: boolean;
}

export function SettingsScreen({
  current,
  onSaved,
  firstRun = false,
}: SettingsScreenProps) {
  const [pace, setPace] = useState(current?.paceMinPerKm ?? 12);
  const [threshold, setThreshold] = useState(
    current?.defaultOverlapThreshold ?? 30,
  );
  const [saving, setSaving] = useState(false);

  const validPace = pace > 0 && pace <= 60;

  const handleSave = async () => {
    if (!validPace) return;
    setSaving(true);
    await saveSettings(pace, threshold);
    setSaving(false);
    onSaved();
  };

  return (
    <div>
      {firstRun && (
        <div className="notice">
          はじめての起動です。まず歩行ペースを登録してください。
        </div>
      )}

      <div className="card">
        <h2>歩行ペース</h2>
        <div className="field">
          <label htmlFor="pace">分 / km</label>
          <input
            id="pace"
            type="number"
            min={1}
            max={60}
            step={0.5}
            value={pace}
            onChange={(e) => setPace(Number(e.target.value))}
          />
          <p className="hint">
            所要時間の見積り(距離 × ペース)に使用します。目安: ゆっくり
            15分/km、普通 12分/km、速歩 9分/km。
          </p>
        </div>
      </div>

      <div className="card">
        <h2>被り率のデフォルト上限</h2>
        <div className="field">
          <label htmlFor="default-threshold">{threshold}%</label>
          <input
            id="default-threshold"
            type="range"
            min={10}
            max={50}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <p className="hint">
            ホーム画面のスライダー初期値になります(その場でも変更可)。
          </p>
        </div>
      </div>

      <button className="btn" disabled={!validPace || saving} onClick={handleSave}>
        {saving ? '保存中…' : '保存する'}
      </button>
    </div>
  );
}
