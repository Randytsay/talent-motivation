import type { RiasecQuestion } from '../types/domain';

export const RIASEC_QUESTIONS: readonly RiasecQuestion[] = [
  { id: 'q01', dimension: 'I', text: '遇到不熟悉的問題，我通常會想先查資料，把原因弄清楚。' },
  { id: 'q02', dimension: 'R', text: '比起一直討論，我更喜歡直接操作、實作或把東西做出來。' },
  { id: 'q03', dimension: 'S', text: '和人聊天時，我通常很快就能察覺對方的情緒或需要。' },
  { id: 'q04', dimension: 'A', text: '我喜歡一件事情可以加入自己的想法，而不是完全照固定方式做。' },
  { id: 'q05', dimension: 'E', text: '一群人遲遲沒有行動時，我常會想：「不然我們就先開始吧。」' },
  { id: 'q06', dimension: 'C', text: '面對很多事情同時發生，我會自然地想把順序和步驟整理出來。' },
  { id: 'q07', dimension: 'I', text: '我喜歡比較不同資訊，找出其中的規律、差異或原因。' },
  { id: 'q08', dimension: 'R', text: '做完一件能看得見成果的工作，通常比只提出想法更讓我滿足。' },
  { id: 'q09', dimension: 'S', text: '如果朋友碰到困難，我通常願意花時間聽他說，陪他想辦法。' },
  { id: 'q10', dimension: 'A', text: '我容易對新的表達方式、創意或不同做法產生興趣。' },
  { id: 'q11', dimension: 'E', text: '有目標、有挑戰，而且結果可以被看見時，我通常更有動力。' },
  { id: 'q12', dimension: 'C', text: '我喜歡事先知道規則、流程和時間安排，這會讓我比較安心。' },
  { id: 'q13', dimension: 'I', text: '別人只告訴我「答案」時，我常常還會想知道「為什麼」。' },
  { id: 'q14', dimension: 'R', text: '遇到實際問題時，我傾向先試著動手處理，再慢慢調整。' },
  { id: 'q15', dimension: 'S', text: '教人、分享經驗，或看到別人因為我的協助而進步，會讓我很有感覺。' },
  { id: 'q16', dimension: 'A', text: '太長時間做一模一樣的事情，我容易開始想換個做法或找點變化。' },
  { id: 'q17', dimension: 'E', text: '我喜歡發起事情、連結人或資源，把原本的想法真正推動起來。' },
  { id: 'q18', dimension: 'C', text: '把資訊分類、整理清楚，或讓流程變得有秩序，會讓我感到舒服。' },
];

export const RIASEC_META = {
  R: { name: '實作型', english: 'Realistic', verb: '做', color: '#c7593f' },
  I: { name: '研究型', english: 'Investigative', verb: '想', color: '#3f6f8f' },
  A: { name: '創意型', english: 'Artistic', verb: '創', color: '#8b5fa8' },
  S: { name: '助人型', english: 'Social', verb: '幫', color: '#3c8a74' },
  E: { name: '推動型', english: 'Enterprising', verb: '帶', color: '#c58d2b' },
  C: { name: '組織型', english: 'Conventional', verb: '整', color: '#56616f' },
} as const;
