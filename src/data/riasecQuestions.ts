import type { RiasecQuestion } from '../types/domain';

export const RIASEC_QUESTIONS: readonly RiasecQuestion[] = [
  { id: 'q01', dimension: 'I', text: '遇到不懂的問題，我會想先弄清楚原因。' },
  { id: 'q02', dimension: 'R', text: '比起一直討論，我更喜歡直接動手做。' },
  { id: 'q03', dimension: 'S', text: '和人聊天時，我很快會注意到對方的情緒或需要。' },
  { id: 'q04', dimension: 'A', text: '我喜歡在事情裡加入自己的想法。' },
  { id: 'q05', dimension: 'E', text: '大家遲遲沒行動時，我常會想：那就先開始吧。' },
  { id: 'q06', dimension: 'C', text: '事情很多時，我會自然把順序和步驟整理出來。' },
  { id: 'q07', dimension: 'I', text: '我喜歡比較資訊，找出規律、差異或原因。' },
  { id: 'q08', dimension: 'R', text: '做出看得見的成果，會讓我更有滿足感。' },
  { id: 'q09', dimension: 'S', text: '朋友遇到困難時，我願意花時間陪他想辦法。' },
  { id: 'q10', dimension: 'A', text: '新的表達方式、創意或不同做法很容易吸引我。' },
  { id: 'q11', dimension: 'E', text: '有目標、有挑戰，而且成果看得見時，我會更有動力。' },
  { id: 'q12', dimension: 'C', text: '先知道規則、流程和時間安排，會讓我比較安心。' },
  { id: 'q13', dimension: 'I', text: '別人只告訴我答案時，我通常還會想知道為什麼。' },
  { id: 'q14', dimension: 'R', text: '遇到實際問題時，我傾向先動手試，再慢慢調整。' },
  { id: 'q15', dimension: 'S', text: '看到別人因為我的幫助而進步，會讓我很有成就感。' },
  { id: 'q16', dimension: 'A', text: '一直做一模一樣的事情，我容易想換個做法。' },
  { id: 'q17', dimension: 'E', text: '我喜歡發起事情、連結資源，把想法真正推動起來。' },
  { id: 'q18', dimension: 'C', text: '把資訊分類整理、讓流程有秩序，會讓我覺得舒服。' },
];

export const RIASEC_META = {
  R: { name: '實作型', english: 'Realistic', verb: '做', color: '#c7593f' },
  I: { name: '研究型', english: 'Investigative', verb: '想', color: '#3f6f8f' },
  A: { name: '創意型', english: 'Artistic', verb: '創', color: '#8b5fa8' },
  S: { name: '助人型', english: 'Social', verb: '幫', color: '#3c8a74' },
  E: { name: '推動型', english: 'Enterprising', verb: '帶', color: '#c58d2b' },
  C: { name: '組織型', english: 'Conventional', verb: '整', color: '#56616f' },
} as const;
