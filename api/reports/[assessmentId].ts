import { vercelWebHandler } from '../../src/server/http';
import { createRouteHandlers } from '../../src/server/routes';

const route = createRouteHandlers();
export default vercelWebHandler((request) => {
  const pathSegments = new URL(request.url).pathname.split('/');
  const assessmentId = pathSegments[pathSegments.length - 1];
  return route.report(request, assessmentId ?? '');
});
