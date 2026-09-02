import { createServer } from 'node:http';
import { once } from 'node:events';
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { createRuntime } from '../src/server/runtime';
import { loadRuntimeConfig } from '../src/server/env';
import { InMemoryRepositories } from '../src/server/repositories';
import { createRouteHandlers } from '../src/server/routes';
import { toErrorResponse } from '../src/server/http';

type RouteHandler = (request: Request) => Promise<Response>;

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
  if (pathname === '/api/reports/generate') return handlers.generateReport;
  if (pathname.startsWith('/api/reports/')) return (request) => handlers.report(request, pathname.slice('/api/reports/'.length));
  if (pathname === '/api/presenter/current') return handlers.presenterCurrent;
  return null;
}

async function main() {
  const repositories = new InMemoryRepositories();
  const runtime = createRuntime(loadRuntimeConfig({ NODE_ENV: 'test', APP_RUNTIME_MODE: 'mock', APP_BASE_URL: 'http://127.0.0.1' }), repositories);
  const handlers = createRouteHandlers(runtime);
  const requests: string[] = [];
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
    requests.push(`${incoming.method} ${url.pathname}`);
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
    console.log('E2E: opening participant flow');
    await desktop.goto(baseUrl);
    await desktop.getByRole('button', { name: '開始探索我的天賦' }).click();
    await desktop.getByRole('button', { name: '我了解，繼續本機探索' }).click();
    await desktop.locator('#birth-date').fill('1978-11-05');
    await desktop.getByRole('button', { name: '看看這面鏡子' }).click();
    await desktop.getByLabel('生命靈數 5').waitFor();
    await desktop.getByRole('button', { name: '這段有沒有打中你？' }).click();
    await desktop.getByRole('button', { name: '很像' }).click();
    await desktop.locator('.resonance-detail button').first().click();
    await desktop.getByRole('button', { name: '前往第二面鏡子' }).click();
    await desktop.getByRole('button', { name: '開始回答' }).click();
    console.log('E2E: answering RIASEC');
    for (let index = 0; index < 18; index += 1) {
      await desktop.getByRole('button', { name: /很像我/ }).click();
    }
    await desktop.getByRole('button', { name: '把問題想明白' }).click();
    await desktop.getByRole('button', { name: '看看活動偏好結果' }).click();
    await desktop.getByText('RIA').first().waitFor();
    await desktop.getByRole('button', { name: '看看第三面鏡子' }).click();
    await desktop.getByRole('button', { name: '60%' }).click();
    await desktop.getByRole('button', { name: '繼續' }).click();
    await desktop.getByRole('button', { name: '更多時間自主' }).click();
    await desktop.getByRole('button', { name: '很想' }).click();
    await desktop.getByRole('button', { name: '整理我的三面鏡子' }).click();
    await desktop.getByText('你的探索摘要').waitFor();
    console.log('E2E: saved canonical assessment and report');
    await desktop.reload();
    await desktop.getByText('你的探索摘要').waitFor();

    const persistedDraft = await desktop.evaluate(() => window.localStorage.getItem('talent-motivation:assessment-draft:v1'));
    assert.equal(persistedDraft, null, 'completed assessment must not remain in localStorage');
    assert(requests.includes('POST /api/assessments'), 'browser did not post the completed assessment');
    assert(requests.includes('POST /api/reports/generate'), 'browser did not request AI report generation');
    assert(requests.filter((path) => path === 'GET /api/assessments/latest').length >= 2, 'refresh did not reload latest assessment from backend');

    const participant = await repositories.participants.findByLineUserId('mock-line-user-001');
    const assessment = await repositories.assessments.findLatestForParticipant(participant!.participantId);
    assert(assessment, 'backend did not persist latest assessment');
    assessment.eventId = 'mock-event-001';
    assessment.presenterConsent = true; // Owner action in the mock event harness.
    await repositories.events.setCurrentPresenterAssessment('mock-event-001', assessment.assessmentId);
    console.log('E2E: opening Presenter');
    await desktop.goto(`${baseUrl}/presenter?eventId=mock-event-001`);
    await desktop.getByRole('heading', { name: 'Mock LINE User' }).waitFor();
    console.log('E2E: verified Presenter allowlist route');
    await assert.doesNotMatch(await desktop.locator('body').innerText(), /1978-11-05/);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(5000);
    const mobileErrors: string[] = [];
    mobile.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(message.text()); });
    await mobile.goto(baseUrl);
    await mobile.getByText('你的探索摘要').waitFor();
    const dimensions = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.equal(dimensions.scrollWidth, dimensions.clientWidth, 'mobile layout has horizontal overflow');
    assert.deepEqual(mobileErrors, [], 'mobile console emitted errors');
    await mobile.close();
    assert.deepEqual(consoleErrors, [], 'desktop console emitted errors');
    console.log('Browser mock E2E passed: server persistence, refresh restore, Presenter, desktop/mobile, console clean.');
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
