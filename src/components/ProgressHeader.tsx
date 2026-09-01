import type { AssessmentStep } from '../types/domain';

const PHASES = [
  { name: '自我反思', steps: ['birthday', 'life-path', 'resonance'] },
  { name: '活動偏好', steps: ['transition', 'riasec', 'energy', 'riasec-result'] },
  { name: '此刻的你', steps: ['talent-usage', 'priorities'] },
] as const;

function activePhase(step: AssessmentStep): number {
  return PHASES.findIndex((phase) => phase.steps.includes(step as never));
}

export function ProgressHeader({ step }: { step: AssessmentStep }) {
  const current = activePhase(step);

  return (
    <header className="app-header">
      <a className="brand" href="/" aria-label="回到天賦原動力首頁">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>天賦原動力</span>
      </a>
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
