import { RIASEC_META } from '../data/riasecQuestions';
import { RIASEC_CODES } from '../types/domain';
import type { RiasecScores } from '../types/domain';

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 112;

function pointAt(index: number, value: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / RIASEC_CODES.length;
  const radius = (value / 100) * RADIUS;
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius];
}

function pointsFor(value: number): string {
  return RIASEC_CODES.map((_, index) => pointAt(index, value).join(',')).join(' ');
}

export function RadarChart({ scores }: { scores: RiasecScores }) {
  const resultPoints = RIASEC_CODES.map((code, index) => pointAt(index, scores[code].normalized).join(',')).join(' ');

  return (
    <figure className="radar-chart">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="六維 RIASEC 偏好分數雷達圖">
        {[25, 50, 75, 100].map((level) => (
          <polygon className="radar-grid" key={level} points={pointsFor(level)} />
        ))}
        {RIASEC_CODES.map((code, index) => {
          const [x, y] = pointAt(index, 100);
          const [labelX, labelY] = pointAt(index, 122);
          return (
            <g key={code}>
              <line className="radar-axis" x1={CENTER} y1={CENTER} x2={x} y2={y} />
              <text className="radar-label" x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle">
                {code} · {RIASEC_META[code].verb}
              </text>
            </g>
          );
        })}
        <polygon className="radar-result" points={resultPoints} />
        {RIASEC_CODES.map((code, index) => {
          const [x, y] = pointAt(index, scores[code].normalized);
          return <circle className="radar-dot" cx={x} cy={y} key={code} r="4" />;
        })}
      </svg>
      <figcaption>這是活動偏好的快照，不是職業適性判定。</figcaption>
    </figure>
  );
}
