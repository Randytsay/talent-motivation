import type { AssessmentStep } from '../types/domain';

const PHASES = [
  { name: '自我反思', steps: ['consent', 'birthday', 'life-path', 'resonance'] },
  { name: '活動偏好', steps: ['transition', 'riasec', 'energy', 'riasec-result'] },
  { name: '此刻的你', steps: ['talent-usage', 'priorities'] },
] as const;

function activePhase(step: AssessmentStep): number {
  return PHASES.findIndex((phase) => phase.steps.includes(step as never));
}

interface ProgressHeaderProps {
  step: AssessmentStep;
  onHome: () => void;
  onBack?: () => void;
  canBack?: boolean;
}

export function ProgressHeader({ step, onHome, onBack, canBack }: ProgressHeaderProps) {
  const current = activePhase(step);

  return (
    <header className="app-header">
      <div className="header-nav">
        {canBack && onBack ? (
          <button
            className="back-button"
            type="button"
            onClick={onBack}
            aria-label="回上一步"
          >
            ← 上一步
          </button>
        ) : null}
        <button
          className="brand"
          type="button"
          aria-label="放棄這次探索並回到天賦原動力首頁"
          onClick={onHome}
          style={{ border: 0, background: 'transparent', padding: 0 }}
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>天賦原動力</span>
        </button>
      </div>
      <ol className="phase-track" aria-label="探索進度">
        {PHASES.map((phase, index) => (
          <li className={index <= current ? 'phase--active' : ''} key={phase.name}>
            <span>{index + 1}</span>
            {phase.name}
          </li>
        ))}
      </ol>
    </header>
  );
}
