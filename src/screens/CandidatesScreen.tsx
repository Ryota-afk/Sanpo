import { useState } from 'react';
import { MapView } from '../components/MapView';
import { highwayLabel } from '../core/wayTypes';
import { formatKm } from '../core/geo';
import type {
  LatLng,
  ProposalResult,
  RouteCandidate,
} from '../types';

export interface CandidatesScreenProps {
  result: ProposalResult;
  start: LatLng;
  end: LatLng;
  threshold: number;
  /** 候補を選ぶと即座に記録される。保存が終わるまで待つため Promise を返す。 */
  onSelect: (candidate: RouteCandidate) => Promise<void>;
  onBack: () => void;
}

function OverlapBadge({ rate }: { rate: number }) {
  const cls = rate > 30 ? 'overlap-badge high' : 'overlap-badge';
  return <span className={cls}>被り率 {rate.toFixed(0)}%</span>;
}

function Breakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  return (
    <div className="breakdown">
      {entries.map(([hw, m]) => (
        <span key={hw} className="tag">
          {highwayLabel(hw)} {formatKm(m)}km
        </span>
      ))}
    </div>
  );
}

export function CandidatesScreen({
  result,
  start,
  end,
  threshold,
  onSelect,
  onBack,
}: CandidatesScreenProps) {
  const { candidates } = result;
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const handlePick = async (candidate: RouteCandidate, index: number) => {
    if (savingIndex != null) return;
    setSavingIndex(index);
    try {
      await onSelect(candidate);
    } finally {
      setSavingIndex(null);
    }
  };

  if (candidates.length === 0) {
    return (
      <div>
        <div className="error">
          {result.message ??
            '条件に合うルートが見つかりませんでした。'}
        </div>
        <button className="btn btn--secondary" onClick={onBack}>
          条件を変えて再検索
        </button>
      </div>
    );
  }

  return (
    <div>
      {result.relaxed && (
        <div className="notice">
          条件を満たす候補が少なかったため、被り率の条件を{' '}
          {threshold}% → {result.usedThreshold}% に緩和しました。
        </div>
      )}

      <div className="card">
        <MapView
          center={start}
          start={start}
          end={end}
          routes={candidates.map((c) => c.geometry)}
          fitRoutes
        />
        <p className="hint">
          色分けされた {candidates.length} 件の候補を比較できます。
        </p>
      </div>

      {candidates.map((c, i) => (
        <div
          key={i}
          className={`candidate-card ${savingIndex === i ? 'selected' : ''}`}
          style={savingIndex != null && savingIndex !== i ? { opacity: 0.5 } : undefined}
          onClick={() => handlePick(c, i)}
          role="button"
          tabIndex={0}
        >
          <div className="candidate-card__header">
            <span className="candidate-card__title">
              候補 {i + 1}
              {savingIndex === i && '(記録中…)'}
            </span>
            <OverlapBadge rate={c.overlapRate} />
          </div>
          <div className="stat-row">
            <span className="stat">
              <b>{formatKm(c.distanceM)}</b>
              <span className="unit">km</span>
            </span>
            <span className="stat">
              <b>{Math.round(c.durationMin)}</b>
              <span className="unit">分</span>
            </span>
          </div>
          <Breakdown breakdown={c.wayTypeBreakdown} />
        </div>
      ))}

      <p className="hint">
        候補をタップすると、その場でルートが記録されます。歩いている途中で
        ブラウザを閉じても、履歴タブから続きを確認できます。
      </p>

      <button
        className="btn btn--secondary"
        onClick={onBack}
        disabled={savingIndex != null}
      >
        条件を変えて再検索
      </button>
    </div>
  );
}
