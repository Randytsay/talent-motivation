import type { RiasecResult } from '../types/domain';
import { RIASEC_META } from '../data/riasecQuestions';
import { RIASEC_HUMAN_PROFILES, getRiasecCompositeArchetype } from '../data/riasecHumanProfiles';
import { FormattedText } from './FormattedText';

export function RiasecHumanInsightCard({ riasecResult }: { riasecResult: RiasecResult }) {
  const top1 = riasecResult.top3[0];
  const top1Meta = RIASEC_META[top1];
  const humanProfile = RIASEC_HUMAN_PROFILES[top1];
  const composite = getRiasecCompositeArchetype(riasecResult.top3);

  return (
    <div className="riasec-human-card" aria-label={`RIASEC 深度特質解密：${humanProfile.title}`}>
      <div className="riasec-human-card__header">
        <div className="riasec-human-card__badge" style={{ backgroundColor: top1Meta.color }}>
          <span>{top1}</span>
        </div>
        <div className="riasec-human-card__header-content">
          <small className="riasec-human-card__eyebrow">深層動能解密 · 第一驅動力</small>
          <h3 className="riasec-human-card__title">
            {humanProfile.title}
            <span className="riasec-human-card__tag">（{top1} · {top1Meta.name}）</span>
          </h3>
          <p className="riasec-human-card__tagline">「{humanProfile.tagline}」</p>
        </div>
      </div>

      <div className="riasec-human-card__grid">
        <div className="riasec-human-card__item riasec-human-card__item--soul">
          <h4>🔥 骨子裡的快感追求（你為什麼想投入？）</h4>
          <p><FormattedText text={humanProfile.soulDrive} /></p>
        </div>
        <div className="riasec-human-card__item riasec-human-card__item--pain">
          <h4>🌧️ 職場錯位地獄（如果被放錯位置，會有多崩潰？）</h4>
          <p><FormattedText text={humanProfile.mismatchPain} /></p>
        </div>
      </div>

      <div className="riasec-human-card__item riasec-human-card__item--fit">
        <h4>🎯 最能讓你發光的理想舞台</h4>
        <p><FormattedText text={humanProfile.workplaceFit} /></p>
      </div>

      <div className="riasec-composite-box">
        <div className="riasec-composite-header">
          <small>前三項天賦化學反應 · 複合打法</small>
          <h4>
            {composite.title}
            <span className="riasec-composite-code">（{riasecResult.top3Code}）</span>
          </h4>
          <p className="riasec-composite-tagline">「{composite.tagline}」</p>
        </div>
        <div className="riasec-composite-body">
          <p className="riasec-composite-chem"><FormattedText text={composite.chemistry} /></p>
          <p className="riasec-composite-desc"><FormattedText text={composite.description} /></p>
        </div>
      </div>
    </div>
  );
}
