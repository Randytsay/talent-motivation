import { HttpError, vercelWebHandler } from '../src/server/http';
import { createRouteHandlers } from '../src/server/routes';

const routes = createRouteHandlers();

/**
 * Keep the V2 endpoints behind one catch-all function. Vercel Hobby permits
 * twelve Functions per deployment; the route handlers themselves remain
 * separate and are selected only by the request path here.
 */
export default vercelWebHandler((request) => {
  const segments = new URL(request.url).pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean);

  if (segments[0] === 'subjects') {
    if (segments.length === 1) {
      return request.method === 'POST' ? routes.createSubject(request) : routes.listSubjects(request);
    }
    if (segments.length === 3 && segments[2] === 'assessments') {
      return routes.subjectAssessments(request, segments[1]);
    }
  }

  if (segments[0] === 'claims') {
    if (segments.length === 1) return routes.createClaim(request);
    if (segments.length === 2 && segments[1] === 'preview') return routes.claimPreview(request);
    if (segments.length === 2 && segments[1] === 'redeem') return routes.redeemClaim(request);
  }

  if (segments[0] === 'share' && segments.length === 2) {
    return routes.publicShare(request, segments[1]);
  }

  throw new HttpError(404, 'not_found', '找不到這個 API 路徑。');
});
