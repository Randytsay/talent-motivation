import type { CSSProperties } from 'react';
import { RIASEC_TRANSITION_BADGES } from '../data/riasecHumanProfiles';

export function TransitionBadgesGrid() {
  return (
    <div className="transition-badges-grid" aria-label="六大活動偏好導覽">
      {RIASEC_TRANSITION_BADGES.map((badge) => (
        <div
          key={badge.code}
          className="transition-badge-card"
          style={{
            '--badge-theme': badge.color,
            '--badge-bg': badge.bg,
          } as CSSProperties}
        >
          <div className="transition-badge-card__top">
            <span className="transition-badge-card__letter">{badge.code}</span>
            <span className="transition-badge-card__english">{badge.english}</span>
          </div>
          <div className="transition-badge-card__bottom">
            <span className="transition-badge-card__verb">{badge.verb}</span>
            <span className="transition-badge-card__essence">{badge.essence}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
