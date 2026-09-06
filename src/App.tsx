import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChoiceButton } from './components/ChoiceButton';
import { AIHighlightedText } from './components/AIInsight';
import { FormattedText } from './components/FormattedText';
import { RiasecHumanInsightCard } from './components/RiasecHumanInsightCard';
import { TransitionBadgesGrid } from './components/TransitionBadgesGrid';
import { ProgressHeader } from './components/ProgressHeader';
import { RadarChart } from './components/RadarChart';
import { PresenterPage } from './components/PresenterPage';
import { LIFE_PATH_CONTENT } from './data/lifePathContent';
import { RIASEC_META, RIASEC_QUESTIONS } from './data/riasecQuestions';
import { calculateLifePath, LifePathValidationError } from './lib/scoring/lifePath';
import { calculateBirthProfile, type BirthProfileResult } from './lib/scoring/birthProfile';
import { calculateBirthSignature, type BirthSignatureResult } from './lib/scoring/birthSignature';
import { CORE_NARRATIVES, OUTER_NARRATIVES, INNER_NARRATIVES, getProfileTension } from './data/birthProfileNarratives';
import { generateWorkplaceDiagnosis } from './data/workplaceProfiles';
import { scoreRiasec } from './lib/scoring/riasec';
import { ApiError, createAssessment, createClaim, createSubject, generateReport, getClaimPreview, getLatestAssessment, getPublicShare, getReport, redeemClaim, type ClientAssessment } from './lib/api/client';
import { useAuthBootstrap, type AuthState } from './lib/api/authBootstrap';
import { localAssessmentDraftRepository } from './lib/storage/assessmentRepository';
import type {
  AssessmentDraft,
  AssessmentMode,
  ExplorationInterest,
  LifePathResonance,
  Priority,
  RiasecAnswer,
  RiasecCode,
  RiasecResult,
  TalentUsage,
} from './types/domain';
import type { AIReport, AssessmentInput } from './server/contracts';

const DISCLAIMER = '生命靈數是一種自我反思工具，結果不代表命定的人格或人生。';
const SCALE: Array<{ value: RiasecAnswer; label: string }> = [
  { value: 1, label: '完全不像我' },
  { value: 2, label: '不太像我' },
  { value: 3, label: '有點像我' },
  { value: 4, label: '很像我' },
];
const ENERGY_OPTIONS: Array<{ code: RiasecCode; label: string }> = [
  { code: 'R', label: '把事情做出來' },
  { code: 'I', label: '把問題想明白' },
  { code: 'A', label: '創造不同做法' },
  { code: 'S', label: '幫助別人成長' },
  { code: 'E', label: '把事情推動起來' },
  { code: 'C', label: '把混亂整理清楚' },
];
const PRIORITIES: Priority[] = [
  '收入更多元',
  '工作更穩定',
  '更多時間自主',
  '更有成就感',
  '更能發揮自己的能力',
  '改善工作／人際環境',
  '新的學習與發展方向',
  '我現在還不確定',
];
const EXPLORATION_OPTIONS: ExplorationInterest[] = ['很想', '可以了解看看', '目前還沒有'];

function createEmptyDraft(): AssessmentDraft {
  return {
    version: 1,
    step: 'landing',
    birthDate: '',
    riasecAnswers: {},
    priorities: [],
    assessmentMode: 'self',
  };
}

function energyLabel(code?: RiasecCode): string {
  return code ? ENERGY_OPTIONS.find((item) => item.code === code)?.label ?? '—' : '—';
}

function App() {
  if (window.location.pathname === '/presenter') return <PresenterPage />;
  if (window.location.pathname === '/claim') return <ClaimPage />;
  if (window.location.pathname.startsWith('/share/')) return <PublicSharePage />;
  return <AssessmentApp />;
}

function ClaimPage() {
  const auth = useAuthBootstrap();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getClaimPreview>>['preview'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!token) return;
    void getClaimPreview(token).then((response) => setPreview(response.preview)).catch(() => setError('這個認領連結已失效或已使用。'));
  }, [token]);
  async function redeem() {
    try {
      await redeemClaim(token);
      setDone(true);
    } catch (claimError) {
      setError(claimError instanceof ApiError ? claimError.message : '目前無法保存這份結果。');
    }
  }
  return <main className="site-shell"><section className="panel panel--narrow entrance claim-panel">
    <p className="eyebrow">私人認領連結</p>
    <h1>{done ? '已保存到你的帳號' : '把這份探索結果保存下來'}</h1>
    {preview ? <><p className="lede">{preview.displayLabel} · Life Path {preview.lifePath ?? '—'} · RIASEC {preview.top3Code ?? '—'}</p><p className="local-note">連結有效至 {new Date(preview.expiresAt).toLocaleString('zh-TW')}</p></> : null}
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {!done && preview ? <button className="primary-button" type="button" disabled={auth.status === 'loading'} onClick={() => { if (auth.status === 'authenticated' || auth.status === 'mock') void redeem(); else window.location.assign(`/api/auth/line/start?claimToken=${encodeURIComponent(token)}`); }}>{auth.status === 'authenticated' || auth.status === 'mock' ? '用 LINE 保存我的結果' : '請先使用 LINE 登入'}</button> : null}
    {!done && !preview ? <button className="secondary-button" type="button" onClick={() => { window.location.assign('/'); }}>回到首頁</button> : null}
  </section></main>;
}

function PublicSharePage() {
  const assessmentId = decodeURIComponent(window.location.pathname.slice('/share/'.length));
  const [share, setShare] = useState<Awaited<ReturnType<typeof getPublicShare>>['share'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!assessmentId) return;
    void getPublicShare(assessmentId).then((response) => setShare(response.share)).catch(() => setError('目前無法讀取這份精華摘要。'));
  }, [assessmentId]);
  return <main className="site-shell"><section className="panel panel--narrow entrance public-share-panel">
    <p className="eyebrow">公開精華摘要</p>
    <h1>一份可以安心分享的探索線索</h1>
    <p className="lede">這張卡片只保留適合公開的摘要，不包含出生日期、原始答案或認領連結。</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {share ? <>
      <div className="public-share-grid">
        <article><small>Life Path</small><strong>{share.lifePath}</strong></article>
        <article><small>RIASEC Top 3</small><strong>{share.top3Code}</strong><p>{share.top3.join('、')}</p></article>
      </div>
      <div className="reflection-card"><small>重複出現的線索</small><p>{share.repeatedSignals.length ? share.repeatedSignals.map((signal, index) => <span key={`${signal}-${index}`}><AIHighlightedText text={signal} /> </span>) : '這份摘要目前沒有額外的重複線索。'}</p></div>
      <p className="local-note"><AIHighlightedText text={share.summary} /></p>
      <a className="secondary-button public-share-home" href={share.landingUrl}>回到天賦原動力</a>
    </> : !error ? <p className="local-note">正在準備精華摘要…</p> : null}
  </section></main>;
}

function BirthProfileCore({ birthProfile }: { birthProfile: BirthProfileResult }) {
  const main = birthProfile.pyramid.main;
  const coreInfo = CORE_NARRATIVES[main] ?? {
    title: `${main} 號核心特質`,
    tagline: '你獨特而真實的內在節奏',
    description: '你習慣以自己的方式感受世界，當環境能貼合你的節奏時，你的真實力量便會自然舒展。',
    relatableHit: '💭 回想一下：最近什麼樣的時刻，讓你感到自己最有力量且踏實？',
  };
  return (
    <div className="mirror-core mirror-core--birth">
      <div className="mirror-result-label">深層特質底色</div>
      <h3>{coreInfo.title}</h3>
      <p className="mirror-result-tagline">{coreInfo.tagline}</p>
      <p>{coreInfo.description}</p>
      <p className="mirror-reflection">{coreInfo.relatableHit}</p>
    </div>
  );
}

function BirthProfileExtension({ birthProfile }: { birthProfile: BirthProfileResult }) {
  const outer = birthProfile.pyramid.outerComposite;
  const inner = birthProfile.pyramid.innerComposite;
  const stage = birthProfile.currentStage;
  return (
    <details className="mirror-extension">
      <summary>🔍 看看別人眼中的你 vs. 你心中的自己（深層特質探索）</summary>
      <div className="mirror-extension__list">
        <div><strong>外在展現 · {outer} 號（給人的第一印象）</strong><p>{OUTER_NARRATIVES[outer] ?? '可以觀察你如何面對外界。'}</p></div>
        <div><strong>內在渴望 · {inner} 號（藏在心底的聲音）</strong><p>{INNER_NARRATIVES[inner] ?? '可以想想你重視的條件。'}</p></div>
        {stage.number ? <div><strong>目前人生階段 · {stage.number} 號（當前核心課題）</strong><p>這個階段的你，正逐漸將注意力轉向更深層的自我實現與價值沉澱，尋求更適合自己的節奏。</p></div> : null}
        <div><strong>當這兩個面向相遇（內心拉扯）</strong><p>{getProfileTension(outer, inner)}</p></div>
      </div>
    </details>
  );
}

function WorkplaceDiagnosisCard({
  lifePathNumber,
  birthSignature,
}: {
  lifePathNumber: number;
  birthSignature?: BirthSignatureResult;
}) {
  const activeLineKeys = birthSignature?.activeLines.map((line) => line.key) ?? [];
  const diagnosis = generateWorkplaceDiagnosis(lifePathNumber, activeLineKeys);

  return (
    <div className="workplace-diagnosis-card">
      <div className="workplace-diagnosis-header">
        <small>💼 職場現狀對照</small>
        <h4>為什麼你在目前工作中可能很開心，也可能很不順？</h4>
        <p className="workplace-subtitle">從你的深層天賦特質，看透你在職場中的順流開關與內耗雷區：</p>
      </div>
      <div className="workplace-notes-grid">
        <div className="workplace-note workplace-note--thrive">
          <strong>✨ 當你感到順流、很有成就感時</strong>
          <p><FormattedText text={diagnosis.thriving} /></p>
        </div>
        <div className="workplace-note workplace-note--friction">
          <strong>🌧️ 當你在目前工作中感到極度內耗、很不順時（痛點雷區）</strong>
          <p><FormattedText text={diagnosis.friction} /></p>
        </div>
      </div>
      <div className="workplace-note workplace-note--guidance">
        <strong>🚀 接下來可以怎麼協助你（破局與調整方向）</strong>
        <p><FormattedText text={diagnosis.guidance} /></p>
      </div>
    </div>
  );
}

function RiasecScoreSummary({ riasecResult }: { riasecResult: RiasecResult }) {
  return (
    <div className="score-summary">
      <p className="score-scale">換算分數 0–100（原始答題 3–12）</p>
      <dl className="score-list">
        {Object.values(riasecResult.scores).map((score) => (
          <div key={score.code}>
            <dt><b style={{ color: RIASEC_META[score.code].color }}>{score.code}</b><span>{RIASEC_META[score.code].name}</span></dt>
            <dd><span className="score-list__track"><i className="score-list__bar" style={{ width: `${score.normalized}%`, background: RIASEC_META[score.code].color }} /></span><b>{score.normalized}</b></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const RIASEC_ACTIVITY_DESCRIPTIONS: Record<RiasecCode, string> = {
  R: '操作工具、動手製作、實際嘗試',
  I: '理解原因、比較資訊、釐清問題',
  A: '發想不同做法、設計與表達想法',
  S: '聆聽他人、陪伴成長、分享經驗',
  E: '發起行動、連結資源、推動目標',
  C: '整理資訊、安排步驟、建立流程',
};

function RiasecTopThree({ riasecResult, showScores = true }: { riasecResult: RiasecResult; showScores?: boolean }) {
  const names = riasecResult.top3.map((code) => RIASEC_META[code].name.replace('型', '')).join('、');
  return (
    <div className="riasec-top-three" aria-label={`前三個活動偏好：${names}`}>
      <div className="riasec-top-three__heading">
        <div>
          <small>先看前三個方向</small>
          <strong>{names}</strong>
        </div>
        <span aria-label={`RIASEC Top 3：${riasecResult.top3Code}`}>{riasecResult.top3Code}</span>
      </div>
      <ol className="riasec-top-three__list">
        {riasecResult.top3.map((code, index) => {
          const score = riasecResult.scores[code];
          return (
            <li key={code}>
              <span className="riasec-top-three__rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="riasec-top-three__code" style={{ color: RIASEC_META[code].color }}>{code}</span>
              <span className="riasec-top-three__copy">
                <strong>{RIASEC_META[code].name}</strong>
                <small>{RIASEC_ACTIVITY_DESCRIPTIONS[code]}</small>
              </span>
              {showScores ? <b className="riasec-top-three__score">{score.normalized}</b> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const LIFE_PATH_DAILY_PROFILES: Record<number, string> = {
  1: '在你的骨子裡，最能點燃你的是**「能按照自己的想法踏出第一步」**。你討厭被動等待每個決定都要他人拍板，那會讓你有**手腳被綁住的無力感**；一旦擁有**主導空間**，你的專注與衝勁會立刻甦醒。',
  2: '在你的骨子裡，最重視的是**「真誠的信任與互動品質」**。當身邊的人能夠**彼此傾聽、同理協作**時，你會感到無比安心且充滿力量；相反地，若身處**勾心鬥角或衝突不斷**的環境，你的心力會被迅速耗盡。',
  3: '在你的骨子裡，最需要的是**「能自由表達自我並被看見」**。當你能用自己的方式把點子、故事或創意說出來，並**得到共鳴**時，整個人會閃閃發光；若是被困在**高度死板且無法表達**的流程裡，心裡會感到極度壓抑。',
  4: '在你的骨子裡，最追求的是**「踏實的秩序與完成感」**。當事情有**清楚的脈絡、可靠的流程**，你能一步一腳印把它做好時，你會感到無比踏實；最怕的就是**規則反覆無常、承諾不算數**，那會讓你極度焦慮與心累。',
  5: '在你的骨子裡，最怕的從來不是辛苦，而是**「被困在沒有彈性的死規矩裡」**。當環境能給你**嘗試新做法的自由**時，你的適應力與靈感會自然湧現；可一旦**所有事都被規定死、看不到轉圜餘地**，你的心力就會被瞬間抽空。',
  6: '在你的骨子裡，最渴望的是**「用真心照顧所愛，且被溫柔珍惜」**。當你的付出能為人帶來實質幫助、且**被好好看見**時，你的價值感會無比充沛；但若**責任被視為理所當然、沒有喘息界線**時，你會感到深深的心碎與委屈。',
  7: '在你的骨子裡，最需要的是**「能把事情想明白的安靜空間」**。當你能**安靜沉澱、深入推敲出問題本質**時，你的洞察力無人能比；最怕的就是**被催促著立刻表態**，或是充斥著**浮躁無效的表面社交**，那會讓你只想立刻抽離。',
  8: '在你的骨子裡，最在乎的是**「努力能不能換來實實在在的成果與進展」**。當你有**明確目標、能調動資源**把事情往前推進時，你會無比興奮且幹勁十足；最怕的就是**付出毫無反饋，或有責無權的空轉**。',
  9: '在你的骨子裡，最堅持的是**「事情背後有沒有深遠的意義與格局」**。當你在做的事情能對他人、對社會產生**正向影響**時，你會願意傾注所有熱情；若是被迫做著**違背初衷、只顧短期利益的瑣事**，你的靈魂會感到難以忍受的疲憊。',
  11: '在你的骨子裡，有一種極為敏銳的**直覺與靈感雷達**。當你能把細微感受整理成**啟發人心的觀點**時，你的能量會無比充沛；最怕環境充滿**嘈雜雜訊且缺乏沉澱時間**，那會讓你的神經系統迅速超載。',
  22: '在你的骨子裡，渴望把宏大的理想一步步落實成**真正的系統與架構**。當你能**整合人與資源、看見大藍圖具體成形**時，成就感無可比擬；最怕**目標很大卻沒有落地路徑**，或責任過重而讓自己喘不過氣。',
  33: '在你的骨子裡，有一種陪伴他人成長、賦予他人力量的**深層召喚**。當你能**引導別人走出困境、看見他人蛻變**時，你的生命力最強烈；最怕**把所有人的問題都攬在自己身上**，忘記給自己留下被愛的餘裕。',
};

function lifePathDailyReading(content: typeof LIFE_PATH_CONTENT[keyof typeof LIFE_PATH_CONTENT]): string {
  return LIFE_PATH_DAILY_PROFILES[content.value] ??
    `在你的骨子裡，最重視的是「${content.coreMotivation}」。當環境能給予充分信任與發揮空間時，你的專注動能會自然湧現；可一旦陷入僵化限制，心力就容易受到無形磨損。`;
}

function RiasecPreferenceReading({ riasecResult }: { riasecResult: RiasecResult }) {
  const first = RIASEC_ACTIVITY_DESCRIPTIONS[riasecResult.top3[0]].split('、')[0];
  const second = RIASEC_ACTIVITY_DESCRIPTIONS[riasecResult.top3[1]].split('、')[0];
  return (
    <>
      <p className="mirror-reading">你的回答較偏向{riasecResult.top3.map((code) => RIASEC_META[code].name.replace('型', '')).join('、')}相關的活動。可以留意：當你能從「{first}」開始，再接著「{second}」時，你是否比較容易投入？</p>
      <RiasecTopThree riasecResult={riasecResult} />
      <p className="mirror-reflection">對照一下：最近哪一件事讓你有機會用到這些偏好？</p>
    </>
  );
}

function MirrorSection({ id, number, title, description, accent, children }: {
  id: string;
  number: string;
  title: string;
  description: string;
  accent: 'birth' | 'activity' | 'feeling';
  children: ReactNode;
}) {
  const ordinal = ({ '01': '一', '02': '二', '03': '三' } as Record<string, string>)[number] ?? number;
  return (
    <section id={id} className={`mirror-section mirror-section--${accent}`} aria-labelledby={`${id}-title`}>
      <header className="mirror-section__header">
        <span className="mirror-section__number" aria-hidden="true">{number}</span>
        <div>
          <h3 id={`${id}-title`}>第{ordinal}面鏡子｜{title}</h3>
          <p>{description}</p>
        </div>
      </header>
      <div className="mirror-section__body">{children}</div>
    </section>
  );
}

function MirrorQuickSummary({
  lifePathValue,
  lifePathLabel,
  lifePathTopResonance,
  riasecResult,
  talentUsage,
  priorities,
}: {
  lifePathValue: number;
  lifePathLabel: string;
  lifePathTopResonance?: string;
  riasecResult: RiasecResult;
  talentUsage: number | string;
  priorities: string[];
}) {
  return (
    <section className="mirror-quick-summary" aria-labelledby="mirror-quick-summary-title">
      <h2 id="mirror-quick-summary-title">三面鏡子快速摘要</h2>
      <div className="mirror-quick-summary__grid">
        <a href="#mirror-1" className="mirror-quick-card mirror-quick-card--birth">
          <span className="mirror-quick-card__number">01</span>
          <span className="mirror-quick-card__content"><strong>出生日期反思</strong><small>{lifePathTopResonance ? `你選的線索：${lifePathTopResonance}` : `${lifePathValue} · ${lifePathLabel}`}</small></span>
          <span className="mirror-quick-card__arrow" aria-hidden="true">↓</span>
        </a>
        <a href="#mirror-2" className="mirror-quick-card mirror-quick-card--activity">
          <span className="mirror-quick-card__number">02</span>
          <span className="mirror-quick-card__content"><strong>活動偏好</strong><small>{riasecResult.top3.map((code) => RIASEC_META[code].name).join('、')}</small></span>
          <span className="mirror-quick-card__arrow" aria-hidden="true">↓</span>
        </a>
        <a href="#mirror-3" className="mirror-quick-card mirror-quick-card--feeling">
          <span className="mirror-quick-card__number">03</span>
          <span className="mirror-quick-card__content"><strong>當下感受</strong><small>{talentUsage}% 使用感{priorities[0] ? ` · ${priorities[0]}` : ''}</small></span>
          <span className="mirror-quick-card__arrow" aria-hidden="true">↓</span>
        </a>
      </div>
    </section>
  );
}

function DetailedResultSections({
  lifePathValue,
  lifePathLabel,
  lifePathCoreMotivation,
  lifePathReflectionQuestion,
  lifePathTopResonance,
  riasecResult,
  birthProfile,
  birthSignature,
  subjectiveDriver,
  talentUsage,
  priorities,
  explorationInterest,
  reflections,
}: {
  lifePathValue: number;
  lifePathLabel: string;
  lifePathCoreMotivation: string;
  lifePathReflectionQuestion: string;
  lifePathTopResonance?: string;
  riasecResult: RiasecResult;
  birthProfile?: BirthProfileResult;
  birthSignature?: BirthSignatureResult;
  subjectiveDriver?: RiasecCode;
  talentUsage: number | string;
  priorities: string[];
  explorationInterest?: string;
  reflections?: { energizingExperience?: string; currentFriction?: string; unconstrainedExploration?: string };
}) {
  const prioritySummary = priorities.length ? `你目前較關注：${priorities.join('、')}。` : null;
  return (
    <section className="mirrors-detail" aria-labelledby="mirrors-detail-title">
      <h2 id="mirrors-detail-title">進一步看三面鏡子</h2>
      <MirrorSection id="mirror-1" number="01" title="出生日期反思" description="以出生日期解讀作為自我反思的提示。" accent="birth">
        {birthProfile ? <BirthProfileCore birthProfile={birthProfile} /> : (
          <div className="mirror-core mirror-core--birth"><p>目前沒有出生日期資料，這一面先略過。</p></div>
        )}
        <p className="mirror-result-meta">生命靈數 {lifePathValue} · {lifePathLabel}｜{lifePathCoreMotivation}</p>
        <p className="life-path-daily-reading"><FormattedText text={lifePathDailyReading(LIFE_PATH_CONTENT[lifePathValue as keyof typeof LIFE_PATH_CONTENT])} /></p>
        <WorkplaceDiagnosisCard lifePathNumber={lifePathValue} birthSignature={birthSignature} />
        {lifePathTopResonance ? (
          <div className="life-path-resonance-note">
            <small>你選的共鳴線索</small>
            <p>「{lifePathTopResonance}」</p>
            <span>這是你對這個反思角度的回應，留意它在生活中何時最接近你。</span>
          </div>
        ) : null}
        <p className="mirror-reflection">{lifePathReflectionQuestion}</p>
        <p className="mirror-caveat">僅供自我反思，不代表命定的人格或人生。</p>
        {birthProfile ? <BirthProfileExtension birthProfile={birthProfile} /> : null}
      </MirrorSection>

      <MirrorSection id="mirror-2" number="02" title="活動偏好" description="看看哪些活動，比較容易讓你想投入。" accent="activity">
        <RiasecPreferenceReading riasecResult={riasecResult} />
        <RiasecScoreSummary riasecResult={riasecResult} />
        <RiasecHumanInsightCard riasecResult={riasecResult} />
        <p className="mirror-caveat">反映活動偏好，不等同能力或職業適性。</p>
        <details className="mirror-extension">
          <summary>查看偏好雷達圖</summary>
          <RadarChart scores={riasecResult.scores} />
        </details>
      </MirrorSection>

      <MirrorSection id="mirror-3" number="03" title="當下感受" description="你現在的感受，以及希望改變的地方。" accent="feeling">
        <div className="feeling-highlight"><strong>天賦使用感 {talentUsage}%</strong><small>你的主觀感受，不是能力分數。</small></div>
        <ul className="feeling-facts">
          {subjectiveDriver && <li><span>能量線索</span><strong>{energyLabel(subjectiveDriver)}</strong></li>}
          {prioritySummary && <li><span>目前最關注</span><strong>{priorities.join('、')}</strong></li>}
          {explorationInterest && <li><span>探索意願</span><strong>{explorationInterest}</strong></li>}
        </ul>
        {reflections?.energizingExperience || reflections?.currentFriction ? (
          <div className="feeling-reflections">
            {reflections.energizingExperience ? <p><strong>讓你有發揮的時刻</strong>{reflections.energizingExperience}</p> : null}
            {reflections.currentFriction ? <p><strong>比較卡住的地方</strong>{reflections.currentFriction}</p> : null}
          </div>
        ) : <p className="mirror-reflection">最近哪一件事讓你覺得有發揮？哪一件事比較卡住？</p>}
      </MirrorSection>
    </section>
  );
}

function AIReportSummary({ report, expanded, onToggle }: { report: AIReport; expanded: boolean; onToggle: () => void }) {
  const firstDirection = report.exploration_directions[0] ?? '先觀察一個讓你投入或耗損的時刻，記下當時的條件。';
  return (
    <section className="ai-report" aria-labelledby="ai-report-title">
      <header className="ai-report__header">
        <div>
          <small>專屬深度解讀</small>
          <h2 id="ai-report-title">為你整理的心靈與天賦畫像</h2>
        </div>
        <span className="ai-report__note">懂你的真實樣貌</span>
      </header>
      <div className="ai-report__summary-copy">
        <h3>💡 一句核心理解｜為你整理的心底話</h3>
        <p><AIHighlightedText text={report.summary} /></p>
      </div>
      <div className="ai-report__summary-copy ai-report__summary-copy--action">
        <h3>🌱 一個可以嘗試的小行動｜本週微實驗</h3>
        <p><AIHighlightedText text={firstDirection} /></p>
      </div>
      <button className="analysis-toggle" type="button" aria-expanded={expanded} aria-controls="full-ai-analysis" onClick={onToggle}>
        {expanded ? '收起完整解析' : '查看完整解析'}
      </button>
      {expanded ? (
        <div id="full-ai-analysis" className="ai-report__full">
          <div className="ai-report__detail">
            <h3>🔍 這次回答反覆出現的線索 · 特質畫像</h3>
            <ul>{report.repeated_signals.slice(0, 3).map((signal, index) => <li key={`signal-${index}`}><AIHighlightedText text={signal} /></li>)}</ul>
          </div>
          <div className="ai-report__detail">
            <h3>🌱 第一面鏡子｜出生日期反思 · 深層底色（你習慣看待世界的方式）</h3>
            <p><AIHighlightedText text={report.birth_profile_summary} /></p>
          </div>
          <div className="ai-report__detail">
            <h3>⚡ 第二面鏡子｜活動偏好 · 高光時刻（最能讓你自然進入心流的事）</h3>
            <p><AIHighlightedText text={report.motivator_summary} /></p>
          </div>
          <div className="ai-report__detail">
            <h3>🪞 第三面鏡子｜當下感受 · 暗耗時刻（你現在心裡最真實的卡點）</h3>
            <p><AIHighlightedText text={report.unused_potential} /></p>
          </div>
          {report.possible_tensions?.length ? (
            <div className="ai-report__detail">
              <h3>⚖️ 三個面向之間可以留意的地方 · 內心拉扯（最常打架的兩個聲音）</h3>
              <ul>{report.possible_tensions.map((item, index) => <li key={`tension-${index}`}><AIHighlightedText text={item} /></li>)}</ul>
            </div>
          ) : null}
          {report.exploration_directions.slice(1).length ? (
            <div className="ai-report__detail">
              <h3>🧭 其他小方向 · 可以嘗試的生活微調</h3>
              <ul>{report.exploration_directions.slice(1).map((item, index) => <li key={`direction-${index}`}><AIHighlightedText text={item} /></li>)}</ul>
            </div>
          ) : null}
          <div className="ai-report__detail">
            <h3>💭 給自己的下一個問題 · 留給今天的心靈提問</h3>
            <p><AIHighlightedText text={report.reflection_question} /></p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const SAVING_STAGES = [
  '正在安全保存你的探索記錄',
  '正在計算生命靈數與活動偏好',
  '正在生成你的三面鏡子快照',
  '即將為你開啟探索結果',
];

function AssessmentApp() {
  const auth = useAuthBootstrap();
  const eventId = new URLSearchParams(window.location.search).get('eventId');
  const [draft, setDraft] = useState<AssessmentDraft>(() => localAssessmentDraftRepository.load() ?? createEmptyDraft());
  const [dateError, setDateError] = useState<string | null>(null);
  const [completedAssessment, setCompletedAssessment] = useState<ClientAssessment | null>(null);
  const [previousAssessment, setPreviousAssessment] = useState<ClientAssessment | null>(null);
  const [previousReport, setPreviousReport] = useState<AIReport | null>(null);
  const [isRestoringPrevious, setIsRestoringPrevious] = useState(false);
  const [serverReport, setServerReport] = useState<AIReport | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingStageIndex, setSavingStageIndex] = useState(0);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  useEffect(() => {
    if (!isSaving) return undefined;
    const timer = window.setInterval(() => {
      setSavingStageIndex((current) => (current + 1) % SAVING_STAGES.length);
    }, 1200);
    return () => {
      window.clearInterval(timer);
      setSavingStageIndex(0);
    };
  }, [isSaving]);

  const completedAnswers = Object.keys(draft.riasecAnswers).length;
  const riasecResult = useMemo(() => {
    if (completedAnswers !== RIASEC_QUESTIONS.length) return null;
    return scoreRiasec(RIASEC_QUESTIONS, draft.riasecAnswers);
  }, [completedAnswers, draft.riasecAnswers]);
  const lifePathContent = draft.lifePath ? LIFE_PATH_CONTENT[draft.lifePath.value] : null;

  useEffect(() => {
    if (!completedAssessment) localAssessmentDraftRepository.save(draft);
  }, [draft, completedAssessment]);

  useEffect(() => {
    if (auth.status !== 'authenticated' && auth.status !== 'mock') return;
    let active = true;
    async function restoreCompletedAssessment() {
      setIsRestoringPrevious(true);
      try {
        const { assessment } = await getLatestAssessment();
        if (!assessment || !active) return;
        setPreviousAssessment(assessment);
        localAssessmentDraftRepository.clear();
        try {
          const { report } = await getReport(assessment.assessmentId);
          if (active) setPreviousReport(report);
        } catch {
          // If the assessment has no report yet, open its recovery view so retry is immediate.
          if (active) {
            setCompletedAssessment(assessment);
            setServerReport(null);
          }
        }
      } catch {
        if (active) setPersistenceError('暫時無法讀取已保存的結果；未完成的本機草稿仍可繼續。');
      } finally {
        if (active) setIsRestoringPrevious(false);
      }
    }
    void restoreCompletedAssessment();
    return () => { active = false; };
  }, [auth.status]);

  function patchDraft(update: Partial<AssessmentDraft>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  function startNew() {
    setDateError(null);
    setPersistenceError(null);
    setServerReport(null);
    setCompletedAssessment(null);
    setDraft({ ...createEmptyDraft(), step: 'consent' });
  }

  function returnHome() {
    localAssessmentDraftRepository.clear();
    setDateError(null);
    setPersistenceError(null);
    setServerReport(null);
    setCompletedAssessment(null);
    setDraft(createEmptyDraft());
  }

  function viewPrevious() {
    if (!previousAssessment) return;
    setPersistenceError(null);
    setCompletedAssessment(previousAssessment);
    setServerReport(previousReport);
  }

  function revealLifePath() {
    try {
      const lifePath = calculateLifePath(draft.birthDate);
      const birthProfile = calculateBirthProfile(draft.birthDate);
      const birthSignature = calculateBirthSignature(draft.birthDate);
      setDateError(null);
      patchDraft({ lifePath, birthProfile, birthSignature, step: 'life-path' });
    } catch (error) {
      setDateError(error instanceof LifePathValidationError ? error.message : '無法計算這個日期。');
    }
  }

  function answerRiasec(answer: RiasecAnswer) {
    const question = RIASEC_QUESTIONS[completedAnswers];
    if (!question) return;
    const answers = { ...draft.riasecAnswers, [question.id]: answer };
    patchDraft({
      riasecAnswers: answers,
      step: completedAnswers === RIASEC_QUESTIONS.length - 1 ? 'energy' : 'riasec',
    });
  }

  function togglePriority(priority: Priority) {
    const selected = draft.priorities.includes(priority);
    if (!selected && draft.priorities.length === 2) return;
    patchDraft({
      priorities: selected ? draft.priorities.filter((item) => item !== priority) : [...draft.priorities, priority],
    });
  }

  function goBack() {
    setDateError(null);
    setPersistenceError(null);
    switch (draft.step) {
      case 'consent':
        patchDraft({ step: 'landing' });
        break;
      case 'birthday':
        patchDraft({ step: 'consent' });
        break;
      case 'life-path':
        patchDraft({ step: 'birthday' });
        break;
      case 'resonance':
        patchDraft({ step: 'life-path' });
        break;
      case 'transition':
        patchDraft({ step: 'resonance' });
        break;
      case 'riasec':
        if (completedAnswers > 0) {
          const prevKeys = RIASEC_QUESTIONS.slice(0, completedAnswers - 1).map((q) => q.id);
          const newAnswers: Partial<Record<`q${string}`, RiasecAnswer>> = {};
          for (const k of prevKeys) {
            if (draft.riasecAnswers[k]) newAnswers[k] = draft.riasecAnswers[k];
          }
          patchDraft({ riasecAnswers: newAnswers });
        } else {
          patchDraft({ step: 'transition' });
        }
        break;
      case 'energy': {
        const prevKeys = RIASEC_QUESTIONS.slice(0, 17).map((q) => q.id);
        const newAnswers: Partial<Record<`q${string}`, RiasecAnswer>> = {};
        for (const k of prevKeys) {
          if (draft.riasecAnswers[k]) newAnswers[k] = draft.riasecAnswers[k];
        }
        patchDraft({ step: 'riasec', riasecAnswers: newAnswers });
        break;
      }
      case 'riasec-result':
        patchDraft({ step: 'energy' });
        break;
      case 'talent-usage':
        patchDraft({ step: 'riasec-result' });
        break;
      case 'priorities':
        patchDraft({ step: 'talent-usage' });
        break;
      case 'report':
        patchDraft({ step: 'priorities' });
        break;
      default:
        break;
    }
  }

  async function completeAssessment() {
    if (!draft.lifePath || !riasecResult || !draft.lifePathResonance || !draft.lifePathTopResonance || !draft.subjectiveDriver || !draft.talentUsage || !draft.explorationInterest) return;
    if (auth.status === 'unauthenticated') {
      setPersistenceError('請先使用 LINE 登入，才能安全保存這次探索結果。');
      return;
    }
    if (auth.status === 'loading') return;
    if (auth.status === 'unavailable') {
      setPersistenceError('目前無法連線到資料服務；結果會暫存在這個瀏覽器，你可以稍後再試。');
      patchDraft({ step: 'report' });
      return;
    }

    setIsSaving(true);
    setPersistenceError(null);
    try {
      let subjectId = draft.subjectId;
      if (!subjectId) {
        const created = await createSubject({
          subjectKind: draft.assessmentMode === 'co_present' ? 'guest' : 'self',
          displayLabel: draft.assessmentMode === 'co_present' ? '另一位探索者' : '我自己',
          birthDate: draft.birthDate,
        });
        subjectId = created.subject.subjectId;
      }
      const { assessment } = await createAssessment({
        birthDate: draft.birthDate,
        subjectId,
        assessmentMode: draft.assessmentMode ?? 'self',
        lifePath: draft.lifePath,
        lifePathResonance: draft.lifePathResonance,
        lifePathTopResonance: draft.lifePathTopResonance,
        riasecAnswers: draft.riasecAnswers,
        riasecResult,
        subjectiveDriver: draft.subjectiveDriver,
        talentUsage: draft.talentUsage,
        priorities: draft.priorities,
        explorationInterest: draft.explorationInterest,
        ...(draft.reflections?.energizingExperience?.trim() ? { reflections: {
          energizingExperience: draft.reflections.energizingExperience.trim(),
          ...(draft.reflections.currentFriction?.trim() ? { currentFriction: draft.reflections.currentFriction.trim() } : {}),
          ...(draft.reflections.unconstrainedExploration?.trim() ? { unconstrainedExploration: draft.reflections.unconstrainedExploration.trim() } : {}),
        } } : {}),
        ...(eventId ? { eventId, presenterConsent: draft.presenterConsent === true } : {}),
      } satisfies AssessmentInput);
      setCompletedAssessment(assessment);
      setPreviousAssessment(assessment);
      setPreviousReport(null);
      localAssessmentDraftRepository.clear();
      await requestReport(assessment.assessmentId);
    } catch (error) {
      setPersistenceError(error instanceof ApiError ? error.message : '暫時無法保存結果；你的本機草稿會保留。');
      patchDraft({ step: 'report' });
    } finally {
      setIsSaving(false);
    }
  }

  async function requestReport(assessmentId: string) {
    if (isGeneratingReport) return;
    setIsGeneratingReport(true);
    setPersistenceError(null);
    try {
      const { report } = await generateReport(assessmentId);
      setServerReport(report);
      setPreviousReport(report);
    } catch (error) {
      setPersistenceError(error instanceof ApiError ? error.message : 'AI 綜合解析暫時無法完成；你的測驗結果已保存，請稍後重試。');
    } finally {
      setIsGeneratingReport(false);
    }
  }

  const subjectiveComparison = useMemo(() => {
    if (!riasecResult || !draft.subjectiveDriver) return null;
    const top1 = riasecResult.top3[0];
    const subjective = draft.subjectiveDriver;
    if (subjective === top1) {
      return {
        title: '兩個角度出現相同線索',
        text: `你直覺選擇「${energyLabel(subjective)}」，RIASEC 最高向度也是 ${RIASEC_META[top1].name}。這是一個值得繼續觀察的一致線索。`,
      };
    }
    return {
      title: '兩個角度照到不同線索',
      text: `你直覺選擇「${energyLabel(subjective)}」，RIASEC 最高向度則是 ${RIASEC_META[top1].name}。這不代表哪一個錯了，而是提醒你留意：什麼事情吸引你，和什麼事情讓你有精神，可能不完全相同。`,
    };
  }, [draft.subjectiveDriver, riasecResult]);

  if (completedAssessment) {
    return <ServerReport key={completedAssessment.assessmentId} assessment={completedAssessment} report={serverReport} persistenceError={persistenceError} isGenerating={isGeneratingReport} onRetry={() => void requestReport(completedAssessment.assessmentId)} onRestart={returnHome} />;
  }

  return (
    <main className="site-shell">
      {draft.step !== 'landing' && draft.step !== 'report' ? (
        <ProgressHeader step={draft.step} onHome={returnHome} onBack={goBack} canBack={draft.step !== 'consent'} />
      ) : null}
      <section className={`journey ${draft.step === 'landing' ? 'journey--landing' : ''}`} aria-live="polite">
        {draft.step === 'landing' ? <Landing
          auth={auth}
          onLogin={() => { window.location.assign('/api/auth/line/start'); }}
          onStart={startNew}
          previousAssessment={previousAssessment}
          isRestoringPrevious={isRestoringPrevious}
          onViewPrevious={viewPrevious}
        /> : null}

        {draft.step === 'consent' ? (
          <section className="panel panel--narrow entrance">
            <p className="eyebrow">歡迎來到 · 天賦原動力</p>
            <h1>很高興遇見你，開啟這段探索旅程</h1>
            <p className="lede">
              接下來，我們將陪伴你一步步梳理自己的特質，看見內在潛藏的亮點與動力，為生活帶來更多清晰與選擇。這裡沒有標準答案，請帶著輕鬆、自在的心情，像和老朋友聊天一樣出發。
            </p>
            <div className="reflection-card" style={{ marginTop: 28 }}>
              <small>旅程中的隱私守護</small>
              <ul className="privacy-list">
                <li><strong>完全私密，專屬於你</strong>：探索結果是送給你的一份內在整理，絕不會主動公開給任何人。</li>
                <li><strong>安心填寫，不作他用</strong>：輸入的生日與每一個回答，只用於為你產出個人分析，絕不挪作其他用途。</li>
                <li><strong>溫柔留存，隨時回顧</strong>：透過 LINE 登入，能幫你把這份發現好好留存，未來隨時都能回來看看自己的模樣。</li>
              </ul>
            </div>
            <button className="primary-button" type="button" onClick={() => patchDraft({ step: 'birthday' })}>
              準備好了，開始我的旅程
            </button>
          </section>
        ) : null}

        {draft.step === 'birthday' ? (
          <section className="panel panel--narrow entrance">
            <p className="eyebrow">第一面鏡子 · 自我反思入口</p>
            <h1>先從你的出生日期開始</h1>
            <p className="lede">我們只會計算專屬的生命數字，作為一個觀察自己的小入口。</p>
            <label className="field-label" htmlFor="birth-date">出生日期</label>
            <input
              className="date-input"
              id="birth-date"
              type="date"
              value={draft.birthDate}
              onChange={(event) => {
                setDateError(null);
                patchDraft({ birthDate: event.target.value });
              }}
            />
            <p className="field-label">這是你本人的出生日期嗎？</p>
            <div className="choice-grid choice-grid--three">
              {([['self', '是，我自己'], ['co_present', '不是，我在陪另一位一起探索']] as Array<[AssessmentMode, string]>).map(([mode, label]) => (
                <ChoiceButton key={mode} selected={(draft.assessmentMode ?? 'self') === mode} onClick={() => patchDraft({ assessmentMode: mode, subjectId: undefined })}>{label}</ChoiceButton>
              ))}
            </div>
            {draft.assessmentMode === 'co_present' ? <p className="guest-disclosure">請讓被探索的人親自回答後續題目。這份結果會先完整呈現；在對方認領前，陪同者可以暫時查看，認領後陪同者將不再有一般私人存取權。</p> : null}
            {dateError ? <p className="field-error" role="alert">{dateError}</p> : null}
            <div className="action-row">
              <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
              <button className="primary-button" type="button" onClick={revealLifePath}>看看這面鏡子</button>
            </div>
            <p className="disclaimer">{DISCLAIMER}</p>
          </section>
        ) : null}

        {draft.step === 'life-path' && lifePathContent && draft.lifePath ? (
          <section className="panel life-reveal entrance">
            <p className="eyebrow">你的生命靈數</p>
            <div className="number-orbit" aria-label={`生命靈數 ${draft.lifePath.value}`}>
              <span>{draft.lifePath.value}</span>
              <small>{lifePathContent.label}</small>
            </div>
            <p className="life-motivation">你骨子裡的深層原動力：<strong>{lifePathContent.coreMotivation}</strong></p>
            <div className="life-daily-reading">
              <small>💡 日常心境的真實寫照</small>
              <p><FormattedText text={lifePathDailyReading(lifePathContent)} /></p>
            </div>
            <div className="tag-list">{lifePathContent.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
            <div className="two-column-notes">
              <div><small>✨ 最能讓你眼睛發亮的事</small><p>{lifePathContent.strengths[0]}</p></div>
              <div><small>🌧️ 暗中消耗你心力的狀態</small><p>{lifePathContent.drains[0]}</p></div>
            </div>
            <WorkplaceDiagnosisCard lifePathNumber={draft.lifePath.value} birthSignature={draft.birthSignature} />
            {draft.birthProfile ? <><BirthProfileCore birthProfile={draft.birthProfile} /><BirthProfileExtension birthProfile={draft.birthProfile} /></> : null}
            <div className="action-row">
              <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
              <button className="primary-button" type="button" onClick={() => patchDraft({ step: 'resonance' })}>這段有沒有打中你？</button>
            </div>
            <p className="disclaimer">{DISCLAIMER}</p>
          </section>
        ) : null}

        {draft.step === 'resonance' && lifePathContent ? (
          <section className="panel panel--wide entrance">
            <p className="eyebrow">由你來驗證</p>
            <h1>這個描述，和你有多接近？</h1>
            <div className="choice-grid choice-grid--three">
              {([
                ['high', '很像', '我在不少情境裡有這種感覺'],
                ['partial', '有一點', '有些部分說中了'],
                ['low', '不太像', '目前不太有共鳴'],
              ] as Array<[LifePathResonance, string, string]>).map(([value, label, description]) => (
                <ChoiceButton
                  description={description}
                  key={value}
                  selected={draft.lifePathResonance === value}
                  onClick={() => patchDraft({ lifePathResonance: value })}
                >
                  {label}
                </ChoiceButton>
              ))}
            </div>
            {draft.lifePathResonance ? (
              <div className="resonance-detail">
                <p className="field-label">哪一句最有感？</p>
                <div className="choice-stack">
                  {lifePathContent.resonanceOptions.map((option) => (
                    <ChoiceButton
                      key={option}
                      selected={draft.lifePathTopResonance === option}
                      onClick={() => patchDraft({ lifePathTopResonance: option })}
                    >
                      {option}
                    </ChoiceButton>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="action-row">
              <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
              <button
                className="primary-button"
                disabled={!draft.lifePathResonance || !draft.lifePathTopResonance}
                type="button"
                onClick={() => patchDraft({ step: 'transition' })}
              >
                前往第二面鏡子
              </button>
            </div>
          </section>
        ) : null}

        {draft.step === 'transition' ? (
          <section className="panel transition-panel entrance">
            <p className="eyebrow">第二面鏡子</p>
            <h1>接著，看看什麼事情讓你想投入</h1>
            <p className="lede">接下來有 18 題。沒有標準答案，請依你平常最接近的狀態作答。</p>
            <TransitionBadgesGrid />
            <div className="action-row">
              <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
              <button className="primary-button" type="button" onClick={() => patchDraft({ step: 'riasec' })}>開始回答</button>
            </div>
          </section>
        ) : null}

        {draft.step === 'riasec' ? (
          <RiasecQuestionStep index={completedAnswers} onAnswer={answerRiasec} onBack={goBack} />
        ) : null}

        {draft.step === 'energy' ? (
          <section className="panel panel--wide entrance">
            <p className="eyebrow">回答完畢 · 先別急著看結果</p>
            <h1>哪一件事最容易讓你做了反而有精神？</h1>
            <p className="lede">請直覺選一個。這題記錄你對自身能量的觀察。</p>
            <div className="choice-grid choice-grid--three">
              {ENERGY_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option.code}
                  selected={draft.subjectiveDriver === option.code}
                  onClick={() => patchDraft({ subjectiveDriver: option.code })}
                >
                  {option.label}
                </ChoiceButton>
              ))}
            </div>
            <div className="action-row">
              <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
              <button
                className="primary-button"
                disabled={!draft.subjectiveDriver}
                type="button"
                onClick={() => patchDraft({ step: 'riasec-result' })}
              >
                看看活動偏好結果
              </button>
            </div>
          </section>
        ) : null}

        {draft.step === 'riasec-result' && riasecResult ? (
          <section className="panel panel--wide results-panel entrance">
            <p className="eyebrow">你的活動偏好快照</p>
            <h1>你最常選擇投入的三種方式</h1>
            <p className="lede">先看前三個方向，再回到分數看看完整輪廓。這些是活動偏好線索，不是能力評等。</p>
            <RiasecTopThree riasecResult={riasecResult} />
            <div className="results-layout">
              <RadarChart scores={riasecResult.scores} />
              <RiasecScoreSummary riasecResult={riasecResult} />
            </div>
            {subjectiveComparison ? (
              <div className="reflection-card">
                <small>{subjectiveComparison.title}</small>
                <p>{subjectiveComparison.text}</p>
              </div>
            ) : null}
            <RiasecHumanInsightCard riasecResult={riasecResult} />
            <div className="action-row">
              <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
              <button className="primary-button" type="button" onClick={() => patchDraft({ step: 'talent-usage' })}>看看第三面鏡子</button>
            </div>
          </section>
        ) : null}

        {draft.step === 'talent-usage' ? (
          <section className="panel panel--narrow entrance">
            <p className="eyebrow">第三面鏡子 · 此刻的你</p>
            <h1>目前的工作／生活，大約讓你用了多少自己的天賦？</h1>
            <p className="lede">這是你的主觀感受，不是精確的能力測量。</p>
            <div className="usage-options">
              {([20, 40, 60, 80, 100] as TalentUsage[]).map((value) => (
                <ChoiceButton key={value} selected={draft.talentUsage === value} onClick={() => patchDraft({ talentUsage: value })}>
                  {value}%
                </ChoiceButton>
              ))}
            </div>
            <div className="action-row">
              <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
              <button className="primary-button" disabled={!draft.talentUsage} type="button" onClick={() => patchDraft({ step: 'priorities' })}>繼續</button>
            </div>
          </section>
        ) : null}

        {draft.step === 'priorities' ? (
          <section className="panel panel--wide entrance">
            <p className="eyebrow">把焦點留給你自己</p>
            <h1>如果未來一年，只能讓一件事情變得更好，你最希望是哪一個？</h1>
            <p className="lede">最多選兩項。你現在選的是目前最想探索的方向，不是承諾。</p>
            <div className="priority-grid">
              {PRIORITIES.map((priority) => (
                <ChoiceButton key={priority} selected={draft.priorities.includes(priority)} onClick={() => togglePriority(priority)}>
                  {priority}
                </ChoiceButton>
              ))}
            </div>
            <div className="exploration-block">
              <p className="field-label">如果不需要立刻離職，你會願意每週拿出一些時間，探索另一種可能嗎？</p>
              <div className="choice-grid choice-grid--three">
                {EXPLORATION_OPTIONS.map((option) => (
                  <ChoiceButton key={option} selected={draft.explorationInterest === option} onClick={() => patchDraft({ explorationInterest: option })}>
                    {option}
                  </ChoiceButton>
                ))}
              </div>
            </div>
            <div className="reflection-inputs">
              <p className="field-label">留下一點你的反思（可選，第一題至少 3 個字）</p>
              <label htmlFor="reflection-energizing">最近哪件事做完雖然累，心裡卻很有成就感？</label>
              <textarea id="reflection-energizing" maxLength={300} value={draft.reflections?.energizingExperience ?? ''} onChange={(event) => patchDraft({ reflections: { ...(draft.reflections ?? { energizingExperience: '' }), energizingExperience: event.target.value } })} />
              <label htmlFor="reflection-friction">現在最消耗你、最想改善的是什麼？</label>
              <textarea id="reflection-friction" maxLength={300} value={draft.reflections?.currentFriction ?? ''} onChange={(event) => patchDraft({ reflections: { ...(draft.reflections ?? { energizingExperience: '' }), currentFriction: event.target.value } })} />
              <label htmlFor="reflection-exploration">如果暫時不考慮現實限制，你最想嘗試什麼？</label>
              <textarea id="reflection-exploration" maxLength={300} value={draft.reflections?.unconstrainedExploration ?? ''} onChange={(event) => patchDraft({ reflections: { ...(draft.reflections ?? { energizingExperience: '' }), unconstrainedExploration: event.target.value } })} />
            </div>
            {eventId ? (
              <fieldset className="presenter-consent">
                <legend>是否願意讓講師在本次活動中，將以下探索摘要顯示在 Presenter 畫面？</legend>
                <p>只會顯示：</p>
                <ul>
                  <li>LINE 顯示名稱</li>
                  <li>Life Path</li>
                  <li>RIASEC 六向度與 Top3</li>
                  <li>主觀能量線索</li>
                  <li>天賦使用感</li>
                  <li>經允許的 AI 重複線索</li>
                </ul>
                <p>不會顯示完整出生日期、原始 18 題答案、探索意願或其他私人資料。</p>
                <label className="presenter-consent__choice">
                  <input
                    type="checkbox"
                    checked={draft.presenterConsent === true}
                    onChange={(event) => patchDraft({ presenterConsent: event.target.checked })}
                  />
                  <span>我同意本次活動顯示上述摘要</span>
                </label>
              </fieldset>
            ) : null}
            {isSaving ? (
              <div className="saving-progress-card" role="status" aria-live="polite">
                <div className="ai-progress-card__header">
                  <span className="ai-progress-orbit" aria-hidden="true"><i /></span>
                  <div>
                    <small>🪞 三面鏡子彙整中</small>
                    <p>{SAVING_STAGES[savingStageIndex]}…</p>
                  </div>
                </div>
                <div className="ai-progress-bar" role="progressbar" aria-label="正在安全保存記錄並彙整三面鏡子">
                  <span />
                </div>
                <p className="saving-subnote">正在為你同步保存記錄，即將開啟專屬的三面鏡子探索結果…</p>
              </div>
            ) : (
              <div className="action-row">
                <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
                <button
                  className="primary-button"
                  disabled={draft.priorities.length === 0 || !draft.explorationInterest}
                  type="button"
                  onClick={() => { void completeAssessment(); }}
                >
                  整理我的三面鏡子
                </button>
              </div>
            )}
            {persistenceError ? <p className="field-error" role="alert">{persistenceError}</p> : null}
          </section>
        ) : null}

        {draft.step === 'report' && lifePathContent && riasecResult ? (
          <section className="panel report-panel entrance">
            <h1>你的探索結果</h1>
            <p className="lede">先讀一小段，再決定要不要往下看更多。</p>
            <div className="local-result-note">本機暫存結果 · 尚未同步保存</div>
            <MirrorQuickSummary
              lifePathValue={lifePathContent.value}
              lifePathLabel={lifePathContent.label}
              lifePathTopResonance={draft.lifePathTopResonance}
              riasecResult={riasecResult}
              talentUsage={draft.talentUsage ?? '—'}
              priorities={draft.priorities}
            />
            <DetailedResultSections
              lifePathValue={lifePathContent.value}
              lifePathLabel={lifePathContent.label}
              lifePathCoreMotivation={lifePathContent.coreMotivation}
              lifePathReflectionQuestion={lifePathContent.reflectionQuestion}
              lifePathTopResonance={draft.lifePathTopResonance}
              riasecResult={riasecResult}
              birthProfile={draft.birthProfile}
              birthSignature={draft.birthSignature}
              subjectiveDriver={draft.subjectiveDriver}
              talentUsage={draft.talentUsage ?? '—'}
              priorities={draft.priorities}
              explorationInterest={draft.explorationInterest}
              reflections={draft.reflections}
            />
            {persistenceError ? (
              <div className="reflection-card" style={{ borderLeftColor: '#a95143', marginTop: 20 }}>
                <small style={{ color: '#a95143' }}>保存提示</small>
                <p style={{ fontSize: '15px' }}>{persistenceError}</p>
                <button
                  className="primary-button"
                  style={{ marginTop: 14 }}
                  type="button"
                  disabled={isSaving}
                  onClick={() => { void completeAssessment(); }}
                >
                  {isSaving ? '正在安全保存…' : '重新嘗試保存並生成 AI 解析'}
                </button>
              </div>
            ) : null}
            <div className="action-row" style={{ marginTop: 24 }}>
              <button className="text-button" type="button" onClick={goBack}>← 回上一步修改</button>
              <button className="secondary-button" type="button" onClick={returnHome}>重新開始一輪</button>
            </div>
            <p className="disclaimer">{DISCLAIMER}</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function ServerReport({
  assessment,
  report,
  persistenceError,
  isGenerating,
  onRetry,
  onRestart,
}: {
  assessment: ClientAssessment;
  report: AIReport | null;
  persistenceError: string | null;
  isGenerating: boolean;
  onRetry: () => void;
  onRestart: () => void;
}) {
  const lifePathContent = LIFE_PATH_CONTENT[assessment.lifePath.value];
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);

  return (
    <main className="site-shell">
      <section className="journey" aria-live="polite">
        <section className="panel report-panel entrance">
          <h1>你的探索結果</h1>
          <p className="lede">你剛才留下的回答已保存。先讀一小段，再決定要不要往下看更多。</p>
          <p className="saved-result-note" role="status">探索結果已保存</p>
          <MirrorQuickSummary
            lifePathValue={assessment.lifePath.value}
            lifePathLabel={lifePathContent.label}
            lifePathTopResonance={assessment.lifePathTopResonance}
            riasecResult={assessment.riasecResult}
            talentUsage={assessment.talentUsage}
            priorities={assessment.priorities}
          />
          {report ? (
            <AIReportSummary report={report} expanded={showFullAnalysis} onToggle={() => setShowFullAnalysis((current) => !current)} />
          ) : (
            <AIGenerationProgress isGenerating={isGenerating} />
          )}
          <DetailedResultSections
            lifePathValue={assessment.lifePath.value}
            lifePathLabel={lifePathContent.label}
            lifePathCoreMotivation={lifePathContent.coreMotivation}
            lifePathReflectionQuestion={lifePathContent.reflectionQuestion}
            lifePathTopResonance={assessment.lifePathTopResonance}
            riasecResult={assessment.riasecResult}
            birthProfile={assessment.birthProfile}
            birthSignature={assessment.birthSignature}
            subjectiveDriver={assessment.subjectiveDriver}
            talentUsage={assessment.talentUsage}
            priorities={assessment.priorities}
            explorationInterest={assessment.explorationInterest}
            reflections={assessment.reflections}
          />
          {!report ? <button className="primary-button" type="button" disabled={isGenerating} onClick={onRetry}>
            {isGenerating ? '正在產生 AI 解析…' : '重新產生 AI 解析'}
          </button> : null}
          {persistenceError ? <p className="field-error" role="alert">{persistenceError}</p> : null}
          {assessment.assessmentMode === 'co_present' ? <GuestSaveActions assessment={assessment} /> : null}
          <div className="action-row" style={{ marginTop: 28 }}>
            <button className="secondary-button" type="button" disabled={isGenerating} onClick={onRestart}>重新開始一輪</button>
          </div>
          <p className="disclaimer">{DISCLAIMER}</p>
        </section>
      </section>
    </main>
  );
}

const AI_PROGRESS_STAGES = [
  { text: '正在整理你的回答', step: '整理回答' },
  { text: '正在深入比對三面鏡子，尋找你的高光時刻', step: '比對線索' },
  { text: '正在細細梳理你最真實的卡點與深層渴望', step: '剖析卡點' },
  { text: '正在雕琢直擊心靈的專屬畫像，即將展開', step: '生成畫像' },
];

function AIGenerationProgress({ isGenerating }: { isGenerating: boolean }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isGenerating) return undefined;
    const timer = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % AI_PROGRESS_STAGES.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  if (!isGenerating) {
    return (
      <div className="reflection-card ai-progress-card" style={{ marginTop: 26, textAlign: 'center', padding: '24px' }}>
        <small>AI 綜合解析</small>
        <p style={{ fontSize: '15px', marginTop: '10px' }}>測驗結果已保存，AI 解析尚未完成。可以重新產生，不必再做一次測驗。</p>
      </div>
    );
  }

  return (
    <div className="ai-progress-card" role="status" aria-live="polite" aria-atomic="true">
      <div className="ai-progress-card__header">
        <span className="ai-progress-orbit" aria-hidden="true"><i /></span>
        <div>
          <small>✨ 專屬 AI 心靈畫像生成中</small>
          <p>{AI_PROGRESS_STAGES[stageIndex].text}…</p>
        </div>
      </div>
      <div className="ai-progress-bar" role="progressbar" aria-label="AI 正在整理你的探索線索" aria-valuemin={0} aria-valuemax={100}>
        <span />
      </div>
      <div className="ai-progress-steps" aria-hidden="true">
        {AI_PROGRESS_STAGES.map((stage, index) => (
          <span className={index === stageIndex ? 'is-active' : ''} key={stage.step}>
            {stage.step}
          </span>
        ))}
      </div>
      <p className="ai-progress-subnote">💡 你的三面鏡子已彙整完成！AI 顧問正在為你撰寫專屬畫像，你可以先往下滑動閱讀三面鏡子…</p>
    </div>
  );
}

function GuestSaveActions({ assessment }: { assessment: ClientAssessment }) {
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  async function makeClaim() {
    if (!assessment.subjectId) return;
    try {
      const { claim } = await createClaim(assessment.subjectId);
      const url = new URL('/claim', window.location.origin);
      url.searchParams.set('token', claim.token);
      setClaimUrl(url.toString());
      setStatus('這是一次性、限時的私人連結，請只傳給本人。');
    } catch {
      setStatus('目前無法建立私人認領連結，請稍後再試。');
    }
  }
  async function saveWithLine() {
    if (!assessment.subjectId) return;
    try {
      const { claim } = await createClaim(assessment.subjectId);
      window.location.assign(`/api/auth/line/start?claimToken=${encodeURIComponent(claim.token)}`);
    } catch {
      setStatus('目前無法建立保存連結，請稍後再試。');
    }
  }
  return <section className="guest-save-actions reflection-card">
    <small>保存或分享</small>
    <p>喜歡這份探索結果嗎？你可以用 LINE 保存，或傳送一次性的私人認領連結給本人。</p>
    <button className="primary-button" type="button" onClick={() => { void saveWithLine(); }}>用 LINE 保存我的結果</button>
    <button className="secondary-button" type="button" onClick={() => { void makeClaim(); }}>傳給本人並保存</button>
    {claimUrl ? <p className="claim-link"><a href={claimUrl}>{claimUrl}</a></p> : null}
    {status ? <p className="local-note">{status}</p> : null}
    <button className="text-button" type="button" onClick={() => { window.location.assign(`/share/${encodeURIComponent(assessment.assessmentId)}`); }}>分享精華結果</button>
    <button className="text-button" type="button" onClick={() => setStatus('你可以稍後再決定是否保存。')}>先不用</button>
  </section>;
}

function Landing({
  auth,
  onLogin,
  onStart,
  previousAssessment,
  isRestoringPrevious,
  onViewPrevious,
}: {
  auth: AuthState;
  onLogin: () => void;
  onStart: () => void;
  previousAssessment: ClientAssessment | null;
  isRestoringPrevious: boolean;
  onViewPrevious: () => void;
}) {
  const needsLogin = auth.status === 'unauthenticated';
  return (
    <section className="landing landing--hero entrance">
      <picture className="landing-backdrop" aria-hidden="true">
        <source media="(max-width: 720px)" srcSet="/landing-hero-mobile.webp" />
        <img src="/landing-hero.webp" alt="" width="1600" height="901" fetchPriority="high" decoding="async" />
      </picture>
      <div className="landing-wash" aria-hidden="true" />
      <div className="landing-copy">
        <p className="eyebrow">給自己 5 分鐘</p>
        <h1>看見天賦，<br /><em>找到原動力</em></h1>
        <p className="landing-lede">從你喜歡的事，發現更能發揮自己的可能。</p>
        {isRestoringPrevious ? <p className="landing-previous-status" role="status">正在確認你是否有上次的探索結果…</p> : null}
        <button className="primary-button" disabled={auth.status === 'loading'} type="button" onClick={needsLogin ? onLogin : onStart}>
          {auth.status === 'loading' ? '正在確認身份…' : needsLogin ? '使用 LINE 登入後開始探索' : '開始探索'}
        </button>
        {previousAssessment ? (
          <div className="landing-previous landing-previous--link">
            <small>上次結果已保存</small>
            <button className="text-button" type="button" onClick={onViewPrevious}>回顧上次結果</button>
          </div>
        ) : null}
        {auth.status === 'unavailable' ? <p className="disclaimer">目前以本機草稿模式進行；連線恢復後即可安全保存結果。</p> : null}
        <p className="landing-footnote">約 5 分鐘・沒有標準答案</p>
        <details className="landing-method">
          <summary>這個探索包含什麼？</summary>
          <p>從活動偏好、當下感受與出生日期的反思提示，整理認識自己的線索。出生日期解讀僅供自我反思參考。</p>
          <p className="landing-method__label">Birth Profile × RIASEC × Reflection</p>
        </details>
      </div>
    </section>
  );
}

function RiasecQuestionStep({
  index,
  onAnswer,
  onBack,
}: {
  index: number;
  onAnswer: (answer: RiasecAnswer) => void;
  onBack?: () => void;
}) {
  const question = RIASEC_QUESTIONS[index];
  if (!question) return null;
  const progress = ((index + 1) / RIASEC_QUESTIONS.length) * 100;
  return (
    <section className="panel question-panel entrance">
      <div className="question-meta"><span>第 {index + 1} 題 / 共 18 題</span><span>{Math.round(progress)}%</span></div>
      <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
      <p className="eyebrow">依平常最接近的狀態選擇</p>
      <h1>{question.text}</h1>
      <div className="scale-options" role="group" aria-label="回答選項">
        {SCALE.map((option) => (
          <button key={option.value} type="button" onClick={() => onAnswer(option.value)}>
            <b>{option.value}</b><span>{option.label}</span>
          </button>
        ))}
      </div>
      <div className="question-actions">
        {onBack ? (
          <button className="back-button" type="button" onClick={onBack}>
            ← {index > 0 ? '回上一題' : '回上一步'}
          </button>
        ) : <span />}
        <p className="question-hint" style={{ margin: 0 }}>選擇後會自動前往下一題。</p>
      </div>
    </section>
  );
}

export default App;
