import { useEffect, useState } from 'react';
import type { PresenterPayload } from '../server/contracts';
import { RadarChart } from './RadarChart';

interface PresenterResponse { presenter: PresenterPayload | null }

/** Event display route. It polls only the field-allowlisted Presenter endpoint. */
export function PresenterPage() {
  const [state, setState] = useState<{ data: PresenterPayload | null; unavailable: boolean }>({ data: null, unavailable: false });
  const eventId = new URLSearchParams(window.location.search).get('eventId');

  useEffect(() => {
    let active = true;
    const currentEventId = eventId ?? '';
    if (!currentEventId) return;
    async function poll() {
      try {
        const response = await fetch(`/api/presenter/current?eventId=${encodeURIComponent(currentEventId)}`);
        if (!response.ok) throw new Error('Presenter endpoint unavailable.');
        const body = await response.json() as PresenterResponse;
        if (active) setState({ data: body.presenter, unavailable: false });
      } catch {
        if (active) setState((current) => ({ ...current, unavailable: true }));
      }
    }
    void poll();
    const interval = window.setInterval(() => void poll(), 2000);
    return () => { active = false; window.clearInterval(interval); };
  }, [eventId]);

  return (
    <main className="site-shell">
      <section className="panel panel--wide results-panel entrance" aria-live="polite">
        <p className="eyebrow">Presenter · 活動即時畫面</p>
        {state.data ? (
          <>
            <h1>{state.data.displayName}</h1>
            <div className="results-layout">
              <RadarChart scores={state.data.riasecScores} />
              <div className="score-summary">
                <p className="top-code">{state.data.top3Code}</p>
                <p>Life Path {state.data.lifePath} · 主觀能量線索 {state.data.subjectiveDriver} · 天賦使用感 {state.data.talentUsage}%</p>
                {state.data.repeatedSignals ? <div className="reflection-card"><small>重複出現的線索</small><p>{state.data.repeatedSignals.join(' ')}</p></div> : null}
              </div>
            </div>
          </>
        ) : (
          <>
            <h1>等待經同意的分享</h1>
            <p className="lede">{!eventId ? '請先提供活動識別碼。' : '目前沒有可顯示的活動資料。'}</p>
            {state.unavailable ? <p className="disclaimer">Presenter 需要透過部署後的 API runtime 讀取活動資料。</p> : null}
          </>
        )}
      </section>
    </main>
  );
}
