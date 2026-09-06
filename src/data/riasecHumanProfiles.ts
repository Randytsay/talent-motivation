import type { RiasecCode } from '../types/domain';
import { RIASEC_META } from './riasecQuestions';

export interface RiasecHumanProfile {
  code: RiasecCode;
  title: string;
  tagline: string;
  soulDrive: string;
  mismatchPain: string;
  workplaceFit: string;
}

export const RIASEC_HUMAN_PROFILES: Record<RiasecCode, RiasecHumanProfile> = {
  R: {
    code: 'R',
    title: '實作破局者',
    tagline: '用雙手與產出說話的硬核匠心',
    soulDrive: '你骨子裡追求的是**「親手捏出具體成果的踏實掌控感」**。比起無休止的開會討論或空談願景，你更享受直接動手把東西做出來、看見具體成品落地的純粹爽快感；你深信**「能跑通並交付的，才是真本事」**。',
    mismatchPain: '如果把你關在每天只能**「空談假大空口號、整天應酬陪笑，卻做不出任何具體實物產出」**的崗位，你會感到極度煩躁與虛無，甚至覺得自己的生命在被無意義浪費。',
    workplaceFit: '最適合能讓你**獨立操盤、接觸具體工具或技術系統、產出看得見摸得著**的實務舞台。',
  },
  I: {
    code: 'I',
    title: '深度洞悉者',
    tagline: '穿透表象直擊本質的思考大腦',
    soulDrive: '你骨子裡追求的是**「看懂底層規律與本質的智力快感」**。別人只告訴你答案你不會滿足，你一定要追問「為什麼」；當你能抽絲剝繭**把混亂資訊連成邏輯鏈、找出問題的真正病根**時，你會感到無比的興奮與成就感。',
    mismatchPain: '如果逼你在**毫無思考沉澱時間下倉促盲幹、或是上面交代什麼就得照單全收不准質疑**，你的大腦會感到極度窒息，甚至會對缺乏邏輯的盲目環境產生深深的厭倦。',
    workplaceFit: '最適合需要**深入調研、數據推理、架構規劃或攻克複雜難題**的策略型角色。',
  },
  A: {
    code: 'A',
    title: '靈魂詮釋者',
    tagline: '不拘一格打破常規的創意火花',
    soulDrive: '你骨子裡追求的是**「打破常規、注入個人靈魂的自我詮釋」**。你極度抗拒千篇一律的公式化複製；當你能用獨特的視角、文字、美感或巧思**為一件事帶來前所未有的生命力、讓人眼睛發亮**時，你會整個人都在發光。',
    mismatchPain: '如果把你放進**死氣沈沈的機械式流水線、每一步都必須遵照僵化範本、不允許任何個人風格**，你的靈氣會被迅速抹殺，每天上班像在上墳，心力迅速枯竭。',
    workplaceFit: '最適合**品牌策劃、內容創作、概念提案、體驗設計或打破僵局**的創新空間。',
  },
  S: {
    code: 'S',
    title: '真誠賦能者',
    tagline: '用同理心溫柔擺渡生命的情感燈塔',
    soulDrive: '你骨子裡追求的是**「生命與生命之間真誠的理解與陪伴成長」**。你對他人的狀態與情緒有著天生的雷達；當你能**幫別人打開心結、看見身邊的人因你的支持而有所成長或鬆一口氣**時，你的內心會感到最深層的充實。',
    mismatchPain: '如果身處**「明爭暗鬥、狼性互撕、或是把人當工具冷酷算計的有毒職場」**，你的高度同理心會變成每天刺向自己的刀子，心力會在無聲中被徹底榨乾。',
    workplaceFit: '最適合**教育培訓、諮詢教練、人才發展、團隊凝聚或深度客戶服務**的互信場域。',
  },
  E: {
    code: 'E',
    title: '戰局掌舵者',
    tagline: '調動資源破浪前行的野心推手',
    soulDrive: '你骨子裡追求的是**「調動局勢、突破挑戰拿下戰果的掌控感」**。你享受鎖定目標、調動資源、克服阻力把事情推向勝利的過程；比起墨守成規，你更渴望**看見局面因為你的介入而發生實質翻轉**。',
    mismatchPain: '如果上面有**保守獨斷的主管死死壓著你、層層審批毫無自主權、只能在體制內無權無力地空轉**，你胸中的抱負會轉化為強烈的憋屈與憤怒，甚至懷疑自己的能力。',
    workplaceFit: '最適合**專案負責人、市場開拓先鋒、跨部門協調樞紐或帶領團隊打勝仗**的主舵手。',
  },
  C: {
    code: 'C',
    title: '秩序精密官',
    tagline: '化混亂為條理的基石守護者',
    soulDrive: '你骨子裡追求的是**「井然有序、零差錯的精準安全感」**。你天生看不得混亂、脫序與模糊地帶；當你能**把紛亂的資料與流程梳理成清晰可靠的標準架構，讓所有環節嚴絲合縫運轉**時，你會感到無比踏實與掌控感。',
    mismatchPain: '如果遇到**「朝令夕改的主管、規則全憑心情、天天都在應對突如其來的混亂失控與瞎忙補救」**，你的神經系統會每天處於緊繃超載狀態，精神被消耗到崩潰邊緣。',
    workplaceFit: '最適合**流程優化、品質管理、合規風控、財務架構或大型專案交付推進**。',
  },
};

export const RIASEC_TRANSITION_BADGES = [
  { code: 'R', english: 'Realistic', verb: '做', essence: '動手破局', color: '#c7593f', bg: 'rgba(199, 89, 63, 0.08)' },
  { code: 'I', english: 'Investigative', verb: '想', essence: '洞悉本質', color: '#3f6f8f', bg: 'rgba(63, 111, 143, 0.08)' },
  { code: 'A', english: 'Artistic', verb: '創', essence: '突破常規', color: '#8b5fa8', bg: 'rgba(139, 95, 168, 0.08)' },
  { code: 'S', english: 'Social', verb: '幫', essence: '真誠賦能', color: '#3c8a74', bg: 'rgba(60, 138, 116, 0.08)' },
  { code: 'E', english: 'Enterprising', verb: '帶', essence: '戰局推手', color: '#c58d2b', bg: 'rgba(197, 141, 43, 0.08)' },
  { code: 'C', english: 'Conventional', verb: '整', essence: '秩序掌控', color: '#56616f', bg: 'rgba(86, 97, 111, 0.08)' },
] as const;

export interface RiasecCompositeArchetype {
  title: string;
  tagline: string;
  description: string;
  chemistry: string;
}

export function getRiasecCompositeArchetype(top3: RiasecCode[]): RiasecCompositeArchetype {
  const codeKey = top3.join('');
  const primary = RIASEC_HUMAN_PROFILES[top3[0]];
  const metaPrimary = RIASEC_META[top3[0]];
  const metaSecondary = RIASEC_META[top3[1]];
  const metaTertiary = RIASEC_META[top3[2]];

  const PRESET_ARCHETYPES: Record<string, { title: string; tagline: string; chemistry: string }> = {
    EAS: { title: '魅力引路型領袖', tagline: '點燃熱情、格局引領的精神導師', chemistry: '以「E 的戰略推進」為主引擎，融合「A 的創意感染力」與「S 的人文溫度」，能凝聚人心、喚醒團隊共同願景。' },
    ESA: { title: '感染型團隊賦能者', tagline: '在溫暖與共情中帶領大家前行', chemistry: '以「E 的大局掌控」為方向，透過「S 的深度同理」與「A 的生動詮釋」，讓人在備受鼓舞中願意跟隨。' },
    ECR: { title: '實幹推進型操盤手', tagline: '雷厲風行、講求戰果與體系效率', chemistry: '結合「E 的目標感」、「C 的流程紀律」與「R 的落地執行」，是商業世界中最扎實的軍團統帥。' },
    ERC: { title: '硬核落地型將領', tagline: '不玩虛招、使命必達的交付之王', chemistry: '以「E 的開拓魄力」搭配「R 的實作能力」與「C 的精準把控」，任何硬骨頭專案交到你手上都能如期攻克。' },
    CIR: { title: '精密工程型建構者', tagline: '追求極致品質與邏輯閉環的建築師', chemistry: '以「C 的秩序安全」為底座，融合「I 的深度鑽研」與「R 的扎實做工」，追求毫釐不差的極致作品。' },
    CRI: { title: '標準落地型專家', tagline: '以精準產出與嚴謹規則定海神針', chemistry: '以「C 的規律細節」驅動「R 的實務打磨」與「I 的本質梳理」，是組織最可靠的品質護城河。' },
    ASI: { title: '靈性啟發型擺渡人', tagline: '洞見人心、啟迪思維的文化燈塔', chemistry: '以「A 的創意表達」融合「S 的溫暖療癒」與「I 的深邃思想」，善於用觸動心靈的語言解開他人的困惑。' },
    SAI: { title: '溫暖療癒型導師', tagline: '傾聽靈魂、賦予勇氣的心靈靠山', chemistry: '以「S 的真誠關懷」為核心，搭配「A 的靈動表達」與「I 的深刻洞察」，在教育諮詢領域極具穿透力。' },
    IRE: { title: '商業戰略型創新者', tagline: '以深厚技術洞見撬動市場新局', chemistry: '結合「I 的規律洞悉」、「R 的實作交付」與「E 的商業敏銳度」，能把前瞻技術轉化為落地商業勝果。' },
    IER: { title: '前瞻探索型架構師', tagline: '看懂未來並親手鋪設軌道的先鋒', chemistry: '以「I 的深度研究」為主導，融入「E 的推動魄力」與「R 的落地檢驗」，善於在未知荒原中定義新標準。' },
    AIR: { title: '創客發明型極客', tagline: '天馬行空的想像力 ＋ 動手做出來的狠勁', chemistry: '融合「A 的靈感突破」、「I 的底層推敲」與「R 的動手實踐」，是把腦中奇思妙想變為現實的原型大師。' },
    SEC: { title: '暖心運營型守護者', tagline: '兼顧人情溫度與秩序條理的團隊定盤星', chemistry: '以「S 的真誠關懷」為初心，藉由「E 的引導組織」與「C 的細節落實」，打造出最具凝聚力與安全感的社群。' },
  };

  if (PRESET_ARCHETYPES[codeKey]) {
    const preset = PRESET_ARCHETYPES[codeKey];
    return {
      title: preset.title,
      tagline: preset.tagline,
      description: `你的活動偏好主要由「${top3.map((c) => RIASEC_META[c].name).join('、')}」所驅動。`,
      chemistry: preset.chemistry,
    };
  }

  // Dynamic synthesis fallback
  return {
    title: `${primary.title} · 複合天賦型`,
    tagline: `以 ${metaPrimary.verb} 為主核心，協同 ${metaSecondary.verb} 與 ${metaTertiary.verb} 推進`,
    description: `你的行為偏好以「${metaPrimary.name}」為第一引擎，並在「${metaSecondary.name}」與「${metaTertiary.name}」的相互協調中展現獨特打法。`,
    chemistry: `你最自然的狀態是：先藉由「${metaPrimary.name}」的熱情建立抓手，再透過「${metaSecondary.name}」豐富手段，並以「${metaTertiary.name}」確保成果扎實到位。`,
  };
}
