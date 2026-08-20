import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { LifetimeResult } from '../core/horse';
import { distanceAptitudeMarks, surfaceAptitudeMarks } from '../core/career';
import {
  CareerEntryRow,
  PedigreeTable,
  RaceRecordTable,
  RankRow,
  fatigueState,
} from '../components/HorseUI';
import {
  COAT_COLORS,
  COAT_LABELS,
  COURSE_PLAN_LABELS,
  DISTANCE_APTITUDE_LABELS,
  GROWTH_TYPE_LABELS,
  RUNNING_STYLE_LABELS,
  TEMPERAMENT_LABELS,
  type DistanceAptitude,
} from '../types';

export interface LifetimeScreenProps {
  result: LifetimeResult;
  onDone: () => void;
}

export function LifetimeScreen({ result, onDone }: LifetimeScreenProps) {
  const { horse, timeline } = result;
  const horses = useLiveQuery(() => db.horses.toArray(), []);
  const byId = new Map(
    (horses ?? []).filter((h) => h.id != null).map((h) => [h.id as number, h]),
  );

  const distMarks = distanceAptitudeMarks(horse);
  const surfMarks = surfaceAptitudeMarks(horse);
  const fatigue = fatigueState(horse.fatigue);
  const raceCount = timeline.filter((e) => e.kind === 'race').length;

  return (
    <div>
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
              {COAT_LABELS[horse.coat]} ・ {COURSE_PLAN_LABELS[horse.planCourse ?? 'turf']} ・
              全{timeline.length}回(うちレース{raceCount}回)
            </div>
          </div>
        </div>

        <div className="notice" style={{ marginTop: 0 }}>
          🎓 一頭の生涯を歩き終えました。{horse.name}
          は引退し、牧場に記録として残ります。
        </div>

        {horse.inbredAtBirth && (
          <div className="notice" style={{ marginTop: 0 }}>
            近親配合で生まれた一頭でした。能力の伸びしろがある一方、気性は難しくなりやすい
            傾向があります。
          </div>
        )}

        <div className="stat-row">
          <span className="stat">
            <b>{GROWTH_TYPE_LABELS[horse.growthType]}</b>
            <span className="unit">成長型(引退で開示)</span>
          </span>
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

        <span className={`fatigue-badge ${fatigue.cls}`}>
          引退時の状態: {fatigue.label}
        </span>

        <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>能力(最終)</h3>
        <RankRow params={horse.params} />

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

        <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>血統表</h3>
        <PedigreeTable horse={horse} byId={byId} />
      </div>

      <div className="card">
        <h2>戦績</h2>
        <RaceRecordTable careerLog={horse.careerLog} />
      </div>

      <div className="card">
        <h2>生涯の記録</h2>
        <ul className="career-log">
          {timeline.map((e, i) => (
            <CareerEntryRow key={i} entry={e} />
          ))}
        </ul>
      </div>

      <button className="btn" onClick={onDone}>
        牧場に戻る
      </button>
    </div>
  );
}
