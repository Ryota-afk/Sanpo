import { useRef, useState } from 'react';
import { saveSettings, exportData, importData } from '../db/db';
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
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validPace = pace > 0 && pace <= 60;

  const handleSave = async () => {
    if (!validPace) return;
    setSaving(true);
    await saveSettings(pace, threshold);
    setSaving(false);
    onSaved();
  };

  const handleExport = async () => {
    setBackupMsg(null);
    const data = await exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sanpo-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupMsg(
      `書き出しました(履歴 ${data.routes.length} 件・場所 ${data.places.length} 件・愛馬 ${data.horses.length} 頭)。`,
    );
  };

  const handleImportFile = async (file: File) => {
    setBackupMsg(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const routeCount = Array.isArray(data.routes) ? data.routes.length : 0;
      const placeCount = Array.isArray(data.places) ? data.places.length : 0;
      const horseCount = Array.isArray(data.horses) ? data.horses.length : 0;
      const ok = window.confirm(
        `このバックアップ(履歴 ${routeCount} 件・場所 ${placeCount} 件・愛馬 ${horseCount} 頭)で` +
          '現在のデータを置き換えます。よろしいですか?',
      );
      if (!ok) return;
      await importData(data);
      setBackupMsg('読み込みました。');
    } catch (e) {
      setBackupMsg(
        e instanceof Error
          ? `読み込みに失敗しました: ${e.message}`
          : '読み込みに失敗しました。',
      );
    }
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

      {!firstRun && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>バックアップ</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            履歴・場所・設定・愛馬をファイルに書き出して保存できます。機種変更や、
            ブラウザにデータを消されたときの復元に使えます。
          </p>
          {backupMsg && <div className="notice">{backupMsg}</div>}
          <button className="btn btn--secondary" onClick={handleExport}>
            ⬇️ バックアップを書き出す
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            ⬆️ バックアップを読み込む
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
