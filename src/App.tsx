import { useState } from 'react';
import { useSettings } from './hooks/useSettings';
import { HomeScreen } from './screens/HomeScreen';
import { CandidatesScreen } from './screens/CandidatesScreen';
import { DetailScreen } from './screens/DetailScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { PlacesScreen } from './screens/PlacesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type {
  LatLng,
  MoodFilter,
  ProposalResult,
  RouteCandidate,
} from './types';

type Screen =
  | 'home'
  | 'candidates'
  | 'detail'
  | 'history'
  | 'places'
  | 'settings';

interface ProposalContext {
  start: LatLng;
  end: LatLng;
  moods: MoodFilter[];
  timeLimitMin: number;
  overlapThreshold: number;
}

const HEADER_TITLES: Record<Screen, string> = {
  home: '🚶 Sanpo — ルート提案',
  candidates: '候補ルート',
  detail: 'ルート詳細',
  history: '履歴',
  places: '場所',
  settings: '設定',
};

export function App() {
  const settings = useSettings();
  const [screen, setScreen] = useState<Screen>('home');
  const [result, setResult] = useState<ProposalResult | null>(null);
  const [context, setContext] = useState<ProposalContext | null>(null);
  const [selected, setSelected] = useState<RouteCandidate | null>(null);

  // 設定読込中。
  if (settings === undefined) {
    return (
      <div className="app">
        <div className="loading-overlay">読込中…</div>
      </div>
    );
  }

  // 初回起動: 設定(歩行ペース)が未登録なら設定画面を必須表示。
  if (settings === null) {
    return (
      <div className="app">
        <header className="app__header">はじめに — 設定</header>
        <div className="app__body">
          <SettingsScreen current={null} firstRun onSaved={() => undefined} />
        </div>
      </div>
    );
  }

  const handleProposed = (
    r: ProposalResult,
    ctx: ProposalContext,
  ) => {
    setResult(r);
    setContext(ctx);
    setSelected(null);
    setScreen('candidates');
  };

  const handleSelect = (c: RouteCandidate) => {
    setSelected(c);
    setScreen('detail');
  };

  const handleSaved = () => {
    setResult(null);
    setContext(null);
    setSelected(null);
    setScreen('history');
  };

  return (
    <div className="app">
      <header className="app__header">{HEADER_TITLES[screen]}</header>
      <main className="app__body">
        {screen === 'home' && (
          <HomeScreen settings={settings} onProposed={handleProposed} />
        )}

        {screen === 'candidates' && result && context && (
          <CandidatesScreen
            result={result}
            start={context.start}
            end={context.end}
            threshold={context.overlapThreshold}
            onSelect={handleSelect}
            onBack={() => setScreen('home')}
          />
        )}

        {screen === 'detail' && selected && context && (
          <DetailScreen
            candidate={selected}
            start={context.start}
            end={context.end}
            moods={context.moods}
            onSaved={handleSaved}
            onBack={() => setScreen('candidates')}
          />
        )}

        {screen === 'history' && <HistoryScreen />}

        {screen === 'places' && <PlacesScreen />}

        {screen === 'settings' && (
          <SettingsScreen
            current={settings}
            onSaved={() => setScreen('home')}
          />
        )}
      </main>

      <nav className="app__nav">
        <button
          className={screen === 'home' ? 'active' : ''}
          onClick={() => setScreen('home')}
        >
          <span className="nav-icon">🏠</span>
          ホーム
        </button>
        <button
          className={
            screen === 'candidates' || screen === 'detail' ? 'active' : ''
          }
          onClick={() => result && setScreen('candidates')}
          disabled={!result}
        >
          <span className="nav-icon">🗺️</span>
          候補
        </button>
        <button
          className={screen === 'history' ? 'active' : ''}
          onClick={() => setScreen('history')}
        >
          <span className="nav-icon">📖</span>
          履歴
        </button>
        <button
          className={screen === 'places' ? 'active' : ''}
          onClick={() => setScreen('places')}
        >
          <span className="nav-icon">📍</span>
          場所
        </button>
        <button
          className={screen === 'settings' ? 'active' : ''}
          onClick={() => setScreen('settings')}
        >
          <span className="nav-icon">⚙️</span>
          設定
        </button>
      </nav>
    </div>
  );
}
