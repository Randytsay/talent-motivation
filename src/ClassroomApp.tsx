import { useEffect, useMemo, useState } from 'react';
import { LIFE_PATH_CONTENT } from './data/lifePathContent';
import { RIASEC_META, RIASEC_QUESTIONS } from './data/riasecQuestions';
import { calculateLifePath, LifePathValidationError } from './lib/scoring/lifePath';
import { birthProfileFacts, calculateBirthProfile, type BirthProfileResult } from './lib/scoring/birthProfile';
import { calculateBirthSignature } from './lib/scoring/birthSignature';
import { scoreRiasec } from './lib/scoring/riasec';
import { ApiError, createAssessment, createSubject, generateReport, getLatestAssessment, getReport, type ClientAssessment } from './lib/api/client';
import { useAuthBootstrap } from './lib/api/authBootstrap';
import type { AIReport, AssessmentInput } from './server/contracts';
import type { AssessmentMode, LifePathResonance, Priority, RiasecAnswer, RiasecCode, TalentUsage } from './types/domain';
import './classroom.css';

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

function ClassroomApp() {
  return window.location.pathname.startsWith('/report/') ? <ClassroomReportPage /> : <ClassroomJourney />;
}

function ClassroomJourney() {
  const auth = useAuthBootstrap();
  const eventId = new URLSearchParams(window.location.search).get('eventId') ?? undefined;
  const [step, setStep] = useState<ClassroomStep>('landing');
  const [birthDate, setBirthDate] = useState('');
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

  if (step === 'landing') return <main className="classroom-shell"><section className="classroom-panel classroom-hero">
    <p className="classroom-eyebrow">天賦原動力 · 課堂探索</p><h1>做一點，看一點，聊一點</h1>
    <p className="classroom-lede">今天不急著把你分析完。我們分三段：先看出生結構、再看活動偏好，最後把線索放回現在的生活。</p>
    <div className="classroom-stage-row"><span>① 出生結構</span><span>② 活動偏好</span><span>③ 當下狀況</span></div>
    <button className="classroom-primary" type="button" disabled={auth.status === 'loading'} onClick={() => auth.status === 'unauthenticated' ? window.location.assign('/api/auth/line/start') : setStep('birthday')}>{auth.status === 'loading' ? '正在準備…' : '開始我的探索'}</button>
    <a className="classroom-link" href="/report/latest">查看我上次的完整報告</a>
  </section></main>;

  if (step === 'birthday') return <main className="classroom-shell"><section className="classroom-panel classroom-panel--narrow">
    <p className="classroom-eyebrow">第一階段 · 出生結構</p><h1>先算出你的生命靈數</h1>
    <p className="classroom-lede">先看第一面鏡子，不急著相信。等等一起聽老師解讀，再看哪些地方真的像你。</p>
    <label className="classroom-label" htmlFor="birth-date">出生日期</label>
    <input className="classroom-input" id="birth-date" type="date" value={birthDate} onChange={(event) => { setBirthDate(event.target.value); setDateError(null); }} />
    <p className="classroom-label">這是誰的出生日期？</p>
    <div className="classroom-choice-grid classroom-choice-grid--two">
      <button type="button" className={assessmentMode === 'self' ? 'is-selected' : ''} onClick={() => setAssessmentMode('self')}>我自己</button>
      <button type="button" className={assessmentMode === 'co_present' ? 'is-selected' : ''} onClick={() => setAssessmentMode('co_present')}>陪另一位一起探索</button>
    </div>
    {dateError ? <p className="classroom-error">{dateError}</p> : null}
    <button className="classroom-primary" type="button" disabled={!birthDate} onClick={revealLifePath}>看看我的數字</button>
  </section></main>;

  if (step === 'life' && lifePath && lifeContent && birthFacts) return <main className="classroom-shell"><section className="classroom-panel classroom-panel--wide">
    <p className="classroom-eyebrow">第一階段完成</p><div className="classroom-number"><strong>{lifePath.value}</strong><span>{lifeContent.label}</span></div>
    <p className="classroom-core">核心原動力：<b>{lifeContent.coreMotivation}</b></p>
    <div className="classroom-two-cards"><article><small>比較容易有精神</small><p>{lifeContent.strengths[0]}</p></article><article><small>比較容易被耗掉</small><p>{lifeContent.drains[0]}</p></article></div>
    <div className="classroom-birth-preview">
      <article><small>核心特質</small><b>{birthFacts.pyramid_main.number}｜{birthFacts.pyramid_main.label}</b><span>{birthFacts.pyramid_main.keywords.join('・')}</span></article>
      <article><small>外在互動</small><b>{birthFacts.outer_profile.composite}｜{birthFacts.outer_profile.label}</b><span>{birthFacts.outer_profile.keywords.join('・')}</span></article>
      <article><small>內在需求</small><b>{birthFacts.inner_profile.composite}｜{birthFacts.inner_profile.label}</b><span>{birthFacts.inner_profile.keywords.join('・')}</span></article>
      <article><small>目前階段</small><b>{birthFacts.current_stage.number ?? '—'}｜{birthFacts.current_stage.theme ?? birthFacts.current_stage.label}</b><span>{birthFacts.current_stage.keywords?.join('・') ?? '目前值得探索的主題'}</span></article>
    </div>
    <div className="classroom-resonance"><h2>剛才的描述，有幾分像你？</h2><div className="classroom-choice-grid classroom-choice-grid--three">{([['high', '很像'], ['partial', '有一些像'], ['low', '目前不太像']] as Array<[LifePathResonance, string]>).map(([value, label]) => <button type="button" key={value} className={lifePathResonance === value ? 'is-selected' : ''} onClick={() => setLifePathResonance(value)}>{label}</button>)}</div></div>
    <div className="classroom-pause"><b>先停在這裡。</b><span>抬頭看看台上，等等一起聊聊你的數字。</span></div>
    <button className="classroom-primary" type="button" disabled={!lifePathResonance} onClick={() => setStep('riasec-intro')}>老師說可以後，進入第二階段</button>
  </section></main>;

  if (step === 'riasec-intro') return <main className="classroom-shell"><section className="classroom-panel classroom-panel--wide">
    <p className="classroom-eyebrow">第二階段 · RIASEC 活動偏好</p><h1>不是看你「是什麼人」，而是看你喜歡怎麼做事情</h1>
    <div className="classroom-riasec-six">{(Object.keys(RIASEC_META) as RiasecCode[]).map((code) => <article key={code}><b>{code}</b><strong>{RIASEC_META[code].name}｜{RIASEC_META[code].verb}</strong><span>{RIASEC_ACTIVITY_DESCRIPTIONS[code]}</span></article>)}</div>
    <p className="classroom-lede">共 18 題，憑第一直覺作答。沒有標準答案，選完會自動進到下一題。</p>
    <button className="classroom-primary" type="button" onClick={() => setStep('riasec')}>開始 18 題</button>
  </section></main>;

  if (step === 'riasec') {
    const question = RIASEC_QUESTIONS[answeredCount];
    if (!question) return null;
    return <main className="classroom-shell"><section className="classroom-panel classroom-panel--narrow classroom-question">
      <div className="classroom-progress"><span style={{ width: `${Math.round((answeredCount / RIASEC_QUESTIONS.length) * 100)}%` }} /></div>
      <p className="classroom-eyebrow">第 {answeredCount + 1} / {RIASEC_QUESTIONS.length} 題</p><h1>{question.text}</h1>
      <div className="classroom-scale">{SCALE.map((item) => <button type="button" key={item.value} onClick={() => answerRiasec(item.value)}><b>{item.value}</b><span>{item.label}</span></button>)}</div>
      <button className="classroom-link classroom-back" type="button" onClick={goPreviousQuestion}>← {answeredCount ? '回上一題' : '回上一頁'}</button>
    </section></main>;
  }

  if (step === 'riasec-result' && riasecResult) return <main className="classroom-shell"><section className="classroom-panel classroom-panel--wide">
    <p className="classroom-eyebrow">第二階段完成</p><h1>你的活動偏好 Top 3</h1>
    <p className="classroom-lede">字母只是代號。請看完整名稱、動詞和生活場景，才比較容易理解自己。</p>
    <div className="classroom-top3">{riasecResult.top3.map((code, index) => <article key={code}><span>TOP {index + 1}</span><b>{code}</b><strong>{RIASEC_META[code].name}｜{RIASEC_META[code].verb}</strong><p>{RIASEC_ACTIVITY_DESCRIPTIONS[code]}</p></article>)}</div>
    <div className="classroom-combo"><small>你的組合</small><strong>{riasecResult.top3Code}｜{riasecResult.top3.map((code) => `${RIASEC_META[code].name.replace('型', '')}・${RIASEC_META[code].verb}`).join(' × ')}</strong><p>不要只看第一名。真正容易投入的方式，常常藏在三個偏好的組合裡。</p></div>
    <div className="classroom-pause"><b>先停在這裡。</b><span>找找看：哪一個最像你？哪一個最讓你意外？</span></div>
    <button className="classroom-primary" type="button" onClick={() => setStep('reality')}>老師說可以後，進入第三階段</button>
  </section></main>;

  if (step === 'reality') return <main className="classroom-shell"><section className="classroom-panel classroom-panel--wide">
    <p className="classroom-eyebrow">第三階段 · 現在的你</p><h1>最後用 2 分鐘，把測驗拉回真實生活</h1>
    <div className="classroom-block"><h2>哪一種事情做了反而比較有精神？</h2><div className="classroom-choice-grid classroom-choice-grid--three">{ENERGY_OPTIONS.map((item) => <button type="button" key={item.code} className={subjectiveDriver === item.code ? 'is-selected' : ''} onClick={() => setSubjectiveDriver(item.code)}>{item.label}</button>)}</div></div>
    <div className="classroom-block"><h2>目前的工作／生活，大約讓你用了多少自己的天賦？</h2><div className="classroom-usage">{([20, 40, 60, 80, 100] as TalentUsage[]).map((value) => <button type="button" key={value} className={talentUsage === value ? 'is-selected' : ''} onClick={() => setTalentUsage(value)}>{value}%</button>)}</div></div>
    <div className="classroom-block"><h2>現在最想改善什麼？<small>最多選 2 項</small></h2><div className="classroom-choice-grid classroom-choice-grid--two">{PRIORITIES.map((priority) => <button type="button" key={priority} className={priorities.includes(priority) ? 'is-selected' : ''} onClick={() => togglePriority(priority)}>{priority}</button>)}</div></div>
    {saveError ? <p className="classroom-error">{saveError}</p> : null}
    <button className="classroom-primary" type="button" disabled={!subjectiveDriver || !talentUsage || !priorities.length || isSaving} onClick={() => void finalize()}>{isSaving ? '正在保存你的探索快照…' : '整理我的天賦快照'}</button>
  </section></main>;

  if (step === 'snapshot' && completedAssessment && riasecResult && lifePath && lifeContent) {
    const repeated = subjectiveDriver ? riasecResult.top3.includes(subjectiveDriver) : false;
    const insights = [
      repeated && subjectiveDriver
        ? `不同角度重複出現「${RIASEC_META[subjectiveDriver].name}｜${energyLabel(subjectiveDriver)}」的線索，值得回想你在哪些真實情境最有成就感。`
        : subjectiveDriver ? '你的活動偏好與主觀能量照到不同方向。這不是矛盾，而是提醒：什麼事情吸引你，和什麼事情真正讓你有精神，可能不完全相同。' : '',
      talentUsage && talentUsage <= 40
        ? `你只給目前的天賦使用感 ${talentUsage}%。也許問題不只是能力，而是現在的環境沒有讓這些偏好充分被使用。`
        : `你給目前的天賦使用感 ${talentUsage}%。可以繼續觀察：哪些情境最容易讓這個比例往上。`,
      `你現在最在意「${priorities.join('、')}」。下一步不用立刻做大決定，先找一個 7 天內可以驗證的小行動。`,
    ].filter(Boolean);
    return <main className="classroom-shell"><section className="classroom-panel classroom-panel--wide">
      <p className="classroom-eyebrow">三段探索完成</p><h1>你的天賦探索快照</h1>
      <div className="classroom-snapshot-grid"><article><small>出生結構</small><strong>{lifePath.value}｜{lifeContent.label}</strong><p>{lifeContent.coreMotivation}</p></article><article><small>活動偏好</small><strong>{riasecResult.top3Code}</strong><p>{riasecResult.top3.map((code) => `${RIASEC_META[code].name}｜${RIASEC_META[code].verb}`).join('・')}</p></article><article><small>本人能量</small><strong>{energyLabel(subjectiveDriver)}</strong><p>天賦使用感 {talentUsage}%</p></article><article><small>現在最關注</small><strong>{priorities[0]}</strong><p>{priorities[1] ?? '先從一個重點開始'}</p></article></div>
      <div className="classroom-insights"><h2>現在最值得留意的 3 個線索</h2>{insights.map((text, index) => <article key={text}><b>{index + 1}</b><p>{text}</p></article>)}</div>
      <div className="classroom-pause classroom-pause--strong"><b>AI 不是答案。</b><span>接下來回到課堂，學會看「重複、落差、現在需要」，比把報告一次讀完更重要。</span></div>
      <a className="classroom-primary classroom-anchor" href="/report/latest">📖 課後查看我的完整報告</a>
      <a className="classroom-secondary classroom-anchor" href={OFFICIAL_LINE_URL}>加入官方 LINE，回家繼續探索</a>
      <p className="classroom-footnote">完整 AI 解析已在背景準備；你現在不用等，也不用把長文看完。</p>
    </section></main>;
  }

  return null;
}

function ClassroomReportPage() {
  const auth = useAuthBootstrap();
  const [assessment, setAssessment] = useState<ClientAssessment | null>(null);
  const [report, setReport] = useState<AIReport | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (auth.status !== 'authenticated' && auth.status !== 'mock') return;
    let active = true;
    async function restore() {
      try {
        const latest = await getLatestAssessment();
        if (!active) return;
        if (!latest.assessment) {
          setStatus('missing');
          return;
        }
        setAssessment(latest.assessment);
        try {
          const result = await getReport(latest.assessment.assessmentId);
          if (active) setReport(result.report);
        } catch {
          if (active) setReport(null);
        }
        if (active) setStatus('ready');
      } catch {
        if (active) setStatus('error');
      }
    }
    void restore();
    return () => { active = false; };
  }, [auth.status]);

  async function reload() {
    setStatus('loading');
    try {
      const latest = await getLatestAssessment();
      if (!latest.assessment) {
        setAssessment(null);
        setStatus('missing');
        return;
      }
      setAssessment(latest.assessment);
      try {
        const result = await getReport(latest.assessment.assessmentId);
        setReport(result.report);
      } catch {
        setReport(null);
      }
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  async function requestFullReport() {
    if (!assessment || generating) return;
    setGenerating(true);
    try {
      const result = await generateReport(assessment.assessmentId);
      setReport(result.report);
    } finally {
      setGenerating(false);
    }
  }

  if (auth.status === 'loading' || status === 'loading') return <ReportMessage title="正在讀取你的完整報告…" />;
  if (auth.status === 'unauthenticated') return <ReportMessage title="先用同一個 LINE 帳號登入" body="登入後，就能找回你在課堂中保存的探索結果。" action={<a className="classroom-primary classroom-anchor" href="/api/auth/line/start">使用 LINE 登入</a>} />;
  if (status === 'missing' || !assessment) return <ReportMessage title="還找不到完整結果" body="請先完成一次「天賦原動力」課堂探索。" action={<a className="classroom-primary classroom-anchor" href="/">開始探索</a>} />;
  if (status === 'error') return <ReportMessage title="目前無法讀取報告" action={<button className="classroom-primary" type="button" onClick={() => void reload()}>重新讀取</button>} />;

  const life = LIFE_PATH_CONTENT[assessment.lifePath.value];
  const facts = assessment.birthProfile ? birthProfileFacts(assessment.birthProfile) : null;
  return <main className="classroom-shell"><section className="classroom-panel classroom-panel--wide classroom-report">
    <p className="classroom-eyebrow">我的天賦探索報告</p><h1>{assessment.lifePath.value}｜{life.label}</h1>
    <p className="classroom-lede">這裡放的是完整版本。不用一次看完，一張卡一張卡慢慢看就好。</p>
    <details open><summary>01｜我的出生結構</summary><div className="classroom-report-body">
      <div className="classroom-snapshot-grid"><article><small>生命靈數</small><strong>{assessment.lifePath.value}｜{life.label}</strong><p>{life.coreMotivation}</p></article>{facts ? <><article><small>核心特質</small><strong>{facts.pyramid_main.number}｜{facts.pyramid_main.label}</strong><p>{facts.pyramid_main.keywords.join('・')}</p></article><article><small>外在互動</small><strong>{facts.outer_profile.composite}｜{facts.outer_profile.label}</strong><p>{facts.outer_profile.keywords.join('・')}</p></article><article><small>內在需求</small><strong>{facts.inner_profile.composite}｜{facts.inner_profile.label}</strong><p>{facts.inner_profile.keywords.join('・')}</p></article><article><small>目前階段</small><strong>{facts.current_stage.number ?? '—'}｜{facts.current_stage.theme ?? facts.current_stage.label}</strong><p>{facts.current_stage.keywords?.join('・') ?? '目前值得探索的主題'}</p></article></> : null}</div>
      <div className="classroom-two-cards"><article><small>容易發揮</small><p>{life.strengths[0]}</p></article><article><small>容易耗能</small><p>{life.drains[0]}</p></article></div>
    </div></details>
    <details><summary>02｜我的活動偏好</summary><div className="classroom-report-body"><div className="classroom-top3">{assessment.riasecResult.top3.map((code, index) => <article key={code}><span>TOP {index + 1}</span><b>{code}</b><strong>{RIASEC_META[code].name}｜{RIASEC_META[code].verb}</strong><p>{RIASEC_ACTIVITY_DESCRIPTIONS[code]}</p></article>)}</div><p className="classroom-footnote">RIASEC 描述的是偏好活動與環境，不是能力高低或職業命定。</p></div></details>
    <details><summary>03｜我現在的狀況</summary><div className="classroom-report-body"><div className="classroom-snapshot-grid"><article><small>主觀能量</small><strong>{energyLabel(assessment.subjectiveDriver)}</strong></article><article><small>天賦使用感</small><strong>{assessment.talentUsage}%</strong></article><article><small>現在最關注</small><strong>{assessment.priorities.join('／')}</strong></article></div></div></details>
    <details open={Boolean(report)}><summary>04｜AI 綜合整理</summary><div className="classroom-report-body">{report ? <>
      <section className="classroom-ai-lead"><small>一句核心理解</small><p>{report.summary}</p></section>
      <h3>反覆出現的線索</h3><ul>{report.repeated_signals.map((item) => <li key={item}>{item}</li>)}</ul>
      <h3>出生結構摘要</h3><p>{report.birth_profile_summary}</p><h3>活動偏好與原動力</h3><p>{report.motivator_summary}</p>
      <h3>可能的內在張力</h3><ul>{report.possible_tensions.map((item) => <li key={item}>{item}</li>)}</ul>
      <h3>可能還沒充分使用的部分</h3><p>{report.unused_potential}</p><h3>可以先探索的方向</h3><ul>{report.exploration_directions.map((item) => <li key={item}>{item}</li>)}</ul>
      <h3>留給自己的下一個問題</h3><p>{report.reflection_question}</p>
    </> : <div className="classroom-ai-pending"><b>AI 深度整理還沒完成。</b><p>你的課堂快照已經保存，不需要卡在這裡等。稍後再回來即可。</p><button className="classroom-primary" type="button" onClick={() => void requestFullReport()} disabled={generating}>{generating ? '正在整理…' : '現在整理完整 AI 報告'}</button></div>}</div></details>
    <section className="classroom-line-card"><h2>想把這份報告變成真正的對話？</h2><p>到官方 LINE 輸入「我的原動力」，選擇更了解自己、工作與第二曲線，或 7～14 天行動實驗。LINE 只當入口，長篇內容留在這裡看。</p><a className="classroom-primary classroom-anchor" href={OFFICIAL_LINE_URL}>開啟官方 LINE</a></section>
    <a className="classroom-link" href="/">回到天賦原動力</a>
  </section></main>;
}

function ReportMessage({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return <main className="classroom-shell"><section className="classroom-panel classroom-panel--narrow"><h1>{title}</h1>{body ? <p className="classroom-lede">{body}</p> : null}{action}</section></main>;
}

export default ClassroomApp;
