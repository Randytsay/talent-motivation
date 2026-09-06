import { createServer } from 'node:http';
import { once } from 'node:events';
import { strict as assert } from 'node:assert';
import { chromium, type Page } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { createRuntime } from '../src/server/runtime';
import { loadRuntimeConfig } from '../src/server/env';
import { InMemoryRepositories } from '../src/server/repositories';
import { createRouteHandlers } from '../src/server/routes';
import { toErrorResponse } from '../src/server/http';

type RouteHandler = (request: Request) => Promise<Response>;
interface RecordedRequest {
  method: string;
  pathname: string;
  body?: string;
}

async function requestBody(request: import('node:http').IncomingMessage): Promise<Uint8Array | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function routeFor(pathname: string, handlers: ReturnType<typeof createRouteHandlers>): RouteHandler | null {
  if (pathname === '/api/auth/session') return handlers.session;
  if (pathname === '/api/auth/liff') return handlers.liffAuthenticate;
  if (pathname === '/api/assessments') return handlers.createAssessment;
  if (pathname === '/api/assessments/latest') return handlers.latestAssessment;
  if (pathname === '/api/subjects') return (request) => request.method === 'POST' ? handlers.createSubject(request) : handlers.listSubjects(request);
  if (pathname === '/api/reports/generate') return handlers.generateReport;
  if (pathname.startsWith('/api/reports/')) return (request) => handlers.report(request, pathname.slice('/api/reports/'.length));
  if (pathname === '/api/presenter/current') return handlers.presenterCurrent;
  return null;
}

async function completeAssessmentFlow(page: Page, presenterConsent: boolean) {
  await page.getByRole('button', { name: '開始探索' }).click();
  await page.getByRole('button', { name: '準備好了，開始我的旅程' }).click();
  await page.locator('#birth-date').fill('1978-11-05');
  await page.getByRole('button', { name: '看看這面鏡子' }).click();
  await page.getByLabel('生命靈數 5').waitFor();
  assert.equal(await page.locator('.life-daily-reading').count(), 1, 'Life Path reveal must translate the theme into a daily-life reflection');
  await page.screenshot({ path: '/tmp/talent-motivation-life-path-1440.png', fullPage: true });
  await page.getByRole('button', { name: '這段有沒有打中你？' }).click();
  await page.getByRole('button', { name: '很像' }).click();
  await page.locator('.resonance-detail button').first().click();
  await page.getByRole('button', { name: '前往第二面鏡子' }).click();
  await page.getByRole('button', { name: '開始回答' }).click();
  for (let index = 0; index < 18; index += 1) {
    await page.getByRole('button', { name: /很像我/ }).click();
  }
  await page.getByRole('button', { name: '把問題想明白' }).click();
  await page.getByRole('button', { name: '看看活動偏好結果' }).click();
  await page.getByText('RIA').first().waitFor();
  assert.deepEqual(await page.locator('.riasec-top-three__code').allTextContents(), ['R', 'I', 'A'], 'RIASEC Top 3 must be shown as three independent directions');
  assert.equal(await page.locator('.riasec-top-three__list li').count(), 3, 'RIASEC Top 3 must contain three separate rows');
  await page.screenshot({ path: '/tmp/talent-motivation-riasec-result-1440.png', fullPage: true });
  await page.getByRole('button', { name: '看看第三面鏡子' }).click();
  await page.getByRole('button', { name: '60%' }).click();
  await page.getByRole('button', { name: '繼續' }).click();
  await page.getByRole('button', { name: '更多時間自主' }).click();
  await page.getByRole('button', { name: '很想' }).click();

  const consent = page.getByRole('checkbox', { name: '我同意本次活動顯示上述摘要' });
  assert.equal(await consent.isChecked(), false, 'Presenter consent must default to false');
  if (presenterConsent) await consent.check();
  assert.equal(await consent.isChecked(), presenterConsent, 'Presenter consent checkbox did not retain the participant choice');

  await page.getByRole('button', { name: '整理我的三面鏡子' }).click();
  await page.getByRole('heading', { name: '你的探索結果' }).waitFor();
  const officialLineLink = page.getByRole('link', { name: '加入官方 LINE' });
  await officialLineLink.waitFor();
  assert.equal(await officialLineLink.getAttribute('href'), 'https://line.me/R/ti/p/@337gxtnq');
  await page.getByRole('img', { name: '掃描 QR Code 加入天賦原動力官方 LINE' }).waitFor();
}

async function main() {
  const repositories = new InMemoryRepositories();
  const runtime = createRuntime(loadRuntimeConfig({ NODE_ENV: 'test', APP_RUNTIME_MODE: 'mock', APP_BASE_URL: 'http://127.0.0.1' }), repositories);
  const handlers = createRouteHandlers(runtime);
  const requests: RecordedRequest[] = [];
  const vite = await createViteServer({ appType: 'spa', server: { middlewareMode: true, hmr: false } });
  const server = createServer(async (incoming, outgoing) => {
    const host = incoming.headers.host ?? '127.0.0.1';
    const url = new URL(incoming.url ?? '/', `http://${host}`);
    const handler = routeFor(url.pathname, handlers);
    if (!handler) {
      vite.middlewares(incoming, outgoing);
      return;
    }

    const body = await requestBody(incoming);
    const request = new Request(url, { method: incoming.method, headers: incoming.headers as HeadersInit, ...(body ? { body } : {}) });
    const response = await toErrorResponse(handler)(request);
    requests.push({
      method: incoming.method ?? 'GET',
      pathname: url.pathname,
      ...(body ? { body: Buffer.from(body).toString('utf8') } : {}),
    });
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as import('node:net').AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  desktop.setDefaultTimeout(5000);
  const consoleErrors: string[] = [];
  desktop.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  try {
    const eventId = 'mock-event-001';
    console.log('E2E: verifying an event-scoped assessment without Presenter consent');
    await desktop.goto(`${baseUrl}/?eventId=${eventId}`);
    let failedAssessmentId = '';
    await desktop.route('**/api/reports/generate', async (route) => {
      failedAssessmentId = route.request().postDataJSON().assessmentId;
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { message: 'AI 測試失敗，請重試。' } }) });
    }, { times: 1 });
    await completeAssessmentFlow(desktop, false);
    await desktop.getByRole('alert').filter({ hasText: 'AI 測試失敗' }).waitFor();
    assert(failedAssessmentId, 'failed generation must target the saved assessment');
    // This deliberately injected HTTP failure should be the only console error.
    assert.equal(consoleErrors.length, 1);
    assert.match(consoleErrors.pop()!, /502/);
    await desktop.reload();
    await desktop.getByRole('button', { name: '重新產生 AI 解析' }).waitFor();
    assert.equal(await desktop.getByText('正在為你生成專屬特質解析…', { exact: true }).count(), 0);
    // A missing saved report is expected while recovering from the injected failure.
    assert.equal(consoleErrors.length, 1);
    assert.match(consoleErrors.pop()!, /404/);
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });
    await desktop.route('**/api/reports/generate', async (route) => {
      assert.equal(route.request().postDataJSON().assessmentId, failedAssessmentId);
      await retryGate;
      await route.continue();
    }, { times: 1 });
    await desktop.getByRole('button', { name: '重新產生 AI 解析' }).click();
    assert.equal(await desktop.getByRole('button', { name: '正在產生 AI 解析…' }).isDisabled(), true);
    await desktop.getByText('正在整理你的回答…').waitFor();
    releaseRetry();
    await desktop.getByText('一句核心理解').waitFor();
    await desktop.waitForTimeout(600);
    await desktop.getByRole('heading', { name: '三面鏡子快速摘要' }).waitFor();
    await desktop.locator('.life-path-resonance-note').waitFor();
    await desktop.getByRole('link', { name: /出生日期反思/ }).click();
    await desktop.getByRole('heading', { name: '第一面鏡子｜出生日期反思' }).waitFor();
    await desktop.screenshot({ path: '/tmp/talent-motivation-result-1440.png', fullPage: true });
    await desktop.getByRole('button', { name: '查看完整解析' }).click();
    await desktop.getByRole('button', { name: '收起完整解析' }).waitFor();
    assert.equal(await desktop.getByRole('button', { name: '收起完整解析' }).getAttribute('aria-expanded'), 'true');
    await desktop.getByRole('heading', { name: '第一面鏡子｜出生日期反思' }).last().waitFor();
    await desktop.screenshot({ path: '/tmp/talent-motivation-result-1440-expanded.png', fullPage: true });
    await desktop.getByRole('button', { name: '收起完整解析' }).click();
    assert.equal(await desktop.getByRole('button', { name: '查看完整解析' }).getAttribute('aria-expanded'), 'false');
    const activityDetails = desktop.locator('.mirror-section--activity details.mirror-extension').first();
    await activityDetails.locator('summary').click();
    await desktop.getByRole('img', { name: '六維 RIASEC 偏好分數雷達圖' }).waitFor();
    assert.equal(await desktop.getByRole('button', { name: '重新產生 AI 解析' }).count(), 0);
    assert.equal(requests.filter((request) => request.method === 'POST' && request.pathname === '/api/assessments').length, 1, 'AI retry must not create a new assessment');
    console.log('E2E: AI failure, refresh, retry, disabled duplicate action and same-assessment recovery passed');
    await desktop.goto(`${baseUrl}/presenter?eventId=${eventId}`);
    await desktop.getByRole('heading', { name: '等待經同意的分享' }).waitFor();
    console.log('E2E: no-consent Presenter correctly remains empty');

    console.log('E2E: verifying an event-scoped assessment with explicit Presenter consent');
    await desktop.goto(`${baseUrl}/?eventId=${eventId}`);
    await desktop.getByRole('button', { name: '回顧上次結果' }).waitFor();
    await desktop.getByText('這個探索包含什麼？').click();
    await desktop.getByText('從活動偏好、當下感受與出生日期的反思提示，整理認識自己的線索。出生日期解讀僅供自我反思參考。').waitFor();
    await desktop.getByText('這個探索包含什麼？').click();
    await desktop.waitForTimeout(600);
    await desktop.screenshot({ path: '/tmp/talent-motivation-home-1440.png', fullPage: true });
    await completeAssessmentFlow(desktop, true);
    await desktop.getByText('一句核心理解').waitFor();
    await desktop.reload();
    await desktop.getByRole('button', { name: '回顧上次結果' }).waitFor();
    await desktop.getByRole('button', { name: '回顧上次結果' }).click();
    await desktop.getByRole('heading', { name: '你的探索結果' }).waitFor();
    console.log('E2E: saved canonical assessment and report');

    const persistedDraft = await desktop.evaluate(() => window.localStorage.getItem('talent-motivation:assessment-draft:v1'));
    assert.equal(persistedDraft, null, 'completed assessment must not remain in localStorage');
    const submittedAssessments = requests.filter((request) => request.method === 'POST' && request.pathname === '/api/assessments');
    assert.equal(submittedAssessments.length, 2, 'browser did not submit both event-scoped assessments');
    const submittedPayloads = submittedAssessments.map((request) => JSON.parse(request.body ?? '{}') as { eventId?: string; presenterConsent?: boolean });
    assert.deepEqual(submittedPayloads.map((payload) => ({ eventId: payload.eventId, presenterConsent: payload.presenterConsent })), [
      { eventId, presenterConsent: false },
      { eventId, presenterConsent: true },
    ], 'browser did not send the participant-selected event consent values');
    assert(requests.some((request) => request.method === 'POST' && request.pathname === '/api/reports/generate'), 'browser did not request AI report generation');
    assert(requests.filter((request) => request.method === 'GET' && request.pathname === '/api/assessments/latest').length >= 2, 'refresh did not reload latest assessment from backend');

    const participant = await repositories.participants.findByLineUserId('mock-line-user-001');
    const assessment = await repositories.assessments.findLatestForParticipant(participant!.participantId);
    assert(assessment, 'backend did not persist latest assessment');
    assert.equal(assessment.eventId, eventId, 'backend did not persist the event context');
    assert.equal(assessment.presenterConsent, true, 'backend did not persist explicit Presenter consent');
    console.log('E2E: opening Presenter');
    await desktop.goto(`${baseUrl}/presenter?eventId=${eventId}`);
    await desktop.getByRole('heading', { name: 'Mock LINE User' }).waitFor();
    console.log('E2E: verified positive-consent Presenter allowlist route');
    await assert.doesNotMatch(await desktop.locator('body').innerText(), /1978-11-05/);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(5000);
    const mobileErrors: string[] = [];
    mobile.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(message.text()); });
    await mobile.goto(`${baseUrl}/?eventId=${eventId}`);
    await mobile.getByRole('button', { name: '回顧上次結果' }).waitFor();
    await mobile.getByRole('button', { name: '回顧上次結果' }).click();
    await mobile.getByRole('heading', { name: '你的探索結果' }).waitFor();
    await mobile.waitForTimeout(600);
    await mobile.screenshot({ path: '/tmp/talent-motivation-result-390.png', fullPage: true });
    const dimensions = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.equal(dimensions.scrollWidth, dimensions.clientWidth, 'mobile layout has horizontal overflow');
    await mobile.setViewportSize({ width: 430, height: 844 });
    const wideMobileDimensions = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.equal(wideMobileDimensions.scrollWidth, wideMobileDimensions.clientWidth, '430px layout has horizontal overflow');
    await mobile.screenshot({ path: '/tmp/talent-motivation-result-430.png', fullPage: true });
    await mobile.setViewportSize({ width: 360, height: 800 });
    const narrowDimensions = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.equal(narrowDimensions.scrollWidth, narrowDimensions.clientWidth, '360px layout has horizontal overflow');
    await mobile.screenshot({ path: '/tmp/talent-motivation-result-360.png', fullPage: true });
    assert.deepEqual(mobileErrors, [], 'mobile console emitted errors');
    await mobile.close();
    assert.deepEqual(consoleErrors, [], 'desktop console emitted errors');
    console.log('Browser mock E2E passed: event-scoped consent, server persistence, refresh restore, Presenter, desktop/mobile, console clean.');
  } finally {
    await browser.close();
    await vite.close();
    server.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
