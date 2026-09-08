import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { loadRuntimeConfig } from '../src/server/env';
import { toErrorResponse } from '../src/server/http';
import { InMemoryRepositories } from '../src/server/repositories';
import { createRouteHandlers } from '../src/server/routes';
import { createRuntime } from '../src/server/runtime';

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
    if (!handler) return void vite.middlewares(incoming, outgoing);
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(8000);

  try {
    const eventId = 'mock-event-classroom-polished';
    await page.goto(`${baseUrl}/?eventId=${eventId}`);
    await page.getByRole('heading', { name: '做一點， 看一點，聊一點' }).waitFor().catch(async () => {
      await page.getByText('做一點，', { exact: false }).waitFor();
    });
    await page.getByRole('button', { name: '開始我的探索' }).click();

    const birthInput = page.locator('#birth-date');
    await birthInput.fill('19781105');
    assert.equal(await birthInput.inputValue(), '1978 / 11 / 05', 'Birthday field should format YYYY / MM / DD instead of accepting endless year digits');
    await page.getByRole('button', { name: '看看我的數字' }).click();
    await page.getByText('自由探索者', { exact: true }).waitFor();
    await page.getByText('外在互動', { exact: true }).waitFor();
    await page.getByText('內在需求', { exact: true }).waitFor();
    await page.getByText('目前階段', { exact: true }).waitFor();
    await page.getByRole('button', { name: '很像' }).click();
    await page.getByRole('button', { name: '老師說可以後，進入第二階段' }).click();

    await page.getByRole('heading', { name: '看你喜歡怎麼做事情' }).waitFor();
    for (const label of ['實作型｜做', '研究型｜想', '創意型｜創', '助人型｜幫', '推動型｜帶', '組織型｜整']) {
      await page.getByText(label, { exact: true }).waitFor();
    }
    await page.getByRole('button', { name: '開始 18 題' }).click();
    for (let index = 0; index < 18; index += 1) await page.getByRole('button', { name: '很像我' }).click();

    await page.getByRole('heading', { name: '你的活動偏好 Top 3' }).waitFor();
    await page.getByText('像是為你組起來的一段話', { exact: true }).waitFor();
    assert.equal(await page.locator('.classroom-top3 article').count(), 3);
    const tailored = await page.locator('.classroom-tailored').innerText();
    assert.match(tailored, /可能比較容易|前兩項分數很接近/);
    assert.match(tailored, /回想看看/);
    await page.getByRole('button', { name: '老師說可以後，進入第三階段' }).click();

    await page.getByRole('button', { name: '把問題想明白' }).click();
    await page.getByRole('button', { name: '40%' }).click();
    await page.getByRole('button', { name: '更能發揮自己的能力' }).click();
    await page.getByRole('button', { name: '收入更多元' }).click();
    assert.equal(await page.locator('textarea').count(), 0);
    await page.getByRole('button', { name: '整理我的天賦快照' }).click();
    await page.getByRole('heading', { name: '你的天賦探索快照' }).waitFor();
    await page.getByRole('heading', { name: '現在最值得留意的 3 個線索' }).waitFor();
    await page.getByText('AI 不是答案。', { exact: true }).waitFor();

    const submitted = requests.filter((item) => item.method === 'POST' && item.pathname === '/api/assessments');
    assert.equal(submitted.length, 1);
    const payload = JSON.parse(submitted[0].body ?? '{}') as Record<string, unknown>;
    assert.equal(payload.eventId, eventId);
    assert.equal(payload.explorationInterest, '未詢問');
    assert.equal('reflections' in payload, false);
    assert.equal(Object.keys(payload.riasecAnswers as Record<string, unknown>).length, 18);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(8000);
    await mobile.goto(baseUrl);
    const start = mobile.getByRole('button', { name: '開始我的探索' });
    await start.waitFor();
    const fontSize = Number.parseFloat(await start.evaluate((element) => getComputedStyle(element).fontSize));
    assert(fontSize >= 17);
    await mobile.close();

    console.log('E2E: polished Classroom Journey passed');
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
