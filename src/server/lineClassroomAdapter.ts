import { createLinePostCourseExperienceWebhookHandler } from './linePostCourseExperience';
import type { LineMessagingConfig } from './linePostCourse';
import type { RuntimeServices } from './runtime';

type LineFetch = typeof fetch;
type JsonRecord = Record<string, unknown>;

const RIASEC_LABEL_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['I 探索型（想）', 'I 研究型（想）'],
  ['A 創造型（創）', 'A 創意型（創）'],
  ['S 連結型（幫）', 'S 助人型（幫）'],
  ['I 探索型', 'I 研究型'],
  ['A 創造型', 'A 創意型'],
  ['S 連結型', 'S 助人型'],
];

const CLASSROOM_MISSING_REFLECTION_LINES = new Set([
  '做完雖然累、卻有成就感的事情：尚未填寫',
  '目前最消耗：尚未填寫',
  '如果暫時不考慮限制，最想嘗試：尚未填寫',
]);

function replaceRiasecLabels(value: string): string {
  return RIASEC_LABEL_REPLACEMENTS.reduce(
    (result, [from, to]) => result.replaceAll(from, to),
    value,
  );
}

export function normalizeClassroomPromptText(value: string): string {
  const source = replaceRiasecLabels(value);
  const lines = source.split('\n');
  const hadMissingReflection = lines.some((line) => CLASSROOM_MISSING_REFLECTION_LINES.has(line.trim()));
  const normalized = lines
    .filter((line) => !CLASSROOM_MISSING_REFLECTION_LINES.has(line.trim()))
    .map((line) => line.trim() === '探索意願：未詢問'
      ? '探索意願：課堂版未詢問；不要據此推論意願高低。'
      : line);

  if (hadMissingReflection) {
    const reflectionHeading = normalized.findIndex((line) => line.trim() === '【真實經驗】');
    if (reflectionHeading >= 0) {
      normalized.splice(
        reflectionHeading + 1,
        0,
        '課堂版沒有要求文字填答；請直接從一個最近的真實生活或工作微時刻開始追問。',
      );
    }
  }

  return normalized.join('\n');
}

function transformStrings(value: unknown): unknown {
  if (typeof value === 'string') return normalizeClassroomPromptText(value);
  if (Array.isArray(value)) return value.map(transformStrings);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, nested]) => [key, transformStrings(nested)]),
  );
}

function reportUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/$/, '')}/report/latest`;
}

function addFullReportButton(message: unknown, appBaseUrl: string): unknown {
  if (!message || typeof message !== 'object') return message;
  const candidate = message as JsonRecord;
  if (candidate.type !== 'flex' || candidate.altText !== '你的天賦探索已準備好') return message;
  const contents = candidate.contents;
  if (!contents || typeof contents !== 'object') return message;
  const bubble = contents as JsonRecord;
  if (bubble.type !== 'bubble') return message;

  return {
    ...candidate,
    contents: {
      ...bubble,
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#4F7C6C',
            action: {
              type: 'uri',
              label: '📖 查看我的完整報告',
              uri: reportUrl(appBaseUrl),
            },
          },
        ],
      },
    },
  };
}

export function transformClassroomLinePayload(payload: unknown, appBaseUrl: string): unknown {
  const normalized = transformStrings(payload);
  if (!normalized || typeof normalized !== 'object') return normalized;
  const record = normalized as JsonRecord;
  if (!Array.isArray(record.messages)) return normalized;
  return {
    ...record,
    messages: record.messages.map((message) => addFullReportButton(message, appBaseUrl)),
  };
}

export function createClassroomLinePostCourseWebhookHandler(
  services: RuntimeServices,
  config: LineMessagingConfig,
  fetchImpl: LineFetch = fetch,
) {
  const classroomFetch: LineFetch = async (input, init) => {
    if (!init?.body || typeof init.body !== 'string') return fetchImpl(input, init);
    let payload: unknown;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return fetchImpl(input, init);
    }
    const transformed = transformClassroomLinePayload(payload, config.appBaseUrl);
    return fetchImpl(input, { ...init, body: JSON.stringify(transformed) });
  };

  return createLinePostCourseExperienceWebhookHandler(services, config, classroomFetch);
}
