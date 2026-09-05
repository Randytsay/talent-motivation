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
  await page.getByRole('button', { name: '開始探索我的天賦' }).click();
  await page.getByRole('button', { name: '準備好了，開始我的旅程' }).click();
  await page.locator('#birth-date').fill('1978-11-05');
  await page.getByRole('button', { name: '看看這面鏡子' }).click();
  await page.getByLabel('生命靈數 5').waitFor();
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
  await page.getByText('你的探索摘要').waitFor();
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
    releaseRetry();
    await desktop.getByText('反覆出現的線索').waitFor();
    assert.equal(await desktop.getByRole('button', { name: '重新產生 AI 解析' }).count(), 0);
    assert.equal(requests.filter((request) => request.method === 'POST' && request.pathname === '/api/assessments').length, 1, 'AI retry must not create a new assessment');
    console.log('E2E: AI failure, refresh, retry, disabled duplicate action and same-assessment recovery passed');
    await desktop.goto(`${baseUrl}/presenter?eventId=${eventId}`);
    await desktop.getByRole('heading', { name: '等待經同意的分享' }).waitFor();
    console.log('E2E: no-consent Presenter correctly remains empty');

    console.log('E2E: verifying an event-scoped assessment with explicit Presenter consent');
    await desktop.goto(`${baseUrl}/?eventId=${eventId}`);
    await desktop.getByText('你的探索摘要').waitFor();
    await desktop.getByRole('button', { name: '重新開始一輪' }).click();
    await completeAssessmentFlow(desktop, true);
    await desktop.getByText('反覆出現的線索').waitFor();
    await desktop.reload();
    await desktop.getByText('你的探索摘要').waitFor();
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
    await mobile.getByText('你的探索摘要').waitFor();
    const dimensions = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.equal(dimensions.scrollWidth, dimensions.clientWidth, 'mobile layout has horizontal overflow');
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
