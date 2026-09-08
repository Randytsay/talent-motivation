import { RIASEC_META } from '../../data/riasecQuestions';
import type { RiasecCode, RiasecResult } from '../../types/domain';

const ACTION_PHRASE: Record<RiasecCode, string> = {
  R: '把想法做成看得見的成果',
  I: '把問題想清楚、找到原因',
  A: '加入自己的表達與不同做法',
  S: '看見人的需要、幫助對方成長',
  E: '發起行動、連結資源、把事情往前推',
  C: '整理資訊、建立步驟、讓事情更有秩序',
};

const PRIMARY_TONE: Record<RiasecCode, string> = {
  R: '你通常比較容易從具體行動與看得見的成果得到掌握感。',
  I: '你容易被問題、原因與規律吸引，通常會想先弄懂，再做判斷。',
  A: '你通常需要一些表達與創造空間，能用自己的方式做事時更容易投入。',
  S: '你比較容易先注意到人與人的需要，看到別人因為你的幫助而變好，往往會讓你有感。',
  E: '你對推動、影響與把事情往前帶比較有動力，常不喜歡事情一直停在討論階段。',
  C: '你在整理、規劃與建立秩序時比較容易安心，也更容易看到事情怎麼穩定完成。',
};

const MODIFIER_TONE: Record<RiasecCode, string> = {
  R: '又讓你不只停在想法，會希望最後能真的做出成果',
  I: '又讓你會追問原因，不太滿足於只知道表面的答案',
  A: '又增加了表達與變化的需求，不太喜歡只能照表操課',
  S: '又讓你在意事情對人有沒有幫助、能不能帶來成長',
  E: '又增加了主動發起、影響他人與把事情推進的傾向',
  C: '又讓你會自然整理資訊、步驟與流程，讓事情更有秩序',
};

export interface RiasecNarrative {
  headline: string;
  body: string;
  reflection: string;
}

export function buildRiasecNarrative(result: RiasecResult): RiasecNarrative {
  const [first, second, third] = result.top3;
  const firstScore = result.scores[first].normalized;
  const secondScore = result.scores[second].normalized;
  const gap = firstScore - secondScore;
  const balanceSentence = gap <= 10
    ? `你的前兩項分數很接近，所以與其只看第一名，更適合把自己理解成「${RIASEC_META[first].verb}＋${RIASEC_META[second].verb}」並存的組合。`
    : `${RIASEC_META[first].name}相對更突出，但第二、三名會決定你喜歡用什麼方式把這股能量表現出來。`;

  const headline = `${result.top3Code}｜${RIASEC_META[first].name} × ${RIASEC_META[second].name} × ${RIASEC_META[third].name}`;
  const body = [
    PRIMARY_TONE[first],
    `${RIASEC_META[second].name}${MODIFIER_TONE[second]}；${RIASEC_META[third].name}${MODIFIER_TONE[third]}。`,
    balanceSentence,
    `綜合起來，你可能比較容易在「${ACTION_PHRASE[first]}＋${ACTION_PHRASE[second]}＋${ACTION_PHRASE[third]}」同時存在的情境中投入。`,
  ].join('');
  const reflection = `回想看看：你過去有沒有一件事，同時讓你「${RIASEC_META[first].verb}、${RIASEC_META[second].verb}、${RIASEC_META[third].verb}」，而且做完特別有成就感？`;

  return { headline, body, reflection };
}
