import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addHorseWithPedigree, breedHorses } from '../db/db';
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
    await addHorseWithPedigree(trimmed, sex);
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
        名付けると、次の散歩から調教が始まります。全12回の散歩でキャリア(育成期
        →2歳→3歳→4歳・引退)が一周します。距離やペースは強さに、
        <b>散歩の回数</b>だけがキャリアの進み方に反映されます。
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
    await breedHorses(trimmed, sireId, damId);
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
      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={saving} onClick={handleBreed}>
        {saving ? '配合中…' : '仔を誕生させる'}
      </button>
    </div>
  );
}

function PedigreeCell({
  horse,
  duplicated,
}: {
  horse?: Horse;
  duplicated: boolean;
}) {
  if (!horse) {
    return <div className="pedigree__cell pedigree__cell--empty" />;
  }
  const isIntro = (horse.origin ?? 'bred') === 'intro';
  return (
    <div className={`pedigree__cell ${isIntro ? 'pedigree__cell--intro' : ''}`}>
      <span className="pedigree__name">
        {horse.name} {horse.sex === 'male' ? '♂' : '♀'}
      </span>
      <span className="pedigree__meta">
        {isIntro ? '導入' : `自家産・${horse.wins}勝`}
        {duplicated && <span className="pedigree__dup">近親</span>}
      </span>
    </div>
  );
}

/** 3世代血統表(父母・祖父母・曾祖父母)。血統情報が無ければ何も表示しない。 */
function PedigreeTable({
  horse,
  byId,
}: {
  horse: Horse;
  byId: Map<number, Horse>;
}) {
  const sire = horse.sireId != null ? byId.get(horse.sireId) : undefined;
  const dam = horse.damId != null ? byId.get(horse.damId) : undefined;
  if (!sire && !dam) return null;

  const nextGen = (gen: (Horse | undefined)[]) =>
    gen.flatMap((h) =>
      h
        ? [
            h.sireId != null ? byId.get(h.sireId) : undefined,
            h.damId != null ? byId.get(h.damId) : undefined,
          ]
        : [undefined, undefined],
    );
  const gen1 = [sire, dam];
  const gen2 = nextGen(gen1);
  const gen3 = nextGen(gen2);

  const counts = new Map<number, number>();
  for (const h of [...gen1, ...gen2, ...gen3]) {
    if (h?.id != null) counts.set(h.id, (counts.get(h.id) ?? 0) + 1);
  }
  const isDup = (h?: Horse) => !!h?.id && (counts.get(h.id) ?? 0) > 1;

  return (
    <div className="pedigree-scroll">
      <div className="pedigree">
        <div className="pedigree__col">
          {gen1.map((h, i) => (
            <PedigreeCell key={i} horse={h} duplicated={isDup(h)} />
          ))}
        </div>
        <div className="pedigree__col">
          {gen2.map((h, i) => (
            <PedigreeCell key={i} horse={h} duplicated={isDup(h)} />
          ))}
        </div>
        <div className="pedigree__col">
          {gen3.map((h, i) => (
            <PedigreeCell key={i} horse={h} duplicated={isDup(h)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ActiveHorseCard({
  horse,
  byId,
}: {
  horse: Horse;
  byId: Map<number, Horse>;
}) {
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

      {horse.inbredAtBirth && (
        <div className="notice" style={{ marginTop: 0 }}>
          近親配合で生まれた一頭です。能力に伸びしろがある一方、気性は要注意かもしれません。
        </div>
      )}

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

      <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>血統表</h3>
      <PedigreeTable horse={horse} byId={byId} />

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
        <ActiveHorseCard horse={active} byId={byId} />
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
            <RetiredHorseItem key={h.id} horse={h} />
          ))}
        </div>
      )}
    </div>
  );
}
