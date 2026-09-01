import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChoiceButton } from './components/ChoiceButton';
import { ProgressHeader } from './components/ProgressHeader';
import { RadarChart } from './components/RadarChart';
import { LIFE_PATH_CONTENT } from './data/lifePathContent';
import { RIASEC_META, RIASEC_QUESTIONS } from './data/riasecQuestions';
import { calculateLifePath, LifePathValidationError } from './lib/scoring/lifePath';
import { scoreRiasec } from './lib/scoring/riasec';
import { localAssessmentDraftRepository } from './lib/storage/assessmentRepository';
import type {
  AssessmentDraft,
  ExplorationInterest,
  LifePathResonance,
  Priority,
  RiasecAnswer,
  RiasecCode,
  TalentUsage,
} from './types/domain';

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
  };
}

function energyLabel(code?: RiasecCode): string {
  return code ? ENERGY_OPTIONS.find((item) => item.code === code)?.label ?? '—' : '—';
}

function App() {
  const [draft, setDraft] = useState<AssessmentDraft>(() => localAssessmentDraftRepository.load() ?? createEmptyDraft());
  const [dateError, setDateError] = useState<string | null>(null);
  const completedAnswers = Object.keys(draft.riasecAnswers).length;
  const riasecResult = useMemo(() => {
    if (completedAnswers !== RIASEC_QUESTIONS.length) return null;
    return scoreRiasec(RIASEC_QUESTIONS, draft.riasecAnswers);
  }, [completedAnswers, draft.riasecAnswers]);
  const lifePathContent = draft.lifePath ? LIFE_PATH_CONTENT[draft.lifePath.value] : null;

  useEffect(() => {
    localAssessmentDraftRepository.save(draft);
  }, [draft]);

  function patchDraft(update: Partial<AssessmentDraft>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  function startNew() {
    setDateError(null);
    setDraft({ ...createEmptyDraft(), step: 'consent' });
  }

  function returnHome() {
    localAssessmentDraftRepository.clear();
    setDateError(null);
    setDraft(createEmptyDraft());
  }

  function revealLifePath() {
    try {
      const lifePath = calculateLifePath(draft.birthDate);
      setDateError(null);
      patchDraft({ lifePath, step: 'life-path' });
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

  return (
    <main className="site-shell">
      {draft.step !== 'landing' && draft.step !== 'report' ? (
        <ProgressHeader step={draft.step} onHome={returnHome} />
      ) : null}
      <section className="journey" aria-live="polite">
        {draft.step === 'landing' ? <Landing onStart={startNew} /> : null}

        {draft.step === 'consent' ? (
          <section className="panel panel--narrow entrance">
            <p className="eyebrow">開始前 · 本機預演說明</p>
            <h1>先說明這次資料怎麼使用</h1>
            <p className="lede">
              目前是 P0 本機預演版，尚未連接 LINE、Lark Base 或雲端資料庫。你的出生日期、作答與結果只會暫存在這個瀏覽器，方便刷新後繼續。
            </p>
            <div className="reflection-card" style={{ marginTop: 28 }}>
              <small>目前不會做的事</small>
              <p>不會建立 LINE 身分、不會上傳雲端，也不會把結果公開給其他人。正式版上線前會另外提供完整隱私告知與同意流程。</p>
            </div>
            <button className="primary-button" type="button" onClick={() => patchDraft({ step: 'birthday' })}>
              我了解，繼續本機探索
            </button>
          </section>
        ) : null}

        {draft.step === 'birthday' ? (
          <section className="panel panel--narrow entrance">
            <p className="eyebrow">第一面鏡子 · 自我反思入口</p>
            <h1>先從你的出生日期開始</h1>
            <p className="lede">我們只會計算 Life Path，作為一個觀察自己的小入口。</p>
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
            {dateError ? <p className="field-error" role="alert">{dateError}</p> : null}
            <button className="primary-button" type="button" onClick={revealLifePath}>看看這面鏡子</button>
            <p className="disclaimer">{DISCLAIMER}</p>
          </section>
        ) : null}

        {draft.step === 'life-path' && lifePathContent && draft.lifePath ? (
          <section className="panel life-reveal entrance">
            <p className="eyebrow">你的 Life Path</p>
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
            <button className="primary-button" type="button" onClick={() => patchDraft({ step: 'resonance' })}>這段有沒有打中你？</button>
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
            <button
              className="primary-button"
              disabled={!draft.lifePathResonance || !draft.lifePathTopResonance}
              type="button"
              onClick={() => patchDraft({ step: 'transition' })}
            >
              前往第二面鏡子
            </button>
          </section>
        ) : null}

        {draft.step === 'transition' ? (
          <section className="panel transition-panel entrance">
            <p className="eyebrow">第二面鏡子</p>
            <h1>接著，看看什麼事情讓你想投入</h1>
            <p className="lede">接下來有 18 題。沒有標準答案，請依你平常最接近的狀態作答。</p>
            <div className="mirror-row" aria-hidden="true"><span>做</span><span>想</span><span>創</span><span>幫</span><span>帶</span><span>整</span></div>
            <button className="primary-button" type="button" onClick={() => patchDraft({ step: 'riasec' })}>開始回答</button>
          </section>
        ) : null}

        {draft.step === 'riasec' ? (
          <RiasecQuestionStep index={completedAnswers} onAnswer={answerRiasec} />
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
            <button
              className="primary-button"
              disabled={!draft.subjectiveDriver}
              type="button"
              onClick={() => patchDraft({ step: 'riasec-result' })}
            >
              看看活動偏好結果
            </button>
          </section>
        ) : null}

        {draft.step === 'riasec-result' && riasecResult ? (
          <section className="panel panel--wide results-panel entrance">
            <p className="eyebrow">你的活動偏好快照</p>
            <h1>你最常選擇投入的三種方式</h1>
            <div className="results-layout">
              <RadarChart scores={riasecResult.scores} />
              <div className="score-summary">
                <p className="top-code">{riasecResult.top3Code}</p>
                <div className="top-cards">
                  {riasecResult.top3.map((code) => (
                    <div className="top-card" key={code} style={{ '--accent': RIASEC_META[code].color } as CSSProperties}>
                      <span>{code}</span>
                      <p>{RIASEC_META[code].name}</p>
                      <small>{RIASEC_META[code].verb} · {riasecResult.scores[code].normalized}</small>
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
            </div>
            {subjectiveComparison ? (
              <div className="reflection-card">
                <small>{subjectiveComparison.title}</small>
                <p>{subjectiveComparison.text}</p>
              </div>
            ) : null}
            <button className="primary-button" type="button" onClick={() => patchDraft({ step: 'talent-usage' })}>看看第三面鏡子</button>
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
            <button className="primary-button" disabled={!draft.talentUsage} type="button" onClick={() => patchDraft({ step: 'priorities' })}>繼續</button>
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
            <button
              className="primary-button"
              disabled={draft.priorities.length === 0 || !draft.explorationInterest}
              type="button"
              onClick={() => patchDraft({ step: 'report' })}
            >
              整理我的三面鏡子
            </button>
          </section>
        ) : null}

        {draft.step === 'report' && lifePathContent && riasecResult ? (
          <section className="panel report-panel entrance">
            <p className="eyebrow">你的本地探索摘要</p>
            <h1>把三面鏡子放在一起看</h1>
            <p className="lede">這裡呈現的是你提供的回答與計算結果；它們可以成為你接下來觀察自己的線索。</p>
            <div className="report-grid">
              <article><small>第一面鏡子 · 自我反思</small><strong>{draft.lifePath?.value} · {lifePathContent.label}</strong><p>{lifePathContent.coreMotivation}</p></article>
              <article><small>第二面鏡子 · 活動偏好 Top 3</small><strong>{riasecResult.top3Code}</strong><p>{riasecResult.top3.map((code) => RIASEC_META[code].name).join('、')}</p></article>
              <article><small>本人能量線索</small><strong>{energyLabel(draft.subjectiveDriver)}</strong><p>{subjectiveComparison?.title ?? '這是你親自選擇的能量線索。'}</p></article>
              <article><small>第三面鏡子 · 天賦使用感</small><strong>{draft.talentUsage ?? '—'}%</strong><p>這是你的主觀感受，不是精確能力測量。</p></article>
              <article><small>目前最關注</small><strong>{draft.priorities.join('、')}</strong><p>探索意願：{draft.explorationInterest}</p></article>
            </div>
            {subjectiveComparison ? (
              <div className="reflection-card"><small>{subjectiveComparison.title}</small><p>{subjectiveComparison.text}</p></div>
            ) : null}
            <div className="reflection-card"><small>留給自己的問題</small><p>{lifePathContent.reflectionQuestion}</p></div>
            <p className="local-note">這是 P0 本地預演：結果只暫存在這個瀏覽器，刷新仍可查看；按「重新開始一輪」後會清除本機紀錄。</p>
            <button className="secondary-button" type="button" onClick={returnHome}>重新開始一輪</button>
            <p className="disclaimer">{DISCLAIMER}</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section className="landing entrance">
      <div className="landing-copy">
        <p className="eyebrow">三面鏡子，不替你下定義</p>
        <h1>看見天賦，<br /><em>找到原動力。</em></h1>
        <p className="landing-lede">看見天賦・找到原動力・增加人生的選擇。從一個自我反思入口、一組活動偏好，和你此刻的感受開始。</p>
        <button className="primary-button" type="button" onClick={onStart}>開始探索我的天賦</button>
        <p className="landing-footnote">約 5 分鐘 · 沒有標準答案，也不是考試</p>
      </div>
      <div className="mirror-composition" aria-hidden="true">
        <span className="mirror mirror--one"><b>1</b><small>自我</small></span>
        <span className="mirror mirror--two"><b>2</b><small>偏好</small></span>
        <span className="mirror mirror--three"><b>3</b><small>此刻</small></span>
        <i className="composition-line" />
      </div>
    </section>
  );
}

function RiasecQuestionStep({ index, onAnswer }: { index: number; onAnswer: (answer: RiasecAnswer) => void }) {
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
      <p className="question-hint">選擇後會自動前往下一題。</p>
    </section>
  );
}

export default App;
