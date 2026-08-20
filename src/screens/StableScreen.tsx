import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addHorseWithPedigree, breedHorses } from '../db/db';
import { distanceAptitudeMarks, paramRank } from '../core/career';
import {
  CoursePlanField,
  PedigreeTable,
  RaceCountField,
  RaceRecordTable,
  RankBadge,
} from '../components/HorseUI';
import {
  COAT_COLORS,
  COAT_LABELS,
  COURSE_PLAN_LABELS,
  DISTANCE_APTITUDE_LABELS,
  GROWTH_TYPE_LABELS,
  RACE_COUNT_PREFERENCE_LABELS,
  type CoursePlan,
  type DistanceAptitude,
  type Horse,
  type HorseSex,
  type RaceCountPreference,
} from '../types';

function NamingForm({
  onCreated,
  collapsedByDefault = false,
}: {
  onCreated: () => void;
  collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<HorseSex>('male');
  const [coursePlan, setCoursePlan] = useState<CoursePlan>('turf');
  const [raceCountPreference, setRaceCountPreference] =
    useState<RaceCountPreference>('normal');
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
    await addHorseWithPedigree(trimmed, sex, coursePlan, raceCountPreference);
    setSaving(false);
    setName('');
    onCreated();
  };

  if (!open) {
    return (
      <button className="btn btn--secondary" onClick={() => setOpen(true)}>
        ＋ 外から新しい血統を迎える
      </button>
    );
  }

  return (
    <div className="card">
      <h2>🐴 愛馬を迎える</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        名付けて、路線とレース数を決めておくと出走待ちになります。次にルートを歩き終えた
        瞬間、そのルートがまるごとこの馬の<b>生涯(誕生〜引退)</b>になります。
        あわせて3世代分の祖先(血統表の元)も自動的に配られます。
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
      <CoursePlanField value={coursePlan} onChange={setCoursePlan} />
      <RaceCountField value={raceCountPreference} onChange={setRaceCountPreference} />
      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={saving} onClick={handleCreate}>
        {saving ? '登録中…' : '名付ける'}
      </button>
      {collapsedByDefault && (
        <button className="btn btn--secondary" onClick={() => setOpen(false)}>
          やめる
        </button>
      )}
    </div>
  );
}

function BreedingForm({
  stallions,
  broodmares,
  onCreated,
}: {
  stallions: Horse[];
  broodmares: Horse[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [sireId, setSireId] = useState<number | null>(stallions[0]?.id ?? null);
  const [damId, setDamId] = useState<number | null>(broodmares[0]?.id ?? null);
  const [coursePlan, setCoursePlan] = useState<CoursePlan>('turf');
  const [raceCountPreference, setRaceCountPreference] =
    useState<RaceCountPreference>('normal');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleBreed = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('名前を入力してください(カタカナ9文字以内)。');
      return;
    }
    if (trimmed.length > 9) {
      setError('名前は9文字以内にしてください。');
      return;
    }
    if (sireId == null || damId == null) {
      setError('父・母を選んでください。');
      return;
    }
    setSaving(true);
    await breedHorses(trimmed, sireId, damId, coursePlan, raceCountPreference);
    setSaving(false);
    setName('');
    onCreated();
  };

  return (
    <div className="card">
      <h2>🐎 配合する</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        牧場にいる引退馬同士を配合します。3世代以内に共通の祖先がいると能力の伸びしろが
        出る代わり、気性が難しくなりやすくなります。
      </p>
      <div className="field">
        <label>父(種牡馬)</label>
        <div className="mood-grid">
          {stallions.map((h) => (
            <div
              key={h.id}
              className={`chip ${sireId === h.id ? 'selected' : ''}`}
              onClick={() => setSireId(h.id ?? null)}
              role="button"
              tabIndex={0}
            >
              ♂ {h.name}
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <label>母(繁殖牝馬)</label>
        <div className="mood-grid">
          {broodmares.map((h) => (
            <div
              key={h.id}
              className={`chip ${damId === h.id ? 'selected' : ''}`}
              onClick={() => setDamId(h.id ?? null)}
              role="button"
              tabIndex={0}
            >
              ♀ {h.name}
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="foal-name">産まれる仔の名前</label>
        <input
          id="foal-name"
          type="text"
          value={name}
          placeholder="ニセイノキボウ"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <CoursePlanField value={coursePlan} onChange={setCoursePlan} />
      <RaceCountField value={raceCountPreference} onChange={setRaceCountPreference} />
      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={saving} onClick={handleBreed}>
        {saving ? '配合中…' : '仔を誕生させる'}
      </button>
    </div>
  );
}

/** 出走待ちの馬(まだ散歩していない)。能力はまだ何も起きていないので出さない。 */
function PendingHorseCard({
  horse,
  byId,
}: {
  horse: Horse;
  byId: Map<number, Horse>;
}) {
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
            {COAT_LABELS[horse.coat]} ・ {COURSE_PLAN_LABELS[horse.planCourse ?? 'turf']} ・
            レース数 {RACE_COUNT_PREFERENCE_LABELS[horse.raceCountPreference ?? 'normal']}
          </div>
        </div>
      </div>
      <div className="notice" style={{ marginTop: 0 }}>
        出走待ちです。次にルートを歩き終えると、そのルートがまるごとこの馬の生涯(誕生〜
        レース〜引退)になり、その場で結果が出ます。
      </div>
      <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>血統表</h3>
      <PedigreeTable horse={horse} byId={byId} />
    </div>
  );
}

function RetiredHorseItem({
  horse,
  expanded,
  onToggle,
}: {
  horse: Horse;
  expanded: boolean;
  onToggle: () => void;
}) {
  const distMarks = distanceAptitudeMarks(horse);
  const best = (Object.keys(distMarks) as DistanceAptitude[]).find(
    (k) => distMarks[k] === '◎',
  );
  return (
    <div className="retired-list-item-wrap">
      <div
        className="retired-list-item"
        onClick={onToggle}
        role="button"
        tabIndex={0}
      >
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
          <div className="rank-row rank-row--compact">
            <RankBadge rank={paramRank(horse.params.speed)} />
            <RankBadge rank={paramRank(horse.params.stamina)} />
            <RankBadge rank={paramRank(horse.params.power)} />
            <RankBadge rank={paramRank(horse.params.guts)} />
            <RankBadge rank={paramRank(horse.params.wisdom)} />
          </div>
        </div>
        <span className="retired-list-item__chevron">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className="retired-list-item__detail">
          <h3 style={{ fontSize: 13, margin: '4px 0 8px' }}>戦績</h3>
          <RaceRecordTable careerLog={horse.careerLog} />
        </div>
      )}
    </div>
  );
}

export function StableScreen() {
  const horses = useLiveQuery(() => db.horses.toArray(), []);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (horses == null) {
    return <div className="loading-overlay">読込中…</div>;
  }

  const byId = new Map(
    horses.filter((h) => h.id != null).map((h) => [h.id as number, h]),
  );
  const active = horses.find((h) => h.status === 'active');
  // 血統表の穴埋め用に自動生成された祖先(origin: 'intro')は、
  // 牧場の記録にも配合相手にも出さない。
  const isBred = (h: Horse) => (h.origin ?? 'bred') === 'bred';
  const retired = horses
    .filter((h) => h.status === 'retired' && isBred(h))
    .sort((a, b) => (a.birthAt < b.birthAt ? 1 : -1));
  const stallions = retired.filter((h) => h.sex === 'male');
  const broodmares = retired.filter((h) => h.sex === 'female');
  const canBreed = stallions.length > 0 && broodmares.length > 0;

  return (
    <div>
      {active ? (
        <PendingHorseCard horse={active} byId={byId} />
      ) : (
        <>
          {canBreed && (
            <BreedingForm
              stallions={stallions}
              broodmares={broodmares}
              onCreated={() => undefined}
            />
          )}
          <NamingForm onCreated={() => undefined} collapsedByDefault={canBreed} />
        </>
      )}

      {retired.length > 0 && (
        <div className="card">
          <h2>牧場の記録(引退馬)</h2>
          {retired.map((h) => (
            <RetiredHorseItem
              key={h.id}
              horse={h}
              expanded={expandedId === h.id}
              onToggle={() => setExpandedId(expandedId === h.id ? null : (h.id ?? null))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
