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
interface RecordedRequest { method: string; pathname: string; body?: string }

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

async function completeClassroomFlow(page: Page) {
  await page.getByRole('button', { name: '開始我的探索' }).click();
  await page.locator('#birth-date').fill('1978-11-05');
  await page.getByRole('button', { name: '看看我的數字' }).click();
  await page.getByText('自由探索者', { exact: true }).waitFor();
  assert.equal(await page.getByText('外在互動', { exact: true }).count(), 1, 'Birth checkpoint should show outer interaction');
  assert.equal(await page.getByText('內在需求', { exact: true }).count(), 1, 'Birth checkpoint should show inner needs');
  assert.equal(await page.getByText('目前階段', { exact: true }).count(), 1, 'Birth checkpoint should show current stage');
  await page.getByRole('button', { name: '很像' }).click();
  await page.getByRole('button', { name: '老師說可以後，進入第二階段' }).click();

  await page.getByRole('heading', { name: '不是看你「是什麼人」，而是看你喜歡怎麼做事情' }).waitFor();
  await page.getByText('R 實作型｜做', { exact: true }).waitFor();
  await page.getByText('I 研究型｜想', { exact: true }).waitFor();
  await page.getByText('S 助人型｜幫', { exact: true }).waitFor();
  await page.getByRole('button', { name: '開始 18 題' }).click();
  for (let index = 0; index < 18; index += 1) {
    await page.getByRole('button', { name: '很像我' }).click();
  }

  await page.getByRole('heading', { name: '你的活動偏好 Top 3' }).waitFor();
  assert.equal(await page.locator('.classroom-top3 article').count(), 3, 'RIASEC checkpoint must show three full preference cards');
  assert.equal(await page.locator('.classroom-top3 strong').count(), 3, 'Each RIASEC card must include full type name and verb');
  await page.getByRole('button', { name: '老師說可以後，進入第三階段' }).click();

  await page.getByRole('button', { name: '把問題想明白' }).click();
  await page.getByRole('button', { name: '40%' }).click();
  await page.getByRole('button', { name: '更能發揮自己的能力' }).click();
  await page.getByRole('button', { name: '收入更多元' }).click();
  assert.equal(await page.locator('textarea').count(), 0, 'Classroom flow must not require free-text reflection');
  await page.getByRole('button', { name: '整理我的天賦快照' }).click();
  await page.getByRole('heading', { name: '你的天賦探索快照' }).waitFor();
  await page.getByRole('heading', { name: '現在最值得留意的 3 個線索' }).waitFor();
  await page.getByText('AI 不是答案。', { exact: true }).waitFor();
  await page.getByRole('link', { name: '📖 課後查看我的完整報告' }).waitFor();
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
    requests.push({ method: incoming.method ?? 'GET', pathname: url.pathname, ...(body ? { body: Buffer.from(body).toString('utf8') } : {}) });
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
  desktop.setDefaultTimeout(7000);

  try {
    const eventId = 'mock-event-classroom-v3';
    console.log('E2E: Classroom Journey V3 desktop flow');
    await desktop.goto(`${baseUrl}/?eventId=${eventId}`);
    await completeClassroomFlow(desktop);
    await desktop.screenshot({ path: '/tmp/talent-motivation-classroom-snapshot.png', fullPage: true });

    const submitted = requests.filter((request) => request.method === 'POST' && request.pathname === '/api/assessments');
    assert.equal(submitted.length, 1, 'Classroom flow should save one canonical Assessment only at finalization');
    const payload = JSON.parse(submitted[0].body ?? '{}') as Record<string, unknown>;
    assert.equal(payload.eventId, eventId);
    assert.equal(payload.explorationInterest, '未詢問', 'Classroom flow must not invent exploration intent');
    assert.equal('reflections' in payload, false, 'Classroom flow must not submit fabricated free-text reflections');
    assert.equal(Object.keys(payload.riasecAnswers as Record<string, unknown>).length, 18, 'Classroom flow must keep all 18 RIASEC items');

    const participant = await repositories.participants.findByLineUserId('mock-line-user-001');
    assert(participant, 'mock participant should be persisted');
    const assessment = await repositories.assessments.findLatestForParticipant(participant.participantId);
    assert(assessment, 'classroom assessment should be persisted');
    assert.equal(assessment.presenterConsent, false, 'Classroom flow should not silently grant Presenter consent');
    assert.equal(assessment.explorationInterest, '未詢問');
    assert.equal(assessment.reflections, undefined);

    console.log('E2E: Full report route');
    await desktop.goto(`${baseUrl}/report/latest`);
    await desktop.getByRole('heading', { name: '5｜自由探索者' }).waitFor();
    await desktop.getByText('01｜我的出生結構', { exact: true }).waitFor();
    await desktop.getByText('02｜我的活動偏好', { exact: true }).waitFor();
    await desktop.getByText('03｜我現在的狀況', { exact: true }).waitFor();
    await desktop.getByText('04｜AI 綜合整理', { exact: true }).waitFor();
    if (await desktop.getByRole('button', { name: '現在整理完整 AI 報告' }).count()) {
      await desktop.getByRole('button', { name: '現在整理完整 AI 報告' }).click();
    }
    await desktop.getByText('一句核心理解', { exact: true }).waitFor();
    assert.doesNotMatch(await desktop.locator('body').innerText(), /1978-11-05/, 'Full report must not render the complete birth date');
    await desktop.screenshot({ path: '/tmp/talent-motivation-full-report.png', fullPage: true });

    console.log('E2E: Presenter remains private without explicit consent');
    await desktop.goto(`${baseUrl}/presenter?eventId=${eventId}`);
    await desktop.getByRole('heading', { name: '等待經同意的分享' }).waitFor();

    console.log('E2E: mobile typography and staged landing');
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(7000);
    await mobile.goto(`${baseUrl}/`);
    await mobile.getByRole('heading', { name: '做一點，看一點，聊一點' }).waitFor();
    const startButton = mobile.getByRole('button', { name: '開始我的探索' });
    await startButton.waitFor();
    const fontSize = Number.parseFloat(await startButton.evaluate((element) => getComputedStyle(element).fontSize));
    assert(fontSize >= 17, `mobile primary action is too small: ${fontSize}px`);
    await mobile.screenshot({ path: '/tmp/talent-motivation-classroom-mobile.png', fullPage: true });
    await mobile.close();

    console.log('E2E: Classroom Journey V3 passed');
  } finally {
    await browser.close();
    await vite.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
