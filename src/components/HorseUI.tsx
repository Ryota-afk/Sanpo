// StableScreen / LifetimeScreen で共通して使う、愛馬表示まわりの小さな部品。

import { paramRank } from '../core/career';
import {
  COURSE_PLAN_DESCRIPTIONS,
  COURSE_PLAN_LABELS,
  PARAM_LABELS,
  RACE_COUNT_PREFERENCE_LABELS,
  type CoursePlan,
  type Horse,
  type HorseCareerEntry,
  type HorseParams,
  type RaceCountPreference,
} from '../types';

export function CoursePlanField({
  value,
  onChange,
}: {
  value: CoursePlan;
  onChange: (v: CoursePlan) => void;
}) {
  const options = Object.keys(COURSE_PLAN_LABELS) as CoursePlan[];
  return (
    <div className="field">
      <label>路線</label>
      <div className="mood-grid">
        {options.map((c) => (
          <div
            key={c}
            className={`chip ${value === c ? 'selected' : ''}`}
            onClick={() => onChange(c)}
            role="button"
            tabIndex={0}
          >
            {COURSE_PLAN_LABELS[c]}
          </div>
        ))}
      </div>
      <p className="hint">{COURSE_PLAN_DESCRIPTIONS[value]}</p>
    </div>
  );
}

export function RaceCountField({
  value,
  onChange,
}: {
  value: RaceCountPreference;
  onChange: (v: RaceCountPreference) => void;
}) {
  const options = Object.keys(RACE_COUNT_PREFERENCE_LABELS) as RaceCountPreference[];
  return (
    <div className="field">
      <label>レース数の目安</label>
      <div className="mood-grid">
        {options.map((p) => (
          <div
            key={p}
            className={`chip ${value === p ? 'selected' : ''}`}
            onClick={() => onChange(p)}
            role="button"
            tabIndex={0}
          >
            {RACE_COUNT_PREFERENCE_LABELS[p]}
          </div>
        ))}
      </div>
      <p className="hint">
        歩くルートの距離に応じた自動値を基準に、レース数を増減します。実際の距離が決まる
        ルート選択より前に決められます。
      </p>
    </div>
  );
}

export function fatigueState(fatigue: number): { label: string; cls: string } {
  if (fatigue >= 80) return { label: '要休養', cls: 'bad' };
  if (fatigue >= 60) return { label: 'やや疲れ気味', cls: 'ok' };
  if (fatigue <= 25) return { label: '絶好調', cls: 'good' };
  return { label: '良好', cls: 'good' };
}

const SURFACE_LABELS: Record<'turf' | 'dirt', string> = { turf: '芝', dirt: 'ダート' };

/** netkeiba表記("480(+4)"など)の馬体重セル文字列を作る。 */
function formatWeight(weightKg?: number, deltaKg?: number): string {
  if (weightKg == null) return '';
  if (deltaKg == null) return `${weightKg}`;
  const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '' : '±';
  return `${weightKg}(${sign}${deltaKg})`;
}

/**
 * 引退後に見る戦績表。netkeiba の馬柱ページ(戦績一覧)を参考に、
 * このアプリが持っているデータ(回次・レース名・馬場距離・頭数・着順)で構成する。
 */
export function RaceRecordTable({ careerLog }: { careerLog: HorseCareerEntry[] }) {
  const races = careerLog.filter((e) => e.kind === 'race' && e.raceName);
  if (races.length === 0) return null;

  const wins = races.filter((e) => e.placing === 1).length;

  return (
    <div>
      <div className="race-record-scroll">
        <table className="race-record">
          <thead>
            <tr>
              <th>回次</th>
              <th>レース名</th>
              <th>馬場・距離</th>
              <th>頭数</th>
              <th>着順</th>
              <th>馬体重</th>
            </tr>
          </thead>
          <tbody>
            {races.map((e, i) => {
              const tier =
                e.placing === 1 ? 'win' : e.placing != null && e.placing <= 3 ? 'place' : '';
              return (
                <tr key={i}>
                  <td className="race-record__idx">{i + 1}</td>
                  <td className="race-record__name">{e.raceName}</td>
                  <td className="race-record__course">
                    {e.surface && SURFACE_LABELS[e.surface]}
                    {e.distanceM}m
                  </td>
                  <td className="race-record__field">{e.fieldSize}頭</td>
                  <td className={`race-record__placing ${tier ? `race-record__placing--${tier}` : ''}`}>
                    {e.placing}着
                  </td>
                  <td className="race-record__weight">{formatWeight(e.weightKg, e.weightDeltaKg)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        {races.length}戦{wins}勝。
      </p>
    </div>
  );
}

export function CareerEntryRow({ entry }: { entry: HorseCareerEntry }) {
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

export function RankBadge({ rank }: { rank: ReturnType<typeof paramRank> }) {
  return <span className={`rank-badge rank-badge--${rank}`}>{rank}</span>;
}

/** 五能力をランク(S〜G)で並べる。数値は出さない。 */
export function RankRow({ params }: { params: HorseParams }) {
  const keys = Object.keys(PARAM_LABELS) as (keyof HorseParams)[];
  return (
    <div className="rank-row">
      {keys.map((k) => (
        <div key={k} className="rank-row__item">
          <RankBadge rank={paramRank(params[k])} />
          <span className="rank-row__label">{PARAM_LABELS[k]}</span>
        </div>
      ))}
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
export function PedigreeTable({
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
