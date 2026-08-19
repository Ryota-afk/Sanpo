import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addHorse } from '../db/db';
import { createHorse } from '../core/horse';
import {
  CAREER_LENGTH_WALKS,
  distanceAptitudeMarks,
  stageLabelForWalk,
  surfaceAptitudeMarks,
} from '../core/career';
import {
  COAT_COLORS,
  COAT_LABELS,
  DISTANCE_APTITUDE_LABELS,
  GROWTH_TYPE_LABELS,
  RUNNING_STYLE_LABELS,
  TEMPERAMENT_LABELS,
  type DistanceAptitude,
  type Horse,
  type HorseCareerEntry,
  type HorseSex,
} from '../types';

function fatigueState(fatigue: number): { label: string; cls: string } {
  if (fatigue >= 80) return { label: '要休養', cls: 'bad' };
  if (fatigue >= 60) return { label: 'やや疲れ気味', cls: 'ok' };
  if (fatigue <= 25) return { label: '絶好調', cls: 'good' };
  return { label: '良好', cls: 'good' };
}

function CareerEntryRow({ entry }: { entry: HorseCareerEntry }) {
  const icon = entry.kind === 'race' ? '🏁' : entry.kind === 'retire' ? '🎓' : '🏋️';
  return (
    <li className="career-entry">
      <span className="career-entry__icon">{icon}</span>
      <div className="career-entry__body">
        <div className="career-entry__meta">
          {entry.walkIndex}回目
          {entry.kind === 'race' &&
            entry.raceName &&
            ` ・ ${entry.raceName}(${entry.placing}着 / ${entry.fieldSize}頭)`}
        </div>
        <div className="career-entry__text">{entry.text}</div>
      </div>
    </li>
  );
}

function NamingForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [sex, setSex] = useState<HorseSex>('male');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('名前を入力してください(カタカナ9文字以内)。');
      return;
    }
    if (trimmed.length > 9) {
      setError('名前は9文字以内にしてください。');
      return;
    }
    setSaving(true);
    await addHorse(createHorse(trimmed, sex));
    setSaving(false);
    setName('');
    onCreated();
  };

  return (
    <div className="card">
      <h2>🐴 愛馬を迎える</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        名付けると、次の散歩から調教が始まります。全12回の散歩でキャリア(育成期
        →2歳→3歳→4歳・引退)が一周します。距離やペースは強さに、
        <b>散歩の回数</b>だけがキャリアの進み方に反映されます。
      </p>
      <div className="field">
        <label htmlFor="horse-name">名前</label>
        <input
          id="horse-name"
          type="text"
          value={name}
          placeholder="サンポノキセキ"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>性別</label>
        <div className="mood-grid">
          <div
            className={`chip ${sex === 'male' ? 'selected' : ''}`}
            onClick={() => setSex('male')}
            role="button"
            tabIndex={0}
          >
            ♂ 牡
          </div>
          <div
            className={`chip ${sex === 'female' ? 'selected' : ''}`}
            onClick={() => setSex('female')}
            role="button"
            tabIndex={0}
          >
            ♀ 牝
          </div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={saving} onClick={handleCreate}>
        {saving ? '登録中…' : '名付ける'}
      </button>
    </div>
  );
}

function ActiveHorseCard({ horse }: { horse: Horse }) {
  const walkIndex = horse.ageWalks; // 直近まで進んだ回数
  const distMarks = distanceAptitudeMarks(horse);
  const surfMarks = surfaceAptitudeMarks(horse);
  const fatigue = fatigueState(horse.fatigue);
  const stageLabel = stageLabelForWalk(Math.max(1, walkIndex));

  return (
    <div className="card">
      <div className="horse-head">
        <span
          className="coat-swatch"
          style={{ background: COAT_COLORS[horse.coat] }}
          title={COAT_LABELS[horse.coat]}
        />
        <div>
          <div className="horse-name">
            {horse.name} {horse.sex === 'male' ? '♂' : '♀'}
          </div>
          <div className="horse-sub">
            {COAT_LABELS[horse.coat]} ・ {stageLabel} ・ {walkIndex}/
            {CAREER_LENGTH_WALKS}回
          </div>
        </div>
      </div>

      <div className="stat-row">
        <span className="stat">
          <b>{TEMPERAMENT_LABELS[horse.temperament]}</b>
          <span className="unit">気性</span>
        </span>
        <span className="stat">
          <b>{RUNNING_STYLE_LABELS[horse.runningStyle]}</b>
          <span className="unit">脚質</span>
        </span>
        <span className="stat">
          <b>{horse.wins}</b>
          <span className="unit">勝</span>
        </span>
      </div>

      <span className={`fatigue-badge ${fatigue.cls}`}>{fatigue.label}</span>

      <div className="apt-grid">
        {(Object.keys(DISTANCE_APTITUDE_LABELS) as DistanceAptitude[]).map((k) => (
          <span key={k} className="apt-chip">
            {DISTANCE_APTITUDE_LABELS[k]} <b>{distMarks[k]}</b>
          </span>
        ))}
        <span className="apt-chip">
          芝 <b>{surfMarks.turf}</b>
        </span>
        <span className="apt-chip">
          ダート <b>{surfMarks.dirt}</b>
        </span>
      </div>

      <p className="hint">
        成長型は引退するまでわかりません。じっくり付き合ってみてください。
      </p>

      {horse.careerLog.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>キャリア記録</h3>
          <ul className="career-log">
            {[...horse.careerLog].reverse().map((e, i) => (
              <CareerEntryRow key={i} entry={e} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RetiredHorseItem({ horse }: { horse: Horse }) {
  const distMarks = distanceAptitudeMarks(horse);
  const best = (Object.keys(distMarks) as DistanceAptitude[]).find(
    (k) => distMarks[k] === '◎',
  );
  return (
    <div className="retired-list-item">
      <span
        className="coat-swatch"
        style={{ background: COAT_COLORS[horse.coat], width: 22, height: 22 }}
        title={COAT_LABELS[horse.coat]}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="horse-name" style={{ fontSize: 14 }}>
          {horse.name} {horse.sex === 'male' ? '♂' : '♀'}
        </div>
        <div className="horse-sub">
          {COAT_LABELS[horse.coat]} ・ {GROWTH_TYPE_LABELS[horse.growthType]} ・{' '}
          {horse.wins}勝 {best && `・ ${DISTANCE_APTITUDE_LABELS[best]}向き`}
        </div>
      </div>
    </div>
  );
}

export function StableScreen() {
  const horses = useLiveQuery(() => db.horses.toArray(), []);

  if (horses == null) {
    return <div className="loading-overlay">読込中…</div>;
  }

  const active = horses.find((h) => h.status === 'active');
  const retired = horses
    .filter((h) => h.status === 'retired')
    .sort((a, b) => (a.birthAt < b.birthAt ? 1 : -1));

  return (
    <div>
      {active ? <ActiveHorseCard horse={active} /> : <NamingForm onCreated={() => undefined} />}

      {retired.length > 0 && (
        <div className="card">
          <h2>牧場の記録(引退馬)</h2>
          {retired.map((h) => (
            <RetiredHorseItem key={h.id} horse={h} />
          ))}
        </div>
      )}
    </div>
  );
}
