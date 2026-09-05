import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChoiceButton } from './components/ChoiceButton';
import { AIHighlightedText, AIInsightBlock } from './components/AIInsight';
import { ProgressHeader } from './components/ProgressHeader';
import { RadarChart } from './components/RadarChart';
import { PresenterPage } from './components/PresenterPage';
import { LIFE_PATH_CONTENT } from './data/lifePathContent';
import { RIASEC_META, RIASEC_QUESTIONS } from './data/riasecQuestions';
import { calculateLifePath, LifePathValidationError } from './lib/scoring/lifePath';
import { calculateBirthProfile, type BirthProfileResult } from './lib/scoring/birthProfile';
import { calculateBirthSignature } from './lib/scoring/birthSignature';
import { CORE_NARRATIVES, OUTER_NARRATIVES, INNER_NARRATIVES, getProfileTension } from './data/birthProfileNarratives';
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

function BirthProfileCards({ birthProfile }: { birthProfile: BirthProfileResult }) {
  const main = birthProfile.pyramid.main;
  const outer = birthProfile.pyramid.outerComposite;
  const inner = birthProfile.pyramid.innerComposite;
  const stage = birthProfile.currentStage;
  const coreInfo = CORE_NARRATIVES[main] ?? {
    title: `${main} 號特質`,
    tagline: '獨特的核心天賦',
    description: '具備獨特的思考與行動風格。',
    relatableHit: '在適合你的環境中能發揮獨特亮點。',
  };
  const tension = getProfileTension(outer, inner);

  return (
    <div className="birth-profile-compact" style={{ marginTop: 28 }}>
      <small>第一面鏡子 · 出生結構與天賦密碼</small>
      <div className="birth-profile-cards">
        <div><b>{main}</b><span>核心天賦本色</span></div>
        <div><b>{outer}</b><span>外在處事風格</span></div>
        <div><b>{inner}</b><span>內在深層渴望</span></div>
        <div><b>{stage.number ?? '—'}</b><span>{stage.label}</span></div>
      </div>

      <div className="birth-insight-box">
        <div className="birth-insight-header">
          <h3>出生日期特質深度解密</h3>
          <span>你的專屬特質解析</span>
        </div>

        <div className="insight-item">
          <div className="insight-item-title">
            <span className="insight-tag insight-tag--core">🌟 核心天賦 · {main} 號</span>
            <strong>{coreInfo.title}（{coreInfo.tagline}）</strong>
          </div>
          <p className="insight-desc">{coreInfo.description}</p>
          <div className="insight-hit">💡 戳中心聲：{coreInfo.relatableHit}</div>
        </div>

        <div className="insight-item">
          <div className="insight-item-title">
            <span className="insight-tag insight-tag--outer">🎭 外在風格 · {outer} 號</span>
            <strong>別人眼中的你</strong>
          </div>
          <p className="insight-desc">{OUTER_NARRATIVES[outer] ?? '展現出獨特的個人氣場。'}</p>
        </div>

        <div className="insight-item">
          <div className="insight-item-title">
            <span className="insight-tag insight-tag--inner">💭 內在渴望 · {inner} 號</span>
            <strong>私底下的真實心聲</strong>
          </div>
          <p className="insight-desc">{INNER_NARRATIVES[inner] ?? '內心保有深層的個人渴望。'}</p>
        </div>

        {stage.number ? (
          <div className="insight-item">
            <div className="insight-item-title">
              <span className="insight-tag insight-tag--stage">🌱 人生階段 · {stage.number} 號</span>
              <strong>目前處於：{stage.label}</strong>
            </div>
            <p className="insight-desc">
              當前階段的核心課題是學習並發揮 {stage.number} 號能量，這也是你這幾年最有感、最能累積成熟度的成長契機。
            </p>
          </div>
        ) : null}

        <div className="insight-tension-card">
          <small>⚡ 內外在反差與真實寫照</small>
          <p>{tension}</p>
        </div>
      </div>
    </div>
  );
}

function RiasecScoreSummary({ riasecResult }: { riasecResult: RiasecResult }) {
  return (
    <div className="score-summary">
      <p className="top-code">{riasecResult.top3Code}</p>
      <div className="top-cards">
        {riasecResult.top3.map((code) => (
          <div className="top-card" key={code} style={{ '--accent': RIASEC_META[code].color } as CSSProperties}>
            <span>{code}</span>
            <p>{RIASEC_META[code].name}</p>
            <small>{RIASEC_META[code].verb} · {riasecResult.scores[code].normalized} 分</small>
          </div>
        ))}
      </div>
      <dl className="score-list">
        {Object.values(riasecResult.scores).map((score) => (
          <div key={score.code}>
            <dt>{score.code} · {RIASEC_META[score.code].name}</dt>
            <dd><span style={{ width: `${score.normalized}%` }} />{score.normalized}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AssessmentApp() {
  const auth = useAuthBootstrap();
  const eventId = new URLSearchParams(window.location.search).get('eventId');
  const [draft, setDraft] = useState<AssessmentDraft>(() => localAssessmentDraftRepository.load() ?? createEmptyDraft());
  const [dateError, setDateError] = useState<string | null>(null);
  const [completedAssessment, setCompletedAssessment] = useState<ClientAssessment | null>(null);
  const [serverReport, setServerReport] = useState<AIReport | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
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
      try {
        const { assessment } = await getLatestAssessment();
        if (!assessment || !active) return;
        setCompletedAssessment(assessment);
        localAssessmentDraftRepository.clear();
        try {
          const { report } = await getReport(assessment.assessmentId);
          if (active) setServerReport(report);
        } catch {
          // A deterministic report can render even while AI generation is pending.
        }
      } catch {
        if (active) setPersistenceError('暫時無法讀取已保存的結果；未完成的本機草稿仍可繼續。');
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
    return <ServerReport assessment={completedAssessment} report={serverReport} persistenceError={persistenceError} isGenerating={isGeneratingReport} onRetry={() => void requestReport(completedAssessment.assessmentId)} onRestart={returnHome} />;
  }

  return (
    <main className="site-shell">
      {draft.step !== 'landing' && draft.step !== 'report' ? (
        <ProgressHeader step={draft.step} onHome={returnHome} onBack={goBack} canBack={draft.step !== 'consent'} />
      ) : null}
      <section className={`journey ${draft.step === 'landing' ? 'journey--landing' : ''}`} aria-live="polite">
        {draft.step === 'landing' ? <Landing auth={auth} onLogin={() => { window.location.assign('/api/auth/line/start'); }} onStart={startNew} /> : null}

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
            <p className="life-motivation">這個框架通常把 {draft.lifePath.value} 解讀為：<strong>{lifePathContent.coreMotivation}</strong></p>
            <div className="tag-list">{lifePathContent.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
            <div className="two-column-notes">
              <div><small>容易發光</small><p>{lifePathContent.strengths[0]}</p></div>
              <div><small>容易耗能</small><p>{lifePathContent.drains[0]}</p></div>
            </div>
            {draft.birthProfile ? <BirthProfileCards birthProfile={draft.birthProfile} /> : null}
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
            <div className="mirror-row" aria-hidden="true"><span>做</span><span>想</span><span>創</span><span>幫</span><span>帶</span><span>整</span></div>
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
            <div className="action-row">
              <button className="text-button" type="button" onClick={goBack}>← 上一步</button>
              <button
                className="primary-button"
                disabled={draft.priorities.length === 0 || !draft.explorationInterest}
                type="button"
                onClick={() => { void completeAssessment(); }}
              >
                {isSaving ? '正在安全保存…' : '整理我的三面鏡子'}
              </button>
            </div>
            {persistenceError ? <p className="field-error" role="alert">{persistenceError}</p> : null}
          </section>
        ) : null}

        {draft.step === 'report' && lifePathContent && riasecResult ? (
          <section className="panel report-panel entrance">
            <p className="eyebrow">你的探索摘要</p>
            <h1>把三面鏡子放在一起看</h1>
            <p className="lede">這裡呈現的是你提供的回答與計算結果；它們可以成為你接下來觀察自己的線索。</p>
            <div className="report-grid">
              <article><small>第一面鏡子 · 自我反思</small><strong>{draft.lifePath?.value} · {lifePathContent.label}</strong><p>{lifePathContent.coreMotivation}</p></article>
              <article><small>第二面鏡子 · 活動偏好 Top 3</small><strong>{riasecResult.top3Code}</strong><p>{riasecResult.top3.map((code) => RIASEC_META[code].name).join('、')}</p></article>
              <article><small>本人能量線索</small><strong>{energyLabel(draft.subjectiveDriver)}</strong><p>{subjectiveComparison?.title ?? '這是你親自選擇的能量線索。'}</p></article>
              <article><small>第三面鏡子 · 天賦使用感</small><strong>{draft.talentUsage ?? '—'}%</strong><p>這是你的主觀感受，不是精確能力測量。</p></article>
              <article><small>目前最關注</small><strong>{draft.priorities.join('、')}</strong><p>探索意願：{draft.explorationInterest}</p></article>
            </div>

            {draft.birthProfile ? <BirthProfileCards birthProfile={draft.birthProfile} /> : null}

            <div className="results-layout" style={{ marginTop: 32 }}>
              <RadarChart scores={riasecResult.scores} />
              <RiasecScoreSummary riasecResult={riasecResult} />
            </div>

            {subjectiveComparison ? (
              <div className="reflection-card"><small>{subjectiveComparison.title}</small><p>{subjectiveComparison.text}</p></div>
            ) : null}
            <div className="reflection-card"><small>留給自己的問題</small><p>{lifePathContent.reflectionQuestion}</p></div>
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
  const top1 = assessment.riasecResult.top3[0];
  const energyComparison = assessment.subjectiveDriver === top1
    ? '兩個角度出現相同線索'
    : '兩個角度照到不同線索';

  return (
    <main className="site-shell">
      <section className="journey" aria-live="polite">
        <section className="panel report-panel entrance">
          <p className="eyebrow">你的探索摘要</p>
          <h1>把三面鏡子放在一起看</h1>
          <p className="lede">這裡呈現的是已保存的回答與伺服器重新驗證的計算結果；它們可以成為你接下來觀察自己的線索。</p>
          <div className="report-grid">
            <article><small>第一面鏡子 · 自我反思</small><strong>{assessment.lifePath.value} · {lifePathContent.label}</strong><p>{lifePathContent.coreMotivation}</p></article>
            <article><small>第二面鏡子 · 活動偏好 Top 3</small><strong>{assessment.riasecResult.top3Code}</strong><p>{assessment.riasecResult.top3.map((code) => RIASEC_META[code].name).join('、')}</p></article>
            <article><small>本人能量線索</small><strong>{energyLabel(assessment.subjectiveDriver)}</strong><p>{energyComparison}</p></article>
            <article><small>第三面鏡子 · 天賦使用感</small><strong>{assessment.talentUsage}%</strong><p>這是你的主觀感受，不是精確能力測量。</p></article>
            <article><small>目前最關注</small><strong>{assessment.priorities.join('、')}</strong><p>探索意願：{assessment.explorationInterest}</p></article>
          </div>

          {assessment.birthProfile ? <BirthProfileCards birthProfile={assessment.birthProfile} /> : null}

          <div className="results-layout" style={{ marginTop: 32 }}>
            <RadarChart scores={assessment.riasecResult.scores} />
            <RiasecScoreSummary riasecResult={assessment.riasecResult} />
          </div>

          <div className="reflection-card" style={{ marginTop: 24 }}>
            <small>{energyComparison}</small>
            <p>你的主觀能量線索與活動偏好都是值得繼續觀察的資料，不需要判斷哪一個更正確。</p>
          </div>

          {report ? (
            <section className="ai-report" aria-labelledby="ai-report-title">
              <header className="ai-report__header">
                <div>
                  <small>AI 綜合解析</small>
                  <h2 id="ai-report-title">先讀這些重點，再回到生活裡驗證</h2>
                </div>
                <span className="ai-report__note">自我反思參考</span>
              </header>
              <AIInsightBlock label="先看這一句" value={report.summary} tone="summary" />
              <AIInsightBlock label="反覆出現的線索" value={report.repeated_signals} tone="signals" />
              <AIInsightBlock label="出生結構這面鏡子" value={report.birth_profile_summary} tone="profile" />
              <AIInsightBlock label="可能的原動力" value={report.motivator_summary} tone="motivator" />
              <AIInsightBlock label="可以再發揮的空間" value={report.unused_potential} tone="potential" />
              {report.possible_tensions?.length ? <AIInsightBlock label="同時在乎的兩件事" value={report.possible_tensions} tone="tension" /> : null}
              {report.exploration_directions?.length ? <AIInsightBlock label="可以先試的小方向" value={report.exploration_directions} tone="exploration" /> : null}
              <AIInsightBlock label="給自己的下一個問題" value={report.reflection_question} tone="question" />
            </section>
          ) : (
            <div className="reflection-card" style={{ marginTop: 26, textAlign: 'center', padding: '24px' }}>
              <small>AI 綜合解析</small>
              <p style={{ fontSize: '15px', marginTop: '10px' }}>{isGenerating ? '正在為你生成專屬特質解析…' : '測驗結果已保存，AI 解析尚未完成。可以重新產生，不必再做一次測驗。'}</p>
            </div>
          )}
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

function Landing({ auth, onLogin, onStart }: { auth: AuthState; onLogin: () => void; onStart: () => void }) {
  const needsLogin = auth.status === 'unauthenticated';
  return (
    <section className="landing landing--hero entrance">
      <picture className="landing-backdrop" aria-hidden="true">
        <source media="(max-width: 720px)" srcSet="/landing-hero-mobile.webp" />
        <img src="/landing-hero.webp" alt="" width="1600" height="901" fetchPriority="high" decoding="async" />
      </picture>
      <div className="landing-wash" aria-hidden="true" />
      <p className="landing-corner-copy landing-corner-copy--left" aria-hidden="true">
        EXPLORE<br />YOUR NATURE<br /><span>LIVE A BRIGHTER YOU</span>
      </p>
      <p className="landing-corner-copy landing-corner-copy--right" aria-hidden="true">
        認識自己<br />看見可能<br />創造屬於你的美好人生
      </p>
      <div className="landing-copy">
        <p className="eyebrow">三面鏡子，不替你下定義</p>
        <h1>看見天賦，<br /><em>找到原動力。</em></h1>
        <p className="landing-lede">看見天賦・找到原動力・增加人生的選擇。從一個自我反思入口、一組活動偏好，和你此刻的感受開始。</p>
        <button className="primary-button" disabled={auth.status === 'loading'} type="button" onClick={needsLogin ? onLogin : onStart}>
          {auth.status === 'loading' ? '正在確認身份…' : needsLogin ? '使用 LINE 登入後開始探索' : '開始探索我的天賦'}
        </button>
        {auth.status === 'unavailable' ? <p className="disclaimer">目前以本機草稿模式進行；連線恢復後即可安全保存結果。</p> : null}
        <p className="landing-footnote">約 5 分鐘 · 沒有標準答案，也不是考試</p>
      </div>
      <div className="landing-signature" aria-hidden="true">
        <span>Birth Profile</span><b>×</b><span>RIASEC</span><b>×</b><span>Reflection</span>
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
