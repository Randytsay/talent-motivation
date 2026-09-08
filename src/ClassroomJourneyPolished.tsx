import { useMemo, useState } from 'react';
import { LIFE_PATH_CONTENT } from './data/lifePathContent';
import { RIASEC_META, RIASEC_QUESTIONS } from './data/riasecQuestions';
import { ApiError, createAssessment, createSubject, generateReport, type ClientAssessment } from './lib/api/client';
import { useAuthBootstrap } from './lib/api/authBootstrap';
import { birthProfileFacts, calculateBirthProfile, type BirthProfileResult } from './lib/scoring/birthProfile';
import { calculateBirthSignature } from './lib/scoring/birthSignature';
import { calculateLifePath, LifePathValidationError } from './lib/scoring/lifePath';
import { buildRiasecNarrative } from './lib/scoring/riasecNarrative';
import { scoreRiasec } from './lib/scoring/riasec';
import type { AssessmentInput } from './server/contracts';
import type { AssessmentMode, LifePathResonance, Priority, RiasecAnswer, RiasecCode, TalentUsage } from './types/domain';
import './classroom.css';
import './classroom-polish.css';

const OFFICIAL_LINE_URL = 'https://line.me/R/ti/p/@337gxtnq';

const RIASEC_ACTIVITY_DESCRIPTIONS: Record<RiasecCode, string> = {
  R: '動手操作、實際製作、把事情做出來',
  I: '理解原因、比較資訊、把問題想明白',
  A: '表達想法、創造變化、用自己的方式做',
  S: '陪伴支持、分享經驗、幫助別人成長',
  E: '發起行動、連結資源、把事情往前推',
  C: '整理資訊、安排步驟、讓事情有秩序',
};

const ENERGY_OPTIONS: Array<{ code: RiasecCode; label: string }> = [
  { code: 'R', label: '把事情做出來' },
  { code: 'I', label: '把問題想明白' },
  { code: 'A', label: '創造不同做法' },
  { code: 'S', label: '幫助別人成長' },
  { code: 'E', label: '把事情推動起來' },
  { code: 'C', label: '把混亂整理清楚' },
];

const PRIORITIES: Priority[] = [
  '收入更多元', '工作更穩定', '更多時間自主', '更有成就感',
  '更能發揮自己的能力', '改善工作／人際環境', '新的學習與發展方向', '我現在還不確定',
];

const SCALE: Array<{ value: RiasecAnswer; label: string }> = [
  { value: 1, label: '完全不像我' }, { value: 2, label: '不太像我' },
  { value: 3, label: '有點像我' }, { value: 4, label: '很像我' },
];

type ClassroomStep = 'landing' | 'birthday' | 'life' | 'riasec-intro' | 'riasec' | 'riasec-result' | 'reality' | 'snapshot';

function energyLabel(code?: RiasecCode): string {
  return code ? ENERGY_OPTIONS.find((item) => item.code === code)?.label ?? '—' : '—';
}

function maskBirthDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)} / ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} / ${digits.slice(4, 6)} / ${digits.slice(6, 8)}`;
}

function isoBirthDate(masked: string): string {
  const digits = masked.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function ClassroomJourneyPolished() {
  const auth = useAuthBootstrap();
  const eventId = new URLSearchParams(window.location.search).get('eventId') ?? undefined;
  const [step, setStep] = useState<ClassroomStep>('landing');
  const [birthDateInput, setBirthDateInput] = useState('');
  const birthDate = useMemo(() => isoBirthDate(birthDateInput), [birthDateInput]);
  const [assessmentMode, setAssessmentMode] = useState<AssessmentMode>('self');
  const [lifePathResonance, setLifePathResonance] = useState<LifePathResonance>();
  const [riasecAnswers, setRiasecAnswers] = useState<Partial<Record<`q${string}`, RiasecAnswer>>>({});
  const [subjectiveDriver, setSubjectiveDriver] = useState<RiasecCode>();
  const [talentUsage, setTalentUsage] = useState<TalentUsage>();
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [completedAssessment, setCompletedAssessment] = useState<ClientAssessment | null>(null);

  const lifePath = useMemo(() => {
    if (!birthDate) return null;
    try { return calculateLifePath(birthDate); } catch { return null; }
  }, [birthDate]);

  const birthProfile = useMemo<BirthProfileResult | null>(() => {
    if (!birthDate) return null;
    try { return calculateBirthProfile(birthDate); } catch { return null; }
  }, [birthDate]);

  const birthFacts = birthProfile ? birthProfileFacts(birthProfile) : null;
  const lifeContent = lifePath ? LIFE_PATH_CONTENT[lifePath.value] : null;
  const answeredCount = Object.keys(riasecAnswers).length;
  const riasecResult = useMemo(
    () => answeredCount === RIASEC_QUESTIONS.length ? scoreRiasec(RIASEC_QUESTIONS, riasecAnswers) : null,
    [answeredCount, riasecAnswers],
  );

  function revealLifePath() {
    try {
      if (!birthDate) throw new LifePathValidationError('請完整輸入西元年、月、日。');
      calculateLifePath(birthDate);
      setDateError(null);
      setStep('life');
    } catch (error) {
      setDateError(error instanceof LifePathValidationError ? error.message : '請確認出生日期。');
    }
  }

  function answerRiasec(answer: RiasecAnswer) {
    const question = RIASEC_QUESTIONS[answeredCount];
    if (!question) return;
    setRiasecAnswers((current) => ({ ...current, [question.id]: answer }));
    if (answeredCount === RIASEC_QUESTIONS.length - 1) setStep('riasec-result');
  }

  function goPreviousQuestion() {
    if (answeredCount === 0) {
      setStep('riasec-intro');
      return;
    }
    const keys = RIASEC_QUESTIONS.slice(0, answeredCount - 1).map((question) => question.id);
    const next: Partial<Record<`q${string}`, RiasecAnswer>> = {};
    for (const key of keys) if (riasecAnswers[key]) next[key] = riasecAnswers[key];
    setRiasecAnswers(next);
  }

  function togglePriority(priority: Priority) {
    setPriorities((current) => current.includes(priority)
      ? current.filter((item) => item !== priority)
      : current.length < 2 ? [...current, priority] : current);
  }

  async function finalize() {
    if (!lifePath || !birthProfile || !riasecResult || !lifePathResonance || !subjectiveDriver || !talentUsage || !priorities.length) return;
    if (auth.status === 'unauthenticated') {
      window.location.assign('/api/auth/line/start');
      return;
    }
    if (auth.status !== 'authenticated' && auth.status !== 'mock') {
      setSaveError('目前無法連線到登入服務，請稍後再試。');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const { subject } = await createSubject({
        subjectKind: assessmentMode === 'co_present' ? 'guest' : 'self',
        displayLabel: assessmentMode === 'co_present' ? '另一位探索者' : '我自己',
        birthDate,
      });
      const { assessment } = await createAssessment({
        birthDate,
        subjectId: subject.subjectId,
        assessmentMode,
        lifePath,
        birthProfile,
        birthSignature: calculateBirthSignature(birthDate),
        lifePathResonance,
        lifePathTopResonance: '課堂版未另選共鳴句',
        riasecAnswers,
        riasecResult,
        subjectiveDriver,
        talentUsage,
        priorities,
        explorationInterest: '未詢問',
        ...(eventId ? { eventId } : {}),
      } satisfies AssessmentInput);
      setCompletedAssessment(assessment);
      setStep('snapshot');
      void generateReport(assessment.assessmentId).catch(() => undefined);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : '目前無法保存結果，請稍後再試。');
    } finally {
      setIsSaving(false);
    }
  }

  if (step === 'landing') return <main className="classroom-shell classroom-polished-shell"><section className="classroom-panel classroom-hero classroom-hero--visual">
    <div className="classroom-hero-copy">
      <p className="classroom-eyebrow">天賦原動力 · 課堂探索</p>
      <span className="classroom-kicker">看見天賦・找到原動力・增加人生的選擇</span>
      <h1>做一點，<br />看一點，聊一點</h1>
      <p className="classroom-lede">今天不急著把你分析完。我們分三段，用幾個簡單線索，一步一步把自己看得更清楚。</p>
      <div className="classroom-stage-row"><span>① 出生結構</span><span>② 活動偏好</span><span>③ 當下狀況</span></div>
      <button className="classroom-primary" type="button" disabled={auth.status === 'loading'} onClick={() => auth.status === 'unauthenticated' ? window.location.assign('/api/auth/line/start') : setStep('birthday')}>{auth.status === 'loading' ? '正在準備…' : '開始我的探索'}</button>
      <a className="classroom-link" href="/report/latest">查看我上次的完整報告</a>
    </div>
    <picture className="classroom-hero-art">
      <source media="(max-width: 760px)" srcSet="/landing-hero-mobile.webp" />
      <img src="/landing-hero.webp" alt="天賦原動力探索插圖" />
    </picture>
  </section></main>;

  if (step === 'birthday') return <main className="classroom-shell classroom-polished-shell"><section className="classroom-panel classroom-panel--narrow classroom-step-card">
    <div className="classroom-step-heading"><span>01</span><div><p className="classroom-eyebrow">第一階段 · 出生結構</p><h1>先算出你的生命靈數</h1></div></div>
    <p className="classroom-lede">先看第一面鏡子，不急著相信。等等一起聽老師解讀，再看哪些地方真的像你。</p>
    <label className="classroom-label" htmlFor="birth-date">出生日期</label>
    <div className="classroom-date-field">
      <input
        className="classroom-input classroom-date-input"
        id="birth-date"
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        placeholder="YYYY / MM / DD"
        value={birthDateInput}
        maxLength={14}
        onChange={(event) => { setBirthDateInput(maskBirthDate(event.target.value)); setDateError(null); }}
        aria-describedby="birth-date-help"
      />
      <small id="birth-date-help">輸入 4 位數年份後會自動進到月份格式，例如 1978 / 11 / 05。</small>
    </div>
    <p className="classroom-label">這是誰的出生日期？</p>
    <div className="classroom-choice-grid classroom-choice-grid--two">
      <button type="button" className={assessmentMode === 'self' ? 'is-selected' : ''} onClick={() => setAssessmentMode('self')}>我自己</button>
      <button type="button" className={assessmentMode === 'co_present' ? 'is-selected' : ''} onClick={() => setAssessmentMode('co_present')}>陪另一位一起探索</button>
    </div>
    {dateError ? <p className="classroom-error">{dateError}</p> : null}
    <button className="classroom-primary" type="button" disabled={!birthDate} onClick={revealLifePath}>看看我的數字</button>
  </section></main>;

  if (step === 'life' && lifePath && lifeContent && birthFacts) return <main className="classroom-shell classroom-polished-shell"><section className="classroom-panel classroom-panel--wide classroom-step-card">
    <div className="classroom-result-banner">
      <div className="classroom-number"><strong>{lifePath.value}</strong><span>{lifeContent.label}</span></div>
      <div><p className="classroom-eyebrow">第一階段完成</p><p className="classroom-core">核心原動力：<b>{lifeContent.coreMotivation}</b></p></div>
    </div>
    <div className="classroom-two-cards classroom-two-cards--emphasis"><article><small>🌤 比較容易有精神</small><p>{lifeContent.strengths[0]}</p></article><article><small>🌙 比較容易被耗掉</small><p>{lifeContent.drains[0]}</p></article></div>
    <h2 className="classroom-section-title">你的出生日期還透露了 4 個角度</h2>
    <div className="classroom-birth-preview">
      <article><small>核心特質</small><b>{birthFacts.pyramid_main.number}｜{birthFacts.pyramid_main.label}</b><span>{birthFacts.pyramid_main.keywords.join('・')}</span></article>
      <article><small>外在互動</small><b>{birthFacts.outer_profile.composite}｜{birthFacts.outer_profile.label}</b><span>{birthFacts.outer_profile.keywords.join('・')}</span></article>
      <article><small>內在需求</small><b>{birthFacts.inner_profile.composite}｜{birthFacts.inner_profile.label}</b><span>{birthFacts.inner_profile.keywords.join('・')}</span></article>
      <article><small>目前階段</small><b>{birthFacts.current_stage.number ?? '—'}｜{birthFacts.current_stage.theme ?? birthFacts.current_stage.label}</b><span>{birthFacts.current_stage.keywords?.join('・') ?? '目前值得探索的主題'}</span></article>
    </div>
    <div className="classroom-resonance"><h2>剛才的描述，有幾分像你？</h2><div className="classroom-choice-grid classroom-choice-grid--three">{([['high', '很像'], ['partial', '有一些像'], ['low', '目前不太像']] as Array<[LifePathResonance, string]>).map(([value, label]) => <button type="button" key={value} className={lifePathResonance === value ? 'is-selected' : ''} onClick={() => setLifePathResonance(value)}>{label}</button>)}</div></div>
    <div className="classroom-pause"><b>先停在這裡。</b><span>抬頭看看台上，等等一起聊聊你的數字。完整出生結構會保留在課後報告裡。</span></div>
    <button className="classroom-primary" type="button" disabled={!lifePathResonance} onClick={() => setStep('riasec-intro')}>老師說可以後，進入第二階段</button>
  </section></main>;

  if (step === 'riasec-intro') return <main className="classroom-shell classroom-polished-shell"><section className="classroom-panel classroom-panel--wide classroom-step-card">
    <div className="classroom-step-heading"><span>02</span><div><p className="classroom-eyebrow">第二階段 · RIASEC 活動偏好</p><h1>看你喜歡怎麼做事情</h1></div></div>
    <p className="classroom-lede">字母只是代號，我們會用「完整名稱＋一個好記的動詞」來理解。不是看能力高低，也不是替你決定職業。</p>
    <div className="classroom-riasec-six">{(Object.keys(RIASEC_META) as RiasecCode[]).map((code) => <article key={code} className={`riasec-${code.toLowerCase()}`}><b>{code}</b><strong>{RIASEC_META[code].name}｜{RIASEC_META[code].verb}</strong><span>{RIASEC_ACTIVITY_DESCRIPTIONS[code]}</span></article>)}</div>
    <p className="classroom-lede classroom-lede--compact">共 18 題，憑第一直覺作答。沒有標準答案，選完會自動進到下一題。</p>
    <button className="classroom-primary" type="button" onClick={() => setStep('riasec')}>開始 18 題</button>
  </section></main>;

  if (step === 'riasec') {
    const question = RIASEC_QUESTIONS[answeredCount];
    if (!question) return null;
    return <main className="classroom-shell classroom-polished-shell"><section className="classroom-panel classroom-panel--narrow classroom-question classroom-step-card">
      <div className="classroom-progress"><span style={{ width: `${Math.round((answeredCount / RIASEC_QUESTIONS.length) * 100)}%` }} /></div>
      <p className="classroom-eyebrow">第 {answeredCount + 1} / {RIASEC_QUESTIONS.length} 題</p><h1>{question.text}</h1>
      <div className="classroom-scale">{SCALE.map((item) => <button type="button" key={item.value} onClick={() => answerRiasec(item.value)}><b>{item.value}</b><span>{item.label}</span></button>)}</div>
      <button className="classroom-link classroom-back" type="button" onClick={goPreviousQuestion}>← {answeredCount ? '回上一題' : '回上一頁'}</button>
    </section></main>;
  }

  if (step === 'riasec-result' && riasecResult) {
    const narrative = buildRiasecNarrative(riasecResult);
    return <main className="classroom-shell classroom-polished-shell"><section className="classroom-panel classroom-panel--wide classroom-step-card">
      <p className="classroom-eyebrow">第二階段完成</p><h1>你的活動偏好 Top 3</h1>
      <p className="classroom-lede">不是只看三個字母。下面先看每一型，再看三個偏好組合起來，像不像你平常做事的方式。</p>
      <div className="classroom-top3">{riasecResult.top3.map((code, index) => <article key={code} className={`classroom-top3-card riasec-${code.toLowerCase()}`}><span>TOP {index + 1}</span><b>{code}</b><strong>{RIASEC_META[code].name}｜{RIASEC_META[code].verb}</strong><p>{RIASEC_ACTIVITY_DESCRIPTIONS[code]}</p></article>)}</div>
      <section className="classroom-tailored"><small>像是為你組起來的一段話</small><h2>{narrative.headline}</h2><p>{narrative.body}</p><blockquote>{narrative.reflection}</blockquote></section>
      <div className="classroom-pause"><b>先停在這裡。</b><span>先別急著判斷準不準。找找看：哪一句最像你？哪一句最讓你意外？</span></div>
      <button className="classroom-primary" type="button" onClick={() => setStep('reality')}>老師說可以後，進入第三階段</button>
    </section></main>;
  }

  if (step === 'reality') return <main className="classroom-shell classroom-polished-shell"><section className="classroom-panel classroom-panel--wide classroom-step-card">
    <div className="classroom-step-heading"><span>03</span><div><p className="classroom-eyebrow">第三階段 · 現在的你</p><h1>把測驗拉回真實生活</h1></div></div>
    <p className="classroom-lede">不用打字，只要做幾個快速選擇。這一段不是測你，而是讓前面的結果跟現在的生活接起來。</p>
    <div className="classroom-block"><h2>哪一種事情做了反而比較有精神？</h2><div className="classroom-choice-grid classroom-choice-grid--three">{ENERGY_OPTIONS.map((item) => <button type="button" key={item.code} className={subjectiveDriver === item.code ? 'is-selected' : ''} onClick={() => setSubjectiveDriver(item.code)}>{item.label}</button>)}</div></div>
    <div className="classroom-block"><h2>目前的工作／生活，大約讓你用了多少自己的天賦？</h2><div className="classroom-usage">{([20, 40, 60, 80, 100] as TalentUsage[]).map((value) => <button type="button" key={value} className={talentUsage === value ? 'is-selected' : ''} onClick={() => setTalentUsage(value)}>{value}%</button>)}</div></div>
    <div className="classroom-block"><h2>現在最想改善什麼？<small>最多選 2 項</small></h2><div className="classroom-choice-grid classroom-choice-grid--two">{PRIORITIES.map((priority) => <button type="button" key={priority} className={priorities.includes(priority) ? 'is-selected' : ''} onClick={() => togglePriority(priority)}>{priority}</button>)}</div></div>
    {saveError ? <p className="classroom-error">{saveError}</p> : null}
    <button className="classroom-primary" type="button" disabled={!subjectiveDriver || !talentUsage || !priorities.length || isSaving} onClick={() => void finalize()}>{isSaving ? '正在保存你的探索快照…' : '整理我的天賦快照'}</button>
  </section></main>;

  if (step === 'snapshot' && completedAssessment && riasecResult && lifePath && lifeContent) {
    const repeated = subjectiveDriver ? riasecResult.top3.includes(subjectiveDriver) : false;
    const narrative = buildRiasecNarrative(riasecResult);
    const insights = [
      repeated && subjectiveDriver
        ? `不同角度都出現「${RIASEC_META[subjectiveDriver].name}｜${energyLabel(subjectiveDriver)}」的線索。這不是答案，但值得回想：你在哪些真實情境裡，最常因為這件事有成就感？`
        : subjectiveDriver ? '你的活動偏好與主觀能量照到不同方向。這不代表測驗不準，反而值得問：什麼事情吸引你，和什麼事情真正讓你有精神，是否本來就不完全相同？' : '',
      talentUsage && talentUsage <= 40
        ? `你只給目前的天賦使用感 ${talentUsage}%。也許問題不只是「我會不會」，而是現在的環境有沒有讓這些偏好被真正用到。`
        : `你給目前的天賦使用感 ${talentUsage}%。下一步可以觀察：哪些情境最容易讓這個比例再往上。`,
      `你現在最在意「${priorities.join('、')}」。先不要急著做大決定，從一個 7 天內可以驗證的小行動開始，比直接替人生下結論更有用。`,
    ].filter(Boolean);
    return <main className="classroom-shell classroom-polished-shell"><section className="classroom-panel classroom-panel--wide classroom-step-card">
      <p className="classroom-eyebrow">三段探索完成</p><h1>你的天賦探索快照</h1>
      <div className="classroom-snapshot-grid"><article><small>出生結構</small><strong>{lifePath.value}｜{lifeContent.label}</strong><p>{lifeContent.coreMotivation}</p></article><article><small>活動偏好</small><strong>{riasecResult.top3Code}</strong><p>{riasecResult.top3.map((code) => `${RIASEC_META[code].name}｜${RIASEC_META[code].verb}`).join('・')}</p></article><article><small>本人能量</small><strong>{energyLabel(subjectiveDriver)}</strong><p>天賦使用感 {talentUsage}%</p></article><article><small>現在最關注</small><strong>{priorities[0]}</strong><p>{priorities[1] ?? '先從一個重點開始'}</p></article></div>
      <section className="classroom-tailored classroom-tailored--compact"><small>你的活動偏好組合</small><h2>{narrative.headline}</h2><p>{narrative.body}</p></section>
      <div className="classroom-insights"><h2>現在最值得留意的 3 個線索</h2>{insights.map((text, index) => <article key={text}><b>{index + 1}</b><p>{text}</p></article>)}</div>
      <div className="classroom-pause classroom-pause--strong"><b>AI 不是答案。</b><span>接下來回到課堂，學會看「重複、落差、現在需要」，比把報告一次讀完更重要。</span></div>
      <a className="classroom-primary classroom-anchor" href="/report/latest">📖 課後查看我的完整報告</a>
      <a className="classroom-secondary classroom-anchor" href={OFFICIAL_LINE_URL}>加入官方 LINE，回家繼續探索</a>
      <p className="classroom-footnote">完整 AI 解析已在背景準備；你現在不用等，也不用把長文看完。</p>
    </section></main>;
  }

  return null;
}

export default ClassroomJourneyPolished;
