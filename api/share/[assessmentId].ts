import { vercelWebHandler } from '../../src/server/http';
import { createRouteHandlers } from '../../src/server/routes';

const routes = createRouteHandlers();
export default vercelWebHandler((request) => {
  const assessmentId = new URL(request.url).pathname.split('/').pop() ?? '';
  return routes.publicShare(request, assessmentId);
});
